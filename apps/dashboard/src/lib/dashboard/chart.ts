// Pure derivation for the Chart lens (Story 2.8, FR-8): project canonical MeterViews into a
// TOU-stacked COST-OVER-TIME series. One bar per BILLING CYCLE (the UTC month of the period
// close), summing each TOU bucket's energy dollars across every reconciled meter in view. This
// keeps the chart legible at farm scale: a 183-meter account reads as ~12 monthly bars, not ~2000
// per-meter bars. Per-meter detail lives in the table and the drawer; the chart is the trend.
// Bars carry TOU ENERGY dollars only - demand and other charges live in the table and drawer.
// Reconciled meters only; a meter with no TOU detail is counted, never rendered. No DB, no UI.

import type { MeterView } from "./load";

export type TouBucket = "peak" | "part_peak" | "off_peak" | "super_off_peak" | "other";

/** Fixed stack order, bottom to top: cheap hours at the base, expensive on top. */
export const BUCKET_ORDER: readonly TouBucket[] = [
  "super_off_peak",
  "off_peak",
  "part_peak",
  "peak",
  "other",
];

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type ChartSegment = { bucket: TouBucket; cents: number };

export type ChartBar = {
  /** Aggregation key: zero-padded UTC year-month of the cycle close, e.g. "2026-03". */
  key: string;
  /** Display label for the axis + tooltip, e.g. "Mar 2026". */
  label: string;
  /** Representative ISO close (the latest in the month) - kept for time-based consumers. */
  close: string;
  /** Present buckets only, in BUCKET_ORDER. */
  segments: ChartSegment[];
  /** Sum of the segments (TOU energy dollars only). */
  totalCents: number;
  /** Distinct reconciled meters contributing to this cycle. */
  meterCount: number;
};

/**
 * Classify a printed TOU label into a bucket. Order matters: "Super Off-Peak" must win over
 * plain off-peak, and "Part-Peak"/"Partial Peak" over plain peak. Real labels seen on the
 * demo account: "Peak", "Off-Peak", "Off Peak", "Super Off-Peak", "Part-Peak".
 */
export function classifyTou(label: string | null): TouBucket {
  if (label === null) return "other";
  const norm = label.toLowerCase();
  if (/super[\s-]*off/.test(norm)) return "super_off_peak";
  if (/part(ial)?[\s-]*peak/.test(norm)) return "part_peak";
  if (/off[\s-]*peak/.test(norm)) return "off_peak";
  if (/peak/.test(norm)) return "peak";
  return "other";
}

export type ChartData = {
  bars: ChartBar[];
  /** Reconciled METERS none of whose periods carry TOU detail (flat-rate bills) - counted
      per meter (matching the caption's "N meters" wording), never rendered as zero bars. */
  metersWithoutTou: number;
};

/** Zero-padded UTC year-month of an ISO close (billing dates are UTC instants). */
function utcMonthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function labelFromKey(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_ABBR[Number(month) - 1]} ${year}`;
}

export function toChartBars(meters: readonly MeterView[]): ChartData {
  type Agg = { close: string; byBucket: Map<TouBucket, number>; meters: Set<string> };
  const byMonth = new Map<string, Agg>();
  let metersWithoutTou = 0;

  for (const meter of meters) {
    if (meter.coverageState !== "reconciled") continue;
    let hadTou = false;
    for (const period of meter.periods) {
      const touLines = period.lineItems.filter((li) => li.kind === "tou_energy");
      if (touLines.length === 0) continue;
      hadTou = true;
      const key = utcMonthKey(period.close);
      let agg = byMonth.get(key);
      if (agg === undefined) {
        agg = { close: period.close, byBucket: new Map(), meters: new Set() };
        byMonth.set(key, agg);
      }
      // Keep the latest close in the month as the representative instant.
      if (period.close > agg.close) agg.close = period.close;
      agg.meters.add(meter.id);
      for (const li of touLines) {
        const bucket = classifyTou(li.label);
        agg.byBucket.set(bucket, (agg.byBucket.get(bucket) ?? 0) + li.amountCents);
      }
    }
    if (!hadTou && meter.periods.length > 0) metersWithoutTou += 1;
  }

  const bars: ChartBar[] = [...byMonth.entries()].map(([key, agg]) => {
    const segments = BUCKET_ORDER.flatMap((bucket) => {
      const cents = agg.byBucket.get(bucket);
      return cents !== undefined ? [{ bucket, cents }] : [];
    });
    return {
      key,
      label: labelFromKey(key),
      close: agg.close,
      segments,
      totalCents: segments.reduce((acc, s) => acc + s.cents, 0),
      meterCount: agg.meters.size,
    };
  });

  // Chronological: the zero-padded year-month key sorts correctly as a plain string.
  bars.sort((a, b) => a.key.localeCompare(b.key));
  return { bars, metersWithoutTou };
}

export type YoyPair = { current: ChartBar; prior: ChartBar };

/**
 * Pair each cycle bar with the bar from the same calendar month one year earlier (FR-8
 * "equivalent periods"). Bars without a prior-year equivalent stay unpaired - the compare
 * never fabricates a baseline. One bar per month means pairing is one-to-one by construction.
 */
export function yoyPairs(bars: readonly ChartBar[]): YoyPair[] {
  const byKey = new Map(bars.map((bar) => [bar.key, bar]));
  const pairs: YoyPair[] = [];
  for (const bar of bars) {
    const [year, month] = bar.key.split("-");
    const prior = byKey.get(`${Number(year) - 1}-${month}`);
    if (prior !== undefined) pairs.push({ current: bar, prior });
  }
  return pairs;
}
