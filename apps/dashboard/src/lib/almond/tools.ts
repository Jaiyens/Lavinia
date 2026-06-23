import { tool } from "ai";
import { z } from "zod";
import type { FarmRole, PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { loadMetersForFarm, type MeterView } from "@/lib/dashboard/load";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings } from "@/lib/dashboard/findings";
import { buildSolarDataset } from "@/lib/dashboard/solar";
import type { GrandfatherPosition } from "@/lib/energy/solar-grandfather";
import {
  demandUncoveredShare,
  nemDemandInsight,
  solarBillFloor,
} from "@/lib/energy/solar-nem";
import { loadRateCard } from "@/lib/pge/rate-card";
import { analyzeFarm } from "./analysis";
import {
  rateSchedulesByFrequency,
  resolveMeterQuery,
  summarizeFarmOverview,
  summarizeFindings,
  summarizeMeterDetail,
  summarizeMeters,
  summarizeRanking,
  summarizeReconciliation,
  type MeterFilters,
  type MeterSolarContext,
  type SolarContextByMeter,
  type RankMetersOptions,
} from "./shape";
import { checkGenerationThrottle } from "./rate-limit";
import { hasGatewayKey } from "@/lib/ai/gateway";
import { isCodegenExportAvailable } from "./codegen/flags";
import { navigateInputSchema, resolveNavigate, type NavigateInput } from "./skills/navigate";
import {
  exportSpreadsheetInputSchema,
  runExportSpreadsheet,
  type ExportSpreadsheetInput,
  type ExportSpreadsheetResult,
} from "./skills/export-spreadsheet";
import {
  generateReportInputSchema,
  runGenerateReport,
  type GenerateReportInput,
  type GenerateReportResult,
} from "./skills/generate-report";
import {
  codegenExportInputSchema,
  HARDCODED_ASK as CODEGEN_EXPORT_HARDCODED_ASK,
  type CodegenExportInput,
} from "./skills/codegen-export";
import {
  codegenWorkbookInputSchema,
  HARDCODED_ASK as CODEGEN_WORKBOOK_HARDCODED_ASK,
  type CodegenWorkbookInput,
} from "./skills/codegen-workbook";

/**
 * The read-only, farm-scoped data Almond can read. Each executor takes the SAME `deps` (a
 * Prisma client + a single resolved farmId, from the session in the route), reuses the existing
 * dashboard loaders, and shapes the result with the pure `./shape` helpers. The model can NEVER
 * read another farm's data: the farmId lives in `deps`, never in a tool argument. Nothing here
 * mutates (Almond is read-only, mirroring the v1 "display, never execute" recommendation law).
 *
 * Executors are exported standalone (clean to unit-test against a real DB); `buildAlmondSkills`
 * is the SKILL FACTORY: it wraps each executor in an AI SDK `tool()` closed over `deps`, and
 * takes an `actor` capability flag so it can include or OMIT a skill by capability (ADR-A08).
 * Scope (`farmId`) comes only from `deps`; capability (`authedOwner`) comes only from `actor` —
 * both are resolved server-side in the route, never from the model or client. "Skill" is the
 * extensible unit every later capability is built as (navigate in 7.3; export/report in Epic 8).
 */
export type AlmondToolDeps = {
  prisma: PrismaClient;
  farmId: string;
  farmName: string;
  // The TRUE signed-in user id for USAGE METERING (the durable per-user token budget), or null for the
  // public Tour / demo (anonymous turns are not metered here). Distinct from `AlmondActor.userId`, which
  // is gated on persist capability — billing must count every authed user, INCLUDING a read-only viewer,
  // so it cannot piggy-back on that gated field. Carried on `deps` because it must reach BOTH accounting
  // sites: the chat responder's `onFinish` and the nested codegen `generateText` (which receives `deps`,
  // not `actor`). Used only to attribute usage rows; never a scope or auth gate.
  meterUserId: string | null;
  // The SHARED mutable sink for background-generation job ids (Almond v2 Phase 2). The codegen tools
  // ENQUEUE a GenerationJob row and PUSH its id here; the chat route holds the SAME array by reference
  // and, in a Next `after()` callback (which runs AFTER the response stream finishes), drains it to run
  // each build in the background — so a model-authored spreadsheet/PDF keeps running if the grower
  // leaves the page. The route creates a fresh `[]` per request and passes it in; it is empty when the
  // tools are built but populated by the time the tool `execute` has run during stream consumption.
  pendingGenerations: string[];
};

