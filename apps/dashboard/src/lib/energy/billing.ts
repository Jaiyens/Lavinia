// Billing-cycle math: when does this pump's PG&E cycle close, and what window
// does the current cycle cover? Pure functions over a list of scheduled
// meter-read dates (YYYY-MM-DD) and a reference date, no UI, no DB, no fs. The
// PG&E read-date table is loaded separately (src/lib/greenbutton/schedule.ts);
// these functions take the dates as plain input so they stay trivially testable.

import type { BillingCycle } from "./types";

const MS_PER_DAY = 86_400_000;

// PG&E read dates are calendar days, so we work in UTC midnight to avoid any
// timezone drift. ISO date strings (YYYY-MM-DD) also sort chronologically, which
// the comparisons below rely on.
function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The day after `date` (YYYY-MM-DD), as a YYYY-MM-DD string. */
function nextDay(date: string): string {
  return formatDate(toUtcMs(date) + MS_PER_DAY);
}

/**
 * The next scheduled meter read on or after `ref` (the cycle close the farmer is
 * heading toward). Returns null when `ref` is past the last date in the table
 * (the following year's schedule is needed). A read landing exactly on `ref`
 * counts as that day's close.
 */
export function closeOnOrAfter(
  readDates: readonly string[],
  ref: string,
): string | null {
  const sorted = [...readDates].sort();
  for (const date of sorted) {
    if (date >= ref) return date;
  }
  return null;
}

/**
 * The billing cycle that contains `ref`: it closes on the next scheduled read and
 * opens the day after the prior read. Returns null when the window can't be
 * placed from this table, `ref` is past the last read, or no prior read exists
 * to anchor the start (the cycle opened in the previous year's schedule).
 */
export function billingCycleFor(
  readDates: readonly string[],
  ref: string,
): BillingCycle | null {
  const sorted = [...readDates].sort();
  const closeIndex = sorted.findIndex((date) => date >= ref);
  if (closeIndex <= 0) return null; // no read >= ref, or no prior read to anchor start
  const close = sorted[closeIndex];
  const prevRead = sorted[closeIndex - 1];
  if (close === undefined || prevRead === undefined) return null;
  return { start: nextDay(prevRead), close };
}

/**
 * Whole days from `ref` to the cycle close (0 on the close day itself, negative
 * once past it). "How many days until this pump's bill locks in."
 */
export function daysToClose(close: string, ref: string): number {
  return Math.round((toUtcMs(close) - toUtcMs(ref)) / MS_PER_DAY);
}
