// The shared house style for every workbook Almond hands a grower (T3a). One place owns the look,
// so the meter workbook and the bill-due workbook can never drift to two different visual languages:
// a forest-green header band with white bold text, a serif-ish title, real currency number formats,
// frozen panes, AutoFilter, and the conditional formats (a three-color scale on a cost column, an
// in-sheet data-bar "chart"). It is presentation only - never a number, never a label - so the
// honesty laws stay in the pure analysis (analysis.ts) and the copy stays in src/copy/en.ts.
//
// Why an in-sheet data-bar chart and not an embedded PNG: ExcelJS 4.4.0 cannot author a native
// chart, so a "chart" is either a rasterized image (needs a declared SVG->PNG dependency this app
// does not ship - sharp is only a transitive Next.js dep, fragile in CI) or Excel's own data-bar
// conditional format drawn across a dedicated cell range. We use the latter: it renders the bars in
// Excel itself, is pure JS with zero added dependency, and is deterministic in CI. The chart range
// is labeled so a reader knows it is the top meters by demand charge.

import type ExcelJS from "exceljs";

/** The forest-green header band fill (cream/forest house style). */
export const FOREST = "FF1F3D2B";
/** White header text on the forest band. */
export const WHITE = "FFFFFFFF";
/** The cream title/background accent. */
export const CREAM = "FFF7F3E8";
/** A soft forest tint for total/callout cells. */
export const FOREST_TINT = "FFE4ECE5";

/** The currency number format every dollar cell carries, so a cell is a real number Excel can sum,
 *  never a string like "$1,234.00". Negative (a NEM credit) prints in parentheses. */
export const CURRENCY_FMT = '$#,##0.00;($#,##0.00)';

/** The Excel date format the bill-due closing-date column carries, so a date cell sorts and filters
 *  as a real date, not a string. */
export const DATE_FMT = "yyyy-mm-dd";

/** Excel ARGB colors for the three-color scale on a cost column (green -> amber -> red). */
const SCALE_GREEN = "FF63BE7B";
const SCALE_AMBER = "FFFFEB84";
const SCALE_RED = "FFF8696B";
/** The data-bar color for a savings / chart column. */
const BAR_FOREST = "FF1F3D2B";

/** Style a header row as the forest band: a forest fill, white bold text, thin bottom border, frozen
 *  by the caller. Reused by every sheet's header so the band is identical everywhere. */
export function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: false }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: FOREST } } };
  });
}

/** Style a title cell: a large serif-ish bold forest title, the document's name row. */
export function styleTitleCell(cell: ExcelJS.Cell): void {
  cell.font = { name: "Georgia", bold: true, size: 16, color: { argb: FOREST } };
}

/** Style a subtitle / as-of cell: a smaller muted forest line under the title. */
export function styleSubtitleCell(cell: ExcelJS.Cell): void {
  cell.font = { name: "Georgia", italic: true, size: 10, color: { argb: FOREST } };
}

/** Style a callout cell (a total figure): a forest-tinted fill and bold text. */
export function styleCalloutCell(cell: ExcelJS.Cell): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST_TINT } };
  cell.font = { bold: true, color: { argb: FOREST } };
}

/** Apply the currency format to a cell (numeric cells only; a coverage-label string is left alone). */
export function applyCurrency(cell: ExcelJS.Cell): void {
  cell.numFmt = CURRENCY_FMT;
}

/** Freeze the header row (and optionally the first N name columns) so the table scrolls under a
 *  pinned header. `xSplit` columns and `ySplit` rows stay frozen. */
export function freeze(sheet: ExcelJS.Worksheet, xSplit: number, ySplit: number): void {
  sheet.views = [{ state: "frozen", xSplit, ySplit }];
}

/** Add a three-color scale (green -> amber -> red, low -> high) over a column range, e.g. the
 *  demand-charge column, so the heaviest cells read hot at a glance. `ref` is an A1 range. */
export function addColorScale(sheet: ExcelJS.Worksheet, ref: string): void {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "colorScale",
        priority: 1,
        cfvo: [
          { type: "min" },
          { type: "percentile", value: 50 },
          { type: "max" },
        ],
        color: [{ argb: SCALE_GREEN }, { argb: SCALE_AMBER }, { argb: SCALE_RED }],
      },
    ],
  });
}

/** Add Excel data bars over a column range (e.g. the savings column, or the chart range): a bar in
 *  each cell proportional to its value, drawn by Excel itself (no image). `ref` is an A1 range. The
 *  bar color rides on the rule object; ExcelJS reads it at write time even though the published
 *  DataBarRuleType omits it, so we widen the rule shape locally to carry it without an `any`. */
export function addDataBar(sheet: ExcelJS.Worksheet, ref: string, priority = 1): void {
  const rule: ExcelJS.DataBarRuleType & { color: { argb: string } } = {
    type: "dataBar",
    priority,
    cfvo: [{ type: "min" }, { type: "max" }],
    gradient: false,
    color: { argb: BAR_FOREST },
  };
  sheet.addConditionalFormatting({ ref, rules: [rule] });
}

/** Highlight a cell as a flag (e.g. a mis-rated meter's rate cell): an amber fill + bold forest text,
 *  so a reader's eye lands on the meters that should move rate. */
export function highlightFlag(cell: ExcelJS.Cell): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SCALE_AMBER } };
  cell.font = { bold: true, color: { argb: FOREST } };
}

/** Set column widths from a header + a per-column hint, autofit-ish (header length floored). */
export function setColumnWidths(sheet: ExcelJS.Worksheet, widths: readonly number[]): void {
  sheet.columns = widths.map((w) => ({ width: w }));
}