/**
 * The server-resolved capability of the caller. Two distinct capabilities, both SERVER properties
 * resolved in the route from the session (never from the request body or the model):
 *
 *   - `canExport`   — may the model build a downloadable file (spreadsheet / PDF)? True for an
 *                     authed owner AND for the demo/Tour viewer, so a guest can pull their own
 *                     report (the demo only ever sees demo-farm data; the per-IP rate limit + the
 *                     per-farm generation throttle bound the cost). The factory gates the file
 *                     skills by OMISSION on this flag — it never hands the model a skill it must
 *                     not call — so capability is structural, not a bypassable in-skill check.
 *   - `authedOwner` — is this a signed-in grower on their OWN connected farm? Strictly narrower
 *                     than `canExport`: it gates PERSISTENCE (Story 8.6 keeps an owner's export in
 *                     their Reports). A demo export is streamed once and never stored.
 *
 * `userId` is the signed-in grower's id, carried so the owner-only persistence can record WHO
 * asked. It is null for the public Tour / demo.
 *
 * `role` is the caller's server-resolved farm role (owner | manager | viewer), or null for the public
 * Tour / demo viewer. It is NOT a capability gate (those are the booleans above, resolved from it in
 * the route); it is carried so the persona can phrase what the caller may do accurately - a viewer is
 * read-only, an owner/manager may also build and keep files. Optional (defaults to the read-only,
 * null-role framing) so existing AlmondActor fixtures (tests) need no change; the route always sets it.
 */
export type AlmondActor = {
  authedOwner: boolean;
  canExport: boolean;
  userId: string | null;
  role?: FarmRole | null;
};

/**
 * Assemble each solar meter's solar context (H-1, FR29): the usage-proportional array share and the
 * demand-charge reality the Solar tab renders, keyed by pump id so the pure `summarizeMeterSolar`
 * shape can read it. The shares come from the SAME `buildSolarDataset` derivation the Solar tab uses
 * (so Almond and the tab never disagree); the demand reality comes from the SAME fail-closed
 * `nemDemandInsight` + bill floor the F2 emitter uses (so Almond never states a demand reality the tab
 * would not show). The credit DOLLAR is never assembled here - it stays honest-blank (Epic G), and H-2
 * makes Almond point to the upload path. A non-solar meter is omitted from the map.
 *
 * `nowMonth` is the calendar month of an injected `asOf` (no clock read in the pure layer), matching
 * `run-solar-insight`'s convention; it only seeds the dataset's next-true-up KPI, not any share.
 */
const SOLAR_CONTEXT_AS_OF = "2026-06-09T12:00:00.000Z";

function nowMonthOf(asOf: string): number {
  const month = new Date(asOf).getUTCMonth() + 1;
  return Number.isFinite(month) ? month : 1;
}

/**
 * The net-metering credit honest-blank state (H-2, FR31). The one law: program structure and timing
 * are on file; net-metering DOLLAR credits are not, until a true-up statement is uploaded (Epic G).
 * So Almond never states a true-up credit number it cannot trace to a real statement: it says the
 * credit is "not on file yet" and points to the upload path (FR37). This is carried as DATA on every
 * solar meter's tool output, not left to instruction alone, so the discipline is structural - there is
 * no credit field for the model to fill, and the only credit words it reads are the honest-blank state
 * and the upload path. Pure (reads only `en` copy): unit-testable, no Prisma, no I/O.
 *
 * `onFile` is always false at launch (no statement-settled path is wired yet); when Epic G's settle
 * flip (FR28) lands, the SETTLED branch is the single place a real credit value would attach here.
 */
export type SolarCreditState = {
  /** A net-metering credit dollar is on file (a true-up statement settled it). False until Epic G. */
  onFile: false;
  /** The honest-blank credit, in plain words ("its true-up credit is not on file yet"). No number. */
  status: string;
  /** The non-salesy path to settle the credit (FR37): upload the statement on the Solar tab. */
  uploadPath: string;
};

export function solarCreditState(): SolarCreditState {
  return {
    onFile: false,
    status: en.solar.almond.creditNotOnFile,
    uploadPath: en.solar.almond.creditUploadPath,
  };
}

