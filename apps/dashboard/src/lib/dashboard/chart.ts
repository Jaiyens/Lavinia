// Pure derivation for the Chart lens (Story 2.8, FR-8): project canonical MeterViews into
// TOU-stacked bars. The bar unit is one reconciled meter-period (a bar click opens THAT
// meter's drawer), ordered by close date ascending then TOU total descending, so today's
// single-cycle account reads "which pump is costing me, split by hours" and the same chart
// becomes a true time series as cycles accumulate. Bars carry TOU ENERGY dollars only -
// demand and other charges live in the table and drawer. Reconciled meters only; a period
// with no TOU detail is counted, never rendered as a zero bar. No DB, no UI.

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

export type ChartSegment = { bucket: TouBucket; cents: number };

export type ChartBar = {
  meterId: string;
  meterName: string;
  /** ISO 8601 period close. */
  close: string;
  /** Present buckets only, in BUCKET_ORDER. */
  segments: ChartSegment[];
  /** Sum of the segments (TOU energy dollars only). */
  totalCents: number;
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

export function toChartBars(meters: readonly MeterView[]): ChartData {
  const bars: ChartBar[] = [];
  let metersWithoutTou = 0;

  for (const meter of meters) {
    if (meter.coverageState !== "reconciled") continue;
    let hadTou = false;
    for (const period of meter.periods) {
      const touLines = period.lineItems.filter((li) => li.kind === "tou_energy");
      if (touLines.length === 0) continue;
      hadTou = true;
      const byBucket = new Map<TouBucket, number>();
      for (const li of touLines) {
        const bucket = classifyTou(li.label);
        byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + li.amountCents);
      }
      const segments = BUCKET_ORDER.flatMap((bucket) => {
        const cents = byBucket.get(bucket);
        return cents !== undefined ? [{ bucket, cents }] : [];
      });
      bars.push({
        meterId: meter.id,
        meterName: meter.name,
        close: period.close,
        segments,
        totalCents: segments.reduce((acc, s) => acc + s.cents, 0),
      });
    }
    if (!hadTou && meter.periods.length > 0) metersWithoutTou += 1;
  }

  bars.sort((a, b) => {
    const byClose = a.close.localeCompare(b.close);
    if (byClose !== 0) return byClose;
    if (b.totalCents !== a.totalCents) return b.totalCents - a.totalCents;
    return a.meterName.localeCompare(b.meterName);
  });

  return { bars, metersWithoutTou };
}

export type YoyPair = { current: ChartBar; prior: ChartBar };

/** UTC year-month of an ISO close date (the 2.5 lesson: billing dates are UTC instants). */
function utcYearMonth(iso: string): { year: number; month: number } {
  const d = new Date(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/**
 * Pair each bar with the SAME meter's bar closing in the same calendar month one year
 * earlier (the FR-8 "equivalent periods"). Bars without a prior-year equivalent are simply
 * unpaired - the compare never fabricates a baseline.
 */
export function yoyPairs(bars: readonly ChartBar[]): YoyPair[] {
  // Bucket bars per meter-month so a rebill (two closes in one month) pairs ONE-TO-ONE in
  // close order instead of double-counting a single prior bar.
  const index = new Map<string, ChartBar[]>();
  for (const bar of bars) {
    const { year, month } = utcYearMonth(bar.close);
    const key = `${bar.meterId}|${year}|${month}`;
    const list = index.get(key);
    if (list === undefined) index.set(key, [bar]);
    else list.push(bar);
  }
  const pairs: YoyPair[] = [];
  const consumed = new Map<string, number>();
  for (const bar of bars) {
    const { year, month } = utcYearMonth(bar.close);
    const priorKey = `${bar.meterId}|${year - 1}|${month}`;
    const priors = index.get(priorKey);
    if (priors === undefined) continue;
    const used = consumed.get(priorKey) ?? 0;
    const prior = priors[used];
    if (prior === undefined) continue;
    consumed.set(priorKey, used + 1);
    pairs.push({ current: bar, prior });
  }
  return pairs;
}
