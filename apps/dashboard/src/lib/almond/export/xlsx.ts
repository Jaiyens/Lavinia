// The XLSX path for Almond's exports (Story 8.2 meter table; Story 8.3 bill-due schedule). Produces
// a real Excel workbook a grower recognizes: one titled sheet with plain operator headers, every
// row the loader returned (no cap), and footer lines that state coverage so nothing is silently
// left out.
//
// REUSE, not a parallel format: every export renders through the ONE workbook builder below
// (buildGridWorkbook). The meter table feeds it cells from the single CSV cell builder
// (src/lib/dashboard/csv.ts -> metersHeader / meterCells); the bill-due schedule (./bill-due.ts)
// feeds it its own header/cells but through the SAME builder, so the two formats can never drift.
// Each cell STRING is authored deterministically by the caller, so a reconciled meter shows its
// real, whole-dollar money (already formatted through the shared formatUsd inside meterCells); an
// unreconciled meter's money cells show the coverage LABEL, never a fabricated or zero figure; a
// null inventory field is an empty cell.
//
// exceljs is pure JS (no native deps), so this runs the same in CI and on Vercel. The builder is
// async only because exceljs serializes the workbook to a buffer; it performs no I/O of its own.

import ExcelJS from "exceljs";
import { en } from "@/copy/en";
import { metersHeader, meterCells } from "@/lib/dashboard/csv";
import { meterRowsForExport } from "./rows";
import type { ExportData } from "./load";

const t = en.shell.almond.export;

/** Format a posted-cycle close (a UTC-midnight ISO 8601 string from the loader) as a plain date,
    in UTC so the printed day never shifts under the runner's timezone. */
const AS_OF_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function asOfLine(asOf: string | null): string {
  return asOf === null ? t.asOfNone : t.asOf(AS_OF_FMT.format(new Date(asOf)));
}

/**
 * The shape every export hands the workbook builder. The builder is format-agnostic: it knows how
 * to lay out a titled sheet (title row, spacer, bold header, one row per data row, spacer, footer
 * lines), but never what the columns MEAN. The caller authors every cell STRING deterministically
 * (no fabrication, no cap) and supplies the coverage/as-of footer lines, so the meter table and the
 * bill-due schedule produce the same document structure without a second workbook implementation.
 */
export type WorkbookGrid = {
  /** Worksheet tab name. */
  sheetName: string;
  /** Title row written above the table. */
  title: string;
  /** Bold header row. */
  header: readonly string[];
  /** One cell-string array per data row, in the loader's order. No cap, no filter. */
  rows: readonly (readonly string[])[];
  /** Footer lines (coverage statement, as-of, etc.) written below the table after a spacer. */
  footer: readonly string[];
};

/**
 * Build a titled workbook from a format-agnostic grid. The ONE workbook builder: both the meter
 * table and the bill-due schedule render through this, so the layout (title, spacer, bold header,
 * every data row in order with no silent cap, spacer, footer lines) is identical across formats.
 * Returns the serialized .xlsx bytes (a Uint8Array) so a caller streams them straight to the grower
 * and a test can assert the generated size. Pure aside from exceljs's buffer serialization.
 */
export async function buildGridWorkbook(grid: WorkbookGrid): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(grid.sheetName);

  // Title row, then a spacer, so the sheet reads like a document a grower would recognize.
  sheet.addRow([grid.title]);
  sheet.addRow([]);

  const headerRow = sheet.addRow([...grid.header]);
  headerRow.font = { bold: true };

  // Every data row, exactly as the caller authored it (no cap, no filter).
  for (const row of grid.rows) {
    sheet.addRow([...row]);
  }

  // Footer: state coverage and the as-of so nothing is silently left out.
  sheet.addRow([]);
  for (const line of grid.footer) {
    sheet.addRow([line]);
  }

  // Give each column a readable width keyed to its header so the file opens clean.
  sheet.columns = grid.header.map((h) => ({ width: Math.max(h.length + 2, 14) }));

  // exceljs declares its own ArrayBuffer-shaped `Buffer`; at runtime in Node this is a real Buffer
  // (a Uint8Array subclass). Narrow it to the portable Uint8Array the caller streams / sizes.
  const written = await workbook.xlsx.writeBuffer();
  return written as unknown as Uint8Array;
}

/**
 * Build the meter-table workbook for an export. Returns the serialized .xlsx bytes.
 *
 * Layout, top to bottom: a title row (the farm name), one blank row, the nine table headers (bold),
 * then one row per meter - EVERY meter the loader returned, in name order, no silent cap. Below the
 * table, a blank row then two footer lines: the coverage statement (what is included and what shows
 * a coverage label instead of a figure) and the as-of (the freshest billed cycle, or its honest
 * absence). The footer is how the artifact states what was left out. Renders through the shared
 * buildGridWorkbook, with cells from the single CSV cell builder (coverage label for unreconciled
 * money cells; never a fabricated or zero figure).
 */
export async function buildMetersWorkbook(data: ExportData): Promise<Uint8Array> {
  const { total, reconciled } = data.state.coverage;
  return buildGridWorkbook({
    sheetName: t.sheetName,
    title: t.title(data.farm.name),
    header: metersHeader(),
    rows: meterRowsForExport(data).map(meterCells),
    footer: [t.coverageFooter(total, reconciled), asOfLine(data.state.asOf)],
  });
}