export function buildSolarContextByMeter(meters: MeterView[]): SolarContextByMeter {
  const byMeter: SolarContextByMeter = new Map();
  const solarMeters = meters.filter((m) => m.isSolar);
  if (solarMeters.length === 0) return byMeter;

  // Shares: build the farm's solar dataset once (the same derivation the Solar tab renders) and take
  // each meter's LARGEST array share across the arrays it benefits from. A meter with no usage on file
  // has a null share in the dataset, which stays null here (not-on-file, never a fabricated zero).
  // Passing `asOf` also lets the dataset compute each array's grandfather position (WS6 item 3), which
  // we pull per meter below; without it the position is honest-unknown for every array.
  const dataset = buildSolarDataset(meters, nowMonthOf(SOLAR_CONTEXT_AS_OF), {
    asOf: SOLAR_CONTEXT_AS_OF,
  });
  const largestShareByPump = new Map<string, number>();
  // The grandfather position to surface per meter: across the arrays that credit a meter, take the one
  // with the MOST years remaining (the best-protected terms the meter still enjoys). A `known` position
  // wins over an `unknown` one, so a meter with at least one dated NEM2 array reads its real expiry.
  const grandfatherByPump = new Map<string, GrandfatherPosition>();
  for (const group of dataset.arrays) {
    for (const row of group.meters) {
      if (row.share !== null) {
        const prev = largestShareByPump.get(row.pumpId);
        if (prev === undefined || row.share > prev) largestShareByPump.set(row.pumpId, row.share);
      }
      const gf = group.grandfather;
      const prevGf = grandfatherByPump.get(row.pumpId);
      if (
        gf.state === "known" &&
        (prevGf === undefined ||
          prevGf.state !== "known" ||
          gf.yearsRemaining > prevGf.yearsRemaining)
      ) {
        grandfatherByPump.set(row.pumpId, gf);
      }
    }
  }

  // Demand reality: the same fail-closed gate the F2 emitter rides. Renders only for a meter that is
  // NEM solar on the AG-C family, reconciled, and actually owes a demand charge; everything else fails
  // closed (the context carries no demand fields, so the shape reads honest not-on-file).
  const card = loadRateCard();
  for (const m of solarMeters) {
    const ctx: MeterSolarContext = {
      sharePct: largestShareByPump.get(m.id) ?? null,
      grandfather: grandfatherByPump.get(m.id),
    };

    const insight = nemDemandInsight({
      isSolar: m.isSolar,
      scheduleLabel: m.rateSchedule,
      coverageState: m.coverageState,
      nemMonths: m.nemPeriods.map((p) => ({
        start: p.start,
        netKwh: p.netKwh,
        amountCents: p.amountCents,
      })),
      cycleDemandCents: m.periods.map((p) => p.demandCents),
      trueUpAmountCents: m.trueUpAmountCents,
      card,
    });
    if (insight !== null) {
      const floor = solarBillFloor(m.periods.flatMap((p) => p.lineItems));
      ctx.demandOwedCents = insight.demandOwedCents;
      ctx.uncoveredShare = demandUncoveredShare({
        demandOwedCents: insight.demandOwedCents,
        offsettableCents: floor.offsettableCents,
      });
    }

    byMeter.set(m.id, ctx);
  }

  return byMeter;
}

export async function farmOverview(deps: AlmondToolDeps) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return summarizeFarmOverview(deps.farmName, meters, computeKpiStrip(meters));
}

/**
 * Attach the honest-blank net-metering credit state (H-2, FR31) to a solar meter's summary. A
 * non-solar meter's `solar` shape is null and is returned untouched. The credit state carries NO
 * number - it is the not-on-file phrasing plus the upload path - so Almond states the credit as not on
 * file and points to the upload path, never an invented dollar. Generic over the two shape types
 * (`MeterSummary`, `MeterDetail`), which both carry `solar: MeterSolarView | null`.
 */
export function withSolarCredit<T extends { solar: { [k: string]: unknown } | null }>(row: T): T {
  if (row.solar === null) return row;
  return { ...row, solar: { ...row.solar, creditState: solarCreditState() } };
}

export async function meterList(deps: AlmondToolDeps, filters: MeterFilters = {}) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  const summary = summarizeMeters(meters, filters, buildSolarContextByMeter(meters));
  return { ...summary, meters: summary.meters.map(withSolarCredit) };
}

export async function meterDetail(deps: AlmondToolDeps, query: string) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  const match = resolveMeterQuery(meters, query);
  if (match.kind === "found") {
    // Only a solar meter carries solar context; building it for one meter reuses the farm dataset so
    // the share matches the tab. A non-solar meter gets an empty context (its solar shape stays null).
    const solarCtx = match.meter.isSolar
      ? buildSolarContextByMeter(meters).get(match.meter.id)
      : undefined;
    return {
      found: true as const,
      meter: withSolarCredit(summarizeMeterDetail(match.meter, solarCtx)),
    };
  }
  if (match.kind === "ambiguous") {
    // Several meters match by name; ask the grower to pick rather than guess one.
    return { found: false as const, query, ambiguous: true as const, candidates: match.names };
  }
  return { found: false as const, query };
}

export async function findingList(deps: AlmondToolDeps) {
  const findings = await loadFindings(deps.prisma, deps.farmId);
  return { count: findings.length, findings: summarizeFindings(findings) };
}

