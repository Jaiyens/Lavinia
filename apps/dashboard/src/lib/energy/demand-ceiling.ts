// Derive a representative demand ceiling (peak kW) for a meter's intra-day load curve.
//
// The billed 15-minute peak kW is the truth, but in a real PG&E export most billing
// periods carry no `peakKw` at all (in the live terra_batth account, 0 of 143 periods
// have one). Without a ceiling the curve can't render, so the grower sees a bare "no
// demand reading yet" instead of the load graph they expect on every meter.
//
// This module backs the curve by FALLING BACK to a representative ceiling derived from
// the meter's own inventory facts (motor horsepower, pump GPM, or the modeled monthly
// cost), always labeled honestly as an estimate when no billed peak exists. It is pure
// (no DB, no clock): it reads a minimal structural slice of MeterView so the test needs
// no database.
//
// NOTE: a distinct filename from the load-bearing timezone module `peak.ts` (the 4-9pm
// peak-window logic, exported through the energy barrel); this is the demand-CEILING
// derivation, a separate concern.

/** The few MeterView fields the derivation reads. Kept minimal so callers (and the test)
 *  can pass a plain object with no DB and no full MeterView. */
export type PeakSource = {
  /** Billing periods; only `peakKw` (the billed 15-minute peak) is read. */
  periods: ReadonlyArray<{ peakKw: number | null }>;
  /** Pump motor size in horsepower; null/absent when not on file. */
  horsepower?: number | null;
  /** Pump flow in gallons per minute; null when not on file. */
  gpm: number | null;
  /** Modeled monthly tariff-component cost in integer cents; null when no interval basis. */
  modeledMonthlyCents?: number | null;
};

/** The derived ceiling and whether it is an estimate (true) or the real billed peak (false). */
export type DerivedPeak = { kw: number; derived: boolean };

// --- Derivation constants (documented so the math is auditable) ----------------------------

/** Motor kW per horsepower. 1 hp = 0.746 kW (electrical), the standard conversion. A pump's
 *  demand ceiling tracks its motor's rated draw, so hp * 0.746 is a sound representative peak. */
const KW_PER_HP = 0.746;

/** A typical agricultural pump draws roughly 1 kW per ~12 gpm of flow at common lifts/pressures
 *  (a coarse field rule when no motor size is on file). So kW ~= gpm / 12. */
const GPM_PER_KW = 12;

/** Nominal blended energy price ($/kWh) used to back an average kW out of a modeled monthly
 *  cost. A round number, not a billed rate; it only sets the SCALE of an estimate. */
const NOMINAL_DOLLARS_PER_KWH = 0.2;

/** Hours in an average month (365.25 * 24 / 12 ~= 730.5), the divisor that turns a monthly
 *  energy total into an average power. */
const HOURS_PER_MONTH = 730;

/** A pump runs in bursts, not flat all month, so its instantaneous PEAK sits well above its
 *  monthly AVERAGE power. ~4x is a representative peak-to-average factor for an irrigation duty
 *  cycle (it runs hard for a fraction of the month). Used only to scale the modeled estimate. */
const PEAK_TO_AVERAGE = 4;

/** When nothing at all is on file, a modest default ceiling so the curve still renders. */
const DEFAULT_CEILING_KW = 50;

/** Round to a sensible integer, clamped to at least 1 kW (never 0 or negative). */
function clampKw(kw: number): number {
  return Math.max(1, Math.round(kw));
}

/**
 * The meter's representative demand ceiling (peak kW) for the intra-day load curve.
 *
 * Billed first: the highest non-null billed `peakKw` across the meter's periods, returned as
 * `{ derived: false }` (the truth). When no period carries a billed peak, derive a representative
 * ceiling (`{ derived: true }`) from the meter's own inventory, in order of fidelity:
 *   1. horsepower  -> hp * 0.746 kW (the motor's rated draw)
 *   2. gpm         -> gpm / 12 kW   (~1 kW per ~12 gpm of ag pump flow)
 *   3. modeledMonthlyCents -> back an average kW out of the modeled monthly cost at a nominal
 *      $0.20/kWh over ~730 h, then scale to a peak (~4x the monthly average).
 *   4. otherwise   -> a modest 50 kW default.
 *
 * Always returns a positive integer ceiling so the curve renders on every meter (never null in
 * practice; the return type allows null only to keep the call site's "somehow null" fallback honest).
 */
export function derivePeakKw(meter: PeakSource): DerivedPeak | null {
  // Billed peak: the highest non-null across periods. The real demand reading, not an estimate.
  let billed: number | null = null;
  for (const p of meter.periods) {
    if (p.peakKw != null) billed = billed === null ? p.peakKw : Math.max(billed, p.peakKw);
  }
  if (billed !== null && billed > 0) return { kw: clampKw(billed), derived: false };

  // No billed peak: derive a representative ceiling from the meter's inventory.
  if (meter.horsepower != null && meter.horsepower > 0) {
    return { kw: clampKw(meter.horsepower * KW_PER_HP), derived: true };
  }
  if (meter.gpm != null && meter.gpm > 0) {
    return { kw: clampKw(meter.gpm / GPM_PER_KW), derived: true };
  }
  if (meter.modeledMonthlyCents != null && meter.modeledMonthlyCents > 0) {
    // cents -> dollars -> kWh (at the nominal price) -> average kW (over the month) -> peak kW.
    const monthlyKwh = meter.modeledMonthlyCents / 100 / NOMINAL_DOLLARS_PER_KWH;
    const averageKw = monthlyKwh / HOURS_PER_MONTH;
    return { kw: clampKw(averageKw * PEAK_TO_AVERAGE), derived: true };
  }

  // Nothing on file: a modest default so the curve always renders.
  return { kw: DEFAULT_CEILING_KW, derived: true };
}
