// Story E-3 (FR24/FR25): rate-legibility on a solar meter. A demand-charge AG-C
// schedule rewards a high-load-factor meter (one that runs many hours so its energy
// charges dwarf its demand charge); a solar meter that bills on AG-C yet shows LOW
// measured operating hours is a candidate for being on the wrong schedule, worth
// verifying. This is a NON-dollar flag: the priced rate-fit on a solar meter is
// staged (both live rate engines exclude solar by design via the isSolar/solarKw
// gates, which stay preserved), and the net-metering credit obscures the underlying
// rate, so we never quote a $/kW or $/kWh here. The finding carries impactNote only,
// matching run-rate-lever's `solar_true_up_pending` posture.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in solar-rate-legibility.test.ts.

import { planFromLabel } from "./rate-lever";
import type { RateCard } from "./rates";

/** Hours in a 365-day year, the year-scaling basis for `measuredAnnualHours`. A
 *  calendar constant, not a rate (NFR12 bars $/kW and $/kWh; this is neither). */
export const HOURS_PER_YEAR = 8760;

/**
 * The low-hours threshold (annual operating hours) below which a solar meter on a
 * demand-charge AG-C schedule is flagged to verify. A season-flat ag pump runs
 * thousands of hours a year, and the demand-charge AG-C family is designed for that
 * high-load-factor profile; a solar meter measuring under this many hours is a
 * legibility candidate (the schedule may not fit, and the net credit hides it). A
 * documented MODEL threshold, deliberately conservative so a borderline meter is not
 * flagged, never a rate (no $/kW, no $/kWh).
 */
export const LOW_MEASURED_HOURS = 2000;

export type RateLegibilityFlag = {
  pumpId: string;
  meterName: string;
  /** Names the schedule in the copy; never a guessed value. */
  scheduleLabel: string;
} | null;

/** One per-cycle billing summary the hours derivation reads. ONLY the summary fields
 *  (`totalKwh` + `peakKw`) already on `MeterPeriodView`; never the 15-minute interval
 *  series (NFR4), so no new DB edge and no OOM at fleet scale. */
export type RateLegibilityCycle = {
  /** Total metered energy for the cycle, kWh; null when not on file. */
  totalKwh: number | null;
  /** Billed max demand for the cycle, kW; null when not on file. */
  peakKw: number | null;
  /** ISO 8601 cycle start (drives the span the hours scale to a year over). */
  start: string;
  /** ISO 8601 cycle close. */
  close: string;
};

/**
 * FR24 input chain. The measured annual operating hours, derived PURELY from the
 * per-cycle summaries (`totalKwh` + `peakKw`), never the interval series (NFR4):
 *
 *   hours over the billed span = sum(totalKwh) / peakKw
 *   measured annual hours      = that, scaled to a full year by the span of the cycles
 *
 * `peakKw` is the fleet's biggest measured draw across the cycles on file (the demand
 * a high-load-factor schedule prices against); dividing the summed energy by it yields
 * the equivalent hours at peak draw, then we scale by the year-over-span factor so a
 * partial year of bills is not read as a low-hours meter.
 *
 * Returns null on honest absence, never a fabricated zero: no billed usage, no peak
 * demand, a non-positive peak, or a span we cannot measure. Pure; no clock (the span
 * comes from the cycles' own ISO dates).
 */
export function measuredAnnualHours(args: { cycles: readonly RateLegibilityCycle[] }): number | null {
  const { cycles } = args;
  if (cycles.length === 0) return null;

  let totalKwh = 0;
  let sawUsage = false;
  let peakKw = 0;
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxCloseMs = Number.NEGATIVE_INFINITY;

  for (const cycle of cycles) {
    if (cycle.totalKwh !== null && cycle.totalKwh > 0) {
      totalKwh += cycle.totalKwh;
      sawUsage = true;
    }
    if (cycle.peakKw !== null && cycle.peakKw > peakKw) {
      peakKw = cycle.peakKw;
    }
    const startMs = new Date(cycle.start).getTime();
    const closeMs = new Date(cycle.close).getTime();
    if (Number.isFinite(startMs) && startMs < minStartMs) minStartMs = startMs;
    if (Number.isFinite(closeMs) && closeMs > maxCloseMs) maxCloseMs = closeMs;
  }

  // Honest absence: no billed usage, or no peak demand to divide by (never a guessed
  // zero, never a divide-by-zero).
  if (!sawUsage || peakKw <= 0) return null;

  // The hours represented by the bills on file (energy at the peak draw).
  const hoursOnFile = totalKwh / peakKw;

  // Scale to a full year by the span of the cycles, so a partial year of bills is not
  // misread as a low-hours meter. Span unmeasurable -> honest absence.
  const spanMs = maxCloseMs - minStartMs;
  if (!Number.isFinite(spanMs) || spanMs <= 0) return null;
  const spanDays = spanMs / (1000 * 60 * 60 * 24);
  const yearFactor = 365 / spanDays;

  return hoursOnFile * yearFactor;
}

/**
 * FR24/FR25. Flags a solar meter on a demand-charge AG-C schedule with low measured
 * hours to verify. Returns null (no flag) for: a non-solar meter (handled by the
 * existing non-solar rate lever, never this flag), a null/unrecognized schedule, a
 * non-AG-C schedule, unknown hours (honest absence), or hours at or above the
 * threshold. Carries NO impactUsd and NO $/kW or $/kWh (FR25); the AG-C family check
 * reuses `planFromLabel(card)`. Pure.
 */
export function rateLegibilityFlag(args: {
  isSolar: boolean;
  scheduleLabel: string | null;
  measuredAnnualHours: number | null;
  card: RateCard;
  pumpId: string;
  meterName: string;
}): RateLegibilityFlag {
  const { isSolar, scheduleLabel, measuredAnnualHours: hours, card, pumpId, meterName } = args;
  // A non-solar meter is the non-solar rate lever's job, not this flag (FR25).
  if (!isSolar) return null;
  if (scheduleLabel === null) return null;
  // The demand-charge family gate: reuse planFromLabel so the schedule spellings map
  // exactly as the rest of the app reads them; only AG-C carries the demand charge.
  const plan = planFromLabel(scheduleLabel, card, null);
  if (plan === null || plan.family !== "AG-C") return null;
  // Unknown hours fail closed (honest absence, never a guessed flag); a meter at or
  // above the threshold is running enough hours for the schedule, so no flag.
  if (hours === null) return null;
  if (hours >= LOW_MEASURED_HOURS) return null;
  return { pumpId, meterName, scheduleLabel };
}