export async function ratesSummary(deps: AlmondToolDeps) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return { rates: rateSchedulesByFrequency(meters) };
}

export async function reconciliation(deps: AlmondToolDeps) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return summarizeReconciliation(meters);
}

/**
 * The `queryMeters` skill executor (Almond hardening T2). The ranking/aggregation read tool: it
 * loads the farm's meters AND findings (scoped by `deps`), feeds the SINGLE source of truth
 * `analyzeFarm` (so cost = the latest reconciled bill and savings = the meter's rate-switch finding,
 * exactly as the dashboard derives them), then shapes a ranking with the pure `summarizeRanking`.
 * This is what lets the model answer "which costs the most / top N / by entity / priciest pump" with
 * a real ranking instead of punting that data does not come back ordered. Read-only: it touches no
 * record, so it is handed to every actor (ADR-A08). Scope (farmId) is inherited from `deps`, never
 * from the input. Numbers stay numbers (integer cents) so a downstream answer never re-rounds.
 */
export async function queryMeters(
  deps: AlmondToolDeps,
  opts: RankMetersOptions & { groupBy?: "entity" } = {},
) {
  const [meters, findings] = await Promise.all([
    loadMetersForFarm(deps.prisma, deps.farmId),
    loadFindings(deps.prisma, deps.farmId),
  ]);
  return summarizeRanking(analyzeFarm(meters, findings), opts);
}

/**
 * The `navigate` skill executor (Story 7.3). Loads the farm's meters (scoped by `deps`, like every
 * read tool) and delegates to the pure `resolveNavigate` resolver, which turns the request into a
 * typed `NavigateAction` over the canonical surface keys — or a clarify/none/unknown-surface result.
 * It EMITS the action as its return value; the server->client bridge that writes the `data-navigate`
 * part and applies it via `useQueryState` setters is Story 7.4. Read-only on data: setting URL state
 * mutates no Finding/rate/meter, so navigate is read-safe and handed to every actor (ADR-A08).
 */
export async function navigateSkill(deps: AlmondToolDeps, input: NavigateInput) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return resolveNavigate(meters, input);
}

/**
 * Per-farm generation throttle (Story 10.3, AR16). The single chokepoint both the live model path
 * (the factory `execute` below) and the offline stub (its owner branches call these wrappers) pass
 * through, so the throttle is applied exactly once per invocation and the PURE `run*` functions stay
 * un-throttled (their direct unit tests are unaffected). When a farm has built too many heavy
 * artifacts in the window, the skill is short-circuited with the typed `error` outcome carrying the
 * calm `busy` line — no loader read, no file build, no Blob write, no `GeneratedReport` row — and the
 * responder renders it inline (no download card) while `toModelOutput` tells the model the file was
 * not made. This is an ADDITIONAL bound on an owner who IS allowed the skill; it never replaces the
 * capability-by-omission gate in `buildAlmondSkills` (the public Tour is never handed these at all).
 */
function throttledMessage(): string {
  return en.shell.almond.busy;
}

/**
 * The `exportSpreadsheet` skill executor (Story 8.5). Reads the uncapped export loader (8.1),
 * applies the requested filter, and builds the file (8.2/8.3) with the coverage footer (8.4),
 * returning a typed result. Owner-only: it is only ever wired in for an authenticated owner via
 * `ownerOnlySkills` below. Scope (farmId) is inherited from `deps`, never from the input. The
 * generated bytes ride the result; the responder lifts them onto the stream as a `data-report`
 * part (download card) and collapses the model-visible output to a small text summary. Guarded by the
 * per-farm generation throttle (Story 10.3) before any heavy work runs.
 */
/**
 * The `exportSpreadsheet` skill executor (Story 8.5). Reads the uncapped export loader (8.1), applies
 * the requested filter, and builds the file (8.2/8.3) with the coverage footer (8.4). It is now the
 * DETERMINISTIC FALLBACK builder (the offline stub's file path, and the codegen skills' last resort when
 * the runtime is down): every artifact is built FROM SCRATCH each turn, no cache. Scope (farmId) is
 * inherited from `deps`. Guarded by the per-farm generation throttle (Story 10.3) before any heavy work.
 */
export async function exportSpreadsheetSkill(
  deps: AlmondToolDeps,
  input: ExportSpreadsheetInput,
): Promise<ExportSpreadsheetResult> {
  if (!checkGenerationThrottle(deps.farmId).allowed) {
    return { kind: "error", message: throttledMessage() };
  }
  return runExportSpreadsheet(deps, input);
}

