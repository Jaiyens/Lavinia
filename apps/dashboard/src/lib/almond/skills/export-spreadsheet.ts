import { z } from "zod";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import {
  loadExportData,
  summarizeExportState,
  type ExportData,
  type ExportLoadDeps,
} from "@/lib/almond/export/load";
import { buildMetersWorkbook } from "@/lib/almond/export/xlsx";
import { buildBillDueWorkbook } from "@/lib/almond/export/bill-due";

/**
 * The `exportSpreadsheet` skill (Story 8.5) - Almond's OWNER-ONLY ability to hand a grower a real
 * spreadsheet of their farm. It is wired into the factory through `ownerOnlySkills` (src/lib/almond/
 * tools.ts), so the model is handed it ONLY for an authenticated owner; the public Tour never sees
 * it (capability-by-omission, ADR-A08). There is no runtime "are you allowed" check inside the skill
 * because there cannot be: an unauthenticated caller is never given the skill to call.
 *
 * SHAPE ONLY across the model boundary (FR7): the input carries which table (meter inventory vs
 * bill-due schedule) and an optional single filter (rate / entity / ranch). It NEVER carries a
 * farmId, a value, or a file path - scope is inherited from `deps` (the resolved farm), and every
 * dollar and date is authored deterministically by the 8.2/8.3 builders off the 8.1 uncapped loader.
 * The model selects the SHAPE; this code authors the bytes.
 *
 * Two-step contract:
 *   1. PREVIEW (not an approval gate): `previewLine` states in one short sentence what the file will
 *      be ("I will export your 14 meters on AG-A1 as a meters spreadsheet"), so the grower sees the
 *      shape before the file lands. It is a courtesy line, never a confirm prompt - the file follows.
 *   2. FILE: `runExportSpreadsheet` reads the uncapped loader, applies the filter, builds the file
 *      via the shared builders (with the 8.4 coverage footer), and returns the bytes. The responder
 *      lifts those bytes onto the stream as a `data-report` part the panel renders as a download card.
 *
 * Honesty laws inherited from Epic 8: every meter in the (filtered) set is included with no silent
 * cap; an unreconciled meter shows a coverage label, never a fabricated or zero figure; an empty
 * result (a filter that matches nothing) returns a typed `empty` outcome, never an empty download; a
 * generation error returns a typed `error` outcome the panel renders inline, never a raw throw and
 * never a partial file. Answerable offline by the stub responder (zero external calls in CI).
 */

const t = en.shell.almond.export.skill;

/** The two table shapes Almond can export. Mirrors the 8.2 (meter inventory) / 8.3 (bill-due) split. */
export const EXPORT_TABLES = ["meters", "billDue"] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

/**
 * The skill's input: SHAPE ONLY. `table` picks the meter inventory or the bill-due schedule; the
 * three optional filters narrow the rows (case-insensitive contains, like the chat tools' filters).
 * There is deliberately NO farmId, no value, and no file path - scope and every figure are
 * server-authored. `filename`/`columns` are intentionally absent: the builders own the column set and
 * the filename, so the model can never reshape a value or rename the file into something misleading.
 */
export const exportSpreadsheetInputSchema = z.object({
  table: z
    .enum(EXPORT_TABLES)
    .optional()
    .describe(
      'Which spreadsheet to make: "meters" for the meter inventory (rate, account, latest bill, coverage), or "billDue" for each meter\'s billing-cycle closing date. Defaults to "meters".',
    ),
  rate: z.string().optional().describe("Only include meters on this rate schedule, e.g. AG-A1."),
  entity: z.string().optional().describe("Only include meters billed to this legal entity name."),
  ranch: z.string().optional().describe("Only include meters on this ranch."),
});

export type ExportSpreadsheetInput = z.infer<typeof exportSpreadsheetInputSchema>;

/** Which single filter (if any) the grower asked for, captured for the preview line and the file
 *  name. Only one filter is woven into the preview; an unset filter is null. */
type ResolvedFilter = { key: "rate" | "entity" | "ranch"; value: string } | null;

/** The outcome the skill returns to the responder. A clean build carries the file bytes + metadata
 *  (lifted onto the stream as a `data-report` part); an empty result and a generation error are typed
 *  so the panel renders them inline - a missing or failed file is NEVER a partial or empty download. */
export type ExportSpreadsheetResult =
  | {
      kind: "file";
      /** The one-line preview Almond states alongside the file. */
      preview: string;
      /** The download file name (server-authored; never from the model). */
      fileName: string;
      /** The MIME type for the download. */
      contentType: string;
      /** The serialized .xlsx bytes. Non-empty by construction (the builders always write a sheet). */
      bytes: Uint8Array;
      /** How many meters made it into the file (the filtered inventory; for the panel's label). */
      meterCount: number;
      /** Which table shape was built (for Reports persistence, Story 8.6; never from the model). */
      table: ExportTable;
      /** The freshest billed cycle the figures reflect, or null when no bill has posted (never
       *  fabricated). Carried so a persisted report records what it was as-of. */
      coverageAsOf: string | null;
      /** The SHAPE params the file was built from (table + the single applied filter), recorded with
       *  a persisted report so a refresh can reproduce the same shape. No farmId, no value. */
      params: ExportParams;
    }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

/** The persisted shape parameters of an export: the table and the single applied filter (if any).
 *  Server-authored from the resolved input; never carries a farmId or a value. */
export type ExportParams = {
  table: ExportTable;
  filterKey: "rate" | "entity" | "ranch" | null;
  filterValue: string | null;
};

