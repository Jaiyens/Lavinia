import { z } from "zod";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings, type FindingView } from "@/lib/dashboard/findings";
import {
  loadExportData,
  summarizeExportState,
  type ExportData,
  type ExportLoadDeps,
} from "@/lib/almond/export/load";
import { coveragePercent } from "@/lib/almond/export/coverage-footer";
import { resolveMeterQuery } from "@/lib/almond/shape";
import { renderReport, type ReportSection, type ReportSelection } from "@/lib/almond/report/render";
import type {
  SummarySectionData,
  MisRatedSectionData,
  MisRatedRow,
  SavingsSectionData,
  SavingsRow,
  SingleMeterSectionData,
} from "@/lib/almond/report/sections/types";
import type { AlmondToolDeps } from "@/lib/almond/tools";

/**
 * The `generateReport` skill (Story 9.3) - Almond's OWNER-ONLY ability to hand a grower a real PDF of
 * their farm, saved to Reports and downloaded in one turn. It is wired into the factory through
 * `ownerOnlySkills` (src/lib/almond/tools.ts), so the model is handed it ONLY for an authenticated
 * owner; the public Tour never sees it (capability-by-omission, ADR-A08). There is no runtime "are you
 * allowed" check inside the skill because there cannot be: an unauthenticated caller is never given
 * the skill to call, and the responder only persists/streams a report for an authed owner.
 *
 * SHAPE ONLY across the model boundary (FR7): the input carries WHICH sections to include and in what
 * ORDER, plus an optional single filter (rate / entity / ranch) and an optional meter name for a
 * single-meter report. It NEVER carries a farmId, a value, report prose, or a file path - scope is
 * inherited from `deps` (the resolved farm), and every dollar, date, and meter is authored
 * deterministically here off the Story 8.1 uncapped loader and the farm's findings (the same grounded
 * sources the dashboard and the spreadsheet read). The model selects the SHAPE; this code authors the
 * PDF (Story 9.2 composer) and the bytes.
 *
 * Two-step contract (mirrors the 8.5 export skill):
 *   1. PREVIEW (not an approval gate): `previewLine` states in one short sentence what the PDF will be
 *      ("I will put together a one or two page summary: your farm's totals, the findings, and the
 *      dollars on each"), so the grower sees the shape before the file lands. It is a courtesy line.
 *   2. FILE: `runGenerateReport` reads the uncapped loader, applies the filter, authors each chosen
 *      section deterministically, renders the PDF via the 9.2 composer (footer stamped on every
 *      report), and returns the bytes wrapped in a typed result. The responder lifts those bytes onto
 *      the stream as a `data-report` download card AND persists them to Reports for an owner (8.6).
 *
 * Honesty laws inherited from Epic 8/9: every meter in the (filtered) set is included with no silent
 * cap (the meter table wraps across pages); the SAME 8.4 coverage / as-of footer is stamped on every
 * PDF, so a report can never disagree with the spreadsheet about what is covered; an unreconciled
 * meter shows a coverage label, never a fabricated or zero figure; an empty result (a filter that
 * matches nothing, or an empty farm) returns a typed `empty` outcome, never an empty PDF; a generation
 * error returns a typed `error` outcome the panel renders inline, never a raw throw and never a partial
 * file. Answerable offline by the stub responder (pure-JS react-pdf, zero external calls in CI).
 */

const t = en.shell.almond.report.skill;

/** The sections the model may select for a report, in selection order. Mirrors the Story 9.1/9.2
 *  section templates. `singleMeter` needs a `meter` query; the others read the (filtered) farm. */
export const REPORT_SECTIONS = [
  "summary",
  "meterTable",
  "misRated",
  "savings",
  "singleMeter",
] as const;
export type ReportSectionKind = (typeof REPORT_SECTIONS)[number];

/**
 * The skill's input: SHAPE ONLY. `sections` is the model's ordered selection of which section
 * templates to include (the array order is the page order); the three optional filters narrow the
 * meter set (case-insensitive contains, exactly like the export skill and the chat tools); `meter`
 * names the pump for a single-meter report. There is deliberately NO farmId, no value, no prose, and
 * no file name - scope and every figure are server-authored. When `sections` is omitted or empty the
 * skill builds a sensible default (farm summary + the meter table), so the model can ask for "a PDF"
 * without choosing sections and still get an honest, non-empty document.
 */
