// Aging-array underperformance (F-2, FR19/FR20). PURE: no Prisma, no React, no I/O, no clock - the
// "now" is an injected `asOf`. Trends an array's measured generation against its age-adjusted expected
// output and fires ONLY when the shortfall is both LARGE ENOUGH (beyond a margin past the baseline
// degradation) and SUSTAINED ENOUGH (over a minimum evidence window). Otherwise it stays SILENT
// (returns null), never a fabricated zero or a guessed "healthy" state.
//
// DATA-GATED (DM2): with no generation series, or no interconnection date to age the array, the flag
// is null. The emitter (F-3) carries `impactNote` ONLY (never `impactUsd`): the dollars-lost figure
// is per-site variable (panel count, tilt, soiling, inverter) and is not honestly computable here, so
// v1 names the shortfall and its evidence window, never a money figure (NFR5).

/** Documented panel degradation midpoint: 0.6%/yr, the middle of the 0.5-0.7% industry band. */
export const BASELINE_DEGRADATION_PER_YEAR = 0.006;
/** FR20: the array must fall this many percentage points BELOW its age-adjusted baseline to fire. */
export const SHORTFALL_MARGIN_PP = 10;
/** FR20: the minimum months of generation evidence before the flag may fire (no sub-window claim). */
export const MIN_EVIDENCE_MONTHS = 6;

export type DegradationFlag = {
  /** How far below the age-adjusted baseline the array measured, in percentage points (>= the margin). */
  shortfallPct: number;
  /** The number of months of generation data the flag is based on (named in the copy, never an
   *  annualized claim from a sub-window). */
  monthsObserved: number;
} | null;

/** Whole years of array age from interconnection to `asOf`, for the age-adjusted baseline. Returns
 *  null when either date is unparseable (honest-unknown -> the flag stays silent). */
function ageYears(interconnectionDate: string, asOf: string): number | null {
  const interMs = Date.parse(interconnectionDate);
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(interMs) || !Number.isFinite(asOfMs)) return null;
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  return Math.max(0, (asOfMs - interMs) / MS_PER_YEAR);
}

/**
 * FR19/FR20. Trends the array's measured generation against its age-adjusted expected output. The
 * expected output is derived PURELY: the nameplate implies a first-year monthly expectation
 * (`nameplateKw` * an industry capacity-factor proxy), degraded by `BASELINE_DEGRADATION_PER_YEAR`
 * per year of age (DM2 baseline computed, no schema field). The measured monthly average is compared
 * to that expectation; the shortfall percentage is how far below expectation the array measured.
 *
 * Fires ONLY when the shortfall exceeds `SHORTFALL_MARGIN_PP` past the baseline AND there are at least
 * `MIN_EVIDENCE_MONTHS` of data. No series -> null (silent). Null interconnection date -> null
 * (honest-unknown -> silent). NEVER carries a dollar.
 *
 * The capacity-factor proxy is a UNIT-FREE ratio (energy/nameplate), not a $/kWh: it converts a kW
 * nameplate into an expected monthly kWh so measured and expected are comparable. It is intentionally
 * a conservative single constant; the flag is a "worth investigating" signal, not a precise yield
 * model, and it carries no money figure.
 */
const EXPECTED_MONTHLY_KWH_PER_KW = 120; // ~16% capacity factor over a 730h month, conservative proxy

export function agingArrayFlag(args: {
  generationByMonthKwh: { month: string; kwh: number }[];
  nameplateKw: number;
  interconnectionDate: string | null;
  asOf: string;
}): DegradationFlag {
  const { generationByMonthKwh, nameplateKw, interconnectionDate, asOf } = args;

  // No series -> silent (DM2 absent). No interconnection date -> cannot age the baseline -> silent.
  if (generationByMonthKwh.length === 0) return null;
  if (interconnectionDate === null) return null;
  if (!(nameplateKw > 0)) return null;

  const age = ageYears(interconnectionDate, asOf);
  if (age === null) return null;

  // Use only valid (finite, non-negative) monthly readings as evidence.
  const readings = generationByMonthKwh.filter(
    (m) => Number.isFinite(m.kwh) && m.kwh >= 0,
  );
  const monthsObserved = readings.length;
  if (monthsObserved < MIN_EVIDENCE_MONTHS) return null;

  const measuredMonthlyAvg =
    readings.reduce((sum, m) => sum + m.kwh, 0) / monthsObserved;

  // Age-adjusted expected monthly output: the first-year expectation degraded by the baseline rate.
  const expectedMonthly =
    nameplateKw * EXPECTED_MONTHLY_KWH_PER_KW * (1 - BASELINE_DEGRADATION_PER_YEAR * age);
  if (!(expectedMonthly > 0)) return null;

  // Shortfall: how far below the age-adjusted expectation the array measured, in percentage points.
  // A measured output at or above expectation is not a shortfall (negative clamps to no-fire).
  const shortfallPct = ((expectedMonthly - measuredMonthlyAvg) / expectedMonthly) * 100;
  if (shortfallPct < SHORTFALL_MARGIN_PP) return null;

  return { shortfallPct, monthsObserved };
}
