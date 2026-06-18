import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type LanguageModel,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { createGatewayModel, hasGatewayKey } from "@/lib/ai/gateway";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings } from "@/lib/dashboard/findings";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { LENS_KEYS } from "@/lib/dashboard/surface";
import {
  rateSchedulesByFrequency,
  summarizeFarmOverview,
  summarizeFindings,
  summarizeMeters,
  summarizeReconciliation,
  UNKNOWN_RATE,
} from "./shape";
import {
  resolveNavigate,
  type NavigateAction,
  type NavigateInput,
  type NavigateResult,
} from "./skills/navigate";
import { describeNavigation } from "./skills/describe-navigation";
import { buildAlmondSkills, type AlmondActor, type AlmondToolDeps } from "./tools";

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
  /** The server-resolved capability of the caller; gates which skills the model is handed
   *  (ADR-A08). The stub ignores it (read-only, grounded directly); the model path passes it
   *  to `buildAlmondSkills`. */
  actor: AlmondActor;
};

export interface AlmondResponder {
  toResponse(req: AlmondRequest): Response | Promise<Response>;
}

// --- The server->client navigation bridge (Story 7.4) -------------------------------------------
//
// On a clean `navigate` resolve, the SERVER writes a typed, TRANSIENT `data-navigate` part onto the
// existing UI-message stream (ADR-A02, AR17) — one stream, no second channel. `transient: true`
// keeps it OUT of message history: the client receives it once via `useChat`'s `onData` callback
// (never replayed on a re-render or a reload), which is what makes "applied exactly once" (7.4 AC3)
// structural rather than a fragile dedupe. The SAME helper serves the stub and the live model path,
// so the emitted part shape is identical on both (AC6). The pure `navigate` skill (Story 7.3) still
// just RETURNS the action; the responder lifts it onto the stream (the 7.3/7.4 boundary).
//
// NEVER-HIJACK (Story 7.5, FR4): `writeNavigatePart` is the ONLY writer of a navigate part, and it
// is called ONLY from within a responder's per-turn `toResponse` — never from a timer, interval, or
// background effect. So a navigation is emitted strictly in response to the grower's turn that drove
// it; Almond never moves the screen spontaneously.
//
// CHIP LABEL (Story 7.5, FR2): the part carries BOTH the `NavigateAction` (so 7.4's `apply` works
// unchanged) AND a server-composed plain-English `label` for the action chip. The label needs the
// meter NAME (the action carries only the id); the name rides on the `navigate` result
// (`resolveNavigate` captured it where the match happened), so labeling needs NO second meter read
// and the write stays synchronous on both paths. The name is never fabricated.

/** The data-part type the client bridge (`useAlmondNavigation`) listens for. */
const NAVIGATE_PART_TYPE = "data-navigate" as const;
/** A stable part id (navigation is non-reconciling; chip keys are derived client-side per message). */
const NAVIGATE_PART_ID = "almond-nav";

function writeNavigatePart(
  writer: UIMessageStreamWriter,
  action: NavigateAction,
  meterName?: string,
): void {
  const label = describeNavigation(action, meterName);
  writer.write({
    type: NAVIGATE_PART_TYPE,
    id: NAVIGATE_PART_ID,
    data: { action, label },
    transient: true,
  });
}

/** Narrow an unknown tool output (the live path inspects `onStepFinish` tool results). */
function isNavigateResult(output: unknown): output is NavigateResult {
  return typeof output === "object" && output !== null && "kind" in output;
}

/** Stream Almond's answer through a real LanguageModel with the farm-scoped tools. Works with
 *  the live Gateway model or a mock model in tests — the streamText tool-calling loop is the same.
 *  Wrapped in `createUIMessageStream` so a clean `navigate` tool result is lifted onto the stream as
 *  a transient `data-navigate` part (AC5), riding the same stream as the model's text/tool parts. */
