import { tool } from "ai";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { loadMetersForFarm, type MeterView } from "@/lib/dashboard/load";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings } from "@/lib/dashboard/findings";
<<<<<<< HEAD
import { buildSolarDataset } from "@/lib/dashboard/solar";
import {
  demandUncoveredShare,
  nemDemandInsight,
  solarBillFloor,
} from "@/lib/energy/solar-nem";
import { loadRateCard } from "@/lib/pge/rate-card";
=======
import { analyzeFarm } from "./analysis";
>>>>>>> night/integration
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
<<<<<<< HEAD
  type MeterSolarContext,
  type SolarContextByMeter,
=======
  type RankMetersOptions,
>>>>>>> night/integration
} from "./shape";
import { checkGenerationThrottle } from "./rate-limit";
import { hasGatewayKey } from "@/lib/ai/gateway";
import { isCodegenExportAvailable } from "./codegen/flags";
import { navigateInputSchema, resolveNavigate, type NavigateInput } from "./skills/navigate";
import {
  exportSpreadsheetInputSchema,
  previewLine as exportPreviewLine,
  resolveExportParams,
  runExportSpreadsheet,
  type ExportSpreadsheetInput,
  type ExportSpreadsheetResult,
} from "./skills/export-spreadsheet";
import {
  generateReportInputSchema,
  previewLine as reportPreviewLine,
  resolveReportParams,
  runGenerateReport,
  type GenerateReportInput,
  type GenerateReportResult,
} from "./skills/generate-report";
import {
  codegenExportInputSchema,
  runCodegenExport,
  type CodegenExportInput,
  type CodegenExportResult,
} from "./skills/codegen-export";
import {
  codegenWorkbookInputSchema,
  runCodegenWorkbook,
  type CodegenWorkbookInput,
  type CodegenWorkbookResult,
} from "./skills/codegen-workbook";
import {
  computeCacheKey,
  computeFarmDataFingerprint,
  lookupCachedReport,
  type CachedFile,
} from "./reports/cache";

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
 */
