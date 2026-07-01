// Year-over-year: pivot the per-season worksheet rows into one row per (block, variety) with a cell
// per season. Pure + deterministic — it consumes the ALREADY-computed worksheetRows() output for each
// season (so every pound here was owned by the worksheet engine and its gates) and only reshapes it
// into columns. No arithmetic invents a figure; turnout in a cell is the season's own gated turnout,
// and a season with no row for a key simply has no cell (rendered as a blank, never a zero).

import type { WorksheetRow, WorksheetSubtotal } from "./worksheet";
import { subtotal } from "./worksheet";

/** One season's figures for a (block, variety) cell. Nulls stay null (insufficient data, not zero). */
export type YoyCell = {
  fieldWeightLb: number;
  hullerWeightLb: number;
  turnoutPct: number | null;
  tgmLbs: number | null;
};

export type YoyRow = {
  entityName: string;
  blockId: string;
  blockName: string;
  variety: string;
  /** season -> cell. A missing season means no data that year for this key. */
  byYear: Record<number, YoyCell>;
};

export type YoyResult = {
  /** the seasons present, newest first. */
  years: number[];
  rows: YoyRow[];
  /** farm-wide subtotal per season (turnout recomputed from summed weights). */
  farmByYear: Record<number, WorksheetSubtotal>;
};

export type YoyInput = {
  /** season -> that season's worksheet rows (from worksheetRows). */
  perYear: ReadonlyMap<number, readonly WorksheetRow[]>;
};

const cellOf = (r: WorksheetRow): YoyCell => ({
  fieldWeightLb: r.fieldWeightLb,
  hullerWeightLb: r.hullerWeightLb,
  turnoutPct: r.turnoutPct,
  tgmLbs: r.tgmLbs,
});

const key = (blockId: string, variety: string): string => `${blockId} ${variety}`;

/**
 * Pivot per-season worksheet rows to year-over-year rows. Rows are sorted Entity -> Block -> Variety
 * (the worksheet's order); seasons are newest first. A (block, variety) row appears if ANY season has
 * it. Pure.
 */
export function yearOverYear(input: YoyInput): YoyResult {
  const years = [...input.perYear.keys()].sort((a, b) => b - a);

  const rowByKey = new Map<string, YoyRow>();
  for (const year of years) {
    for (const r of input.perYear.get(year) ?? []) {
      const k = key(r.blockId, r.variety);
      let row = rowByKey.get(k);
      if (!row) {
        row = {
          entityName: r.entityName,
          blockId: r.blockId,
          blockName: r.blockName,
          variety: r.variety,
          byYear: {},
        };
        rowByKey.set(k, row);
      }
      row.byYear[year] = cellOf(r);
    }
  }

  const rows = [...rowByKey.values()].sort(
    (a, b) =>
      a.entityName.localeCompare(b.entityName) ||
      a.blockName.localeCompare(b.blockName, "en-US", { numeric: true }) ||
      a.variety.localeCompare(b.variety),
  );

  const farmByYear: Record<number, WorksheetSubtotal> = {};
  for (const year of years) farmByYear[year] = subtotal(input.perYear.get(year) ?? []);

  return { years, rows, farmByYear };
}

/**
 * The change ratio for a metric between a season and the one before it in `years` (newest-first). Used
 * by the UI to render a signed delta. Returns null when either season lacks the figure (no honest
 * delta), so a missing year never reads as a 100% drop.
 */
export function yoyRatio(
  row: YoyRow,
  years: readonly number[],
  yearIndex: number,
  metric: "fieldWeightLb" | "hullerWeightLb" | "tgmLbs",
): number | null {
  const year = years[yearIndex];
  const prior = years[yearIndex + 1]; // newest-first, so the next index is the prior season
  if (year === undefined || prior === undefined) return null;
  const cur = row.byYear[year];
  const prev = row.byYear[prior];
  if (!cur || !prev) return null;
  const a = cur[metric];
  const b = prev[metric];
  if (a === null || b === null || b === 0) return null;
  return a / b;
}
