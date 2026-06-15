// Lever (a): the retrospective. "What last summer cost you." Given a pump's
// interval history and its posted bills, find the cycles that hit a demand
// charge and, within each, the one day whose peak stood far above the rest of
// the month, the spike that drove the charge and "wasn't needed." Earns trust
// with the farmer's own numbers before advising anything.

import { en } from "@/copy/en";
import type { DraftRecommendation, Severity } from "@/lib/recommendations";
import { effectiveDemandRate, intervalKw } from "./demand";
import { localDate } from "./peak";
import { pumpTimingDraft, roundUsd } from "./recommend";
import type { CycleBill, DailyPeak, IntervalReading } from "./types";

/**
 * The category tag demand-charge-exposure findings carry once persisted. The pure
 * `retrospective` function still emits under the pump-timing tool tag (it is a
 * pump-timing lever); the engine runner re-tags the actionable outlier drafts to this
 * so the feed can categorize and color them as money-at-risk. Kept here next to the
 * lever that produces them.
 */
export const DEMAND_CHARGE_TOOL = "demand-charge";

export type RetrospectiveInput = {
  farmId: string;
  pumpId: string;
  pumpName: string;
  timezone: string;
  intervals: readonly IntervalReading[];
  bills: readonly CycleBill[];
  /** Local "today"; becomes the recs' createdAt. */
  asOf: string;
  /**
   * A day's peak is "avoidable" only when it tops the next-highest day's peak
   * by at least this fraction (so a flat month never gets flagged). Default 0.1.
   */
  outlierMargin?: number;
  /**
   * Severity for a cycle WITH a clear avoidable outlier (money at risk now). Defaults
   * to "info" so existing callers and tests are unchanged; the engine runner passes
   * "act" so demand-charge exposure lands in the at-risk hero and ranks in the feed.
   */
  outlierSeverity?: Severity;
};

const MS_PER_DAY = 86_400_000;

/** Normalize a window bound to a full ISO instant; date-only spans the day. */
function startBound(iso: string): number {
  const full = iso.length === 10 ? `${iso}T00:00:00.000Z` : iso;
  return new Date(full).getTime();
}
function endBound(iso: string): number {
  if (iso.length !== 10) return new Date(iso).getTime();
  // A date-only close means "through the close day": include it whole.
  return new Date(`${iso}T00:00:00.000Z`).getTime() + MS_PER_DAY;
}

/** The highest 15-minute kW on each local day within a cycle window. */
function dailyPeaksInWindow(
  intervals: readonly IntervalReading[],
  bill: CycleBill,
  timeZone: string,
): DailyPeak[] {
  const lo = startBound(bill.start);
  const hi = endBound(bill.close);
  const byDay = new Map<string, DailyPeak>();
  for (const interval of intervals) {
    const t = new Date(interval.start).getTime();
    if (t < lo || t >= hi) continue;
    const kw = intervalKw(interval);
    const date = localDate(interval.start, timeZone);
    const current = byDay.get(date);
    if (!current || kw > current.kw) {
      byDay.set(date, { date, kw, at: interval.start });
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function monthIndexOf(iso: string, timeZone: string): number {
  // A date-only cycle boundary names its own month directly; converting a UTC-midnight
  // date into a behind-UTC zone would roll it back a day into the previous month (a July 1
  // start reading as June). Only a full timestamp needs the local-day conversion.
  if (iso.length === 10) return Number(iso.slice(5, 7)) - 1;
  return Number(localDate(iso, timeZone).slice(5, 7)) - 1;
}

/** "June 14" for a YYYY-MM-DD local day. */
function dayLabel(date: string): string {
  const monthIndex = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  return en.pumpTiming.dateLabel(monthIndex, day);
}

/**
 * One recommendation per cycle that hit a demand charge. When a single day's
 * peak is an outlier above the rest of the month, the rec carries the dollar
 * estimate of that avoidable spike (peakDay's kW over the next-highest day's,
 * priced at the bill's own $/kW). Cycles with no clear outlier still surface as
 * an informational "this month cost you a demand charge."
 */
export function retrospective(
  input: RetrospectiveInput,
): DraftRecommendation[] {
  const margin = input.outlierMargin ?? 0.1;
  const recs: DraftRecommendation[] = [];

  for (const bill of input.bills) {
    if (bill.demandChargeUsd === null || bill.demandChargeUsd <= 0) continue;

    const rate = effectiveDemandRate(bill.demandChargeUsd, bill.peakKw);
    const dailyPeaks = dailyPeaksInWindow(input.intervals, bill, input.timezone);
    const ranked = [...dailyPeaks].sort((a, b) => b.kw - a.kw);
    const top = ranked[0];
    const second = ranked[1];

    const month = en.pumpTiming.monthLabel(
      monthIndexOf(bill.start, input.timezone),
    );

    let impactUsd: number | undefined;
    let impactNote: string | undefined;
    let avoidableKw: number | null = null;
    let peakDay: string | null = null;
    let actionLabel = en.pumpTiming.retrospective.action(month);

    const isOutlier =
      top !== undefined &&
      second !== undefined &&
      rate !== null &&
      top.kw > second.kw * (1 + margin);

    if (isOutlier && top && second && rate !== null) {
      avoidableKw = roundUsd(top.kw - second.kw);
      impactUsd = roundUsd((top.kw - second.kw) * rate);
      peakDay = top.date;
      const label = dayLabel(top.date);
      impactNote = en.pumpTiming.retrospective.avoidable(label, impactUsd);
      actionLabel = en.pumpTiming.retrospective.action(label);
    }

    // An avoidable outlier is money at risk now; a flat demand month is just info.
    const severity: Severity = isOutlier ? (input.outlierSeverity ?? "info") : "info";

    recs.push(
      pumpTimingDraft({
        farmId: input.farmId,
        severity,
        createdAt: input.asOf,
        situation: en.pumpTiming.retrospective.situation(
          month,
          bill.demandChargeUsd,
        ),
        impactUsd,
        impactNote,
        action: {
          kind: "review_peak",
          label: actionLabel,
          params: {
            pumpId: input.pumpId,
            cycleStart: bill.start,
            cycleClose: bill.close,
            demandChargeUsd: bill.demandChargeUsd,
            peakKw: bill.peakKw,
            ratePerKw: rate,
            peakDay,
            avoidableKw,
            dailyPeaks: dailyPeaks.map((d) => ({
              date: d.date,
              kw: roundUsd(d.kw),
              at: d.at,
            })),
          },
        },
      }),
    );
  }

  return recs;
}
