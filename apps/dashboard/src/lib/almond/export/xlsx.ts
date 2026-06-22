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
// As of the styled-workbook upgrade, buildGridWorkbook renders THROUGH the one styled builder
// (./workbook.ts), so a focused meter / bill-due export gets the same brand header band, frozen
// header, autofilter, readable widths, and zebra striping the full multi-tab workbook does. The grid
// here is all TEXT (the cell strings the caller authored - a reconciled meter's money already
// formatted, an unreconciled meter's coverage label), so the focused exports keep their exact byte
// content (and the parity tests) while gaining the polish. The full multi-tab workbook lives in
// ./full-workbook.ts; both call the same builder, so no format can drift.

import { en } from "@/copy/en";
import { metersHeader, meterCells } from "@/lib/dashboard/csv";
import { meterRowsForExport } from "./rows";
import { composeCoverageFooter } from "./coverage-footer";
import { buildStyledWorkbook, type SheetSpec } from "./workbook";
import type { ExportData } from "./load";

const t = en.shell.almond.export;

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
export function buildGridWorkbook(grid: WorkbookGrid): Promise<Uint8Array> {
  // Adapt the format-agnostic string grid to a single styled sheet of TEXT cells. The layout (title,
  // spacer, header, every data row in order, spacer, footer) and every cell string are preserved, so
  // the focused exports keep their exact content; the styled builder adds only the visual polish.
  const sheet: SheetSpec = {
    name: grid.sheetName,
    title: grid.title,
    columns: grid.header.map((header) => ({ header })),
    rows: grid.rows.map((row) => row.map((value) => ({ value }))),
    footer: grid.footer,
  };
  return buildStyledWorkbook({ sheets: [sheet] });
}

/**
 * Build the meter-table workbook for an export. Returns the serialized .xlsx bytes.
 *
 * Layout, top to bottom: a title row (the farm name), one blank row, the nine table headers (bold),
 * then one row per meter - EVERY meter the loader returned, in name order, no silent cap. Below the
 * table, a blank row then the shared coverage / as-of footer (the coverage statement - what is
 * included and what shows a coverage label instead of a figure, with the whole-percent complete -
 * and the as-of, the freshest billed cycle or its honest absence). That footer comes from the ONE
 * composer (./coverage-footer.ts), the same lines the Epic 9 PDF composer will print, so the two
 * artifacts can never disagree about completeness. Renders through the shared buildGridWorkbook,
 * with cells from the single CSV cell builder (coverage label for unreconciled money cells; never a
 * fabricated or zero figure).
 */
export async function buildMetersWorkbook(data: ExportData): Promise<Uint8Array> {
  return buildGridWorkbook({
    sheetName: t.sheetName,
    title: t.title(data.farm.name),
    header: metersHeader(),
    rows: meterRowsForExport(data).map(meterCells),
    footer: composeCoverageFooter(data.state),
  });
}
