// All money in Terra is stored and compared as integer US cents (AR-6); this module is
// the one place cents become a human string, so every screen renders dollars identically.
// Inputs are integer cents (e.g. 1172733 = $11,727.33); never pass float dollars to
// formatUsd. Money renders with tabular-nums per DESIGN.md (a CSS concern, not here).

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format integer cents as "$X,XXX.XX" (negatives as "-$X.XX"). */
export function formatUsd(cents: number): string {
  return USD.format(cents / 100);
}

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Whole-dollar form ("$1,200") for compact surfaces like chart axis ticks. */
export function formatUsdWhole(cents: number): string {
  return USD_WHOLE.format(cents / 100);
}

const USD_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Compact form for tight summaries ("$34k", "$1.2m") like the mobile findings peek.
 * Lowercased per DESIGN.md ("~$78k"); the approximation tilde is copy, not formatting.
 */
export function formatUsdCompact(cents: number): string {
  return USD_COMPACT.format(cents / 100).toLowerCase();
}

/**
 * Round float dollars to integer cents. For ingestion/fixtures and the normalize step
 * (turning a printed dollar figure into the stored cents value), NOT for re-deriving a
 * value already stored as cents. Decimal drift is corrected before rounding so a true
 * half-cent product rounds UP like the bill prints it: 1 kWh x $0.145 is 14.4999...
 * in binary float but genuinely 14.5 cents, and must land on 15, not 14.
 */
export function centsFromDollars(usd: number): number {
  return Math.round(Number((usd * 100).toFixed(4)));
}
