// The meter-table PDF section (Story 9.1): every meter on the farm, in the SAME operator headers and
// the SAME cell semantics as the spreadsheet export. It does NOT define a parallel table: it projects
// the export's full inventory through the shipped `meterRowsForExport` (Story 8.2) and renders each
// row through the ONE cell builder (src/lib/dashboard/csv.ts -> metersHeader / meterCells), so the PDF
// and the spreadsheet can never disagree about a meter's figures. A reconciled meter shows its real
// whole-dollar money (already formatted through the shared formatUsd inside meterCells); an
// unreconciled meter's money cells show the coverage LABEL, never a fabricated or zero figure; a null
// inventory field is an empty cell. No cap, no filter: every meter the loader returned is listed.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The cell-string grid is the exported `meterTableGrid`, so a test asserts the exact
// cells (including the coverage-label rule) without parsing PDF bytes; the component only lays it out.

import { Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { metersHeader, meterCells } from "@/lib/dashboard/csv";
import { meterRowsForExport, type MeterRow } from "@/lib/almond/export/rows";
import type { ExportData } from "@/lib/almond/export/load";
import { styles } from "../theme";

const t = en.shell.almond.report.meterTable;

// The two money columns (cost, demand) by header index. A reconciled cell is monospaced so dollar
// columns align; an unreconciled cell is the coverage label (muted). Indices match metersHeader().
const COST_COL = 5;
const DEMAND_COL = 6;

// Relative column widths (the nine table columns). Money columns get a touch more room; the rest
// share the remainder. The component uses these as flexGrow weights so the table fills the page width
// without per-column magic pixel values.
const COL_WEIGHTS = [2.4, 2, 2, 1.4, 1, 1.6, 1.6, 1.6, 1.6] as const;

/** The header cells and one cell-string array per meter, in the loader's order (no cap, no filter).
 *  Reuses the ONE header/cell builder, so this grid IS the spreadsheet's grid. Exported so a test
 *  asserts the exact cells without reading PDF bytes. */
export function meterTableGrid(data: ExportData): {
  header: string[];
  rows: { row: MeterRow; cells: string[] }[];
} {
  return {
    header: metersHeader(),
    rows: meterRowsForExport(data).map((row) => ({ row, cells: meterCells(row) })),
  };
}

/** Style a money column's cell: a reconciled meter gets the monospaced money style; an unreconciled
 *  meter's cell is the coverage-label style (muted), so a withheld figure reads as a label. */
function cellStyle(row: MeterRow, colIndex: number) {
  const isMoney = colIndex === COST_COL || colIndex === DEMAND_COL;
  if (!isMoney) return styles.td;
  return row.coverageState === "reconciled" ? styles.tdMoney : styles.tdCoverage;
}

/** The meter-table section. Renders the header band then one row per meter, every cell from the
 *  shared builder. The width weight per column comes from COL_WEIGHTS. */
export function MeterTableSection({ data }: { data: ExportData }) {
  const { header, rows } = meterTableGrid(data);
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.heading}>{t.heading}</Text>
      <View style={styles.tableHeaderRow}>
        {header.map((label, i) => (
          <Text key={label} style={[styles.th, { flexGrow: COL_WEIGHTS[i] ?? 1, flexBasis: 0 }]}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map(({ row, cells }) => (
        <View key={row.meter.id} style={styles.tableRow}>
          {cells.map((cell, i) => (
            <Text
              key={`${row.meter.id}-${i}`}
              style={[cellStyle(row, i), { flexGrow: COL_WEIGHTS[i] ?? 1, flexBasis: 0 }]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
