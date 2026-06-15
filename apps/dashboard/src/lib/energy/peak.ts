// The 4-9pm peak window, resolved in the farm's local timezone. PG&E's costliest
// hours (and the AG-C summer peak demand charge) live in local wall-clock time,
// but interval timestamps are UTC, so this module converts between the two with
// Intl (DST-correct, pure: no clock read, no date library). It backs the
// coincident-peak and off-peak levers and the retrospective's per-day grouping.

import type { PumpRun } from "./types";

/** Local hour the evening peak opens (4pm). */
export const PEAK_START_HOUR = 16;
/** Local hour the evening peak closes (9pm); the window is half-open [16, 21). */
export const PEAK_END_HOUR = 21;

type LocalParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
};

// Intl formatters are not cheap to build; reuse one per timezone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23", // 00-23, avoids the "24:00" midnight quirk
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

function partsOf(iso: string, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The local hour (0-23) of an instant in `timeZone`. */
export function localHour(iso: string, timeZone: string): number {
  return partsOf(iso, timeZone).hour;
}

/** The local calendar day (YYYY-MM-DD) of an instant in `timeZone`. */
export function localDate(iso: string, timeZone: string): string {
  const p = partsOf(iso, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** True when an instant's local hour sits inside the [16, 21) evening peak. */
export function isInPeakWindow(iso: string, timeZone: string): boolean {
  const hour = localHour(iso, timeZone);
  return hour >= PEAK_START_HOUR && hour < PEAK_END_HOUR;
}

/**
 * The timezone offset (ms to add to local wall-clock to get UTC) at `iso`.
 * Computed by reading the wall-clock parts back as if they were UTC. 4-9pm is
 * never a DST transition (those happen at 2am), so the offset is stable across
 * the window.
 */
function offsetMs(iso: string, timeZone: string): number {
  const p = partsOf(iso, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const actual = new Date(iso).getTime();
  const actualToSecond = actual - (actual % 1000); // parts carry no ms
  return asUtc - actualToSecond;
}

/**
 * The 4-9pm peak window on the local day that contains `iso`, returned as the
 * UTC instants [start, end). Used to clip runs to the window.
 */
export function peakWindowUtc(
  iso: string,
  timeZone: string,
): { start: string; end: string } {
  const p = partsOf(iso, timeZone);
  const offset = offsetMs(iso, timeZone);
  const startMs = Date.UTC(p.year, p.month - 1, p.day, PEAK_START_HOUR) - offset;
  const endMs = Date.UTC(p.year, p.month - 1, p.day, PEAK_END_HOUR) - offset;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

/**
 * The portion of a run that falls inside the 4-9pm window on its start day, as
 * UTC instants, or null when the run never touches the window. Assumes a run
 * stays within a single local day (typical of an irrigation set).
 */
export function clipToPeakWindow(
  run: Pick<PumpRun, "start" | "end">,
  timeZone: string,
): { start: string; end: string } | null {
  const win = peakWindowUtc(run.start, timeZone);
  const startMs = Math.max(new Date(run.start).getTime(), new Date(win.start).getTime());
  const endMs = Math.min(new Date(run.end).getTime(), new Date(win.end).getTime());
  if (startMs >= endMs) return null;
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}
