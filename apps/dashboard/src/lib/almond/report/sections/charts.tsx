// The charts PDF section (Almond hardening, T3b): a few plain bar charts so the report reads at a
// glance. Charting in a PDF has no Chromium and no canvas here, so we draw NATIVE react-pdf <Svg>
// <Rect> bars (fully supported by @react-pdf/renderer v4) rather than rastering a PNG - that keeps the
// renderer offline, deterministic, and crash-free in CI. Three charts: the highest demand charges,
// spend by entity, and the meter rate mix. Every bar's magnitude and value label is authored by the
// caller from the analysis (cents for the money charts, a count for the rate mix), so the charts can
// never disagree with the tables. A chart with no data to draw states its absence honestly.
//
// Each bar is scaled to the chart's own longest bar (so the widest bar fills the track and the rest
// read in proportion); a zero-magnitude set draws no bars and shows the empty line. Pure presentation
// under the existing "nodejs" runtime. The exported `chartGeometry` turns a bar list into scaled
// widths so a test asserts the scaling without parsing PDF bytes; the component only lays it out.

import { Svg, Rect, Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { palette, styles } from "../theme";
import type { ChartBar, ChartsSectionData } from "./types";

const t = en.shell.almond.report.charts;

// The drawable width of a bar track in points (the <Svg> viewport width). The label sits to the left
// (a fixed-width Text), the value to the right; this is just the bar lane.
const TRACK_WIDTH = 240;
const BAR_HEIGHT = 8;

/** Scale a bar list to pixel widths against the list's own maximum, so the widest bar fills the track
 *  and the rest read in proportion. A non-positive max (all zeros / empty) yields zero widths, which
 *  the component reads as "nothing to chart". Pure and exported so a test asserts the scaling. */
export function chartGeometry(bars: readonly ChartBar[]): { bar: ChartBar; width: number }[] {
  let max = 0;
  for (const b of bars) if (b.value > max) max = b.value;
  if (max <= 0) return bars.map((bar) => ({ bar, width: 0 }));
  return bars.map((bar) => ({
    bar,
    width: Math.max(0, Math.round((bar.value / max) * TRACK_WIDTH)),
  }));
}

/** One native bar chart: a title, then one row per bar (label, an <Svg><Rect> bar scaled to the
 *  widest bar, and the value). An empty set renders the honest empty line, never an empty chart. */
function BarChart({ title, bars }: { title: string; bars: readonly ChartBar[] }) {
  const geometry = chartGeometry(bars);
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.chartTitle}>{title}</Text>
      {geometry.length === 0 ? (
        <Text style={styles.muted}>{t.empty}</Text>
      ) : (
        geometry.map(({ bar, width }, i) => (
          <View key={`${bar.label}-${i}`} style={styles.chartRow}>
            <Text style={styles.chartRowLabel}>{bar.label}</Text>
            <Svg width={TRACK_WIDTH} height={BAR_HEIGHT}>
              {/* The track (a faint full-width band) then the value bar in the brand green. */}
              <Rect x={0} y={0} width={TRACK_WIDTH} height={BAR_HEIGHT} fill={palette.bandStrong} />
              <Rect x={0} y={0} width={width} height={BAR_HEIGHT} fill={palette.green} />
            </Svg>
            <Text style={styles.chartRowValue}>{bar.display}</Text>
          </View>
        ))
      )}
    </View>
  );
}

/** The charts section: the three native bar charts. Each draws its own bars or its honest empty line;
 *  no chart invents a value, and a chart with no data never draws an empty band. */
export function ChartsSection({ data }: { data: ChartsSectionData }) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.heading}>{t.heading}</Text>
      <BarChart title={t.demandTitle} bars={data.demandTop} />
      <BarChart title={t.spendTitle} bars={data.spendByEntity} />
      <BarChart title={t.rateMixTitle} bars={data.rateMix} />
    </View>
  );
}
