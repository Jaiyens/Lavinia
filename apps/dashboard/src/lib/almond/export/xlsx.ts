// The XLSX path for Almond's meter-table export (Story 8.2). Produces a real Excel workbook a grower
// recognizes: one "Meters" sheet with the plain operator headers, every meter on the farm (no cap),
// and a footer that states coverage so nothing is silently left out.
//
// REUSE, not a parallel format: the rows come from the single mapping point (./rows.ts ->
// meterRowsForExport), and each cell STRING is the exact value the shipped CSV writes
// (src/lib/dashboard/csv.ts -> metersHeader / meterCells). So a reconciled meter shows its real,
// whole-dollar money (already formatted through the shared formatUsd inside meterCells); an
// unreconciled meter's money cells show the coverage LABEL, never a fabricated or zero figure; a
// null inventory field is an empty cell. The CSV and the XLSX can never drift, because both read the
// same header/cell builders.
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
 * Build the meter-table workbook for an export. Returns the serialized .xlsx bytes (a Uint8Array),
 * so a caller streams them straight to the grower and a test can assert the generated size.
 *
 * Layout, top to bottom: a title row (the farm name), one blank row, the nine table headers (bold),
 * then one row per meter - EVERY meter the loader returned, in name order, no silent cap. Below the
 * table, a blank row then two footer lines: the coverage statement (what is included and what shows
 * a coverage label instead of a figure) and the as-of (the freshest billed cycle, or its honest
 * absence). The footer is how the artifact states what was left out.
 */
export async function buildMetersWorkbook(data: ExportData): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t.sheetName);

  const header = metersHeader();

  // Title row, then a spacer, so the sheet reads like a document a grower would recognize.
  sheet.addRow([t.title(data.farm.name)]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };

  // Every meter, projected through the single mapping point and written with the identical CSV cell
  // semantics (coverage label for unreconciled money cells; never a fabricated or zero figure).
  for (const row of meterRowsForExport(data)) {
    sheet.addRow(meterCells(row));
  }

  // Footer: state coverage and the as-of so nothing is silently left out.
  sheet.addRow([]);
  const { total, reconciled } = data.state.coverage;
  sheet.addRow([t.coverageFooter(total, reconciled)]);
  sheet.addRow([asOfLine(data.state.asOf)]);

  // Give each column a readable width keyed to its header so the file opens clean.
  sheet.columns = header.map((h) => ({ width: Math.max(h.length + 2, 14) }));

  // exceljs declares its own ArrayBuffer-shaped `Buffer`; at runtime in Node this is a real Buffer
  // (a Uint8Array subclass). Narrow it to the portable Uint8Array the caller streams / sizes.
  const written = await workbook.xlsx.writeBuffer();
  return written as unknown as Uint8Array;
}
