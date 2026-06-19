// The XLSX engine for Almond's exports (Epic 8 meter table + bill-due schedule, hardened in T3a). It
// renders a workbook an energy analyst would hand a CFO: real numeric currency cells (never string
// dollars), a styled forest-green house look, frozen panes, AutoFilter, conditional formats (a
// three-color scale on the demand-charge column, data bars on savings), and a Summary + Meters +
// Opportunities sheet set. Every number is driven from the ONE pure analysis (analysis.ts ->
// analyzeFarm), so a generated cell can never contradict the live dashboard: the same
// latest-reconciled selection, the same rate-switch opportunities, the same rankings.
//
// REUSE, not a parallel format: the bill-due schedule (./bill-due.ts) still renders through the ONE
// grid builder (buildGridWorkbook), now styled with the same house look, so the two formats share a
// visual language. The meter workbook is richer (multiple sheets, conditional formats) than a single
// grid can express, so it is authored directly here off the analysis - but the STYLE primitives all
// come from the single ./workbook-style.ts, so nothing drifts.
//
// exceljs is pure JS (no native deps), so this runs the same in CI and on Vercel. Builders are async
// only because exceljs serializes to a buffer; they perform no I/O of their own. Coverage-label rule
// is preserved: an unreconciled meter NEVER gets a fabricated or zero dollar; its money cells are
// numeric-empty (null) and a Coverage column states why.

import ExcelJS from "exceljs";
import { en } from "@/copy/en";
import type { FarmAnalysis, EnrichedMeter } from "@/lib/almond/analysis";
import type { ExportCoverageState } from "./load";
import { composeCoverageFooter } from "./coverage-footer";
import {
  styleHeaderRow,
  styleTitleCell,
  styleSubtitleCell,
  styleCalloutCell,
  applyCurrency,
  freeze,
  addColorScale,
  addDataBar,
  highlightFlag,
  setColumnWidths,
  CURRENCY_FMT,
} from "./workbook-style";

const t = en.shell.almond.export;
const coverageLabels = en.shell.table.coverage;

// Sheet names and column labels new to the analyst workbook (internal headers, plain operator
// English, no em dashes). Existing labels (the Meters tab name, the coverage state labels) are reused
// from src/copy/en.ts so the spreadsheet and the dashboard say the same words.
const SHEET = {
  summary: "Summary",
  meters: t.sheetName, // "Meters"
  opportunities: "Opportunities",
  chart: "Demand chart",
} as const;

const METER_HEADERS = [
  "Meter",
  "Entity",
  "Ranch",
  "Rate",
  "This cycle",
  "Demand charge",
  "Coverage",
] as const;

const OPP_HEADERS = [
  "Meter",
  "Entity",
  "Current rate",
  "Suggested rate",
  "Est. annual savings",
] as const;

/** Dollars (a JS number Excel stores) from integer cents, for a numeric currency cell. */
function dollars(cents: number): number {
  return cents / 100;
}

