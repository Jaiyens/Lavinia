// The farm-summary PDF section (Story 9.1): the farm at a glance - a few measured stats and a plain
// completeness line - rendered ONLY from the grounded SummarySectionData the deterministic caller
// passes in. Zero model-authored values: the farm name, counts and loaded spend all come from the
// data argument; the loaded spend is formatted through the shared formatUsd (whole-dollar tabular on
// screen, here in cents->dollars), never hand-formatted. Crucially this is NOT a screaming hero: the
// loaded-spend stat sits at the same measured size as every other tile, so money is present but never
// the largest, loudest element (the north-star rule). When no meter is reconciled, the spend tile
// shows the coverage LABEL, never a fabricated or zero figure.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The value-authoring lives in the exported `summaryStats` so a test asserts the exact
// strings without parsing PDF bytes; the component only lays them out.

import { Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import { styles } from "../theme";
import type { SummarySectionData } from "./types";

const t = en.shell.almond.report.summary;

/** One labeled summary tile: a measured label/value pair (no hero figure). */
export type SummaryStat = { label: string; value: string };

/**
 * Author the summary's stats and completeness line from grounded data. Every value is deterministic:
 * the meter counts render verbatim; the loaded spend renders through the shared formatUsd, or the
 * coverage LABEL when no meter is reconciled (loadedSpendCents === null) - never a fabricated $0. The
 * completeness line states the percent plainly (an empty farm gets its own honest line). Exported so
 * a test asserts these exact strings without reading PDF bytes.
 */
export function summaryStats(data: SummarySectionData): {
  stats: SummaryStat[];
  completeness: string;
} {
  const spend =
    data.loadedSpendCents === null ? t.spendNotLoaded : formatUsd(data.loadedSpendCents);
  return {
    stats: [
      { label: t.metersLabel, value: String(data.totalMeters) },
      { label: t.loadedLabel, value: String(data.reconciledMeters) },
      { label: t.spendLabel, value: spend },
    ],
    completeness: t.completeness(data.totalMeters, data.reconciledMeters, data.coveragePercent),
  };
}

/** The farm-summary section. Renders the grounded stats and completeness line in the warm palette. */
export function SummarySection({ data }: { data: SummarySectionData }) {
  const { stats, completeness } = summaryStats(data);
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.heading}>{t.heading(data.farmName)}</Text>
      <View style={styles.statRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>{completeness}</Text>
    </View>
  );
}