export const generateReportInputSchema = z.object({
  sections: z
    .array(z.enum(REPORT_SECTIONS))
    .optional()
    .describe(
      'Which sections to include, in the order they should appear. Options: "summary" (the farm at a glance), "meterTable" (every meter listed), "misRated" (meters that may be on the wrong rate), "savings" (estimated dollars from rate changes), "singleMeter" (one meter\'s detail; requires the meter name). Omit to get a farm summary plus the meter table.',
    ),
  rate: z.string().optional().describe("Only include meters on this rate schedule, e.g. AG-A1."),
  entity: z.string().optional().describe("Only include meters billed to this legal entity name."),
  ranch: z.string().optional().describe("Only include meters on this ranch."),
  meter: z
    .string()
    .optional()
    .describe(
      'The meter name, SA id, or id for a single-meter report. Required only when "singleMeter" is among the chosen sections.',
    ),
});

export type GenerateReportInput = z.infer<typeof generateReportInputSchema>;

/** Which single filter (if any) the grower asked for, for the preview line. Only one filter is woven
 *  into the preview; an unset filter is null. Rows are still narrowed by ALL set filters. */
type ResolvedFilter = { key: "rate" | "entity" | "ranch"; value: string } | null;

/**
 * The outcome the skill returns to the responder. A clean build carries the PDF bytes + metadata
 * (lifted onto the stream as a `data-report` card and persisted to Reports); an empty result and a
 * generation error are typed so the panel renders them inline - a missing or failed report is NEVER a
 * partial or empty download. The shape mirrors `ExportSpreadsheetResult` so the responder's existing
 * persist-and-stream path serves both.
 */
export type GenerateReportResult =
  | {
      kind: "file";
      /** The one-line preview Almond states alongside the file. */
      preview: string;
      /** The download file name (server-authored; never from the model). */
      fileName: string;
      /** The MIME type for the download (application/pdf). */
      contentType: string;
      /** The serialized PDF bytes. Non-empty by construction (the composer always writes a footer). */
      bytes: Uint8Array;
      /** How many meters the report covers (the filtered inventory; for the card's label). */
      meterCount: number;
      /** The freshest billed cycle the figures reflect, or null when no bill has posted (never
       *  fabricated). Carried so a persisted report records what it was as-of. */
      coverageAsOf: string | null;
      /** The SHAPE params the report was built from (sections + the single applied filter + meter),
       *  recorded with a persisted report so a refresh can reproduce the same shape. No farmId, no
       *  value. */
      params: ReportParams;
      /** The content-addressed cache key this report is stored under (Phase 2); the responder
       *  persists it so an identical later ask resolves to the same key. */
      cacheKey?: string;
      /** True when these bytes were served from the cache, so the responder streams them without
       *  persisting a duplicate row. */
      fromCache?: boolean;
    }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

/** The persisted shape parameters of a report: the chosen sections, the single applied filter (if
 *  any), and the single-meter query (if any). Server-authored from the resolved input; never carries
 *  a farmId or a value. */
export type ReportParams = {
  sections: ReportSectionKind[];
  filterKey: "rate" | "entity" | "ranch" | null;
  filterValue: string | null;
  meterQuery: string | null;
};

/** The PDF content type, declared once. */
const PDF_CONTENT_TYPE = "application/pdf";

/** Case-insensitive contains, mirroring the export skill's `contains` (and the chat tools' `matches`):
 *  an empty/absent filter matches all; a null field never matches a set filter. */
function contains(value: string | null, filter: string | undefined): boolean {
  if (!filter || filter.trim() === "") return true;
  if (value === null) return false;
  return value.toLowerCase().includes(filter.trim().toLowerCase());
}

/**
 * The single filter the grower asked for, for the preview line. Precedence rate > entity > ranch is
 * arbitrary but fixed (matching the export skill), so the preview is deterministic when more than one
 * filter is somehow set (rows are still narrowed by ALL set filters in `applyFilter`). Null when no
 * filter is set.
 */
export function resolveFilter(input: GenerateReportInput): ResolvedFilter {
  const rate = input.rate?.trim();
  if (rate) return { key: "rate", value: rate };
  const entity = input.entity?.trim();
  if (entity) return { key: "entity", value: entity };
  const ranch = input.ranch?.trim();
  if (ranch) return { key: "ranch", value: ranch };
  return null;
}

/** Narrow the loaded inventory by EVERY set filter (case-insensitive contains). No cap. */
export function applyFilter(meters: readonly MeterView[], input: GenerateReportInput): MeterView[] {
  return meters.filter(
    (m) =>
      contains(m.rateSchedule, input.rate) &&
      contains(m.entityName, input.entity) &&
      contains(m.ranchName, input.ranch),
  );
}

