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

import { isKnownSerial, type MeterReadSchedule } from "@/lib/pge/schedule";
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
