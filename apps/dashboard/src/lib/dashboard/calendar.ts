// Pure derivation for the Calendar lens (Story 3.5, FR-16): one month of the
// billing-cycle timing picture. Two kinds of marks, never conflated (AR-14):
// - "actual"    - the close printed on a posted bill (MeterView.periods[].close),
//                 a fact from the bill;
// - "scheduled" - PG&E's planned read date for the meter's serial letter from the
//                 committed 2026 schedule (may shift; labeled so).
// A meter without a serial code simply has no scheduled marks (the real account
// today - extraction never captured the Service Information block); a meter
// without bills has no actual marks. Nothing is inferred, nothing fabricated.
//
// Pure: no clock (callers pass todayIso), no DB, no fs (callers pass the loaded
// schedule). Colocated tests in calendar.test.ts.
//
// Date convention: period closes are stored UTC-midnight date-only (the seed
// uses Date.UTC; extraction stores printed calendar dates), so the slice-based
// year-month/day bucketing below is exact. A time-of-day close would need a
// Pacific-localized bucket first - the same convention note as kpi.ts monthKey
// (recorded in deferred-work from 2-3).

import { isKnownSerial, nextCycleClose, type MeterReadSchedule } from "@/lib/pge/schedule";
import { billingCycleFor, daysToClose } from "@/lib/energy/billing";
import { maxDemandInWindow } from "@/lib/energy/demand";
import type { IntervalReading } from "@/lib/energy/types";
import type { MeterView } from "./load";

export type CalendarChipKind = "actual" | "scheduled";

export type CalendarChip = {
  meterId: string;
  meterName: string;
  kind: CalendarChipKind;
};

export type CalendarDay = {
  /** 1-based day of month. */
  day: number;
  /** ISO date for the cell (aria labels, keys). */
  iso: string;
  chips: CalendarChip[];
};

export type CalendarMonthModel = {
  year: number;
  /** 1-12. */
  month: number;
  /** Cells before day 1 in a Sunday-first week row (0-6). */
  leadingBlanks: number;
  days: CalendarDay[];
  actualCount: number;
  scheduledCount: number;
};

/** "2026-03" for (2026, 3). */
function ym(year: number, month: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
}

/**
 * The month the calendar opens on: the month of the LATEST posted close on file
 * (the month with data - an empty "today" month would read broken), else the
 * month of `todayIso`.
 */
export function defaultCalendarMonth(
  meters: MeterView[],
  todayIso: string,
): { year: number; month: number } {
  let latest: string | null = null;
  for (const meter of meters) {
    for (const period of meter.periods) {
      if (latest === null || period.close > latest) latest = period.close;
    }
  }
  const anchor = latest ?? todayIso;
  return { year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) };
}

/**
 * Inclusive month-paging bounds: from the earliest MARK to the latest, where a
 * mark is a posted close or a date a resolvable serial can actually produce.
 * Resolvable means the code is in the table (isKnownSerial) - a present-but-
 * unknown code ("14A", a mis-extracted field) must not widen the range to a
 * year of empty months. Serial bounds come from the serial's own first/last
 * dates, so the December-2025 wrap month is reachable and trailing empty
 * months are not.
 */
export function calendarBounds(
  meters: MeterView[],
  schedule: MeterReadSchedule,
  todayIso: string,
): { minYm: string; maxYm: string } {
  const anchors: string[] = [todayIso.slice(0, 7)];
  for (const meter of meters) {
    for (const period of meter.periods) anchors.push(period.close.slice(0, 7));
    if (isKnownSerial(meter.serialCode, schedule)) {
      const dates = schedule.cycles[meter.serialCode?.trim().toUpperCase() ?? ""];
      const first = dates?.[0];
      const last = dates?.[dates.length - 1];
      if (first !== undefined) anchors.push(first.slice(0, 7));
      if (last !== undefined) anchors.push(last.slice(0, 7));
    }
  }
  anchors.sort();
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  return { minYm: first ?? todayIso.slice(0, 7), maxYm: last ?? todayIso.slice(0, 7) };
}

/** Whether any meter's serial resolves in the table (drives the no-serials note). */
export function anyResolvableSerial(
  meters: MeterView[],
  schedule: MeterReadSchedule,
): boolean {
  return meters.some((m) => isKnownSerial(m.serialCode, schedule));
}

/**
 * Build one displayed month: every posted close and every scheduled read date
 * falling inside it, bucketed by day. Scheduled dates are matched by the DATE
 * itself, not the statement column - an early serial letter's January statement
 * reads in late December, and that mark belongs on the December grid.
 */