/** The XLSX content type, declared once. */
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Case-insensitive contains, mirroring the chat tools' `matches` (shape.ts): an empty/absent filter
 *  matches all; a null field never matches a set filter. Keeps Almond's filtering consistent across
 *  the read tools and the export, and tolerant of the model's casing (vs the dashboard's exact match). */
function contains(value: string | null, filter: string | undefined): boolean {
  if (!filter || filter.trim() === "") return true;
  if (value === null) return false;
  return value.toLowerCase().includes(filter.trim().toLowerCase());
}

/**
 * The single filter the grower asked for, for the preview line and the file name. Precedence
 * rate > entity > ranch is arbitrary but fixed, so the preview is deterministic when more than one
 * filter is somehow set (the rows are still narrowed by ALL set filters in `applyFilter`). Null when
 * no filter is set (or all are blank).
 */
export function resolveFilter(input: ExportSpreadsheetInput): ResolvedFilter {
  const rate = input.rate?.trim();
  if (rate) return { key: "rate", value: rate };
  const entity = input.entity?.trim();
  if (entity) return { key: "entity", value: entity };
  const ranch = input.ranch?.trim();
  if (ranch) return { key: "ranch", value: ranch };
  return null;
}

/** Narrow the loaded inventory by EVERY set filter (case-insensitive contains). No cap. */
export function applyFilter(meters: readonly MeterView[], input: ExportSpreadsheetInput): MeterView[] {
  return meters.filter(
    (m) =>
      contains(m.rateSchedule, input.rate) &&
      contains(m.entityName, input.entity) &&
      contains(m.ranchName, input.ranch),
  );
}

/** The table shape, defaulting to the meter inventory. */
function tableOf(input: ExportSpreadsheetInput): ExportTable {
  return input.table ?? "meters";
}

/** The plain filter clause woven into the preview line (e.g. "on AG-A1"), or null when unset. */
function filterClause(filter: ResolvedFilter): string | null {
  if (filter === null) return null;
  if (filter.key === "rate") return t.filterClause.rate(filter.value);
  if (filter.key === "entity") return t.filterClause.entity(filter.value);
  return t.filterClause.ranch(filter.value);
}

/**
 * The one-line preview ("I will export your 14 meters on AG-A1 as a meters spreadsheet"). Pure and
 * exported so the stub responder and a unit test can assert it without building a file. States the
 * filtered meter count, the table kind, and the single named filter - a lightweight courtesy, never
 * an approval gate.
 */
export function previewLine(count: number, table: ExportTable, filter: ResolvedFilter): string {
  const kind = table === "billDue" ? t.kind.billDue : t.kind.meters;
  return t.preview(count, kind, filterClause(filter));
}

/** A filesystem-safe slug for the farm name in the download file name (no path, no separators). */
function slug(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "farm" : cleaned;
}

/** The server-authored download file name. Never from the model, never a path - just a safe slug. */
export function exportFileName(farmName: string, table: ExportTable): string {
  const suffix = table === "billDue" ? "bill-due" : "meters";
  return `${slug(farmName)}-${suffix}.xlsx`;
}

/** Build the .xlsx bytes for the chosen table over the (already filtered) export data. */
function buildWorkbook(data: ExportData, table: ExportTable): Promise<Uint8Array> {
  return table === "billDue" ? buildBillDueWorkbook(data) : buildMetersWorkbook(data);
}

/**
 * Run the export: read the uncapped farm data (8.1), apply the filter, build the file (8.2/8.3) with
 * the coverage footer (8.4), and return the bytes wrapped in a typed result. Scope is inherited from
 * `deps` (no farmId crosses the model boundary). An empty (filter matched nothing) set returns a
 * typed `empty`; any builder failure is caught and returned as a typed `error` - this never throws
 * raw to the responder and never emits a partial file.
 */
export async function runExportSpreadsheet(
  deps: ExportLoadDeps,
  input: ExportSpreadsheetInput,
): Promise<ExportSpreadsheetResult> {
  try {
    const data = await loadExportData(deps);
    const table = tableOf(input);
    const filtered = applyFilter(data.meters, input);

    // A filter (or an empty farm) that leaves no meters has nothing to put in a file: return the
    // typed empty outcome rather than an empty workbook (never an empty download).
    if (filtered.length === 0) {
      return { kind: "empty", message: t.empty };
    }

    // Narrow the export data to the filtered set, recomputing the coverage / as-of state so the
    // footer describes exactly the rows in the file, not the whole farm.
    const filteredData: ExportData = {
      farm: data.farm,
      meters: filtered,
      state: summarizeExportState(filtered),
    };

    const bytes = await buildWorkbook(filteredData, table);
    const filter = resolveFilter(input);
    return {
      kind: "file",
      preview: previewLine(filtered.length, table, filter),
      fileName: exportFileName(deps.farmName, table),
      contentType: XLSX_CONTENT_TYPE,
      bytes,
      meterCount: filtered.length,
      table,
      // The footer's as-of describes exactly the rows in the file (recomputed above), so a
      // persisted report records the same honest as-of, never the whole farm's.
      coverageAsOf: filteredData.state.asOf,
      params: {
        table,
        filterKey: filter?.key ?? null,
        filterValue: filter?.value ?? null,
      },
    };
  } catch {
    // Any failure in the read or the build becomes a typed error the panel renders inline - never a
    // raw throw to the client, and never a partial file (we return before any bytes are streamed).
    return { kind: "error", message: t.error };
  }
}
