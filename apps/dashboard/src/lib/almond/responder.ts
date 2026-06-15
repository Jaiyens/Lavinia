import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { createGatewayModel, hasGatewayKey } from "@/lib/ai/gateway";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings } from "@/lib/dashboard/findings";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import {
  rateSchedulesByFrequency,
  summarizeFarmOverview,
  summarizeFindings,
  summarizeMeters,
  summarizeReconciliation,
  UNKNOWN_RATE,
} from "./shape";
import { buildAlmondTools, type AlmondToolDeps } from "./tools";

/**
 * The injected model boundary for Almond, mirroring `src/lib/extract/reader.ts`:
 *   - `createStubResponder()` is the deterministic default — ZERO external calls. It grounds its
 *     answer in the farm via the same loaders the tools wrap, so dev/test/CI never hit a model.
 *   - `createGatewayResponder()` is the LIVE one, constructed only when a Gateway key is present.
 *   - `createModelResponder(model)` is the shared streaming path, usable with any LanguageModel
 *     (the live Gateway model, or a mock model in tests) so the real tool-calling loop is testable.
 *
 * Both kinds return a UI-message-stream `Response` for `useChat`, so the route is identical.
 */

export type AlmondRequest = {
  uiMessages: UIMessage[];
  system: string;
  deps: AlmondToolDeps;
};

export interface AlmondResponder {
  toResponse(req: AlmondRequest): Response | Promise<Response>;
}

/** Stream Almond's answer through a real LanguageModel with the farm-scoped tools. Works with
 *  the live Gateway model or a mock model in tests — the streamText tool-calling loop is the same. */
export function createModelResponder(model: LanguageModel): AlmondResponder {
  return {
    async toResponse({ uiMessages, system, deps }) {
      const result = streamText({
        model,
        system,
        messages: await convertToModelMessages(uiMessages),
        tools: buildAlmondTools(deps),
        stopWhen: stepCountIs(6),
      });
      return result.toUIMessageStreamResponse();
    },
  };
}

/** The live responder over the Vercel AI Gateway. Only construct when `hasGatewayKey()`. */
export function createGatewayResponder(modelId?: string): AlmondResponder {
  return createModelResponder(createGatewayModel(modelId));
}

const TEXT_CHUNK_SIZE = 24;

function toTextChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += TEXT_CHUNK_SIZE) {
    chunks.push(text.slice(i, i + TEXT_CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [""];
}

type StubIntent = "rates" | "reconciliation" | "findings" | "meters" | "overview";

/** The lower-cased text of the most recent user turn (empty if none). */
function lastUserText(uiMessages: UIMessage[]): string {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const m = uiMessages[i];
    if (m?.role === "user") {
      return (m.parts ?? [])
        .map((p) => (p.type === "text" ? p.text : ""))
        .join(" ")
        .toLowerCase();
    }
  }
  return "";
}

/** Route the question to a topic. Order matters (reconciliation before meters so "billing
 *  data" lands on coverage, findings before meters so "save money" lands on opportunities). */
function classifyIntent(text: string): StubIntent {
  if (/\brate|tariff|schedule\b/.test(text)) return "rates";
  if (/complete|reconcil|coverage|\bdata\b|how much.*know/.test(text)) return "reconciliation";
  if (/find|opportunit|save|saving|\bmoney\b|wast/.test(text)) return "findings";
  if (/meter|pump|cost|expensive|\bbill\b/.test(text)) return "meters";
  return "overview";
}

/**
 * Build a deterministic, GROUNDED answer for the stub — no model involved. It reads the farm
 * through the same loaders the tools wrap (so the offline answer names real meters and real
 * dollars, never a fabricated number) and routes on the user's actual question, so a tapped
 * starter is genuinely answered. This is what lets dev/test/CI run with zero external calls.
 */
export async function composeStubAnswer(
  deps: AlmondToolDeps,
  uiMessages: UIMessage[] = [],
): Promise<string> {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  const kpi = computeKpiStrip(meters);
  const overview = summarizeFarmOverview(deps.farmName, meters, kpi);
  const intent = classifyIntent(lastUserText(uiMessages));

  if (intent === "rates") {
    const rates = rateSchedulesByFrequency(meters).filter((r) => r.rate !== UNKNOWN_RATE);
    if (rates.length === 0) return `I do not have a rate schedule on file for any meter yet.`;
    const top = rates[0];
    const legacy = rates.filter((r) => r.isLegacy).map((r) => r.rate);
    const legacyLine = legacy.length > 0 ? ` Legacy rates still in use: ${legacy.join(", ")}.` : "";
    return `You have ${rates.length} rate schedules across your meters. The most common is ${top?.rate} on ${top?.meterCount} meters.${legacyLine}`;
  }

  if (intent === "reconciliation") {
    const recon = summarizeReconciliation(meters);
    const states = recon.byCoverageState.map((s) => `${s.meterCount} ${s.state}`).join(", ");
    return `Across ${recon.meterCount} meters, billing coverage breaks down as: ${states || "no data yet"}.`;
  }

  if (intent === "findings") {
    const findings = summarizeFindings(await loadFindings(deps.prisma, deps.farmId));
    const top = findings[0];
    if (!top) return `Nothing needs you right now.`;
    const impact = top.impact ? ` worth about ${top.impact.usd}` : "";
    const where = top.meterName ? ` on ${top.meterName}` : "";
    return `Your biggest open opportunity${where}: ${top.situation}${impact}.`;
  }

  if (intent === "meters") {
    const summary = summarizeMeters(meters, {});
    const withBill = summary.meters
      .filter((m) => m.latestBill !== null)
      .sort((a, b) => (b.latestBill?.cents ?? 0) - (a.latestBill?.cents ?? 0));
    const top = withBill[0];
    if (!top || !top.latestBill) {
      return `You have ${summary.total} meters. I do not have a posted bill for any of them yet.`;
    }
    return `Of your ${summary.total} meters, the costliest on its latest bill is ${top.name} at ${top.latestBill.usd}.`;
  }

  // overview
  const lines: string[] = [];
  lines.push(
    `Here is ${overview.farmName} at a glance: ${overview.meterCount} meters across ${overview.rateSchedules.length} rate schedules.`,
  );
  if (overview.latestMonthSpend) {
    lines.push(`Latest month spend is ${overview.latestMonthSpend.usd}.`);
  }
  lines.push(`Ask me about a specific meter, your rates, or where the money is going.`);
  return lines.join(" ");
}

/** The offline, deterministic responder. Default when no Gateway key is present. */
export function createStubResponder(): AlmondResponder {
  return {
    async toResponse({ uiMessages, deps }) {
      const answer = await composeStubAnswer(deps, uiMessages);
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          const id = "almond-stub-0";
          writer.write({ type: "text-start", id });
          for (const delta of toTextChunks(answer)) {
            writer.write({ type: "text-delta", id, delta });
          }
          writer.write({ type: "text-end", id });
        },
      });
      return createUIMessageStreamResponse({ stream });
    },
  };
}

/**
 * The default responder: live Gateway when a key is present, else the offline stub. This is the
 * single selection point — the route just calls this.
 */
export function defaultAlmondResponder(): AlmondResponder {
  return hasGatewayKey() ? createGatewayResponder() : createStubResponder();
}