export type AlmondActor = {
  authedOwner: boolean;
  canExport: boolean;
  userId: string | null;
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
  const dataset = buildSolarDataset(meters, nowMonthOf(SOLAR_CONTEXT_AS_OF));
  const largestShareByPump = new Map<string, number>();
  for (const group of dataset.arrays) {
    for (const row of group.meters) {
      if (row.share === null) continue;
      const prev = largestShareByPump.get(row.pumpId);
      if (prev === undefined || row.share > prev) largestShareByPump.set(row.pumpId, row.share);
    }
  }

  // Demand reality: the same fail-closed gate the F2 emitter rides. Renders only for a meter that is
  // NEM solar on the AG-C family, reconciled, and actually owes a demand charge; everything else fails
  // closed (the context carries no demand fields, so the shape reads honest not-on-file).
  const card = loadRateCard();
  for (const m of solarMeters) {
    const ctx: MeterSolarContext = { sharePct: largestShareByPump.get(m.id) ?? null };

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
 * Resolve the farm-data fingerprint + content-addressed cache key for a file skill, then look up a
 * cached file. Shared by all three file skills so the cache rule is authored once. Cheap on a MISS
 * (two indexed queries, then the normal build); a HIT skips the build entirely and streams the stored
 * (and, for codegen, already number-verified) bytes. The public Tour never persists, so it never has
 * a hit (it always builds fresh) — the v1 cache policy, with no extra gate needed.
 */
async function findCachedFile(
  deps: AlmondToolDeps,
  skill: "export" | "report" | "codegen",
  request: unknown,
): Promise<{ cacheKey: string | undefined; hit: CachedFile | null }> {
  // Throw-safe: the cache is a fast path, never a gate. A flaky DB/Blob read here must degrade to a
  // MISS (build fresh) rather than throw out of the skill — a thrown tool.execute becomes a tool-error
  // with no download card and no deterministic fallback. On failure we return no cacheKey (so the
  // fresh build is simply not cached) and no hit.
  try {
    const fingerprint = await computeFarmDataFingerprint(deps.prisma, deps.farmId);
    const cacheKey = computeCacheKey({ farmId: deps.farmId, fingerprint, skill, request });
    const hit = await lookupCachedReport(deps.prisma, deps.farmId, cacheKey);
    return { cacheKey, hit };
  } catch {
    return { cacheKey: undefined, hit: null };
  }
}

export async function exportSpreadsheetSkill(
  deps: AlmondToolDeps,
  input: ExportSpreadsheetInput,
): Promise<ExportSpreadsheetResult> {
  if (!checkGenerationThrottle(deps.farmId).allowed) {
    return { kind: "error", message: throttledMessage() };
  }
  const params = resolveExportParams(input);
  const { cacheKey, hit } = await findCachedFile(deps, "export", params);
  if (hit !== null) {
    const filter = params.filterKey !== null ? { key: params.filterKey, value: params.filterValue ?? "" } : null;
    return {
      kind: "file",
      fromCache: true,
      cacheKey: hit.cacheKey,
      preview: exportPreviewLine(hit.meterCount, params.table, filter),
      fileName: hit.fileName,
      contentType: hit.contentType,
      bytes: hit.bytes,
      meterCount: hit.meterCount,
      table: params.table,
      coverageAsOf: hit.coverageAsOf,
      params,
    };
  }
  const result = await runExportSpreadsheet(deps, input);
  return result.kind === "file" ? { ...result, cacheKey } : result;
}

/**
 * The `generateReport` skill executor (Story 9.3). Reads the uncapped export loader (8.1), applies the
 * requested filter, authors each chosen section deterministically, and renders the PDF (9.2) with the
 * coverage footer (8.4), returning a typed result. Owner-only: it is only ever wired in for an
 * authenticated owner via `ownerOnlySkills` below. Scope (farmId) is inherited from `deps`, never from
 * the input. The generated bytes ride the result; the responder lifts them onto the stream as a
 * `data-report` part (download card), persists them to Reports (8.6), and collapses the model-visible
 * output to a small text summary. Guarded by the per-farm generation throttle (Story 10.3) before any
 * heavy work runs.
 */
export async function generateReportSkill(
  deps: AlmondToolDeps,
  input: GenerateReportInput,
): Promise<GenerateReportResult> {
  if (!checkGenerationThrottle(deps.farmId).allowed) {
    return { kind: "error", message: throttledMessage() };
  }
  const params = resolveReportParams(input);
  const { cacheKey, hit } = await findCachedFile(deps, "report", params);
  if (hit !== null) {
    const filter = params.filterKey !== null ? { key: params.filterKey, value: params.filterValue ?? "" } : null;
    return {
      kind: "file",
      fromCache: true,
      cacheKey: hit.cacheKey,
      preview: reportPreviewLine(params.sections, filter),
      fileName: hit.fileName,
      contentType: hit.contentType,
      bytes: hit.bytes,
      meterCount: hit.meterCount,
      coverageAsOf: hit.coverageAsOf,
      params,
    };
  }
  const result = await runGenerateReport(deps, input);
  return result.kind === "file" ? { ...result, cacheKey } : result;
}

/**
 * The `codegenExport` skill executor (code-gen export POC). Builds the canonical snapshot, has the model
 * WRITE the report markup, renders it in a Vercel Sandbox, and verifies it fail-closed (falling back to
 * the deterministic report on any failure). Far heavier than the deterministic file skills, so it passes
 * through the SAME per-farm generation throttle (Story 10.3) before any model/sandbox work. The chat
 * tool-call's `abortSignal` is threaded so a closed tab cancels the model loop and the microVM.
 */
export async function codegenExportSkill(
  deps: AlmondToolDeps,
  input: CodegenExportInput,
  signal?: AbortSignal,
): Promise<CodegenExportResult> {
  if (!checkGenerationThrottle(deps.farmId).allowed) {
    return { kind: "error", message: throttledMessage() };
  }
  // The bespoke path is the big cache win: an identical ask on unchanged data returns the verified
  // bytes without re-running the model + Vercel Sandbox (20-60s saved). The `format` discriminator
  // keeps the PDF and xlsx codegen in one cache namespace without colliding on an identical request.
  const request = { request: input.request ?? null, format: "pdf" };
  const { cacheKey, hit } = await findCachedFile(deps, "codegen", request);
  if (hit !== null) {
    return {
      kind: "file",
      fromCache: true,
      cacheKey: hit.cacheKey,
      preview: en.shell.almond.export.skill.cached,
      fileName: hit.fileName,
      contentType: hit.contentType,
      bytes: hit.bytes,
      meterCount: hit.meterCount,
      coverageAsOf: hit.coverageAsOf,
      params: hit.params as Prisma.InputJsonValue,
    };
  }
  const result = await runCodegenExport(deps, input, signal);
  // Cache ONLY the verified bespoke render, never the deterministic fallback (else a one-off sandbox
  // outage pins the generic report under the bespoke key until the data changes / 30d).
  return result.kind === "file" && !result.fromFallback ? { ...result, cacheKey } : result;
}

/**
 * The `codegenWorkbook` skill executor (Phase 3) — the xlsx twin of `codegenExportSkill`. Builds the
 * snapshot, has the model WRITE a declarative workbook spec, renders it with openpyxl in a Vercel
 * Sandbox, and verifies it fail-closed (falling back to the deterministic Phase 1 workbook on any
 * failure). Same per-farm generation throttle, same Phase 2 cache (with the `format: "xlsx"`
 * discriminator), same abort-signal threading as the PDF codegen.
 */
export async function codegenWorkbookSkill(
  deps: AlmondToolDeps,
  input: CodegenWorkbookInput,
  signal?: AbortSignal,
): Promise<CodegenWorkbookResult> {
  if (!checkGenerationThrottle(deps.farmId).allowed) {
    return { kind: "error", message: throttledMessage() };
  }
  const request = { request: input.request ?? null, format: "xlsx" };
  const { cacheKey, hit } = await findCachedFile(deps, "codegen", request);
  if (hit !== null) {
    return {
      kind: "file",
      fromCache: true,
      cacheKey: hit.cacheKey,
      preview: en.shell.almond.export.skill.cached,
      fileName: hit.fileName,
      contentType: hit.contentType,
      bytes: hit.bytes,
      meterCount: hit.meterCount,
      coverageAsOf: hit.coverageAsOf,
      params: hit.params as Prisma.InputJsonValue,
    };
  }
  const result = await runCodegenWorkbook(deps, input, signal);
  // Cache ONLY the verified bespoke render, never the deterministic fallback.
  return result.kind === "file" && !result.fromFallback ? { ...result, cacheKey } : result;
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
 * The code-gen export skill (POC), spread in ONLY when every dependency is present (the flag + a gateway
 * key + sandbox creds + a built snapshot id — see codegen/flags.ts) AND the caller is an authed OWNER.
 * Owner-only and availability-gated by OMISSION: in dev/CI (no key, no creds) the skill is never
 * registered, so the "zero external calls" law holds and the model is never handed a skill it cannot
 * fulfil. The model is steered (description) to use it ONLY for novel/custom report asks; the instant
 * deterministic `generateReport` still serves ordinary "make me a PDF" requests.
 */
function codegenSkills(deps: AlmondToolDeps) {
  return {
    codegenExport: tool({
      description:
        "Build a CUSTOM, one-off PDF report by writing its layout from the farm's data — use this ONLY for a bespoke report request that the standard generateReport sections do not cover (an unusual shape, framing, or selection the grower describes). For an ordinary farm summary, savings, or meter-table PDF, use generateReport instead (it is instant). Every figure is verified against the farm's real numbers before the file is handed over; you choose only the request, never any value.",
      inputSchema: codegenExportInputSchema,
      // The chat tool-call options carry the abort signal; thread it so a closed tab cancels the nested
      // model loop and stops the Vercel Sandbox microVM rather than leaking a running render.
      execute: (input, { abortSignal }) => codegenExportSkill(deps, input, abortSignal),
      // Keep the PDF bytes OUT of the model's context — the bytes reach the grower via the responder's
      // `data-report` card, not the prompt window.
      toModelOutput: ({ output }) => {
        if (output.kind === "file") {
          return { type: "text", value: `Made ${output.fileName}.` };
        }
        return { type: "text", value: output.message };
      },
    }),
    codegenWorkbook: tool({
      description:
        "Build a CUSTOM, multi-tab Excel workbook by writing its layout from the farm's data — use this ONLY for a bespoke spreadsheet request that the standard exportSpreadsheet shapes do not cover (an unusual set of tabs, a chart, or a selection the grower describes). For an ordinary meters/bill-dates/overview spreadsheet, use exportSpreadsheet instead (it is instant). Every figure is verified against the farm's real numbers before the file is handed over; you choose only the request, never any value.",
      inputSchema: codegenWorkbookInputSchema,
      // Thread the abort signal so a closed tab cancels the nested model loop + the Vercel Sandbox.
      execute: (input, { abortSignal }) => codegenWorkbookSkill(deps, input, abortSignal),
      toModelOutput: ({ output }) => {
        if (output.kind === "file") {
          return { type: "text", value: `Made ${output.fileName}.` };
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
        "Get a high-level overview of the whole farm: number of meters, rate schedules in use, latest month spend, demand charge, and the meter whose bill moved the most. Call this first for broad questions.",
      inputSchema: z.object({}),
      execute: () => farmOverview(deps),
    }),

    listMeters: tool({
      description:
        "List the farm's meters (pumps) with their rate, account, entity, ranch, and latest bill. A solar meter also carries its solar facts (net-metering program, array membership and usage share, grandfather position, demand-charge reality) plus its credit state. A net-metering true-up credit is NOT on file until the grower uploads a true-up statement: never state a credit dollar; say the credit is not on file yet and point to the upload path the credit state names.",
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
        "Get one meter's detail and recent bills. Look it up by meter name, SA id, or id. For a solar meter this also carries its solar facts: its net-metering program, the arrays that credit it and its usage share of them, its grandfather position, how solar relates to its demand charge, and its credit state. Quote those facts verbatim. A net-metering true-up credit is NEVER on file until the grower uploads a true-up statement: if asked for the credit, say it is not on file yet and point to the upload path the credit state names; never invent or estimate a credit dollar.",
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
        'Rank the farm\'s meters (pumps) by a number and get the ordered list back. Use this whenever the grower asks WHICH meter is the most or least of something, the TOP N, a TOTAL, or a breakdown BY ENTITY: "which pump costs me the most", "the priciest pump", "my top 5 by bill", "biggest demand charge", "where are the savings", "most expensive by company". sortBy "cost" ranks by the latest bill (the default), "demand" by the demand charge, "savings" by the estimated dollars from a rate change (mis-rated meters only). order defaults to "desc" (the most first); pass "asc" for the least. Pass limit for the top N (for example limit 1 for "the single priciest"). groupBy "entity" returns a per-entity rollup instead of meters. Optionally narrow with filterRate or filterEntity (case-insensitive). The data ALWAYS comes back ranked; report the order it returns and quote the meter name plus the whole-dollar figure.',
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
  // The file-building skills are spread in HERE only when `actor.canExport` is true, so the model is
  // never handed a skill it must not call. `canExport` now includes the demo/Tour viewer (so a guest
  // can pull a report of the demo farm); persistence stays owner-only, gated separately in the
  // responder. A caller without `canExport` gets only the read-safe set — files withheld by OMISSION.
  // The code-gen export POC is OWNER-ONLY (heavier + experimental) and only offered when every external
  // dependency is configured (flag + gateway key + sandbox creds + a built snapshot id). When any is
  // absent it is withheld by omission, so the deterministic file skills above still serve the grower and
  // dev/CI never even sees a skill that would touch the gateway or a sandbox.
  const codegenOn = actor.authedOwner && isCodegenExportAvailable(hasGatewayKey());
  return {
    ...readTools,
    ...(actor.canExport ? fileSkills(deps) : {}),
    ...(codegenOn ? codegenSkills(deps) : {}),
  };
}

export type AlmondSkills = ReturnType<typeof buildAlmondSkills>;