/** Convert a 1-based column index to an Excel column letter (1 -> A, 27 -> AA). */
function colLetter(index: number): string {
  let n = index;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// -------------------------------------------------------------------------------------------------
// The grid builder (still the ONE builder the bill-due schedule renders through). Now styled with the
// house look: a forest title, a forest header band, frozen header, AutoFilter, autofit-ish widths.
// -------------------------------------------------------------------------------------------------

export type WorkbookGrid = {
  /** Worksheet tab name. */
  sheetName: string;
  /** Title row written above the table. */
  title: string;
  /** Bold header row. */
  header: readonly string[];
  /** One cell-string array per data row, in the caller's order. No cap, no filter. */
  rows: readonly (readonly string[])[];
  /** Footer lines (coverage statement, as-of, etc.) written below the table after a spacer. */
  footer: readonly string[];
  /** 0-based indexes of columns whose cells are ISO date strings to render as real Excel dates. */
  dateColumns?: readonly number[];
};

/**
 * Build a titled, house-styled workbook from a format-agnostic grid. The bill-due schedule renders
 * through this, so its layout (forest title, forest header band, every data row in order with no
 * silent cap, footer lines) matches the meter workbook's look. A `dateColumns` entry renders that
 * column's ISO-date cells as REAL Excel dates (sortable, filterable), not strings. Returns the
 * serialized .xlsx bytes (a Uint8Array). Pure aside from exceljs's buffer serialization.
 */
export async function buildGridWorkbook(grid: WorkbookGrid): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(grid.sheetName);

  const titleRow = sheet.addRow([grid.title]);
  styleTitleCell(titleRow.getCell(1));
  sheet.addRow([]);

  const headerRow = sheet.addRow([...grid.header]);
  styleHeaderRow(headerRow);
  const headerRowNumber = headerRow.number;

  const dateCols = new Set(grid.dateColumns ?? []);
  for (const row of grid.rows) {
    const values = row.map((cell, i) => {
      if (dateCols.has(i) && /^\d{4}-\d{2}-\d{2}/.test(cell)) {
        // A real date cell, parsed at UTC midnight so the printed day never shifts under the runner's
        // timezone. exceljs stores it as a date serial; numFmt below renders it.
        return new Date(`${cell.slice(0, 10)}T00:00:00.000Z`);
      }
      return cell;
    });
    const added = sheet.addRow(values);
    for (const i of dateCols) {
      const cell = added.getCell(i + 1);
      if (cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd";
    }
  }

  // Footer: state coverage and the as-of so nothing is silently left out.
  sheet.addRow([]);
  for (const line of grid.footer) sheet.addRow([line]);

  // Freeze the header row, AutoFilter across it, and give each column a readable width.
  freeze(sheet, 0, headerRowNumber);
  const lastCol = colLetter(grid.header.length);
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `${lastCol}${headerRowNumber}` };
  setColumnWidths(
    sheet,
    grid.header.map((h) => Math.max(h.length + 2, 16)),
  );

  const written = await workbook.xlsx.writeBuffer();
  return written as unknown as Uint8Array;
}

// -------------------------------------------------------------------------------------------------
// The analyst meter workbook: Summary + Meters + Opportunities, driven entirely from analyzeFarm.
// -------------------------------------------------------------------------------------------------

/**
 * Build the analyst meter workbook from the pure farm analysis. Three sheets:
 *  - Summary (first): the farm name + as-of, the headline totals (spend, demand charge, meters,
 *    entities), and a top-5 rate-switch opportunities table - every figure a real currency number.
 *  - Meters: every meter (no cap), default-sorted by This Cycle descending (top row is the answer),
 *    real numeric currency cells, a three-color scale on the demand-charge column, a flag highlight
 *    on a mis-rated meter's rate cell, a frozen header + first column, and AutoFilter. An
 *    unreconciled meter's dollar cells are numeric-empty (null) - never a $0 or a string - and its
 *    Coverage cell states why.
 *  - Opportunities: the flagged (rate-switch) meters only, sorted by savings desc, with data bars on
 *    the savings column and a total-savings callout at the top.
 * Plus one embedded "chart": the top meters by demand charge as an Excel data-bar range (no image;
 * ExcelJS 4.4.0 cannot author a native chart and this app ships no SVG->PNG dependency).
 *
 * Returns the serialized .xlsx bytes. Pure aside from exceljs's buffer serialization.
 */
export async function buildAnalystMetersWorkbook(
  analysis: FarmAnalysis,
  state: ExportCoverageState,
  farmName: string,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  buildSummarySheet(workbook, analysis, state, farmName);
  buildMetersSheet(workbook, analysis);
  buildOpportunitiesSheet(workbook, analysis);
  buildChartSheet(workbook, analysis);

  const written = await workbook.xlsx.writeBuffer();
  return written as unknown as Uint8Array;
}