/**
 * The `generateReport` skill executor (Story 9.3) — the DETERMINISTIC FALLBACK report builder (offline
 * stub + codegen runtime-down last resort). Reads the uncapped export loader, applies the requested
 * filter, authors each chosen section, and renders the PDF, FROM SCRATCH each turn (no cache). Scope is
 * inherited from `deps`. Guarded by the per-farm generation throttle before any heavy work.
 */
export async function generateReportSkill(
  deps: AlmondToolDeps,
  input: GenerateReportInput,
): Promise<GenerateReportResult> {
  if (!checkGenerationThrottle(deps.farmId).allowed) {
    return { kind: "error", message: throttledMessage() };
  }
  return runGenerateReport(deps, input);
}

/**
 * The lightweight result the codegen tools now return (Almond v2 Phase 2). The build no longer runs
 * INSIDE the tool `execute` (which would die when the grower leaves the page); instead the tool ENQUEUES
 * a GenerationJob row, pushes its id onto `deps.pendingGenerations` for the route's `after()` to run in
 * the background, and returns this immediately. The responder recognizes a "building" result and emits a
 * transient `data-generation` part (no bytes, no download card yet); the model answers in text that the
 * file is being built and the grower can leave the page. A "busy" result is the per-farm throttle's calm
 * decline (no job enqueued), surfaced inline like the old throttle path.
 */
export type CodegenBuildingResult =
  | {
      kind: "building";
      jobId: string;
      generationKind: "workbook" | "report";
      requestText: string;
    }
  | { kind: "busy"; message: string };

/** Enqueue a background generation job and push its id onto the route's shared sink. Scope (`farmId`)
 *  and authorship (`createdById = deps.meterUserId`) come from `deps`, never from the model; the public
 *  Tour enqueues with a null author (its job + report are still farm-scoped, so the Tour can poll them).
 *  Guarded by the SAME per-farm generation throttle the synchronous path used, so an over-busy farm gets
 *  the calm decline and NO job is created. */
async function enqueueGeneration(
  deps: AlmondToolDeps,
  generationKind: "workbook" | "report",
  request: string | undefined,
  hardcodedAsk: string,
): Promise<CodegenBuildingResult> {
  if (!checkGenerationThrottle(deps.farmId).allowed) {
    return { kind: "busy", message: throttledMessage() };
  }
  const requestText = request?.trim() || hardcodedAsk;
  const job = await deps.prisma.generationJob.create({
    data: {
      farmId: deps.farmId,
      createdById: deps.meterUserId,
      kind: generationKind,
      status: "pending",
      requestText,
      paramsJson: { ask: requestText },
    },
    select: { id: true },
  });
  // Hand the id to the route's `after()` sink (captured by reference). The build runs there, after the
  // response stream finishes — so a closed tab cannot kill it.
  deps.pendingGenerations.push(job.id);
  return { kind: "building", jobId: job.id, generationKind, requestText };
}

/**
 * The `codegenExport` skill executor — the DEFAULT report path. It no longer builds inline (a ~30-90s
 * build would die when the grower leaves the page); it ENQUEUES a background GenerationJob and returns a
 * "building" result. The route's `after()` runs `runCodegenExport` (build the snapshot, model WRITEs the
 * HTML/CSS, render + verify fail-closed) AFTER the response is sent, then persists the PDF and flips the
 * job to done. Guarded by the SAME per-farm generation throttle before any row is written.
 */
export async function codegenExportSkill(
  deps: AlmondToolDeps,
  input: CodegenExportInput,
): Promise<CodegenBuildingResult> {
  return enqueueGeneration(deps, "report", input.request, CODEGEN_EXPORT_HARDCODED_ASK);
}

/**
 * The `codegenWorkbook` skill executor — the DEFAULT spreadsheet path; the xlsx twin of
 * `codegenExportSkill`. It ENQUEUES a background GenerationJob and returns a "building" result; the
 * route's `after()` runs `runCodegenWorkbook` (model WRITEs an openpyxl script, render + verify the .xlsx
 * fail-closed) AFTER the response is sent, then persists the workbook and flips the job to done. Same
 * per-farm generation throttle before any row is written.
 */
export async function codegenWorkbookSkill(
  deps: AlmondToolDeps,
  input: CodegenWorkbookInput,
): Promise<CodegenBuildingResult> {
  return enqueueGeneration(deps, "workbook", input.request, CODEGEN_WORKBOOK_HARDCODED_ASK);
}