export function calendarMonth(
  meters: MeterView[],
  year: number,
  month: number,
  schedule: MeterReadSchedule,
): CalendarMonthModel {
  const prefix = ym(year, month);
  const chipsByDay = new Map<number, CalendarChip[]>();
  let actualCount = 0;
  let scheduledCount = 0;

  const push = (day: number, chip: CalendarChip) => {
    const list = chipsByDay.get(day) ?? [];
    list.push(chip);
    chipsByDay.set(day, list);
  };

  for (const meter of meters) {
    // Actual closes from posted bills (dates are not dollars; no coverage gate).
    // One chip per meter per day even if two periods closed the same day.
    const actualDays = new Set<number>();
    for (const period of meter.periods) {
      if (period.close.slice(0, 7) !== prefix) continue;
      actualDays.add(Number(period.close.slice(8, 10)));
    }
    for (const day of actualDays) {
      push(day, { meterId: meter.id, meterName: meter.name, kind: "actual" });
      actualCount += 1;
    }

    // Scheduled reads from the serial letter, matched by date.
    if (meter.serialCode !== null) {
      const dates = schedule.cycles[meter.serialCode.trim().toUpperCase()];
      if (dates) {
        const scheduledDays = new Set<number>();
        for (const date of dates) {
          if (date.slice(0, 7) === prefix) scheduledDays.add(Number(date.slice(8, 10)));
        }
        for (const day of scheduledDays) {
          push(day, { meterId: meter.id, meterName: meter.name, kind: "scheduled" });
          scheduledCount += 1;
        }
      }
    }
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days: CalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const chips = (chipsByDay.get(day) ?? []).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "actual" ? -1 : 1;
      return a.meterName.localeCompare(b.meterName);
    });
    days.push({
      day,
      iso: `${prefix}-${day.toString().padStart(2, "0")}`,
      chips,
    });
  }

  return { year, month, leadingBlanks, days, actualCount, scheduledCount };
}

// ---------------------------------------------------------------------------
// Billing-cycle surface selectors (2026-06-17): the Home "next close" line, the
// Calendar KPI strip, and the open-cycle standing sheet. All pure (callers pass
// todayIso + the loaded schedule + any readings); colocated tests in
// calendar.test.ts. Forecast vs posted are never conflated (AR-14): these read
// only SCHEDULED closes (the forecast side) and posted peaks (the retrospective
// side), and never invent a date or a dollar.
// ---------------------------------------------------------------------------

/** Normalize a stored serial for schedule lookup; null when blank/absent. */
function serialKey(serialCode: string | null): string | null {
  if (serialCode === null) return null;
  const k = serialCode.trim().toUpperCase();
  return k === "" ? null : k;
}

/** Median of a numeric list, or null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  return lo !== undefined && hi !== undefined ? (lo + hi) / 2 : null;
}

/**
 * PLACEHOLDER threshold, pending ratification on real Batth data (per the UX
 * spine's "running hot" rule). The margin a meter's most recent posted demand
 * peak must clear over the median of its prior posted peaks to read as "running
 * hot."
 */
export const RUNNING_HOT_MARGIN = 0.25; // +25% over the trailing median

/**
 * Whether a meter is "running hot." Defined (spine 2026-06-17) as peak-to-date
 * materially above the meter's trailing-cycle median, by a tested pure function,
 * and SUPPRESSED when fewer than 3 prior cycles exist (no history => no guess).
 * Until interval readings are wired, the most recent POSTED peak stands in for the
 * open cycle's peak-to-date; this is the placeholder the threshold rides on.
 */
export function runningHot(meter: MeterView): boolean {
  const peaks: number[] = [];
  for (const p of [...meter.periods].sort((a, b) => a.start.localeCompare(b.start))) {
    if (p.peakKw !== null && p.peakKw > 0) peaks.push(p.peakKw);
  }
  if (peaks.length < 4) return false; // need the latest peak + >= 3 prior cycles
  const latest = peaks[peaks.length - 1];
  const med = median(peaks.slice(0, -1));
  if (latest === undefined || med === null || med <= 0) return false;
  return latest > med * (1 + RUNNING_HOT_MARGIN);
}

export type NextClose = {
  meterId: string;
  meterName: string;
  ranchName: string | null;
  /** The next SCHEDULED (forecast) close on or after today; ISO date. */
  closeIso: string;
  /** Whole days from today to that close (0 on the day, never negative here). */
  daysAway: number;
};

export type NextClosesModel = {
  /** The soonest upcoming forecast close across resolvable meters; null when none. */
  soonest: NextClose | null;
  closingThisWeek: number;
  closingThisMonth: number;
  /** Meters running hot right now (drives the Home watch clause + KPI). */
  hotCount: number;
  /** Meters with no resolvable serial; surfaced honestly, never silently dropped. */
  unforecastable: number;
};

const WEEK_DAYS = 7;

/**
 * The Home "next close" inputs: the soonest upcoming forecast close, how many
 * close this week / this calendar month, the running-hot count, and how many
 * meters we cannot forecast (honesty over false completeness).
 */
