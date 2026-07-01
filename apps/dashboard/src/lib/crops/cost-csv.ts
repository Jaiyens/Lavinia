// Pure CSV builder for the cost-per-pound-by-block table export (WS1). Takes the exact
// BlockCostPerPound[] the table is rendering (already sorted upstream) and renders through the ONE
// shared CSV mechanism (gridCsv: UTF-8 BOM, RFC-4180 escaping, CRLF), mirroring the on-screen cell
// semantics: a block with no mapped yield exports the honest "no ratio" label, never a fabricated
// number. No DOM here; the component triggers the download. Pure: this authors every cell.

import { en, lbs, usdPerLb } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import { gridCsv } from "@/lib/dashboard/csv";
import type { BlockCostPerPound } from "./cost";

const t = en.crops.cost.table;

/** The five headers, in column order. */
function header(): string[] {
  const c = t.columns;
  return [c.block, c.acreage, c.energy, c.yield, c.costPerLb];
}

/** The cost-per-pound cell: the formatted ratio, or the honest "no yield mapped" when null. */
function costCell(row: BlockCostPerPound): string {
  return row.centsPerLb === null ? t.noRatio : usdPerLb(row.centsPerLb);
}

/** The five cell STRINGS for one block row, in header order. */
function rowCells(row: BlockCostPerPound): string[] {
  return [
    row.blockName,
    row.acreage === null ? "" : String(row.acreage),
    formatUsdWhole(row.energyCents),
    lbs(row.netLb),
    costCell(row),
  ];
}

/** Serialize the cost-per-pound rows as one CSV document (header + one line per block). */
export function costCsv(rows: readonly BlockCostPerPound[]): string {
  return gridCsv([header(), ...rows.map(rowCells)]);
}
