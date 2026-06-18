// The coverage-footer PDF section (Story 9.1): the honest statement of how complete the data behind
// the report is, rendered from the SAME lines the spreadsheet prints. It composes the ONE coverage /
// as-of footer composer (Story 8.4, src/lib/almond/export/coverage-footer.ts), so the PDF and the
// XLSX can never disagree about what is and is not covered: the coverage statement (every meter is
// included, what share carries loaded billing as a whole-percent complete, and that the rest show a
// coverage label in place of a dollar figure) and the as-of (the freshest billed cycle on file, or
// its honest absence - never a fabricated date). Zero values are authored here; the composer owns the
// words, this only lays them out.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The lines come straight from the shared composer, so a test can re-use the composer
// to assert the rendered lines, never a parallel footer string.

import { Text, View } from "@react-pdf/renderer";
import { composeCoverageFooter } from "@/lib/almond/export/coverage-footer";
import type { ExportCoverageState } from "@/lib/almond/export/load";
import { styles } from "../theme";

/** The footer section. Renders the shared coverage / as-of lines below a hairline rule. The lines are
 *  the SAME the 8.2 XLSX builder appends, via the ONE composer, so the two artifacts agree. */
export function CoverageFooterSection({ state }: { state: ExportCoverageState }) {
  const lines = composeCoverageFooter(state);
  return (
    <View style={styles.footer}>
      {lines.map((line, i) => (
        <Text key={`${i}-${line}`} style={styles.footerLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}