/**
 * The file-building skills, handed to the model only when the caller `canExport` (an authed owner OR
 * the demo/Tour viewer — see `AlmondActor`). The single place a file capability is added; gated by
 * OMISSION in `buildAlmondSkills` so the model can never call a skill it was not given. As of Story
 * 9.3 this is `exportSpreadsheet` (Story 8.5) and `generateReport` (Story 9.3): each builds a file.
 * Persistence (keeping an owner's export in their Reports) is a SEPARATE, narrower gate applied in the
 * responder on `authedOwner`, so a demo export is streamed once but never stored.
 *
 * `toModelOutput` collapses each tool's result for the MODEL's context to a tiny text summary, so the
 * file bytes never enter the prompt window (they are lifted onto the UI stream by the responder
 * instead). The full result, including the bytes, is still available to the responder via
 * `onStepFinish`'s tool results - that is where the download card is written and the file persisted.
 */
function fileSkills(deps: AlmondToolDeps) {
  return {
    exportSpreadsheet: tool({
      description:
        "Make a spreadsheet of the grower's farm and hand it to them as a download. Choose table: \"meters\" for the full meter inventory (rate, account, latest bill, coverage), or \"billDue\" for each meter's billing-cycle closing date. Optionally narrow to one rate, entity, or ranch. Use this when the grower asks to export, download, or get a spreadsheet of their meters or bill dates. Every meter in scope is included; you do not pick values or columns, only the shape.",
      inputSchema: exportSpreadsheetInputSchema,
      execute: (input) => exportSpreadsheetSkill(deps, input),
      // Keep the spreadsheet bytes OUT of the model's context: the model only needs to know whether
      // the file was made (and the one-line preview), not its contents. The bytes reach the grower
      // via the responder's `data-report` part, not the prompt window.
      toModelOutput: ({ output }) => {
        if (output.kind === "file") {
          return { type: "text", value: `Made ${output.fileName} with ${output.meterCount} meters.` };
        }
        return { type: "text", value: output.message };
      },
    }),
    generateReport: tool({
      description:
        'Make a PDF report of the grower\'s farm and hand it to them as a download (also saved to their Reports). Choose which sections to include and in what order: "summary" (the farm at a glance), "meterTable" (every meter listed), "misRated" (meters that may be on the wrong rate), "savings" (estimated dollars from rate changes), "singleMeter" (one meter\'s detail; also pass the meter name). Optionally narrow to one rate, entity, or ranch. Use this when the grower asks for a PDF, a report, a summary document, or a printout. Omit the sections to get a farm summary plus the meter table. You pick only the shape; every value is authored from the farm data.',
      inputSchema: generateReportInputSchema,
      execute: (input) => generateReportSkill(deps, input),
      // Keep the PDF bytes OUT of the model's context: the model only needs to know whether the file
      // was made (and the one-line preview), not its contents. The bytes reach the grower via the
      // responder's `data-report` part, not the prompt window.
      toModelOutput: ({ output }) => {
        if (output.kind === "file") {
          return { type: "text", value: `Made ${output.fileName} covering ${output.meterCount} meters.` };
        }
        return { type: "text", value: output.message };
      },
    }),
  } as const;
}

/**
 * The from-scratch file skills — the DEFAULT way Almond builds a spreadsheet or a report. The model
 * WRITES the document (an openpyxl script for a workbook, HTML/CSS for a PDF) over the farm snapshot and
 * a runtime executes it, so the grower gets full styling freedom (any color, font, layout, columns, tabs)
 * and the file is generated fresh every time (no cache, no fixed template). Every number is verified
 * against the farm's real data fail-closed (with in-loop repair) before the file is handed over. These
 * are spread in only when codegen is available (gateway key + a runtime — see codegen/flags.ts); when it
 * is not, the deterministic `fileSkills` serve instead (capability-by-omission, ADR-A08).
 */