/** The Summary sheet: title, as-of, headline totals, and the top-5 opportunities table. */
function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  analysis: FarmAnalysis,
  state: ExportCoverageState,
  farmName: string,
): void {
  const sheet = workbook.addWorksheet(SHEET.summary);
  setColumnWidths(sheet, [30, 22, 22, 22, 18]);

  const titleRow = sheet.addRow([t.title(farmName)]);
  styleTitleCell(titleRow.getCell(1));
  // The shared coverage / as-of footer (the SAME lines the CSV and the PDF state), so the workbook
  // never overstates its completeness: a coverage statement (every meter included, what share is
  // billed) and the freshest billed cycle (or its honest absence).
  const footer = composeCoverageFooter(state);
  const coverageRow = sheet.addRow([footer[0] ?? ""]);
  styleSubtitleCell(coverageRow.getCell(1));
  const asOfRow = sheet.addRow([footer[1] ?? ""]);
  styleSubtitleCell(asOfRow.getCell(1));
  sheet.addRow([]);

  // Headline totals as a small two-column block. Dollar values are real numeric currency cells.
  const totalsHeader = sheet.addRow(["Headline", "Value"]);
  styleHeaderRow(totalsHeader);
  const spendRow = sheet.addRow(["Total spend (latest cycle)", dollars(analysis.totals.spendCents)]);
  applyCurrency(spendRow.getCell(2));
  const demandRow = sheet.addRow([
    "Total demand charge",
    dollars(analysis.totals.demandChargeCents),
  ]);
  applyCurrency(demandRow.getCell(2));
  sheet.addRow(["Meters", analysis.totals.meterCount]);
  sheet.addRow(["Entities", analysis.totals.entityCount]);
  sheet.addRow([]);

  // Top-5 rate-switch opportunities (the same source as the Opportunities sheet, capped to 5 here).
  const oppTitle = sheet.addRow(["Top rate-switch opportunities"]);
  oppTitle.getCell(1).font = { bold: true };
  const oppHeader = sheet.addRow(["Meter", "Entity", "Current rate", "Suggested rate", "Est. annual savings"]);
  styleHeaderRow(oppHeader);
  const top5 = analysis.opportunities.slice(0, 5);
  const firstOppRow = oppHeader.number + 1;
  for (const m of top5) {
    const row = sheet.addRow([
      m.name,
      m.entity ?? "",
      m.rate ?? "",
      m.flags.suggestedRate ?? "",
      dollars(m.flags.estAnnualSavingsCents),
    ]);
    applyCurrency(row.getCell(5));
  }
  if (top5.length > 0) {
    addDataBar(sheet, `E${firstOppRow}:E${firstOppRow + top5.length - 1}`);
  } else {
    const none = sheet.addRow(["No rate-switch opportunities found yet.", "", "", "", ""]);
    none.getCell(1).font = { italic: true };
  }

  freeze(sheet, 0, 1);
}

/** The Meters sheet: every meter, sorted by This Cycle desc, numeric currency, a three-color scale
 *  on the demand column, a flag highlight on a mis-rated rate cell, frozen header + name column, and
 *  AutoFilter. The demand-charge chart lives on its own sheet (buildChartSheet). */
function buildMetersSheet(workbook: ExcelJS.Workbook, analysis: FarmAnalysis): void {
  const sheet = workbook.addWorksheet(SHEET.meters);
  setColumnWidths(sheet, [30, 22, 18, 12, 16, 16, 16]);

  const headerRow = sheet.addRow([...METER_HEADERS]);
  styleHeaderRow(headerRow);
  const headerRowNumber = headerRow.number;

  // rankingsByCost is the analysis already sorted by latest-reconciled cost desc (top = the answer).
  const rows = analysis.rankingsByCost;
  const firstDataRow = headerRowNumber + 1;
  for (const m of rows) {
    const row = sheet.addRow([
      m.name,
      m.entity ?? "",
      m.ranch ?? "",
      m.rate ?? "",
      // Unreconciled -> numeric-empty (null). NEVER a $0 or a string in a numeric column.
      m.thisCycleCents === null ? null : dollars(m.thisCycleCents),
      m.demandChargeCents === null ? null : dollars(m.demandChargeCents),
      coverageLabel(m),
    ]);
    if (m.thisCycleCents !== null) applyCurrency(row.getCell(5));
    if (m.demandChargeCents !== null) applyCurrency(row.getCell(6));
    // Highlight the rate cell of a mis-rated meter so the eye lands on what should move rate.
    if (m.flags.misRated) highlightFlag(row.getCell(4));
  }

  const lastDataRow = headerRowNumber + rows.length;
  if (rows.length > 0) {
    // Three-color scale on the demand-charge column (col F) - green -> amber -> red, low -> high.
    addColorScale(sheet, `F${firstDataRow}:F${lastDataRow}`);
  }

  // Freeze the header row AND the meter-name column; AutoFilter across the header.
  freeze(sheet, 1, headerRowNumber);
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `G${headerRowNumber}` };
}

