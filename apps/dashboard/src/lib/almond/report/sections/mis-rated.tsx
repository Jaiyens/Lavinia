// The mis-rated PDF section (Story 9.1): the focused set of meters that look billed on the wrong
// rate, rendered ONLY from the grounded MisRatedSectionData the deterministic caller passes in. No
// dollars live here - this section names WHICH meters and the suggested rate; the savings section
// owns the money - so it can never imply a saving the rate lever did not compute. Every field comes
// from the data argument (the meter name, ranch, current rate, suggested rate); a rate not on file
// shows the coverage label, never a fabricated code. The one warm clay alert tone marks the current
// (wrong) rate, used sparingly. An EMPTY set renders the honest "nothing flagged" line, never an
// empty table that would imply a problem the data does not show.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The cell grid is the exported `misRatedGrid`, so a test asserts the exact cells and
// the empty-case label without parsing PDF bytes; the component only lays it out.

import { Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { styles } from "../theme";
import type { MisRatedSectionData } from "./types";

const t = en.shell.almond.report.misRated;

// The not-on-file label for a missing rate code, reused from the single-meter section copy so the two
// sections speak the same word for an absent field. Never a fabricated rate.
const NOT_ON_FILE = en.shell.almond.report.singleMeter.notOnFile;

const COL_WEIGHTS = [2.4, 2, 2, 2] as const;

/** The header cells and one cell-string array per mis-rated meter, in the caller's order (no cap). A
 *  null rate renders the not-on-file label, never a fabricated code. Exported so a test asserts the
 *  exact cells without reading PDF bytes. */
export function misRatedGrid(data: MisRatedSectionData): {
  header: string[];
  rows: string[][];
} {
  const c = t.columns;
  return {
    header: [c.meter, c.ranch, c.currentRate, c.suggestedRate],
    rows: data.rows.map((row) => [
      row.meterName,
      row.ranch ?? "",
      row.currentRate ?? NOT_ON_FILE,
      row.suggestedRate ?? NOT_ON_FILE,
    ]),
  };
}

/** The mis-rated section. An empty set renders the honest empty line; otherwise the focused table,
 *  with the current (wrong) rate marked in the one warm clay alert tone. */
export function MisRatedSection({ data }: { data: MisRatedSectionData }) {
  const { header, rows } = misRatedGrid(data);
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.heading}>{t.heading}</Text>
      {rows.length === 0 ? (
        <Text style={styles.muted}>{t.empty}</Text>
      ) : (
        <>
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
                  // The current-rate column (index 2) is the wrong rate: mark it in the clay tone.
                  style={[
                    styles.td,
                    ...(i === 2 ? [styles.alert] : []),
                    { flexGrow: COL_WEIGHTS[i] ?? 1, flexBasis: 0 },
                  ]}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
    </View>
  );
}
