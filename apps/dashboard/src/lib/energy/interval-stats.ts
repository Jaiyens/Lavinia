// Interval statistics: aggregating a 15-minute energy series into the compact
// shapes the assistant reads back to a grower — which hours run hardest, the
// weekday pattern, the monthly trend, and how much power lands on the expensive
// on-peak window versus off-peak. Pure functions over IntervalReading[]: no UI,
// no DB, no clock. Siblings of demand.ts (which finds the single max-demand
// peak) and modeled-cost.ts (which prices the series); this one groups it.
//
// Two laws shared with the rest of the energy lib:
//   - Only IMPORT (delivered) energy is counted, so a solar meter's export
//     readings never inflate a "usage" bucket (mirrors modelMeterCost).
//   - TOU bucketing reuses touPeriodForCode and folds an unlabeled interval into
//     off_peak, so no kWh is ever silently dropped (mirrors modelMeterCost).
//
// Hour-of-day and day-of-week are LOCAL to the farm's timezone (a 5pm peak is a
// 5pm peak in California, not in UTC), resolved with Intl so there is no Date
// arithmetic and no dependency. The default zone is America/Los_Angeles because
// the product serves California growers; callers may override it.

import { intervalKw, maxDemand, type DemandPeak } from "./demand";
import { touPeriodForCode } from "./modeled-cost";
import { TOU_PERIODS, type TouPeriod } from "./rates";
import type { IntervalReading } from "./types";

/** The farm's default timezone. California growers; overridable per call. */
export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

const SECONDS_PER_HOUR = 3600;

/** Options shared by the aggregators. */
export type BucketOptions = {
  /** IANA timezone for hour-of-day / day-of-week / month bucketing. */
  timeZone?: string;
  /**
   * Whether to count export (solar to grid) intervals too. Default false: only
   * import (delivered) energy is bucketed, matching the rest of the energy lib.
   */
  includeExport?: boolean;
};

/** One aggregation bucket: an hour, a weekday, a month, or a TOU period. */
export type UsageBucket = {
  /** Bucket key: "00".."23" (hour), "Mon".."Sun" (weekday), "YYYY-MM" (month),
   *  or a TouPeriod ("peak" | "partial_peak" | "off_peak"). */
  key: string;
  /** Total import kWh in this bucket. */
  kWh: number;
  /** Share of the window's total bucketed kWh, 0..1 (0 when the window is empty). */
  share: number;
  /** Number of intervals folded into this bucket. */
  count: number;
  /** The single highest 15-minute kW seen in this bucket, and when (null if empty). */
  peak: DemandPeak | null;
};

/** A window-level summary: the totals the assistant leads with. */
export type IntervalWindowSummary = {
  /** Number of import intervals in the window. */
  count: number;
  /** Total import energy over the window, kWh. */
  totalKwh: number;
  /** The single max-demand peak over the window (null when empty). */
  peak: DemandPeak | null;
  /** Earliest / latest interval start in the window, ISO (null when empty). */
  windowStart: string | null;
  windowEnd: string | null;
  /** Average real power over the window, kW (total energy / total hours). */
  avgKw: number;
};

/** Display order for weekday buckets (Monday-first, how a grower reads a week). */
const WEEKDAY_ORDER: readonly string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Keep only delivered (import) intervals unless the caller opts into export. */
function counted(readings: readonly IntervalReading[], opts?: BucketOptions): IntervalReading[] {
  if (opts?.includeExport) return [...readings];
  return readings.filter((r) => (r.direction ?? "import") === "import");
}

/** The farm-local hour, weekday short-name, and year-month for one ISO instant. */
function localParts(iso: string, timeZone: string): { hour: string; weekday: string; ym: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    hour: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  // hourCycle h23 yields "00".."23"; normalize a stray "24" (midnight) to "00".
  const hour = (Number(get("hour")) % 24).toString().padStart(2, "0");
  return { hour, weekday: get("weekday"), ym: `${get("year")}-${get("month")}` };
}