/** The embedded "chart" on its own sheet: the top 15 meters by demand charge as an Excel data-bar
 *  range (a bar per meter, drawn by Excel itself). A dedicated sheet keeps the Meters table clean
 *  (no duplicate meter names) and the chart self-contained. We use Excel's native data bars rather
 *  than an embedded PNG because ExcelJS 4.4.0 cannot author a native chart and this app ships no
 *  SVG->PNG rasterizer as a declared dependency; the data-bar approach is pure JS and deterministic
 *  in CI. When no meter carries a demand charge the sheet states that honestly. */
function buildChartSheet(workbook: ExcelJS.Workbook, analysis: FarmAnalysis): void {
  const sheet = workbook.addWorksheet(SHEET.chart);
  setColumnWidths(sheet, [30, 20]);

  const titleRow = sheet.addRow(["Top meters by demand charge"]);
  styleTitleCell(titleRow.getCell(1));
  sheet.addRow([]);

  const top = [...analysis.meters]
    .filter((m) => m.demandChargeCents !== null && m.demandChargeCents > 0)
    .sort((a, b) => (b.demandChargeCents ?? 0) - (a.demandChargeCents ?? 0))
    .slice(0, 15);

  if (top.length === 0) {
    const none = sheet.addRow(["No demand charges on file yet."]);
    none.getCell(1).font = { italic: true };
    freeze(sheet, 0, 1);
    return;
  }

  const headerRow = sheet.addRow(["Meter", "Demand charge"]);
  styleHeaderRow(headerRow);
  const firstDataRow = headerRow.number + 1;
  for (const m of top) {
    const row = sheet.addRow([m.name, dollars(m.demandChargeCents ?? 0)]);
    row.getCell(2).numFmt = CURRENCY_FMT;
  }
  addDataBar(sheet, `B${firstDataRow}:B${firstDataRow + top.length - 1}`);
  freeze(sheet, 0, headerRow.number);
}

/** The Opportunities sheet: rate-switch meters only, total-savings callout, data bars on savings. */
function buildOpportunitiesSheet(workbook: ExcelJS.Workbook, analysis: FarmAnalysis): void {
  const sheet = workbook.addWorksheet(SHEET.opportunities);
  setColumnWidths(sheet, [30, 22, 16, 16, 20]);

  const opps = analysis.opportunities;
  const totalSavingsCents = opps.reduce((sum, m) => sum + m.flags.estAnnualSavingsCents, 0);

  const titleRow = sheet.addRow(["Rate-switch opportunities"]);
  styleTitleCell(titleRow.getCell(1));
  const totalRow = sheet.addRow(["Total estimated annual savings", "", "", "", dollars(totalSavingsCents)]);
  styleCalloutCell(totalRow.getCell(1));
  styleCalloutCell(totalRow.getCell(5));
  applyCurrency(totalRow.getCell(5));
  sheet.addRow([]);

  const headerRow = sheet.addRow([...OPP_HEADERS]);
  styleHeaderRow(headerRow);
  const headerRowNumber = headerRow.number;
  const firstDataRow = headerRowNumber + 1;

  for (const m of opps) {
    const row = sheet.addRow([
      m.name,
      m.entity ?? "",
      m.rate ?? "",
      m.flags.suggestedRate ?? "",
      dollars(m.flags.estAnnualSavingsCents),
    ]);
    applyCurrency(row.getCell(5));
  }

  if (opps.length > 0) {
    addDataBar(sheet, `E${firstDataRow}:E${headerRowNumber + opps.length}`);
  } else {
    const none = sheet.addRow(["No rate-switch opportunities found yet.", "", "", "", ""]);
    none.getCell(1).font = { italic: true };
  }

  freeze(sheet, 1, headerRowNumber);
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `E${headerRowNumber}` };
}

/** The coverage cell for a meter: the shared coverage state label (the same words the dashboard and
 *  the CSV use), so a reader knows why a dollar cell is blank. */
function coverageLabel(m: EnrichedMeter): string {
  if (m.coverageState === "reconciled") return coverageLabels.reconciled;
  if (m.coverageState === "needs_review") return coverageLabels.needs_review;
  return coverageLabels.no_bill;
}
