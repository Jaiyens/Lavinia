// Pure CSV builder for the by-packer table export (Phase 6). Takes the exact PackerRow[] the table
// is rendering (already sorted/filtered upstream) and renders through the ONE shared CSV mechanism
// (gridCsv: UTF-8 BOM, RFC-4180 escaping, CRLF) so the crop export can never drift to a second CSV
// format. It mirrors the on-screen cell semantics: every pound figure carries its SOURCE label, and
// the gap cell reads the honest "no settlement yet" when the cell has not been settled. No DOM here;
// the component triggers the download. Pure: this authors every cell, including the header row.

import { en, lbs } from "@/copy/en";
import { gridCsv } from "@/lib/dashboard/csv";
import type { PackerRow } from "./views";

const t = en.crops.table;

/** The six headers, in column order. */
function header(): string[] {
  const c = t.columns;
  return [c.buyer, c.year, c.variety, c.pounds, c.source, c.gap];
}

/** The source label for a row, matching the on-screen tag (an estimate is never a final). */
function sourceCell(row: PackerRow): string {
  return row.source === "PACKER_SETTLED" ? t.sourceSettled : t.sourceEstimate;
}

/** The gap cell: the signed settlement movement in pounds when one has landed, else the honest
 *  "no settlement yet" — never a fabricated zero. */
function gapCell(row: PackerRow): string {
  if (row.gapPounds === null) return t.gapNone;
  const signed = row.gapPounds > 0 ? `+${lbs(row.gapPounds)}` : lbs(row.gapPounds);
  return signed;
}

/** The six cell STRINGS for one packer row, in header order. */
function rowCells(row: PackerRow): string[] {
  return [
    row.buyer,
    String(row.cropYear),
    row.variety,
    lbs(row.committedPounds),
    sourceCell(row),
    gapCell(row),
  ];
}

/** Serialize the by-packer rows as one CSV document (header + one line per row). */
export function packerCsv(rows: readonly PackerRow[]): string {
  return gridCsv([header(), ...rows.map(rowCells)]);
}
