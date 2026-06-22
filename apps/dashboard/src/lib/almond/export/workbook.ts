// The STYLED workbook builder for Almond's exports - the one place a grid of typed cells becomes a
// real, polished .xlsx a grower (and an investor) recognizes. It supersedes the bare one-sheet
// builder: every sheet gets a brand-green header band, a frozen header, an autofilter, readable
// column widths, zebra striping, real currency/number formats, and an optional totals band. The
// older `buildGridWorkbook` (./xlsx.ts) now renders THROUGH this, so the focused meter / bill-due
// exports get the same polish, and a multi-sheet workbook (./full-workbook.ts) is just several
// SheetSpecs handed to one call - no second workbook implementation.
//
// TYPED CELLS, not pre-formatted strings: a money cell carries a real NUMBER (dollars) plus a
// `currency` format, so Excel right-aligns it, shows "$11,727.33", and can SUM it - the thing the
// old all-text sheet could not do. A cell whose value cannot be a figure (an unreconciled meter's
// coverage label, an empty inventory field) stays text/`label`, so the honesty laws (never a
// fabricated or zero figure) are preserved at the cell level. `cellText` reproduces exactly what a
// cell renders, so a parity test can prove the typed cells match the shared CSV string cells
// (src/lib/dashboard/csv.ts) and the two formats can never drift.
//
// exceljs is pure JS (no native deps), so this runs identically in CI and on Vercel. The call is
// async only because exceljs serializes the workbook to a buffer; it performs no I/O of its own.

import ExcelJS from "exceljs";
import { formatUsd } from "@/lib/format/money";

/** How a cell renders. `text`/`label` stay strings (label is muted, for a coverage state or an
 *  honest-blank marker); `currency` and `integer` carry a real NUMBER so Excel formats and sums it. */
export type CellFormat = "text" | "label" | "currency" | "integer";

/** A single typed cell: the raw value plus how it renders. A `currency` value is DOLLARS (cents/100);
 *  `cellText` reproduces "$X,XXX.XX" from it. A null value renders as an empty cell, never a zero. */
export type SheetCell = { value: string | number | null; format?: CellFormat };

/** A column definition: its header and an optional explicit width (else auto-fit from content). */
export type SheetColumn = { header: string; width?: number };

/** One worksheet: a titled, header-banded, frozen, filterable table of typed cells with a footer. */
export type SheetSpec = {
  /** The tab name (sanitized + truncated to Excel's 31-char limit). */
  name: string;
  /** The title row written above the table. */
  title: string;
  columns: readonly SheetColumn[];
  /** One typed-cell array per data row, in order. No cap, no filter (the caller authored them). */
  rows: readonly (readonly SheetCell[])[];
  /** Footer lines (coverage statement, as-of) written below the table after a spacer. */
  footer: readonly string[];
  /** An optional bold totals band rendered directly under the data (e.g. summed savings). */
  totals?: readonly SheetCell[];
  /** Freeze the header so it stays pinned while scrolling (default true). */
  freezeHeader?: boolean;
  /** Add an Excel autofilter on the header row (default true). */
  autoFilter?: boolean;
  /** Zebra-stripe alternate data rows for readability at scale (default true). */
  zebra?: boolean;
};

/** A whole workbook: one or more sheets rendered into a single .xlsx. */
export type WorkbookSpec = { sheets: readonly SheetSpec[] };

// The Terra palette (cool-grey paper, brand green), as exceljs ARGB ("FFRRGGBB"). Mirrors
// src/app/globals.css tokens so an exported file reads like the app.
const BRAND_GREEN = "FF2FA84F";
const BRAND_GREEN_DARK = "FF1F7A39";
const HEADER_TEXT = "FFFFFFFF";
const TITLE_TEXT = "FF16181D";
const MUTED_TEXT = "FF6B7280";
const ZEBRA_FILL = "FFF2F4F7";
const TOTALS_RULE = "FFCBD2D9";

/** The Excel number format for a cell format, or undefined for text/label (no numFmt). */
function numFmtFor(format: CellFormat | undefined): string | undefined {
  if (format === "currency") return '"$"#,##0.00';
  if (format === "integer") return "#,##0";
  return undefined;
}

/** Whether a format is numeric (right-aligned, carries a numFmt). */
function isNumeric(format: CellFormat | undefined): boolean {
  return format === "currency" || format === "integer";
}

/**
 * The exact string a cell renders, so a parity test can assert the typed cells match the shared CSV
 * string cells. A `currency` value is dollars; we reconstruct the cents and run the SAME `formatUsd`
 * the CSV uses, so a typed money cell and a CSV money cell are provably identical. A null renders
 * empty (never a zero); everything else is its string.
 */