/** Fold a list of readings into buckets keyed by a per-reading key function. */
function bucketBy(
  readings: readonly IntervalReading[],
  keyOf: (r: IntervalReading) => string,
  order: (a: string, b: string) => number,
  opts?: BucketOptions,
): UsageBucket[] {
  const used = counted(readings, opts);
  const total = used.reduce((sum, r) => sum + r.kWh, 0);
  const groups = new Map<string, IntervalReading[]>();
  for (const r of used) {
    const key = keyOf(r);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()]
    .map(([key, rows]): UsageBucket => {
      const kWh = rows.reduce((sum, r) => sum + r.kWh, 0);
      return {
        key,
        kWh,
        share: total > 0 ? kWh / total : 0,
        count: rows.length,
        peak: maxDemand(rows),
      };
    })
    .sort((a, b) => order(a.key, b.key));
}

/** Usage grouped by farm-local hour of day ("00".."23"), only non-empty hours. */
export function bucketByHourOfDay(
  readings: readonly IntervalReading[],
  opts?: BucketOptions,
): UsageBucket[] {
  const tz = opts?.timeZone ?? DEFAULT_TIME_ZONE;
  return bucketBy(readings, (r) => localParts(r.start, tz).hour, (a, b) => a.localeCompare(b), opts);
}

/** Usage grouped by farm-local weekday ("Mon".."Sun"), Monday-first. */
export function bucketByDayOfWeek(
  readings: readonly IntervalReading[],
  opts?: BucketOptions,
): UsageBucket[] {
  const tz = opts?.timeZone ?? DEFAULT_TIME_ZONE;
  return bucketBy(
    readings,
    (r) => localParts(r.start, tz).weekday,
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b),
    opts,
  );
}

/** Usage grouped by farm-local calendar month ("YYYY-MM"), chronological. */
export function bucketByMonth(
  readings: readonly IntervalReading[],
  opts?: BucketOptions,
): UsageBucket[] {
  const tz = opts?.timeZone ?? DEFAULT_TIME_ZONE;
  return bucketBy(readings, (r) => localParts(r.start, tz).ym, (a, b) => a.localeCompare(b), opts);
}

/**
 * Usage grouped into the three TOU periods (peak / partial_peak / off_peak),
 * always returned in that fixed order with every period present (zero-filled),
 * so "how much of my power is on-peak" is a stable, complete answer. An interval
 * whose touCode does not resolve to a period folds into off_peak (no kWh lost),
 * the same convention modelMeterCost uses when it prices the series.
 */
export function bucketByTouPeriod(
  readings: readonly IntervalReading[],
  opts?: BucketOptions,
): UsageBucket[] {
  const used = counted(readings, opts);
  const total = used.reduce((sum, r) => sum + r.kWh, 0);
  const byPeriod = new Map<TouPeriod, IntervalReading[]>();
  for (const period of TOU_PERIODS) byPeriod.set(period, []);
  for (const r of used) {
    const period = touPeriodForCode(r.touCode) ?? "off_peak";
    byPeriod.get(period)!.push(r);
  }
  return TOU_PERIODS.map((period): UsageBucket => {
    const rows = byPeriod.get(period)!;
    const kWh = rows.reduce((sum, r) => sum + r.kWh, 0);
    return {
      key: period,
      kWh,
      share: total > 0 ? kWh / total : 0,
      count: rows.length,
      peak: maxDemand(rows),
    };
  });
}

/**
 * Window-level totals: the count, total energy, the single max-demand peak (and
 * when it happened), the spanned window, and the average kW. Import-only by
 * default. This is what the assistant leads with before reading out a breakdown.
 */
export function summarizeIntervalWindow(
  readings: readonly IntervalReading[],
  opts?: BucketOptions,
): IntervalWindowSummary {
  const used = counted(readings, opts);
  const first = used[0];
  if (used.length === 0 || first === undefined) {
    return { count: 0, totalKwh: 0, peak: null, windowStart: null, windowEnd: null, avgKw: 0 };
  }
  const totalKwh = used.reduce((sum, r) => sum + r.kWh, 0);
  const totalHours = used.reduce((sum, r) => sum + r.durationSec, 0) / SECONDS_PER_HOUR;
  let windowStart = first.start;
  let windowEnd = first.start;
  for (const r of used) {
    if (r.start < windowStart) windowStart = r.start;
    if (r.start > windowEnd) windowEnd = r.start;
  }
  return {
    count: used.length,
    totalKwh,
    peak: maxDemand(used),
    windowStart,
    windowEnd,
    avgKw: totalHours > 0 ? totalKwh / totalHours : 0,
  };
}

// `intervalKw` is re-exported so callers building a single-interval answer (e.g.
// "what was the kW at 5:15pm") do not have to reach past this module into demand.ts.
export { intervalKw };
