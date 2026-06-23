// Typed-cell authors for the styled workbook (./workbook.ts). These mirror the shared CSV string
// cells (src/lib/dashboard/csv.ts) ONE-FOR-ONE - same column order, same coverage/money rule - but
// emit typed SheetCells so a reconciled meter's money becomes a real NUMBER Excel can format and
// sum, while an unreconciled meter's money cell stays the coverage LABEL (never a fabricated or zero
// figure). `cellText` over these cells reproduces the CSV strings exactly, which a parity test
// asserts, so the styled workbook and the CSV/legacy XLSX can never drift to different content.

import { en } from "@/copy/en";
import type { MeterRow } from "@/lib/dashboard/table";
import { billDueCells, type BillDueRow } from "./bill-due";
import type { SheetCell } from "./workbook";

const t = en.shell.table;

/**
 * The typed money cell for a meter row, carrying the SAME rule as the CSV `moneyCell`: an
 * unreconciled meter shows its coverage LABEL (muted), never a number; a reconciled meter with no
 * figure shows "None" for demand or an empty cell for cost; a reconciled figure is a real currency
 * NUMBER (dollars) Excel formats as "$X,XXX.XX" and can sum.
 */
function moneyCellTyped(row: MeterRow, cents: number | null, kind: "cost" | "demand"): SheetCell {
  if (row.coverageState !== "reconciled") return { value: t.coverage[row.coverageState], format: "label" };
  if (cents === null) return kind === "demand" ? { value: t.none } : { value: "" };
  return { value: cents / 100, format: "currency" };
}

/**
 * The nine typed cells for one meter row, in the SAME header order as the CSV `meterCells`. Text
 * fields stay text; the two money fields use the typed money rule above; the coverage column is a
 * muted label. `cellText` over this array equals `meterCells(row)` (the parity law).
 */
export function meterCellsTyped(row: MeterRow): SheetCell[] {
  return [
    { value: row.name },
    { value: row.ranch ?? "" },
    { value: row.entity ?? "" },
    { value: row.rate ?? "" },
    { value: row.peakKw !== null ? String(Math.round(row.peakKw)) : "" },
    moneyCellTyped(row, row.costCents, "cost"),
    moneyCellTyped(row, row.demandCents, "demand"),
    { value: row.status ?? "" },
    { value: t.coverage[row.coverageState], format: "label" },
  ];
}

/**
 * The five typed cells for one bill-due row. There is no money column here, so we reuse the shared
 * string cells verbatim (wrapped as text) - the bill-due sheet can never drift from the CSV/legacy
 * XLSX, and the billed-vs-scheduled status cell is carried through unchanged.
 */
export function billDueCellsTyped(row: BillDueRow): SheetCell[] {
  return billDueCells(row).map((value) => ({ value }) as SheetCell);
}