export function cellText(cell: SheetCell): string {
  if (cell.value === null) return "";
  if (cell.format === "currency" && typeof cell.value === "number") {
    return formatUsd(Math.round(cell.value * 100));
  }
  return String(cell.value);
}

/** Excel column letter for a 1-based index (1 -> "A", 27 -> "AA"). For the autofilter range. */
function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Sanitize a tab name: strip the chars Excel forbids, trim, cap at 31, never blank. */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  return cleaned === "" ? "Sheet" : cleaned;
}

/** A readable column width from the header and the rendered content, clamped to a sane range. */
function autoWidth(column: SheetColumn, columnIndex: number, rows: readonly (readonly SheetCell[])[]): number {
  if (column.width !== undefined) return column.width;
  let longest = column.header.length;
  for (const row of rows) {
    const cell = row[columnIndex];
    if (cell !== undefined) longest = Math.max(longest, cellText(cell).length);
  }
  return Math.min(Math.max(longest + 2, 12), 48);
}

/** Write one typed-cell row at the given values, applying numFmt / alignment / muted-label style. */
function writeRow(
  sheet: ExcelJS.Worksheet,
  cells: readonly SheetCell[],
  opts: { fill?: string; bold?: boolean; topRule?: boolean },
): ExcelJS.Row {
  const row = sheet.addRow(cells.map((c) => c.value));
  cells.forEach((cell, i) => {
    const target = row.getCell(i + 1);
    const numFmt = numFmtFor(cell.format);
    if (numFmt !== undefined) target.numFmt = numFmt;
    if (isNumeric(cell.format)) target.alignment = { horizontal: "right" };
    const fontColor = cell.format === "label" ? MUTED_TEXT : TITLE_TEXT;
    target.font = { color: { argb: fontColor }, bold: opts.bold === true };
    if (opts.fill !== undefined) {
      target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    }
    if (opts.topRule === true) {
      target.border = { top: { style: "thin", color: { argb: TOTALS_RULE } } };
    }
  });
  return row;
}

/** Render one sheet into the workbook (title, frozen header band, typed data rows, totals, footer). */
function renderSheet(workbook: ExcelJS.Workbook, spec: SheetSpec): void {
  const sheet = workbook.addWorksheet(safeSheetName(spec.name));
  const freeze = spec.freezeHeader !== false;
  const filter = spec.autoFilter !== false;
  const zebra = spec.zebra !== false;

  // Title row, then a spacer, so the sheet reads like a document a grower recognizes.
  const titleRow = sheet.addRow([spec.title]);
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: TITLE_TEXT } };
  sheet.addRow([]);

  // The brand-green header band.
  const headerRow = sheet.addRow(spec.columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: BRAND_GREEN_DARK } } };
  });
  const headerIndex = headerRow.number;

  // Every data row, exactly as the caller authored it (no cap, no filter), with zebra striping.
  spec.rows.forEach((cells, i) => {
    writeRow(sheet, cells, { fill: zebra && i % 2 === 1 ? ZEBRA_FILL : undefined });
  });

  // An optional bold totals band directly under the data.
  if (spec.totals !== undefined) {
    writeRow(sheet, spec.totals, { bold: true, topRule: true });
  }

  // Footer: state coverage / as-of so nothing is silently left out.
  sheet.addRow([]);
  for (const line of spec.footer) {
    const row = sheet.addRow([line]);
    row.getCell(1).font = { italic: true, color: { argb: MUTED_TEXT } };
  }

  // Freeze the header (so it stays pinned), add an autofilter, and size every column.
  if (freeze) sheet.views = [{ state: "frozen", ySplit: headerIndex }];
  if (filter) {
    sheet.autoFilter = `${colLetter(1)}${headerIndex}:${colLetter(spec.columns.length)}${headerIndex}`;
  }
  sheet.columns = spec.columns.map((c, i) => ({ width: autoWidth(c, i, spec.rows) }));
}

/**
 * Build a styled, possibly multi-sheet .xlsx from typed cells. Returns the serialized bytes (a
 * Uint8Array) so a caller streams them straight to the grower and a test can read them back. Pure
 * aside from exceljs's buffer serialization (no I/O of its own).
 */
export async function buildStyledWorkbook(spec: WorkbookSpec): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of spec.sheets) {
    renderSheet(workbook, sheet);
  }
  // exceljs declares its own ArrayBuffer-shaped `Buffer`; at runtime in Node this is a real Buffer
  // (a Uint8Array subclass). Narrow it to the portable Uint8Array the caller streams / sizes.
  const written = await workbook.xlsx.writeBuffer();
  return written as unknown as Uint8Array;
}
