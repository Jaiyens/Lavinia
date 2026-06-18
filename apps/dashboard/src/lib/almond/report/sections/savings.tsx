// The savings PDF section (Story 9.1): the dollars a rate change would save, per meter and summed,
// rendered ONLY from the grounded SavingsSectionData the deterministic caller passes in. Every figure
// is integer cents authored by the rate lever; the section formats each through the shared formatUsd
// and never hand-formats a dollar string. The summed total is a labeled, MEASURED value in the
// brighter savings green - present and legible, but deliberately NOT a screaming hero figure (the
// north-star rule). The honesty caveat (PG&E allows one rate change per 12 months) is restated so the
// reader is never left implying a saving is guaranteed or stackable. An EMPTY set renders the honest
// "no savings found" line, never a $0 total dressed up as a result.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The cell grid and the formatted total are the exported `savingsView`, so a test
// asserts the exact strings without parsing PDF bytes; the component only lays them out.

import { Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import { styles } from "../theme";
import type { SavingsSectionData } from "./types";

const t = en.shell.almond.report.savings;

// The not-on-file label for a missing rate code, reused so every section names an absent field the
// same way. Never a fabricated rate.
const NOT_ON_FILE = en.shell.almond.report.singleMeter.notOnFile;

const COL_WEIGHTS = [2.4, 1.6, 1.6, 2.4] as const;

/** The header cells, one cell-string array per savings row, and the formatted total. Each money cell
 *  is formatted through the shared formatUsd; a null rate renders the not-on-file label. The total is
 *  formatted once, here. Exported so a test asserts the exact strings without reading PDF bytes. */
export function savingsView(data: SavingsSectionData): {
  header: string[];
  rows: string[][];
  total: string;
} {
  const c = t.columns;
  return {
    header: [c.meter, c.from, c.to, c.savings],
    rows: data.rows.map((row) => [
      row.meterName,
      row.from ?? NOT_ON_FILE,
      row.to ?? NOT_ON_FILE,
      formatUsd(row.savingsCents),
    ]),
    total: formatUsd(data.totalSavingsCents),
  };
}

/** The savings section. An empty set renders the honest empty line; otherwise the summed total (a
 *  measured value, not a hero), the per-meter table, and the one-change-a-year caveat. */
export function SavingsSection({ data }: { data: SavingsSectionData }) {
  const { header, rows, total } = savingsView(data);
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.heading}>{t.heading}</Text>
      {rows.length === 0 ? (
        <Text style={styles.muted}>{t.empty}</Text>
      ) : (
        <>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t.totalLabel}</Text>
            <Text style={[styles.statValue, styles.moneyPositive]}>{total}</Text>
          </View>
          <View style={styles.tableHeaderRow}>
            {header.map((label, i) => (
              <Text key={label} style={[styles.th, { flexGrow: COL_WEIGHTS[i] ?? 1, flexBasis: 0 }]}>
                {label}
              </Text>
            ))}
          </View>
          {rows.map((cells, rowIndex) => (
            <View key={`${cells[0]}-${rowIndex}`} style={styles.tableRow}>
              {cells.map((cell, i) => (
                <Text
                  key={`${cells[0]}-${rowIndex}-${i}`}
                  // The savings column (index 3) is monospaced money in the savings green.
                  style={
                    i === 3
                      ? [styles.tdMoney, styles.moneyPositive, { flexGrow: COL_WEIGHTS[i] ?? 1, flexBasis: 0 }]
                      : [styles.td, { flexGrow: COL_WEIGHTS[i] ?? 1, flexBasis: 0 }]
                  }
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.muted}>{t.note}</Text>
        </>
      )}
    </View>
  );
}
