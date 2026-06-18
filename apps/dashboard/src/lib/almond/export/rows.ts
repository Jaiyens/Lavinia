// The single mapping point from an export's full meter inventory to the spreadsheet ROWS the
// builders write (Story 8.2). The export loader (Story 8.1, ./load.ts) returns the canonical
// MeterView[] - the same projection the dashboard table reads - so the meter-table spreadsheet is
// projected through the EXISTING pure `toMeterRow` (src/lib/dashboard/table.ts, AR-15: cost/demand
// are carried only for a reconciled meter). There is no parallel row shape: a meter becomes a
// MeterRow exactly once, here.
//
// The CSV form REUSES the shipped pure `metersCsv` string-builder verbatim (same RFC-4180 escaping,
// the same UTF-8 BOM, the same coverage-label-vs-money cell rule). We do NOT introduce a second CSV
// format; the XLSX path (./xlsx.ts) reuses the same `metersHeader`/`meterCells` semantics so the
// two formats can never drift. Pure: no Prisma, no I/O.

import { metersCsv } from "@/lib/dashboard/csv";
import { toMeterRow, type MeterRow } from "@/lib/dashboard/table";
import type { ExportData } from "./load";

export type { MeterRow };

/**
 * Project an export's full inventory into the table-shaped MeterRow[] the spreadsheet builders
 * write. This is the ONE place a MeterView becomes a MeterRow for an export, so the XLSX and CSV
 * forms operate on identical rows. No cap and no filter: every meter the loader returned is mapped,
 * in the loader's name-ascending order (no silent truncation). Pure (returns a new array).
 */
export function meterRowsForExport(data: ExportData): MeterRow[] {
  return data.meters.map(toMeterRow);
}

/**
 * The meter-table export as CSV, reusing the shipped pure `metersCsv` builder. The grower gets the
 * exact CSV the on-screen Table lens exports (same headers, escaping, BOM, coverage-label
 * semantics) - just over the FULL farm rather than the on-screen view. A meter with no reconciled
 * billing exports the coverage label, never a fabricated or zero figure (the metersCsv moneyCell
 * rule). No parallel CSV format is introduced.
 */
export function exportMetersCsv(data: ExportData): string {
  return metersCsv(meterRowsForExport(data));
}
