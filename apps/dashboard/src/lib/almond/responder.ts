import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
  type LanguageModel,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { createGatewayModel, hasGatewayKey } from "@/lib/ai/gateway";
import { en } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings } from "@/lib/dashboard/findings";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { LENS_KEYS } from "@/lib/dashboard/surface";
import { analyzeFarm, type EnrichedMeter } from "./analysis";
import {
  rankMeters,
  rateSchedulesByFrequency,
  summarizeFarmOverview,
  summarizeFindings,
  summarizeReconciliation,
  UNKNOWN_RATE,
  type RankMetersOptions,
} from "./shape";
import {
  resolveNavigate,
  type NavigateAction,
  type NavigateInput,
  type NavigateResult,
  type NavState,
} from "./skills/navigate";
import { describeNavigation } from "./skills/describe-navigation";
import {
  type ExportSpreadsheetInput,
  type ExportSpreadsheetResult,
} from "./skills/export-spreadsheet";
import {
  type GenerateReportInput,
  type GenerateReportResult,
} from "./skills/generate-report";
import { type CodegenExportResult } from "./skills/codegen-export";
import { storeReport, type GeneratedReportKind, type ReportToStore } from "./reports/store";
import { DEFAULT_ALMOND_MODEL } from "./models";
import type { AutoDecided, AutoHeadlineKey } from "./auto/types";
import { billableTokens, recordUsage } from "./usage-budget";
import {
  buildAlmondSkills,
  exportSpreadsheetSkill,
  generateReportSkill,
  type AlmondActor,
  type AlmondToolDeps,
} from "./tools";

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
  /** The Auto router's decision for this turn (when the grower picked "Auto"). Carries the PREDICTED
   *  decided-line headline; the responder writes it once and may correct a stale cache prediction from
   *  the real file outcome (see `writeDecidedPart`). Absent for a hand-picked model, in which case no
   *  decided line is written and every existing behavior is unchanged. */
  decided?: AutoDecided;
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
  state?: NavState,
): void {
  // The label is composed FROM the resolver's post-action state (the verify-before-narrate seam):
  // a clear says "Showing all N", a filter says its real count, an empty filter says "no meters
  // match" - never a count derived from the request. With no state (should not happen on a clean
  // resolve) it falls back to the request-derived copy.
  const label = describeNavigation(action, meterName, state);
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

// --- The Auto "what it decided" line (the Auto router) -------------------------------------------
//
// When the grower picks "Auto", the server-side router classifies the turn and hands the responder a
// PREDICTED `decided.headline` (the copy KEY, not text — resolved client-side from `en.shell.almond.auto`).
// The responder writes that headline onto the SAME UI-message stream as a transient `data-decided` part,
// so the client buffers it once (like navigate/report parts) and never replays it. The concrete model id
// stays server-side (already recorded on the usage row); only the headline key crosses the wire.
//
// ONCE + CORRECTED: the live path writes the part in `streamText`'s `onFinish` (after ALL tool-loop
// steps), which is exactly-once by construction and reflects any correction made along the way. The one
// correction: a file ask the router predicted as a cache HIT (`pulledCached`) but whose tool result comes
// back with `fromCache !== true` (the predicted hit went stale and built fresh) is swapped to
// `buildingNew`, so the line never claims bytes were pulled when they were actually built. A hand-picked
// model passes no `decided`, so no part is written and behavior is unchanged.

/** The data-part type the client Auto badge listens for. */
const DECIDED_PART_TYPE = "data-decided" as const;
/** A stable part id (a turn decides at most one headline; non-reconciling, like the other parts). */
const DECIDED_PART_ID = "almond-decided";

function writeDecidedPart(writer: UIMessageStreamWriter, headline: AutoHeadlineKey): void {
  writer.write({
    type: DECIDED_PART_TYPE,
    id: DECIDED_PART_ID,
    data: { headline },
    transient: true,
  });
}

// --- The file download bridge (Story 8.5 / 9.3) + Reports persistence (Story 8.6) ---------------
//
// The `exportSpreadsheet` (8.5) and `generateReport` (9.3) skills (both owner-only) build a file's
// bytes; the responder lifts them onto the SAME UI-message stream as a transient `data-report` part
// the panel renders as a download card. The bytes are base64-encoded so they ride the JSON stream
// (and `useChat`'s `onData`) intact, then the panel rebuilds a Blob client-side. `transient: true`
// keeps the (potentially large) bytes OUT of message history, so they are delivered once and never
// replayed or persisted. The model-visible tool output is collapsed to a tiny text summary
// (`toModelOutput` in tools.ts), so the bytes never enter the prompt window. A typed `empty` /
// `error` outcome is NOT written as a download card - the preview/answer text carries it - so a failed
// or empty file never produces a partial download.
//
// PERSISTENCE (Story 8.6): for an AUTHED OWNER, the same bytes are ALSO kept in the grower's Reports
// before the card is written: `storeReport` writes them to a private blob and records a
// GeneratedReport row, and the card gains a "saved to Reports" line (`saved: true`). The public Tour
// is never an owner, so its file is never stored (capability-by-omission) and its card has no saved
// line. Persistence is best-effort relative to the download: if the store fails, the grower STILL
// gets the file (the card is written with `saved: false`) rather than losing the download.

/** The data-part type the client download card listens for. */
const REPORT_PART_TYPE = "data-report" as const;
/** A stable part id (a turn produces at most one file; non-reconciling, like the navigate part). */
const REPORT_PART_ID = "almond-report";

/** The payload the panel needs to offer the download: the base64 bytes plus the server-authored
 *  file name, content type, and a plain count for the card label. No path, no model-authored value.
 *  When the export was persisted for an authed owner (Story 8.6), `saved` is true so the card can
 *  show the "saved to Reports" line; it is false/absent for an export that was not stored. */
export type AlmondReportData = {
  fileName: string;
  contentType: string;
  /** The file bytes, base64-encoded for JSON transport (the panel decodes to a Blob). */
  base64: string;
  meterCount: number;
  /** True when the file was kept in the grower's Reports (owner-only persistence, Story 8.6). */
  saved?: boolean;
};

/** Base64-encode the file bytes for JSON transport. The Almond route is the Node runtime, so
 *  `Buffer` is available; this keeps the encode dependency-free (no transitive provider-utils import).
 *  The panel decodes the string back to a Blob client-side via `atob`. */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * A clean `file` outcome from either file skill, normalized to the single shape the persist-and-stream
 * path needs. The export (8.5) and report (9.3) results share every download field; they differ only
 * in the persisted `kind` (the export's table, vs `"report"` for a PDF), so the caller supplies that.
 * Carrying the bytes + metadata here lets ONE function serve both skills with no duplicated logic.
 */
type StreamableFile = {
  kind: GeneratedReportKind;
  preview: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  meterCount: number;
  coverageAsOf: string | null;
  params: ReportToStore["params"];
};

/** Normalize a clean export result into the common streamable-file shape, or null for empty/error
 *  (no download is written for those). The persisted kind is the export's table. */
function exportFile(result: ExportSpreadsheetResult): StreamableFile | null {
  if (result.kind !== "file") return null;
  return {
    kind: result.table,
    preview: result.preview,
    fileName: result.fileName,
    contentType: result.contentType,
    bytes: result.bytes,
    meterCount: result.meterCount,
    coverageAsOf: result.coverageAsOf,
    params: result.params,
  };
}

/** Normalize a clean report result into the common streamable-file shape, or null for empty/error.
 *  A PDF is always persisted under the `"report"` kind. */
function reportFile(result: GenerateReportResult): StreamableFile | null {
  if (result.kind !== "file") return null;
  return {
    kind: "report",
    preview: result.preview,
    fileName: result.fileName,
    contentType: result.contentType,
    bytes: result.bytes,
    meterCount: result.meterCount,
    coverageAsOf: result.coverageAsOf,
    params: result.params,
  };
}

/** Normalize a clean code-gen export result into the common streamable-file shape, or null for
 *  empty/error. Persisted under the distinct `"codegen"` kind so Reports history can tell a model-
 *  authored custom report from a deterministic one. The stream/card path is identical (content-type
 *  driven), so the download card needs no change. */
function codegenFile(result: CodegenExportResult): StreamableFile | null {
  if (result.kind !== "file") return null;
  return {
    kind: "codegen",
    preview: result.preview,
    fileName: result.fileName,
    contentType: result.contentType,
    bytes: result.bytes,
    meterCount: result.meterCount,
    coverageAsOf: result.coverageAsOf,
    params: result.params,
  };
}

/**
 * Persist a generated file to the owner's Reports (8.6) when the caller is an authed owner, then write
 * the bytes onto the stream as a transient `data-report` download card. Serves BOTH the spreadsheet
 * (8.5) and the PDF report (9.3): the caller normalizes its result to a `StreamableFile` first, so a
 * null (empty/error outcome) writes no card - a failed or empty file is surfaced as text, never an
 * empty download.
 *
 * Persistence runs ONLY for an authed owner (`actor.authedOwner` + a `userId`): the public Tour is
 * never an owner, so its file is never stored. A store failure does not cost the grower the
 * download — the card is still written, just with `saved: false`. Scope (farmId) and authorship
 * (userId) come from `deps`/`actor`, never from the model.
 */
async function persistAndWriteReportPart(
  writer: UIMessageStreamWriter,
  file: StreamableFile | null,
  deps: AlmondToolDeps,
  actor: AlmondActor,
  requestText: string,
): Promise<void> {
  if (file === null) return;

  let saved = false;
  if (actor.authedOwner) {
    try {
      await storeReport(
        { prisma: deps.prisma, farmId: deps.farmId, createdById: actor.userId },
        {
          kind: file.kind,
          title: file.fileName,
          requestText: requestText.trim() || file.preview,
          coverageAsOf: file.coverageAsOf,
          params: file.params,
          bytes: file.bytes,
          contentType: file.contentType,
          // No serve-from-cache: every file is built fresh, so the Reports row is history only.
          cacheKey: null,
          meterCount: file.meterCount,
        },
      );
      saved = true;
    } catch {
      // Best-effort: a store failure must not cost the grower the download. The card is still
      // written below (saved stays false) so the file is delivered; the row is simply absent.
      saved = false;
    }
  }

  const data: AlmondReportData = {
    fileName: file.fileName,
    contentType: file.contentType,
    base64: toBase64(file.bytes),
    meterCount: file.meterCount,
    saved,
  };
  writer.write({ type: REPORT_PART_TYPE, id: REPORT_PART_ID, data, transient: true });
}

/** Narrow an unknown tool output to an export result (the live path inspects `onStepFinish`). */
function isExportResult(output: unknown): output is ExportSpreadsheetResult {
  if (typeof output !== "object" || output === null || !("kind" in output)) return false;
  const kind = (output as { kind: unknown }).kind;
  return kind === "file" || kind === "empty" || kind === "error";
}

/** Narrow an unknown tool output to a generate-report result. Same outcome shape as the export, so
 *  this checks the discriminant kinds the report skill returns. */
function isReportResult(output: unknown): output is GenerateReportResult {
  if (typeof output !== "object" || output === null || !("kind" in output)) return false;
  const kind = (output as { kind: unknown }).kind;
  return kind === "file" || kind === "empty" || kind === "error";
}

/** Narrow an unknown tool output to a code-gen export result. Same `file`/`empty`/`error` outcome shape
 *  as the other file skills (the codegen skill mirrors it so this persist-and-stream path serves it). */
function isCodegenResult(output: unknown): output is CodegenExportResult {
  if (typeof output !== "object" || output === null || !("kind" in output)) return false;
  const kind = (output as { kind: unknown }).kind;
  return kind === "file" || kind === "empty" || kind === "error";
}

/** Stream Almond's answer through a real LanguageModel with the farm-scoped tools. Works with
 *  the live Gateway model or a mock model in tests — the streamText tool-calling loop is the same.
 *  Wrapped in `createUIMessageStream` so a clean `navigate` tool result is lifted onto the stream as
 *  a transient `data-navigate` part (AC5), riding the same stream as the model's text/tool parts. */
export function createModelResponder(
  model: LanguageModel,
  // The resolved Gateway model-id string, recorded on each usage row for per-model cost analysis.
  // A `LanguageModel` can be an opaque object (or a bare string), so the id is threaded explicitly
  // rather than read off `model`. Defaults to the menu default for tests that pass a mock model.
  modelId: string = DEFAULT_ALMOND_MODEL,
  // The Auto router's decision, when constructed for an Auto turn. The per-REQUEST `decided` (below)
  // wins over this closure default so a single responder instance can serve either; absent on both
  // means no decided line is written.
  decided?: AutoDecided,
): AlmondResponder {
  return {
    async toResponse(req) {
      const { uiMessages, system, deps, actor } = req;
      const turnDecided = req.decided ?? decided;
      const messages = await convertToModelMessages(uiMessages);
      // The grower's most recent turn, recorded with a persisted export (8.6) as the request that
      // produced it. Captured once per turn; the export branch below reads it.
      const requestText = lastUserText(uiMessages);
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          // Dedupe navigate parts within a turn: a multi-step tool-calling loop can surface the SAME
          // navigate result more than once (or the model can re-call `navigate` with an identical
          // action), which previously rendered two identical action chips ("Opened Westside Pump 17"
          // twice). Keyed by the serialized action, so two DIFFERENT moves in one turn still both show.
          const writtenNav = new Set<string>();
          // Same guard for file cards, keyed by file name: a multi-step loop surfacing the export/report
          // result twice previously rendered (and for an owner, persisted) the SAME file twice. One file
          // name = one card and one Reports row.
          const writtenFiles = new Set<string>();
          // The Auto decided-line headline for this turn (the router's classification). A file ask always
          // builds fresh now (no cache), so there is no correction to make: written ONCE in `onFinish`
          // below; undefined for a hand-picked model.
          const finalHeadline = turnDecided?.headline;
          const result = streamText({
            model,
            system,
            messages,
            tools: buildAlmondSkills(deps, actor),
            stopWhen: stepCountIs(6),
            // Stream the model's words at a steady cadence so the reply types in smoothly (like
            // Claude/Notion) instead of arriving in uneven token bursts.
            experimental_transform: smoothStream({ chunking: "word" }),
            // The navigate chip is synchronous (the name rides on the tool result), but a clean
            // export or report now also PERSISTS to Reports for an owner (8.6), which is async, so the
            // step handler awaits that write before the card is streamed.
            onStepFinish: async ({ toolResults }) => {
              for (const tr of toolResults) {
                if (!tr) continue;
                if (
                  tr.toolName === "navigate" &&
                  isNavigateResult(tr.output) &&
                  tr.output.kind === "navigate"
                ) {
                  const key = JSON.stringify(tr.output.action);
                  if (!writtenNav.has(key)) {
                    writtenNav.add(key);
                    writeNavigatePart(
                      writer,
                      tr.output.action,
                      tr.output.meterName,
                      tr.output.state,
                    );
                  }
                }
                // A clean export persists to the owner's Reports (8.6), then lifts its bytes onto the
                // stream as a download card (8.5). An empty or errored export writes no card - the
                // model's text carries that outcome instead. Deduped by file name so a repeated result
                // never doubles the card (or the saved Reports row).
                if (tr.toolName === "exportSpreadsheet" && isExportResult(tr.output)) {
                  const file = exportFile(tr.output);
                  if (file && !writtenFiles.has(file.fileName)) {
                    writtenFiles.add(file.fileName);
                    await persistAndWriteReportPart(writer, file, deps, actor, requestText);
                  }
                }
                // A clean PDF report (9.3) follows the SAME path: persist to Reports, then stream the
                // bytes as a download card. Empty/error outcomes write no card (text carries them).
                if (tr.toolName === "generateReport" && isReportResult(tr.output)) {
                  const file = reportFile(tr.output);
                  if (file && !writtenFiles.has(file.fileName)) {
                    writtenFiles.add(file.fileName);
                    await persistAndWriteReportPart(writer, file, deps, actor, requestText);
                  }
                }
                // A clean code-gen export (POC) follows the SAME path: a verified, model-authored PDF is
                // persisted (kind "codegen") and streamed as a download card. A verification reject /
                // error already fell back to the deterministic template inside the skill, so whatever
                // arrives here is a real file or a typed empty/error (which writes no card).
                if (tr.toolName === "codegenExport" && isCodegenResult(tr.output)) {
                  const file = codegenFile(tr.output);
                  if (file && !writtenFiles.has(file.fileName)) {
                    writtenFiles.add(file.fileName);
                    await persistAndWriteReportPart(writer, file, deps, actor, requestText);
                  }
                }
                // The bespoke WORKBOOK codegen (Phase 3) follows the SAME path: a verified, model-authored
                // .xlsx persisted (kind "codegen") and streamed as a download card. A reject/error already
                // fell back to the deterministic workbook inside the skill, so what arrives is a real file
                // or a typed empty/error (which writes no card). The card is content-type driven, so the
                // .xlsx renders with the spreadsheet download label unchanged.
                if (tr.toolName === "codegenWorkbook" && isCodegenResult(tr.output)) {
                  const file = codegenFile(tr.output);
                  if (file && !writtenFiles.has(file.fileName)) {
                    writtenFiles.add(file.fileName);
                    await persistAndWriteReportPart(writer, file, deps, actor, requestText);
                  }
                }
              }
            },
            // Account the turn's TOKEN usage against the durable per-user budget (Story 10.4). Fires
            // AFTER the stream settles, so it never delays the client's bytes, and reads `totalUsage`
            // — the SUM across every tool-loop step, not just the last. Gated on a real authed user
            // (deps.meterUserId is null for the public Tour, which is metered by IP instead, not here).
            // recordUsage is best-effort (it swallows its own errors), so a metering write can never
            // break a turn the grower already received. A live turn that reports no tokens at all
            // falls back to a flagged estimate so a hidden-usage provider cannot zero-charge its way
            // around the cap.
            onFinish: async ({ totalUsage }) => {
              // Write the Auto decided line ONCE, after every tool-loop step, so it reflects any
              // correction (`pulledCached` -> `buildingNew`) made in `onStepFinish` above. Writing here
              // (not per step) is exactly-once by construction. Undefined for a hand-picked model.
              if (finalHeadline) writeDecidedPart(writer, finalHeadline);
              if (deps.meterUserId === null) return;
              await recordUsage(deps.prisma, {
                userId: deps.meterUserId,
                farmId: deps.farmId,
                source: "chat",
                model: modelId,
                ...billableTokens(totalUsage),
              });
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
export function createGatewayResponder(modelId?: string, decided?: AutoDecided): AlmondResponder {
  // Pass the resolved id (or the menu default when absent — createGatewayModel itself defaults to
  // Opus 4.8) so usage rows record exactly which model was billed. `decided` (when an Auto turn) rides
  // through to the model responder so the decided line is written for the live path.
  return createModelResponder(createGatewayModel(modelId), modelId ?? DEFAULT_ALMOND_MODEL, decided);
}

/** Split the stub answer into word-sized deltas (each word plus its trailing whitespace) so the
 *  offline/demo path types in word-by-word and reads as smoothly as the live model's `smoothStream`
 *  cadence, instead of arriving in fixed character blocks. The reassembled text is byte-identical. */
function toTextChunks(text: string): string[] {
  if (text.length === 0) return [""];
  const chunks = text.match(/\S+\s*|\s+/g);
  return chunks && chunks.length > 0 ? chunks : [""];
}

type StubIntent = "rates" | "reconciliation" | "findings" | "meters" | "overview";

/** Filenames of file attachments on the latest user turn. By the time the stub runs, spreadsheets
 *  have already been parsed to text in the route, so these are the PDFs/images the live model would
 *  read natively; the offline stub uses them only to acknowledge an attachment it cannot read. */
function lastUserAttachmentNames(uiMessages: UIMessage[]): string[] {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const m = uiMessages[i];
    if (m?.role === "user") {
      return (m.parts ?? []).flatMap((p) =>
        p.type === "file"
          ? [typeof p.filename === "string" && p.filename.length > 0 ? p.filename : "a file"]
          : [],
      );
    }
  }
  return [];
}

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
    // The costliest meter, ranked through the SAME pure helper the queryMeters tool uses, so the
    // offline answer can never disagree with the live model's ranking. Cost = the latest reconciled
    // bill (analyzeFarm), so a meter with no posted bill ranks last (null) and never wins.
    const analysis = analyzeFarm(meters, await loadFindings(deps.prisma, deps.farmId));
    const top = rankMeters(analysis, { sortBy: "cost", order: "desc", limit: 1 })[0];
    if (!top || top.thisCycleCents === null) {
      return `You have ${analysis.totals.meterCount} meters. I do not have a posted bill for any of them yet.`;
    }
    return `Of your ${analysis.totals.meterCount} meters, the costliest on its latest bill is ${top.name} at ${formatUsdWhole(top.thisCycleCents)}.`;
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

// NAV_VERB stays exported (auto/intent.ts reads it to classify nav-class intent); night's T5 work
// widened it to include clear/reset so "clear the filter" also reads as a navigation intent.
export const NAV_VERB = /\b(open|show|see|view|go to|clear|reset)\b/;
// A "show the whole farm again" / "clear the filter" / "show all meters" phrase: the clear-filters
// intent (T5). Matched here so the offline stub drives the SAME clear action the live model would,
// proving the bug fix (the table returns to every meter) with zero external calls.
const CLEAR_FILTER = /\b(whole farm|all meters|all the meters|every meter|everything|no filter)\b/;
const CLEAR_VERB = /\b(clear|reset|remove)\b.*\b(filter|filters)\b/;

// "open the pump that costs me the most" (T2): an OPEN verb pointed at a SUPERLATIVE rather than a
// named meter. The model would call queryMeters (limit 1) then navigate; the offline stub does the
// same two-step (rank, then open the winner) so the same behavior is proven with zero external calls.
// An open/show verb...
const OPEN_VERB = /\b(open|show|see|view|go to|jump to|take me to|pull up)\b/;
// ...pointed at a "most/least <superlative>" target (the priciest pump, the biggest bill, the most
// expensive meter), with no concrete meter name to look up.
const SUPERLATIVE =
  /\b(most expensive|priciest|costliest|biggest|highest|largest|cheapest|smallest|lowest|least expensive)\b|costs?\s+(me\s+)?the\s+most|costs?\s+(me\s+)?the\s+least/;
const RANK_FIELD_DEMAND = /\bdemand\b/;
const RANK_FIELD_SAVINGS = /\b(save|saving|savings)\b/;
const RANK_ORDER_ASC = /\b(cheapest|smallest|lowest|least expensive)\b|costs?\s+(me\s+)?the\s+least/;

/** Whether the latest user turn is a request to drive the screen (vs. a data question). A lens word
 *  ("map"/"table"/...) also counts, so "switch to the map" is caught without `switch` being a verb. */
export function isNavigationTurn(text: string): boolean {
  if (NAV_VERB.test(text)) return true;
  if (CLEAR_FILTER.test(text) || CLEAR_VERB.test(text)) return true;
  return LENS_KEYS.some((k) => new RegExp(`\\b${k}\\b`).test(text));
}

/** Parse a deterministic `NavigateInput` from the (lower-cased) user text. A lens word wins; else an
 *  open/show verb opens the named meter; else nothing actionable. Free-text entity/ranch/rate
 *  filtering is intentionally NOT derived here: `lastUserText` lower-cases the text, but the
 *  dashboard's `filterMeters` is a case-sensitive exact match, so a stub-derived filter would
 *  silently match nothing. Filtering offline is left to the live model's structured input. */
export function deriveNavigateInput(text: string): NavigateInput {
  // A clear-filters phrase wins first: "show me the whole farm again" / "clear the filter" resets
  // ALL three filter keys (the T5 bug fix). It may carry a lens word too ("show the table for the
  // whole farm"), so the lens is still derived alongside the clear.
  if (CLEAR_FILTER.test(text) || CLEAR_VERB.test(text)) {
    const clearLens = LENS_KEYS.find((k) => new RegExp(`\\b${k}\\b`).test(text));
    return clearLens ? { clear: true, lens: clearLens } : { clear: true };
  }
  const lens = LENS_KEYS.find((k) => new RegExp(`\\b${k}\\b`).test(text));
  if (lens) return { lens };
  const opened = text.match(/\b(?:open|show|see|view|go to)\b\s+(?:me\s+|the\s+)*(.+)$/);
  if (opened && opened[1]) return { open: "meter", query: opened[1].trim() };
  return {};
}

/** Whether the latest user turn is "open the pump that costs me the most" (an open verb pointed at a
 *  superlative, not a named meter). Distinguished from a normal open by the SUPERLATIVE: a request
 *  that names a real meter is handled by `deriveNavigateInput`; this one must first RANK, then open. */
export function isOpenSuperlativeTurn(text: string): boolean {
  return OPEN_VERB.test(text) && SUPERLATIVE.test(text);
}

/** The ranking options for an "open the pump that costs me the most" turn, parsed deterministically:
 *  the field (cost by default, demand or savings if named) and the direction (desc unless a
 *  "cheapest/lowest/least" superlative). Mirrors the queryMeters arguments the live model would pass,
 *  capped to the single winner (limit 1) since the request opens one meter. */
export function deriveOpenSuperlativeRank(text: string): RankMetersOptions {
  const sortBy: RankMetersOptions["sortBy"] = RANK_FIELD_DEMAND.test(text)
    ? "demand"
    : RANK_FIELD_SAVINGS.test(text)
      ? "savings"
      : "cost";
  const order: RankMetersOptions["order"] = RANK_ORDER_ASC.test(text) ? "asc" : "desc";
  return { sortBy, order, limit: 1 };
}

/** The plain reason a meter won the ranking, for the offline confirmation line. Mirrors how the live
 *  model would explain the pick (the whole-dollar figure on the ranked field), grounded in the same
 *  integer cents the rank used so the number can never disagree with the tool. */
function openSuperlativeReason(opts: RankMetersOptions, meter: EnrichedMeter): string {
  const sortBy = opts.sortBy ?? "cost";
  const least = opts.order === "asc";
  if (sortBy === "savings") {
    return `it has the ${least ? "smallest" : "biggest"} estimated rate-switch saving, about ${formatUsdWhole(meter.flags.estAnnualSavingsCents)}`;
  }
  if (sortBy === "demand") {
    const cents = meter.demandChargeCents ?? 0;
    return `it has the ${least ? "lowest" : "highest"} demand charge, about ${formatUsdWhole(cents)}`;
  }
  const cents = meter.thisCycleCents ?? 0;
  return `it has the ${least ? "lowest" : "highest"} latest bill, about ${formatUsdWhole(cents)}`;
}

// --- Offline export routing for the stub (Story 8.5) --------------------------------------------
//
// The live model produces the structured `exportSpreadsheet` input; the stub parses the user's text
// just enough to drive the SAME shipped skill so e2e/CI prove a download card lands with ZERO
// external calls. Intentionally a simple deterministic parser - a fixture, not the model. The stub
// only ever drives the export for an authenticated owner (capability parity with the factory gate):
// the public Tour, like the model, never gets an export.

export const EXPORT_VERB = /\b(export|download|spreadsheet|excel|xlsx|csv)\b/;
// A PDF/report request. Checked BEFORE the export verb so "download a pdf" / "make me a report" drive
// the report skill, while "export"/"spreadsheet"/"csv" still drive the spreadsheet (8.5).
export const REPORT_VERB = /\b(pdf|report|printout|print out|write[- ]?up|one[- ]?pager)\b/;

/** Whether the latest user turn asks for a PDF report (vs a spreadsheet). */
export function isReportTurn(text: string): boolean {
  return REPORT_VERB.test(text);
}

/** Whether the latest user turn asks for a spreadsheet/download. */
export function isExportTurn(text: string): boolean {
  return EXPORT_VERB.test(text);
}

/** Parse a deterministic `ExportSpreadsheetInput` from the (lower-cased) user text. Only the table
 *  shape is derived (bill-due vs meters); a free-text rate/entity/ranch filter is NOT derived (the
 *  same reason navigate does not - lower-cased text vs the model's structured value), so the offline
 *  export is the full inventory, which is the honest default. */
export function deriveExportInput(text: string): ExportSpreadsheetInput {
  if (/\b(bill|due|closing|close date|read date)\b/.test(text)) return { table: "billDue" };
  // A request that names the whole picture builds the rich multi-tab workbook offline too (parity
  // with the live default); a bare "meters" ask still gets the focused single-tab inventory.
  if (/\b(workbook|everything|overview|full|whole farm|all my data)\b/.test(text)) return { table: "workbook" };
  return { table: "meters" };
}

/** Parse a deterministic `GenerateReportInput` from the (lower-cased) user text. The offline stub
 *  picks the SECTION SHAPE from a few plain words; a free-text rate/entity/ranch filter and a meter
 *  name are NOT derived (the same reason export/navigate do not - lower-cased text vs the model's
 *  structured value), so the offline report is the whole farm, which is the honest default. A request
 *  that names savings or rates gets those sections too; otherwise it defaults to the farm summary plus
 *  the meter table (a non-empty whole-farm document). */
export function deriveReportInput(text: string): GenerateReportInput {
  const sections: GenerateReportInput["sections"] = ["summary"];
  if (/\b(save|saving|savings|money|cheaper)\b/.test(text)) sections.push("savings");
  if (/\b(rate|tariff|mis-?rated|wrong rate)\b/.test(text)) sections.push("misRated");
  // Always include the full meter table so the whole-farm document lists every meter (no cap).
  sections.push("meterTable");
  return { sections };
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
export function createStubResponder(decided?: AutoDecided): AlmondResponder {
  return {
    async toResponse(req) {
      const { uiMessages, deps, actor } = req;
      // The per-request decision wins over the closure default (parity with the model responder).
      const turnDecided = req.decided ?? decided;
      // Turn routing, in capability order: a PDF-report turn builds a report (offline); an export
      // turn builds a spreadsheet (offline); a navigation turn drives the screen; any other turn gets
      // the grounded data answer. The report and export branches are gated on `actor.canExport` for
      // parity with the factory gate - a caller without it never gets either (capability-by-omission),
      // exactly as the model is never handed those skills. Persistence stays owner-only (below), so a
      // demo export is streamed but never stored. The report verb is checked BEFORE the export verb so
      // "download a pdf" builds a PDF, not a spreadsheet.
      const text = lastUserText(uiMessages);
      let navigation: NavigateResult | null = null;
      let file: StreamableFile | null = null;
      let answer: string;
      if (actor.canExport && isReportTurn(text)) {
        // Through the throttled wrapper (Story 10.3), so the offline path honors the SAME per-farm
        // generation throttle the live model path does (parity); a throttled turn returns the typed
        // `error` outcome (the calm `busy` line) and writes no file.
        const result = await generateReportSkill(deps, deriveReportInput(text));
        file = reportFile(result);
        // The text carries the one-line preview on success, or the typed empty/error line otherwise;
        // a download card is only written for a clean file (below), never for empty/error.
        answer = result.kind === "file" ? result.preview : result.message;
      } else if (actor.canExport && isExportTurn(text)) {
        // Through the throttled wrapper (Story 10.3) for the same per-farm throttle parity as above.
        const result = await exportSpreadsheetSkill(deps, deriveExportInput(text));
        file = exportFile(result);
        // The text carries the one-line preview on success, or the typed empty/error line otherwise;
        // a download card is only written for a clean file (below), never for empty/error.
        answer = result.kind === "file" ? result.preview : result.message;
      } else if (isOpenSuperlativeTurn(text)) {
        // "open the pump that costs me the most" (T2): a superlative open, not a named one. The model
        // would call queryMeters (limit 1) then navigate; the offline stub does the SAME two-step over
        // the shared ranking helper so the priciest meter resolves and the open-meter action fires with
        // zero external calls. The rank reads the T1 analysis (cost = latest reconciled bill), so the
        // meter it opens is the same one the dashboard would call costliest.
        const [meters, findings] = await Promise.all([
          loadMetersForFarm(deps.prisma, deps.farmId),
          loadFindings(deps.prisma, deps.farmId),
        ]);
        const opts = deriveOpenSuperlativeRank(text);
        const winner = rankMeters(analyzeFarm(meters, findings), opts)[0];
        // No meter (or no proven value) to open: fall through to the grounded data answer rather than
        // dead-end. A savings rank can legitimately be empty (no mis-rated meters); a cost/demand
        // winner with a null value means no posted bill yet.
        const ranked: number | null =
          winner === undefined
            ? null
            : (opts.sortBy ?? "cost") === "savings"
              ? winner.flags.estAnnualSavingsCents
              : (opts.sortBy ?? "cost") === "demand"
                ? winner.demandChargeCents
                : winner.thisCycleCents;
        if (winner === undefined || ranked === null) {
          answer = await composeStubAnswer(deps, uiMessages);
        } else {
          // Open it by NAME through the SAME shipped navigate skill (so the emitted part is identical
          // to a normal open), naming the meter and why it won.
          const result = resolveNavigate(meters, { open: "meter", query: winner.name });
          if (result.kind === "navigate") {
            navigation = result;
            answer = `Opening ${winner.name}: ${openSuperlativeReason(opts, winner)}.`;
          } else {
            // Should not happen (we opened by the meter's own exact name), but never claim an open we
            // did not perform: fall back to the grounded answer.
            answer = await composeStubAnswer(deps, uiMessages);
          }
        }
      } else if (isNavigationTurn(text)) {
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
        // Acknowledge any PDF/image attachment so the offline path is honest that a file was sent
        // (the live model actually reads it; the deterministic stub cannot). Parity with the live
        // path, which sees the same attachment.
        const attached = lastUserAttachmentNames(uiMessages);
        if (attached.length > 0) {
          answer = `${en.shell.almond.attachmentAck(attached)} ${answer}`;
        }
      }
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const id = "almond-stub-0";
          writer.write({ type: "text-start", id });
          for (const delta of toTextChunks(answer)) {
            writer.write({ type: "text-delta", id, delta });
          }
          writer.write({ type: "text-end", id });
          if (navigation?.kind === "navigate") {
            writeNavigatePart(writer, navigation.action, navigation.meterName, navigation.state);
          }
          // A clean offline export OR report writes the download card; for an authed owner it is also
          // persisted to Reports first (8.6) inside persistAndWriteReportPart, which is owner-gated, so
          // a demo/Tour export is streamed but never stored. The file branch is reached for any
          // `canExport` actor, matching which actors the model is handed those skills.
          if (file !== null) {
            await persistAndWriteReportPart(writer, file, deps, actor, text);
          }
          // The Auto decided line (when the grower picked Auto): a pass-through of the headline. A file
          // ask always builds fresh now (no cache), so there is nothing to correct. Written once, after
          // the text/file parts.
          if (turnDecided) {
            writeDecidedPart(writer, turnDecided.headline);
          }
        },
      });
      return createUIMessageStreamResponse({ stream });
    },
  };
}

/**
 * The default responder: live Gateway when a key is present, else the offline stub. This is the
 * single selection point — the route just calls this. `modelId` is the grower's chosen model (an
 * allowlisted Gateway `provider/model` string, already validated in the route); the stub ignores it
 * so dev/CI stays offline regardless of the picked model. `decided` is the Auto router's decision for
 * an Auto turn (absent for a hand-picked model); it rides through to whichever responder is built so
 * the decided line is written on both the live and offline paths.
 */
export function defaultAlmondResponder(modelId?: string, decided?: AutoDecided): AlmondResponder {
  return hasGatewayKey() ? createGatewayResponder(modelId, decided) : createStubResponder(decided);
}