function codegenSkills(deps: AlmondToolDeps) {
  return {
    codegenExport: tool({
      description:
        "Build the grower a PDF report and hand it to them as a download. Use this whenever the grower asks for a report, a PDF, a summary document, or a printout — for the whole farm or a specific slice (an entity, a ranch, a rate, one meter). You WRITE the report's layout from the farm's data, so you can honor anything the grower asks for: which sections, the scope, the styling, the emphasis. Pass the grower's request verbatim (including any styling they named). Every figure is verified against the farm's real numbers before the file is handed over. The build runs IN THE BACKGROUND (it takes up to a minute or two): once you call this, tell the grower you are building it and they can leave this page — it will be ready and saved to their Reports when it is done. Do not claim the file is finished or attached; it is still being built.",
      inputSchema: codegenExportInputSchema,
      // ENQUEUE only: the build runs in the route's `after()` (after the response is sent), so a closed
      // tab does not kill it. No abort signal — we WANT it to survive the request ending.
      execute: (input) => codegenExportSkill(deps, input),
      // Tell the model the build was QUEUED (not finished), so it answers "I'm building it, you can
      // leave this page" rather than claiming an attached file. A busy result carries the calm decline.
      toModelOutput: ({ output }) => {
        if (output.kind === "building") {
          return {
            type: "text",
            value:
              "Queued the report build; it is running in the background and will be saved to Reports when done. Tell the grower you are building it and they can leave this page.",
          };
        }
        return { type: "text", value: output.message };
      },
    }),
    codegenWorkbook: tool({
      description:
        "Build the grower an Excel spreadsheet and hand it to them as a download. Use this whenever the grower asks for a spreadsheet, a workbook, an Excel file, a CSV, or a sheet of their meters/bills/savings. You WRITE the workbook from the farm's data, so you can do anything the grower asks: pick the columns and tabs, add charts, and style it exactly as they describe (colors, fonts, bold, merges, frozen headers, conditional formatting). Pass the grower's request verbatim (including any styling they named). Every figure is verified against the farm's real numbers before the file is handed over. The build runs IN THE BACKGROUND (it takes up to a minute or two): once you call this, tell the grower you are building it and they can leave this page — it will be ready and saved to their Reports when it is done. Do not claim the file is finished or attached; it is still being built.",
      inputSchema: codegenWorkbookInputSchema,
      // ENQUEUE only: the build runs in the route's `after()` so a closed tab does not kill it.
      execute: (input) => codegenWorkbookSkill(deps, input),
      toModelOutput: ({ output }) => {
        if (output.kind === "building") {
          return {
            type: "text",
            value:
              "Queued the spreadsheet build; it is running in the background and will be saved to Reports when done. Tell the grower you are building it and they can leave this page.",
          };
        }
        return { type: "text", value: output.message };
      },
    }),
  } as const;
}

