// The Almond CROP responder (Phase 7, Track E): a streamText surface with a set of READ-ONLY tools
// that render as generative UI. This is PARALLEL to — and does not replace — the existing bash
// ToolLoopAgent in `agent.ts` (document generation in a Sandbox); that stays working untouched.
//
// The gate this responder enforces:
//   - Every NUMBER Almond shows comes from a TOOL RESULT (a deterministic recompute / Track-D view).
//     The model orchestrates PROSE only — it cannot emit a pound. The prose is non-PII (it talks
//     about which tool to call, not the figures), so the orchestration model is the Vercel AI Gateway
//     (createGatewayModel). The grower's pounds reach the user only inside the typed tool results
//     rendered by the result components — they never transit the model's text.
//   - The farmId is captured from the SESSION into the tool deps at construction, NEVER a tool input,
//     so the model can never widen scope to another farm.
//
// Retrieval (find-report) and the live model are credential/infra-gated by their own modules: with no
// gateway key the route fails closed before calling here; with no ZDR key find-report returns an
// explicit "unavailable" result. This module assembles the responder; the route owns the gates.

import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createGatewayModel } from "@/lib/ai/gateway";
import { resolveAlmondModel, type AlmondModelId } from "@/lib/almond/models";
import type { CropToolDeps } from "./tools/deps";
import { CROP_TOOL_NAMES } from "./tools/names";
import { positionCardTool } from "./tools/position-card";
import { packerTableTool } from "./tools/packer-table";
import { yoyChartTool } from "./tools/yoy-chart";
import { findReportTool, type FindReportDeps } from "./tools/find-report";

/** A sane cap on the tool/orchestration loop for a read-only Q&A surface. */
export const CROP_RESPONDER_MAX_STEPS = 8;

/** What the route hands the responder: the session-scoped deps + the chosen model + the messages. */
export type CropResponderArgs = {
  /** Crop deps with the retrieval port (farmId pinned from the session). */
  deps: FindReportDeps;
  /** Validated model id (defaults to the Almond default when unrecognized). */
  modelId?: AlmondModelId;
  /** The conversation so far, as UI messages from the client. */
  messages: UIMessage[];
  /** Forwarded so an aborted request tears the stream down. */
  abortSignal?: AbortSignal;
};

function buildCropInstructions(): string {
  return [
    "You are Almond, Terra's crop production analyst for California almond growers.",
    "",
    "Speak in plain operator English: pounds, varieties, packers, pools, crop years, settlements.",
    "",
    "Hard grounding rules (non-negotiable):",
    "- You do NOT know any pound figure on your own. EVERY number the grower sees comes from a tool",
    "  result you call, never from your prose. Do not state, estimate, or add up pounds yourself.",
    "- To show a position, the by-packer table, or the year-over-year chart, CALL the matching tool",
    "  and let its result render. Your text only explains and points at what the tool returned.",
    "- If a tool returns an empty result, say plainly that there is nothing on file for that scope.",
    "  Never invent a figure to fill the gap.",
    "- To ground an answer in the grower's own documents, call the document-search tool. If it reports",
    "  it is unavailable, say document search is not set up; do not fabricate a citation.",
    "- A settled figure is a packer final; an estimate is the Almond Logic estimate. Never present an",
    "  estimate as a final — the tool results carry that provenance; keep it.",
    "",
    "Keep answers short and actionable. Call a tool, then summarize what it shows in a sentence or two.",
  ].join("\n");
}

/**
 * The read-only crop tool set, every tool a thin wrapper over a pure farmId-scoped query. position /
 * packer / yoy take only the shared crop deps; find-report also needs the retrieval port.
 */
export function buildCropTools(deps: FindReportDeps) {
  const cropDeps: CropToolDeps = { farmId: deps.farmId, loadLedger: deps.loadLedger };
  return {
    [CROP_TOOL_NAMES.position]: positionCardTool(cropDeps),
    [CROP_TOOL_NAMES.packerTable]: packerTableTool(cropDeps),
    [CROP_TOOL_NAMES.yoyChart]: yoyChartTool(cropDeps),
    [CROP_TOOL_NAMES.findReport]: findReportTool(deps),
  } as const;
}

// The stable tool names live in ./tools/names (dependency-free) so the client render switch can
// import them without pulling streamText / the gateway into the bundle. Re-exported here for callers.
export { CROP_TOOL_NAMES } from "./tools/names";

/**
 * Run the crop responder: streamText over the gateway model with the read-only crop tools. The
 * caller (the route) has already resolved the farm and gated the gateway key. Returns the
 * StreamTextResult so the route can stream it as a UI-message response.
 */
export async function runCropResponder(args: CropResponderArgs) {
  return streamText({
    model: createGatewayModel(resolveAlmondModel(args.modelId)),
    system: buildCropInstructions(),
    messages: await convertToModelMessages(args.messages),
    tools: buildCropTools(args.deps),
    stopWhen: stepCountIs(CROP_RESPONDER_MAX_STEPS),
    abortSignal: args.abortSignal,
  });
}
