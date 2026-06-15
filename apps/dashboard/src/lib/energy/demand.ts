// Demand math: turning a 15-minute energy series into the kW that sets the bill.
// Pure functions over IntervalReading[], no UI, no DB. The demand charge is set
// by the single highest 15-minute kW in a billing cycle (max demand), so this is
// the quantity every Pump-Timing lever is trying to hold down.

import type { IntervalReading } from "./types";

const SECONDS_PER_HOUR = 3600;

/**
 * Average real power over one interval, in kW. Energy (kWh) divided by the
 * interval length in hours: 28 kWh metered in a 15-minute interval is 112 kW.
 * A zero-length interval reads as 0 kW rather than dividing by zero.
 */
export function intervalKw(reading: IntervalReading): number {
  const hours = reading.durationSec / SECONDS_PER_HOUR;
  return hours === 0 ? 0 : reading.kWh / hours;
}

/** A demand peak: the kW and the ISO timestamp of the interval that set it. */
export type DemandPeak = {
  kw: number;
  at: string;
};

/**
 * The highest 15-minute kW across the readings, the cycle's max demand. Returns
 * null for an empty series. On ties, the earliest interval wins (stable: it is
 * the first to reach that level).
 */
export function maxDemand(readings: readonly IntervalReading[]): DemandPeak | null {
  let peak: DemandPeak | null = null;
  for (const reading of readings) {
    const kw = intervalKw(reading);
    if (peak === null || kw > peak.kw) {
      peak = { kw, at: reading.start };
    }
  }
  return peak;
}

/**
 * Max demand within a half-open window [startIso, endIso): the peak that sets a
 * given billing cycle's demand charge. Timestamps are compared as ISO 8601 UTC
 * strings, which sort chronologically, so no Date parsing is needed.
 */
export function maxDemandInWindow(
  readings: readonly IntervalReading[],
  startIso: string,
  endIso: string,
): DemandPeak | null {
  return maxDemand(
    readings.filter((r) => r.start >= startIso && r.start < endIso),
  );
}

/**
 * The effective demand rate ($/kW) implied by a posted bill: the demand charge
 * divided by the peak kW that set it. This is how every lever turns a kW it can
 * shave into dollars without ever hardcoding a rate, the figure is read back
 * out of the farmer's own bill. Null when the bill lacks a charge or peak, or
 * the peak is non-positive (no rate can be inferred).
 */
export function effectiveDemandRate(
  demandChargeUsd: number | null,
  peakKw: number | null,
): number | null {
  if (demandChargeUsd === null || peakKw === null || peakKw <= 0) return null;
  return demandChargeUsd / peakKw;
}
