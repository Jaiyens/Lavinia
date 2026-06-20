// Grandfather watch (F-1, FR16/FR17/FR18). PURE: no Prisma, no React, no I/O, no clock - the "now"
// is always an injected `asOf`. The one law: program structure and timing are in Terra's data; a
// grandfather position is computed ONLY where the interconnection (Permission-to-Operate) date is on
// file, and honest-unknown otherwise. Never a guessed or program-code-inferred date.
//
// COHORT ISOLATION (FR18, NFR11): this path carries NO net-billing (NEM3) per-kWh export constant.
// Only the NEM2 cohort produces a countdown; a net-billing array never reaches a grandfather render.
// A colocated test asserts no net-billing rate constant enters this file.

/** 20 years from Permission to Operate is the documented NEM2 grandfather window (CPUC NEM2 sunset). */
export const NEM2_GRANDFATHER_YEARS = 20;

export type GrandfatherPosition =
  // No interconnection date on file (DM1 absent) -> honest-unknown. Never a guessed vintage.
  | { state: "unknown" }
  // A date is on file: the 20-year-from-PTO expiry year and the whole years remaining as of `asOf`.
  | { state: "known"; expiryYear: number; yearsRemaining: number };

/** The NEM2-cohort tokens that carry a grandfather position. A net-billing (NEM3) array never does,
 *  so it returns honest-unknown rather than a countdown - the cohorts stay cleanly separated (FR18). */
const NEM2_COHORT_TOKENS: ReadonlySet<string> = new Set(["nem2", "nem2_agg", "vnem"]);

/** True when a token belongs to the NEM2 grandfathered cohort. A null/unknown token is NOT assumed to
 *  be NEM2 (fail-closed: an unknown program produces honest-unknown, never a fabricated countdown). */
function isNem2Cohort(nemType: string | null): boolean {
  if (nemType === null) return false;
  return NEM2_COHORT_TOKENS.has(nemType.trim().toLowerCase());
}

/** Whole years from `from` to `to` (calendar-year difference adjusted for the day-of-year), so a
 *  countdown reads in plain years, never a fractional or clock-precise figure. Both are parsed as
 *  UTC instants; an unparseable input is treated as absent upstream (this is only called with valid
 *  dates). */
function wholeYearsBetween(fromMs: number, toMs: number): number {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  return Math.floor((toMs - fromMs) / MS_PER_YEAR);
}

/**
 * FR16. The 20-year-from-interconnection grandfather countdown. A null interconnection date yields
 * `{state:"unknown"}` (honest-unknown, never a guessed or program-code-inferred date); a non-NEM2
 * array also yields unknown (cohort isolation, FR18). A valid date on a NEM2 array yields the expiry
 * YEAR (interconnection year + 20) and the WHOLE years remaining from `asOf` (clamped at 0 so an
 * already-expired array reads "0 years remaining", never a negative). `asOf` is injected (no clock).
 */
export function grandfatherPosition(args: {
  interconnectionDate: string | null;
  nemType: string | null;
  asOf: string;
}): GrandfatherPosition {
  const { interconnectionDate, nemType, asOf } = args;
  if (interconnectionDate === null) return { state: "unknown" };
  if (!isNem2Cohort(nemType)) return { state: "unknown" };

  const interMs = Date.parse(interconnectionDate);
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(interMs) || !Number.isFinite(asOfMs)) return { state: "unknown" };

  const expiryMs = interMs + NEM2_GRANDFATHER_YEARS * 365.25 * 24 * 60 * 60 * 1000;
  const expiryYear = new Date(interMs).getUTCFullYear() + NEM2_GRANDFATHER_YEARS;
  const yearsRemaining = Math.max(0, wholeYearsBetween(asOfMs, expiryMs));
  return { state: "known", expiryYear, yearsRemaining };
}

/**
 * FR17 trip-wire: expanding a legacy NEM2 array's capacity beyond the tariff threshold forfeits its
 * grandfathered value (storage usually does not trip it). This is a protect-what-you-have guidance
 * signal with NO dollar (`impactNote` only at the emitter). It applies ONLY to the NEM2 cohort: a
 * net-billing array is already on the new tariff, so there is no grandfathered value to protect, and
 * the trip-wire never applies (FR18). Pure; carries no rate constant.
 */
export function expandTripWire(args: { nemType: string | null }): { applies: boolean } {
  return { applies: isNem2Cohort(args.nemType) };
}
