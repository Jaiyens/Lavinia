// The opportunities PDF section (Almond hardening, T3b): the money-first lead that comes right after
// the cover. It ranks the rate-switch findings most-savings-first - the SAME rows analyzeFarm exposes
// as `opportunities` - with each meter's current rate, suggested rate, and estimated yearly dollars.
// This REPLACES the old "No rate savings found" lead: when the analysis has opportunities (the seed has
// four), this section leads with them; the honest empty line shows ONLY when there genuinely are none.
// Money is integer cents throughout, formatted through the shared formatUsd at the render edge (never
// hand-formatted); the summed total is a measured figure, never a screaming hero. The PG&E
// one-change-a-year caveat is restated so the dollars are never read as stackable or guaranteed.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The cell grid, the lead line, and the formatted total are the exported
// `opportunitiesView`, so a test asserts the exact strings without parsing PDF bytes.

import { Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import { styles } from "../theme";
import type { OpportunitiesSectionData } from "./types";

const t = en.shell.almond.report.opportunities;

// The not-on-file label for a missing rate code, reused so every section names an absent field the
// same way. Never a fabricated rate.
const NOT_ON_FILE = en.shell.almond.report.singleMeter.notOnFile;

const COL_WEIGHTS = [2.6, 1.6, 1.6, 2.4] as const;

/** The header cells, one cell-string array per opportunity, the lead line, and the formatted total.
 *  Each money cell and the total are formatted through the shared formatUsd; a null rate renders the
 *  not-on-file label. The lead/total are null/"" for an empty set (the section shows the empty line).
 *  Exported so a test asserts the exact strings without reading PDF bytes. */
export function opportunitiesView(data: OpportunitiesSectionData): {
  header: string[];
  rows: string[][];
  lead: string | null;
  total: string;
} {
  const c = t.columns;
  const total = formatUsd(data.totalSavingsCents);
  return {
    header: [c.meter, c.currentRate, c.suggestedRate, c.savings],
    rows: data.rows.map((row) => [
      row.meterName,
      row.currentRate ?? NOT_ON_FILE,
      row.suggestedRate ?? NOT_ON_FILE,
      formatUsd(row.savingsCents),
    ]),
    lead: data.rows.length === 0 ? null : t.lead(data.rows.length, total),
    total,
  };
}

/** The opportunities section. An empty set renders the honest empty line; otherwise the lead, the
 *  ranked table (most savings first), and the one-change-a-year caveat. */
export function OpportunitiesSection({ data }: { data: OpportunitiesSectionData }) {
  const { header, rows, lead } = opportunitiesView(data);
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.heading}>{t.heading}</Text>
      {rows.length === 0 ? (
        <Text style={styles.muted}>{t.empty}</Text>
      ) : (
        <>
          {lead !== null ? <Text style={styles.body}>{lead}</Text> : null}
          <View style={[styles.tableHeaderRow, { marginTop: 6 }]}>
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