export function createModelResponder(model: LanguageModel): AlmondResponder {
  return {
    async toResponse({ uiMessages, system, deps, actor }) {
      const messages = await convertToModelMessages(uiMessages);
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          const result = streamText({
            model,
            system,
            messages,
            tools: buildAlmondSkills(deps, actor),
            stopWhen: stepCountIs(6),
            // Synchronous: the chip label needs only the action + the meter name, and the name rides
            // on the tool's own result (`navigate` already loaded the meters), so there is no second
            // read and nothing to await — the part is written in step order with no failure surface.
            onStepFinish: ({ toolResults }) => {
              for (const tr of toolResults) {
                if (
                  tr.toolName === "navigate" &&
                  isNavigateResult(tr.output) &&
                  tr.output.kind === "navigate"
                ) {
                  writeNavigatePart(writer, tr.output.action, tr.output.meterName);
                }
              }
            },
          });
          writer.merge(result.toUIMessageStream());
        },
      });
      return createUIMessageStreamResponse({ stream });
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

// --- Offline navigation routing for the stub (Story 7.4) ----------------------------------------
//
// The live model produces the structured `navigate` input; the stub parses the user's text just
// enough to drive the SAME shipped skill so e2e/CI prove navigation with ZERO external calls
// (NFR3, AR18). Intentionally a simple deterministic parser — a fixture, not the model.

const NAV_VERB = /\b(open|show|see|view|go to)\b/;

/** Whether the latest user turn is a request to drive the screen (vs. a data question). A lens word
 *  ("map"/"table"/...) also counts, so "switch to the map" is caught without `switch` being a verb. */
export function isNavigationTurn(text: string): boolean {
  if (NAV_VERB.test(text)) return true;
  return LENS_KEYS.some((k) => new RegExp(`\\b${k}\\b`).test(text));
}

/** Parse a deterministic `NavigateInput` from the (lower-cased) user text. A lens word wins; else an
 *  open/show verb opens the named meter; else nothing actionable. Free-text entity/ranch/rate
 *  filtering is intentionally NOT derived here: `lastUserText` lower-cases the text, but the
 *  dashboard's `filterMeters` is a case-sensitive exact match, so a stub-derived filter would
 *  silently match nothing. Filtering offline is left to the live model's structured input. */
export function deriveNavigateInput(text: string): NavigateInput {
  const lens = LENS_KEYS.find((k) => new RegExp(`\\b${k}\\b`).test(text));
  if (lens) return { lens };
  const opened = text.match(/\b(?:open|show|see|view|go to)\b\s+(?:me\s+|the\s+)*(.+)$/);
  if (opened && opened[1]) return { open: "meter", query: opened[1].trim() };
  return {};
}

/** A short, grounded acknowledgment the stub streams alongside (navigate) or instead of the part. */
function navigationStubText(result: NavigateResult): string {
  switch (result.kind) {
    case "navigate":
      return "Opening that now.";
    case "clarify":
      return `I found more than one match: ${result.candidates.join(", ")}. Which one do you mean?`;
    case "none":
      return "I could not find that on your farm.";
    case "unknown-surface":
      return `I cannot open ${result.requested}; that view does not exist.`;
  }
}

/** The offline, deterministic responder. Default when no Gateway key is present. */
export function createStubResponder(): AlmondResponder {
  return {
    async toResponse({ uiMessages, deps }) {
      // A navigation turn drives the screen via the shipped resolver (offline); any other turn gets
      // the existing grounded data answer. Both stream text; only a clean navigate writes the part.
      const text = lastUserText(uiMessages);
      let navigation: NavigateResult | null = null;
      let answer: string;
      if (isNavigationTurn(text)) {
        const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
        const result = resolveNavigate(meters, deriveNavigateInput(text));
        // A turn that looks like navigation but resolves to nothing (e.g. "show me the data", or a
        // verb with no parseable target) is better served as a data question than a dead-end, so
        // fall through to the grounded answer instead of "I could not find that on your farm".
        if (result.kind === "none") {
          answer = await composeStubAnswer(deps, uiMessages);
        } else {
          navigation = result;
          answer = navigationStubText(result);
        }
      } else {
        answer = await composeStubAnswer(deps, uiMessages);
      }
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          const id = "almond-stub-0";
          writer.write({ type: "text-start", id });
          for (const delta of toTextChunks(answer)) {
            writer.write({ type: "text-delta", id, delta });
          }
          writer.write({ type: "text-end", id });
          if (navigation?.kind === "navigate") {
            writeNavigatePart(writer, navigation.action, navigation.meterName);
          }
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