/**
 * The sections to build, in order. The model's choice wins; an omitted/empty selection defaults to a
 * farm summary plus the meter table (a sensible, non-empty whole-farm report). De-duplicated so a
 * doubled choice never renders a section twice, preserving first-seen order.
 */
export function resolveSections(input: GenerateReportInput): ReportSectionKind[] {
  const chosen = input.sections ?? [];
  const ordered = chosen.length > 0 ? chosen : (["summary", "meterTable"] as ReportSectionKind[]);
  const seen = new Set<ReportSectionKind>();
  const out: ReportSectionKind[] = [];
  for (const s of ordered) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** The resolved SHAPE params for an input (sections + the single applied filter + meter query). The
 *  ONE place the persisted report params are authored, reused by the build AND the cache key (the
 *  skill wrapper), so the two can never disagree about what request a report represents. Pure. */
export function resolveReportParams(input: GenerateReportInput): ReportParams {
  const filter = resolveFilter(input);
  return {
    sections: resolveSections(input),
    filterKey: filter?.key ?? null,
    filterValue: filter?.value ?? null,
    meterQuery: input.meter?.trim() ?? null,
  };
}

/** The plain filter clause woven into the preview line (e.g. "for AG-A1"), or null when unset. */
function filterClause(filter: ResolvedFilter): string | null {
  if (filter === null) return null;
  if (filter.key === "rate") return t.filterClause.rate(filter.value);
  if (filter.key === "entity") return t.filterClause.entity(filter.value);
  return t.filterClause.ranch(filter.value);
}

/** Join the chosen section names into a plain English list ("a, b, and c"). */
function joinParts(names: string[]): string {
  if (names.length === 0) return t.defaultParts;
  if (names.length === 1) return names[0] as string;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * The one-line preview Almond states before the PDF lands ("I will put together a one or two page
 * summary: your farm's totals, the findings, and the dollars on each"). Pure and exported so the stub
 * responder and a unit test can assert it without rendering a file. Lists the chosen sections in
 * order, with the single named filter appended - a lightweight courtesy, never an approval gate.
 */
export function previewLine(sections: readonly ReportSectionKind[], filter: ResolvedFilter): string {
  const names = sections.map((s) => t.sectionName[s]);
  return t.preview(joinParts(names), filterClause(filter));
}

/** A filesystem-safe slug for the farm name in the download file name (no path, no separators). */
function slug(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "farm" : cleaned;
}

/** The server-authored download file name. Never from the model, never a path - a safe slug + the
 *  named meter (for a single-meter report) or the default "report" suffix, with a .pdf extension. */
export function reportFileName(farmName: string, singleMeterName: string | null): string {
  const suffix = singleMeterName !== null ? slug(singleMeterName) : t.defaultTitle;
  return `${slug(farmName)}-${suffix}.pdf`;
}

// --- Deterministic section authoring -------------------------------------------------------------
//
// Every section's grounded `data` is authored HERE from the uncapped loader and the farm's findings,
// never from the model. The model only chose WHICH sections; this fills each one with real values.
// Money stays integer cents end to end (the section components format through the shared formatUsd);
// a missing value is null, which the section turns into a coverage label, never a fabricated figure.

/** The farm-summary section's data: counts + the loaded (reconciled) spend this cycle, from the same
 *  KPI rollup the dashboard reads. The loaded spend is null when no meter is reconciled (the section
 *  shows the coverage label, never $0). The completeness percent reuses the shared 8.4 composer. */
function authorSummary(farmName: string, data: ExportData): SummarySectionData {
  const kpi = computeKpiStrip(data.meters);
  const { total, reconciled } = data.state.coverage;
  return {
    farmName,
    totalMeters: total,
    reconciledMeters: reconciled,
    coveragePercent: coveragePercent(data.state),
    // The KPI spend counts only reconciled meters; when none is reconciled there is no loaded spend
    // to state, so we pass null and the section shows the coverage label (never a fabricated $0).
    loadedSpendCents: reconciled === 0 ? null : kpi.spend.cents,
  };
}

/** A rate-switch finding: a meter the rate lever suggests is on the wrong rate. Read from the GROUNDED
 *  action kind that `loadFindings` narrows off the stored action JSON (`finding.rateSwitchTo`), never
 *  from the farmer-facing label - the lever's label copy ("Move it to AG-B") deliberately never
 *  contains the word "switch", so a label string-match would drop every real finding. */
type RateSwitch = { meterId: string; toRate: string; savingsCents: number };

/** Extract a rate-switch from a finding, or null when it is not a switch_rate finding (or is
 *  fleet-level with no meter). `finding.rateSwitchTo` is non-null exactly when the stored action's
 *  `kind === "switch_rate"` and `params.to` is a readable rate code (the grounded suggestion);
 *  the savings is the finding's dollar impact (stored as float dollars on the row) converted to
 *  integer cents, floored to a non-negative whole cent. */
function readRateSwitch(finding: FindingView): RateSwitch | null {
  if (finding.meterId === null || finding.rateSwitchTo === null) return null;
  const savingsCents = Math.max(0, Math.round((finding.impactUsd ?? 0) * 100));
  return { meterId: finding.meterId, toRate: finding.rateSwitchTo, savingsCents };
}

/**
 * The rate-switch findings for the meters in scope, keyed to their current rate from the loaded
 * inventory. The findings carry the suggested rate and the dollar impact (the grounded lever output);
 * the meter's current rate comes from the MeterView (the same code the table/CSV display). Findings
 * for a meter outside the filtered set are dropped, so a filtered report's rate review and savings
 * describe exactly the meters in the report. Returned in findings order (severity then dollars).
 */
function rateSwitchesInScope(
  findings: readonly FindingView[],
  metersById: Map<string, MeterView>,
): { meter: MeterView; toRate: string; savingsCents: number }[] {
  const out: { meter: MeterView; toRate: string; savingsCents: number }[] = [];
  for (const f of findings) {
    const sw = readRateSwitch(f);
    if (sw === null) continue;
    const meter = metersById.get(sw.meterId);
    if (meter === undefined) continue; // outside the filtered set
    out.push({ meter, toRate: sw.toRate, savingsCents: sw.savingsCents });
  }
  return out;
}

/** The mis-rated section's data: the in-scope rate-switch meters with their current and suggested
 *  rate. No dollars here (the savings section owns the money). An empty set renders the honest
 *  "nothing flagged" line, never an empty table. */
function authorMisRated(
  findings: readonly FindingView[],
  metersById: Map<string, MeterView>,
): MisRatedSectionData {
  const rows: MisRatedRow[] = rateSwitchesInScope(findings, metersById).map((s) => ({
    meterName: s.meter.name,
    ranch: s.meter.ranchName,
    currentRate: s.meter.rateSchedule,
    suggestedRate: s.toRate,
  }));
  return { rows };
}

/** The savings section's data: per-meter estimated savings from a rate change, integer cents, plus
 *  the summed total. Every figure is the grounded finding impact; an empty set renders the honest
 *  empty line. */
function authorSavings(
  findings: readonly FindingView[],
  metersById: Map<string, MeterView>,
): SavingsSectionData {
  const rows: SavingsRow[] = rateSwitchesInScope(findings, metersById).map((s) => ({
    meterName: s.meter.name,
    from: s.meter.rateSchedule,
    to: s.toRate,
    savingsCents: s.savingsCents,
  }));
  const totalSavingsCents = rows.reduce((sum, r) => sum + r.savingsCents, 0);
  return { rows, totalSavingsCents };
}

/** This-cycle cost in integer cents for a meter's latest period, or null when none is posted. */
function latestCostCents(meter: MeterView): number | null {
  const latest = meter.periods[meter.periods.length - 1];
  return latest?.printedTotalCents ?? null;
}

/** Demand charge in integer cents for a meter's latest period, or null when none. */
function latestDemandCents(meter: MeterView): number | null {
  const latest = meter.periods[meter.periods.length - 1];
  return latest?.demandCents ?? null;
}

/** The single-meter section's data: one meter's detail. Money fields are null unless reconciled (the
 *  section turns a null + coverage state into the coverage label, never a fabricated value). */
function authorSingleMeter(meter: MeterView): SingleMeterSectionData {
  return {
    name: meter.name,
    ranch: meter.ranchName,
    entity: meter.entityName,
    rate: meter.rateSchedule,
    status: meter.status,
    coverageState: meter.coverageState,
    costCents: latestCostCents(meter),
    demandCents: latestDemandCents(meter),
  };
}

/**
 * Build the ordered `ReportSection[]` the 9.2 composer renders, authoring each chosen section's data
 * deterministically. A `singleMeter` section needs a resolved meter; when one was not resolved
 * (no `meter` query, or it matched nothing) that section is omitted rather than fabricated - the
 * caller has already turned a single-meter request with no match into a typed outcome, so this only
 * sees a resolved meter. Returns the sections in the model's chosen order; the composer stamps the
 * footer on every report, so even a single-section report states its coverage.
 */
function authorSections(
  sections: readonly ReportSectionKind[],
  farmName: string,
  data: ExportData,
  findings: readonly FindingView[],
  singleMeter: MeterView | null,
): ReportSection[] {
  const metersById = new Map(data.meters.map((m) => [m.id, m]));
  const out: ReportSection[] = [];
  for (const kind of sections) {
    if (kind === "summary") {
      out.push({ kind: "summary", data: authorSummary(farmName, data) });
    } else if (kind === "meterTable") {
      out.push({ kind: "meterTable", data });
    } else if (kind === "misRated") {
      out.push({ kind: "misRated", data: authorMisRated(findings, metersById) });
    } else if (kind === "savings") {
      out.push({ kind: "savings", data: authorSavings(findings, metersById) });
    } else if (kind === "singleMeter" && singleMeter !== null) {
      out.push({ kind: "singleMeter", data: authorSingleMeter(singleMeter) });
    }
  }
  return out;
}

/**
 * Run the report: read the uncapped farm data (8.1), apply the filter, author every chosen section
 * deterministically, render the PDF (9.2) with the coverage footer (8.4), and return the bytes wrapped
 * in a typed result. Scope is inherited from `deps` (no farmId crosses the model boundary).
 *
 * Honest outcomes, never a partial or empty file:
 *  - a filter (or an empty farm) that leaves no meters returns a typed `empty` (never an empty PDF);
 *  - a `singleMeter` section whose named meter is not found returns a typed `empty` with the
 *    not-found line (never a report about the wrong pump, never a fabricated meter);
 *  - any failure in the read, authoring, or render is caught and returned as a typed `error` - this
 *    never throws raw to the responder and never emits a partial file (we return before any bytes
 *    would be streamed).
 */
export async function runGenerateReport(
  deps: AlmondToolDeps,
  input: GenerateReportInput,
): Promise<GenerateReportResult> {
  try {
    const loadDeps: ExportLoadDeps = {
      prisma: deps.prisma,
      farmId: deps.farmId,
      farmName: deps.farmName,
    };
    const data = await loadExportData(loadDeps);
    const filtered = applyFilter(data.meters, input);

    // A filter (or an empty farm) that leaves no meters has nothing to report on: return the typed
    // empty outcome rather than an empty PDF (never an empty download).
    if (filtered.length === 0) {
      return { kind: "empty", message: t.empty };
    }

    // Narrow the export data to the filtered set, recomputing the coverage / as-of state so the footer
    // describes exactly the meters in the report, not the whole farm (the same rule the export uses).
    const filteredData: ExportData = {
      farm: data.farm,
      meters: filtered,
      state: summarizeExportState(filtered),
    };

    const sections = resolveSections(input);

    // Resolve the single meter only when a single-meter section is asked for. A query that matches
    // nothing (or is ambiguous) is a typed empty outcome with the not-found line, never a report about
    // the wrong pump. Resolution is over the FILTERED set so a single-meter report respects the filter.
    let singleMeter: MeterView | null = null;
    if (sections.includes("singleMeter")) {
      const query = input.meter?.trim() ?? "";
      const match = resolveMeterQuery(filtered, query);
      if (match.kind !== "found") {
        return { kind: "empty", message: t.meterNotFound(query) };
      }
      singleMeter = match.meter;
    }

    const findings = await loadFindings(deps.prisma, deps.farmId);

    const selection: ReportSelection = {
      farmName: deps.farmName,
      sections: authorSections(sections, deps.farmName, filteredData, findings, singleMeter),
      // The footer's coverage describes exactly the meters in the report (the filtered state), so the
      // PDF and a filtered spreadsheet state the same coverage.
      coverage: filteredData.state,
    };

    const bytes = await renderReport(selection);
    const filter = resolveFilter(input);
    return {
      kind: "file",
      preview: previewLine(sections, filter),
      fileName: reportFileName(deps.farmName, singleMeter?.name ?? null),
      contentType: PDF_CONTENT_TYPE,
      bytes,
      meterCount: filtered.length,
      coverageAsOf: filteredData.state.asOf,
      params: resolveReportParams(input),
    };
  } catch {
    // Any failure in the read, authoring, or render becomes a typed error the panel renders inline -
    // never a raw throw to the client, and never a partial file (we return before any bytes stream).
    return { kind: "error", message: t.error };
  }
}