export function buildAlmondSkills(deps: AlmondToolDeps, actor: AlmondActor) {
  const readTools = {
    getFarmOverview: tool({
      description:
        "Get a high-level overview of the whole farm: number of meters, rate schedules in use, the power-source breakdown (how many pumps run on electric vs diesel vs gas), the pump-health breakdown (how many are GOOD / BAD / NEW WELL / OLD), latest month spend, demand charge, and the meter whose bill moved the most. Call this first for broad questions, including how the fleet splits by power source or pump condition.",
      inputSchema: z.object({}),
      execute: () => farmOverview(deps),
    }),

    listMeters: tool({
      description:
        "List the farm's meters (pumps) with their rate, account, entity, ranch, and latest bill. Each meter carries a costSource: BILLED means latestBill is a real posted bill, MODELED means there is no posted bill and modeledCost is an ESTIMATE from usage (say estimated, never a posted bill), REVIEW or NONE means no usable cost yet. A solar meter also carries its solar facts (net-metering program, array membership and usage share, grandfather position, demand-charge reality) plus its credit state. A net-metering true-up credit is NOT on file until the grower uploads a true-up statement: never state a credit dollar; say the credit is not on file yet and point to the upload path the credit state names.",
      inputSchema: z.object({
        rate: z.string().optional().describe("Filter by rate schedule, e.g. AG-A1"),
        entity: z.string().optional().describe("Filter by legal billing entity name"),
        ranch: z.string().optional().describe("Filter by ranch name"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max meters to return (default 25)"),
      }),
      execute: (filters) => meterList(deps, filters),
    }),

    getMeter: tool({
      description:
        "Get one meter's detail and recent bills, and show it as a light card right in the chat. Use this to show, open, or pull up a SINGLE meter (\"show me Westside Pump 17\", \"open pump 4\", \"pull up that meter\") so the grower sees it inline without leaving the chat - prefer this over navigate for a single named meter. Look it up by meter name, SA id, or id. It carries a costSource: BILLED means its bills are real posted bills, MODELED means there is no posted bill and modeledCost is an ESTIMATE (say estimated, never a posted bill), REVIEW/NONE means no usable cost. Each recent bill carries a breakdown of demand vs energy vs other so you can say how much of a bill is the demand charge. It also lists the blocks (fields) this pump serves with their acreage. For a solar meter this also carries its solar facts: its net-metering program, the arrays that credit it and its usage share of them, its grandfather position, how solar relates to its demand charge, and its credit state. Quote those facts verbatim. A net-metering true-up credit is NEVER on file until the grower uploads a true-up statement: if asked for the credit, say it is not on file yet and point to the upload path the credit state names; never invent or estimate a credit dollar.",
      inputSchema: z.object({
        query: z.string().describe("The meter name, SA id, or id to look up"),
      }),
      execute: ({ query }) => meterDetail(deps, query),
    }),

    listFindings: tool({
      description:
        "List the farm's open findings (money-saving opportunities and issues), highest dollar impact first. Use this when the grower asks about savings, opportunities, or what needs attention.",
      inputSchema: z.object({}),
      execute: () => findingList(deps),
    }),

    queryMeters: tool({
      description:
        'Rank the farm\'s meters (pumps) by a number and get the ordered list back. Use this whenever the grower asks WHICH meter is the most or least of something, the TOP N, a TOTAL, or a breakdown BY ENTITY: "which pump costs me the most", "the priciest pump", "my top 5 by bill", "biggest demand charge", "where are the savings", "most expensive by company". sortBy "cost" ranks by the latest POSTED bill (the default), "demand" by the demand charge, "savings" by the estimated dollars from a rate change (mis-rated meters only). Each row carries a costSource: a cost rank is built from posted bills only, so a meter whose costSource is MODELED (an estimate, no posted bill yet) ranks last and is never "the costliest". order defaults to "desc" (the most first); pass "asc" for the least. Pass limit for the top N (for example limit 1 for "the single priciest"). groupBy "entity" returns a per-entity rollup instead of meters. Optionally narrow with filterRate or filterEntity (case-insensitive). The data ALWAYS comes back ranked; report the order it returns and quote the meter name plus the whole-dollar figure.',
      inputSchema: z.object({
        sortBy: z
          .enum(["cost", "demand", "savings"])
          .optional()
          .describe(
            "What to rank by: cost (latest bill, default), demand (demand charge), or savings (estimated rate-switch dollars).",
          ),
        order: z
          .enum(["asc", "desc"])
          .optional()
          .describe("desc (most first, default) or asc (least first)."),
        groupBy: z
          .enum(["entity"])
          .optional()
          .describe("Return a per-entity rollup (summed) instead of the meter list."),
        limit: z
          .number()
          .int()
          .positive()
          .max(183)
          .optional()
          .describe("Return only the top N rows (for example 1 for the single priciest, 5 for a top 5)."),
        filterRate: z
          .string()
          .optional()
          .describe("Narrow to one rate schedule, case-insensitive contains (for example AG-C)."),
        filterEntity: z
          .string()
          .optional()
          .describe("Narrow to one legal billing entity, case-insensitive contains."),
      }),
      execute: (opts) => queryMeters(deps, opts),
    }),

    getRatesSummary: tool({
      description:
        "Summarize the distinct rate schedules across the farm and how many meters are on each, most common first, flagging legacy rates.",
      inputSchema: z.object({}),
      execute: () => ratesSummary(deps),
    }),

    getReconciliation: tool({
      description:
        "Summarize how complete the farm's billing data is: how many meters are in each coverage state. Use this when the grower asks how much we know or whether the data is complete.",
      inputSchema: z.object({}),
      execute: () => reconciliation(deps),
    }),

    navigate: tool({
      description:
        "Drive the dashboard for the grower: open a specific meter, switch the lens (chart, table, map, or calendar), or filter the table by entity, ranch, or rate. Use this when the grower asks to see, open, show, or filter something. To open a meter, pass open: \"meter\" with a query (its name, SA id, or id). If the request matches more than one meter, this returns the candidates so you can ask which one; it never guesses, and it never navigates to a surface that does not exist.",
      inputSchema: navigateInputSchema,
      execute: (input) => navigateSkill(deps, input),
    }),
  };

  // Capability seam (ADR-A08): the read tools above (including `navigate`) are public-safe and handed
  // to every actor — `navigate` only sets URL state, so it is read-safe and added UNCONDITIONALLY.
  // A file-building skill is spread in only when `actor.canExport` is true (an authed owner/manager OR
  // the demo/Tour viewer), so the model is never handed a skill it must not call; persistence stays
  // owner-only, gated separately in the responder. WHICH file skill: the FROM-SCRATCH codegen skills are
  // the default for an owner/manager (`authedOwner`) when codegen is available (gateway key + a runtime,
  // flags.ts), giving the real grower full styling freedom. The deterministic `fileSkills` serve everyone
  // else who can export — the public Tour's demo viewer, and an owner when codegen is not configured —
  // so a guest still gets a file but never triggers the nested model + sandbox spend on a public,
  // unauthenticated endpoint. Exactly one of the two file sets is handed to the model, never both.
  const codegenOn = actor.authedOwner && isCodegenExportAvailable(hasGatewayKey());
  return {
    ...readTools,
    ...(codegenOn ? codegenSkills(deps) : actor.canExport ? fileSkills(deps) : {}),
  };
}

export type AlmondSkills = ReturnType<typeof buildAlmondSkills>;