export function nextCloses(
  meters: MeterView[],
  schedule: MeterReadSchedule,
  todayIso: string,
): NextClosesModel {
  const today = todayIso.slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  const upcoming: NextClose[] = [];
  let unforecastable = 0;
  let hotCount = 0;

  for (const meter of meters) {
    if (runningHot(meter)) hotCount += 1;
    const key = serialKey(meter.serialCode);
    if (key === null || !isKnownSerial(meter.serialCode, schedule)) {
      unforecastable += 1;
      continue;
    }
    const close = nextCycleClose(key, today, schedule);
    if (close === null) continue; // schedule horizon exhausted; no fabricated date
    upcoming.push({
      meterId: meter.id,
      meterName: meter.name,
      ranchName: meter.ranchName,
      closeIso: close,
      daysAway: daysToClose(close, today),
    });
  }

  upcoming.sort((a, b) =>
    a.closeIso !== b.closeIso
      ? a.closeIso.localeCompare(b.closeIso)
      : a.meterName.localeCompare(b.meterName),
  );

  return {
    soonest: upcoming[0] ?? null,
    closingThisWeek: upcoming.filter((c) => c.daysAway >= 0 && c.daysAway <= WEEK_DAYS).length,
    closingThisMonth: upcoming.filter((c) => c.closeIso.slice(0, 7) === monthPrefix).length,
    hotCount,
    unforecastable,
  };
}

export type UpcomingClose = {
  /** The scheduled (forecast) billing-close date; ISO date. */
  closeIso: string;
  /** How many meters close on that date. */
  meterCount: number;
  /** Distinct ranch names closing that date (sorted), for context; may be empty. */
  ranchNames: string[];
};

/**
 * Upcoming billing CLOSES across the farm, grouped by date, soonest first - the
 * front-page "when does my PG&E billing close" answer. Each meter contributes its
 * next scheduled close (from its serial via the read schedule); meters with no
 * resolvable serial are skipped (never a fabricated date). Capped at `limit` dates.
 */
export function upcomingCloses(
  meters: MeterView[],
  schedule: MeterReadSchedule,
  todayIso: string,
  limit = 6,
): UpcomingClose[] {
  const today = todayIso.slice(0, 10);
  const byDate = new Map<string, { count: number; ranches: Set<string> }>();
  for (const meter of meters) {
    const key = serialKey(meter.serialCode);
    if (key === null || !isKnownSerial(meter.serialCode, schedule)) continue;
    const close = nextCycleClose(key, today, schedule);
    if (close === null) continue;
    const cur = byDate.get(close) ?? { count: 0, ranches: new Set<string>() };
    cur.count += 1;
    if (meter.ranchName !== null && meter.ranchName !== "") cur.ranches.add(meter.ranchName);
    byDate.set(close, cur);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([closeIso, v]) => ({
      closeIso,
      meterCount: v.count,
      ranchNames: [...v.ranches].sort((a, b) => a.localeCompare(b)),
    }));
}

export type OpenCycleStanding = {
  /** This open cycle's forecast close; ISO date. */
  closeIso: string;
  daysAway: number;
  /** ISO timestamp of the highest pull so far this cycle; null with no reads. */
  peakAtIso: string | null;
  /** Date of the latest read we actually hold (<= today); null with no reads. */
  asOfIso: string | null;
  /** The latest read is more than STALE_DAYS old; say so rather than imply freshness. */
  asOfStale: boolean;
  /** Safe to show the steer: read <= 1 day old AND the cycle is still open. */
  steerOk: boolean;
};

const STALE_DAYS = 2;

/**
 * Where an open cycle stands, honestly day-lagged. Retrospective only: the peak
 * "so far" comes from the reads we hold, the "as of" date is the latest read
 * (computed, never the literal "yesterday"), and the steer is gated to fresh data
 * on a still-open cycle so we never give live "run/don't run now" advice (planner,
 * not live meter). Returns null when the meter has no resolvable cycle window; the
 * standing fields degrade to null when we hold no reads for the window.
 */
export function openCycleStanding(
  meter: MeterView,
  readings: readonly IntervalReading[],
  schedule: MeterReadSchedule,
  todayIso: string,
): OpenCycleStanding | null {
  const key = serialKey(meter.serialCode);
  if (key === null) return null;
  const dates = schedule.cycles[key];
  if (dates === undefined) return null;
  const today = todayIso.slice(0, 10);
  const cycle = billingCycleFor(dates, today);
  if (cycle === null) return null;

  const closeIso = cycle.close;
  const daysAway = daysToClose(closeIso, today);

  // Peak-to-date over [cycle.start 00:00Z, end of today]; half-open end covers
  // every 15-minute interval that STARTS today.
  const windowStart = `${cycle.start}T00:00:00.000Z`;
  const windowEnd = `${today}T23:59:59.999Z`;
  const peak = maxDemandInWindow(readings, windowStart, windowEnd);
  if (peak === null) {
    return { closeIso, daysAway, peakAtIso: null, asOfIso: null, asOfStale: false, steerOk: false };
  }

  // "as of" = the latest read we actually hold within the window (computed).
  let latestStart: string | null = null;
  for (const r of readings) {
    if (r.start >= windowStart && r.start <= windowEnd && (latestStart === null || r.start > latestStart)) {
      latestStart = r.start;
    }
  }
  const asOfIso = latestStart === null ? null : latestStart.slice(0, 10);
  const staleDays = asOfIso === null ? 0 : daysToClose(today, asOfIso); // today - asOf
  return {
    closeIso,
    daysAway,
    peakAtIso: peak.at,
    asOfIso,
    asOfStale: staleDays > STALE_DAYS,
    steerOk: asOfIso !== null && staleDays <= 1 && daysAway > 0,
  };
}
