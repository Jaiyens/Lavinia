// The ONE source of the back-test reconciliation tolerance, in ONE place so a
// founder tweak (how close must a recompute land before we trust a savings
// figure?) never means hunting through rate-lever.ts, bill-verify.ts and
// rate-compare.ts for three different constants. PURE: no process.env, no I/O,
// no rate-card read - safe to import from anywhere (client included). The
// env-resolved default lives in the server-only sibling back-test-config.env.ts;
// this module only knows pure numbers and the pure derivation between them.
//
// What this is NOT (NFR-3): a model reconciliation tolerance, never a rate. It
// is neither $/kWh nor $/kW; it is the percentage band a fixture recompute may
// drift from the printed total before we refuse to quote a dollar. Tightening it
// makes the engine MORE conservative (fail-closed), never changes how a bill is
// priced.

/**
 * The reconciliation band, in PERCENT of the printed total. Tightened to 3%
 * (was 5%): a recompute that lands within 3% of what the farmer actually paid
 * licenses a savings figure; beyond it the model falls back to a qualitative
 * finding (legacy meters) or stays silent (current meters). A fixture recompute
 * never hits the cent - riders outside the card (Energy Commission Tax), the
 * 2026-03-01 mid-cycle rate change (pre-change sub-periods price ~4% hot on the
 * post-change card), and day-prorated demand all drift - so the band is a band,
 * never a cent-exact claim. 3% is the conservative default; the founder can
 * loosen it back toward the historically-calibrated 5% via the env override
 * read in back-test-config.env.ts.
 */
export const DEFAULT_BACK_TEST_BAND_PCT = 3;

/**
 * A single wild cycle fails the meter even when the aggregate squeaks in. The
 * per-cycle band is the primary band times this factor (default 3% * 2 = 6%):
 * one badly-mispriced cycle is allowed twice the aggregate slack before it sinks
 * the whole meter, because a lone straddling sub-period can drift further than
 * the meter's averaged error.
 */
export const PER_CYCLE_BAND_FACTOR = 2;

/** Savings below one dollar over the billed span are noise, not a finding. */
export const MIN_SAVINGS_CENTS = 100;

/** The resolved tolerance, as a self-consistent triple the consumers read. */
export type BackTestTolerance = {
  /** Aggregate band in percent of the printed total. */
  bandPct: number;
  /** Per-cycle band in percent (bandPct * perCycleBandFactor). */
  perCycleBandPct: number;
  /** Savings floor in cents below which a finding is suppressed. */
  minSavingsCents: number;
};

/**
 * Build the self-consistent tolerance triple from a primary band. Validates the
 * band is finite and strictly positive (a zero or negative band would reject
 * every real bill, and an infinite band would admit any drift); the per-cycle
 * band is DERIVED, never set independently, so the two can never disagree.
 */
export function backTestTolerance(
  bandPct = DEFAULT_BACK_TEST_BAND_PCT,
  opts: { perCycleBandFactor?: number; minSavingsCents?: number } = {},
): BackTestTolerance {
  if (!Number.isFinite(bandPct) || bandPct <= 0) {
    throw new Error(`back-test bandPct must be finite and > 0, got ${bandPct}`);
  }
  const perCycleBandFactor = opts.perCycleBandFactor ?? PER_CYCLE_BAND_FACTOR;
  const minSavingsCents = opts.minSavingsCents ?? MIN_SAVINGS_CENTS;
  return {
    bandPct,
    perCycleBandPct: bandPct * perCycleBandFactor,
    minSavingsCents,
  };
}

/**
 * The same band expressed as a RATIO (bandPct / 100), the form rate-compare.ts
 * compares its reproduction error against. This folds the old hard-coded 0.10
 * tolerance onto the single configurable band: 3% -> 0.03. Same number, a
 * different scale - the only divergence between the two consumers was that
 * rate-compare worked in ratio-space and rate-lever in percent-space.
 */
export function reproductionToleranceRatio(
  bandPct = DEFAULT_BACK_TEST_BAND_PCT,
): number {
  return bandPct / 100;
}
