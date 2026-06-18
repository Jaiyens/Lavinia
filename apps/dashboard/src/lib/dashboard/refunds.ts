// Retroactive-refund scan (PG&E Rule 17.1): a pump billed on a COMMERCIAL rate (B-1, B-10, B-19,
// etc.) that should be on an agricultural rate can reclaim up to ~3 years of overcharges. This is
// a stronger hook than forward savings, so it is surfaced near the top of Home.
//
// STUB: the detection here is rate-code-shaped only (any commercial B-* schedule), and the dollar
// figure is a deliberately CONSERVATIVE, hard-rounded-DOWN estimate from each meter's own billing.
// It is framed everywhere as "up to ~$Xk, estimated, verify before claiming" - never a precise or
// promised number. Replace REFUND_PCT and the detection with the real Rule 17.1 math when wired.

import type { MeterView } from "./load";

// Commercial schedules (B-1, B1, B-10, B-19, ...). Ag schedules (AG-*) never match.
const COMMERCIAL_RE = /^B-?\d/i;
// Deliberately low so the real figure, once wired, comes in ABOVE this estimate (under-promise).
const REFUND_PCT = 0.06;
const LOOKBACK_YEARS = 3;

export type RefundScan = {
  /** Commercial-rate meters that look mis-classified (worth a Rule 17.1 review). */
  meterCount: number;
  /** Conservative, hard-rounded-DOWN "up to" estimate in integer cents. Never precise. */
  estimatedUpToCents: number;
};

/** Round DOWN to a clean step ($10k / $5k / $1k) so the displayed "up to" never looks precise. */
function roundDownHard(cents: number): number {
  const step = cents >= 1_000_000 ? 1_000_000 : cents >= 500_000 ? 500_000 : 100_000;
  return Math.floor(cents / step) * step;
}

/**
 * Scan for commercial-rate meters owed a possible ag-rate refund. Returns null when none are
 * mis-classified (the card hides) or the conservative estimate rounds to zero.
 */
export function scanRefunds(meters: readonly MeterView[]): RefundScan | null {
  const commercial = meters.filter(
    (m) => m.rateSchedule !== null && COMMERCIAL_RE.test(m.rateSchedule.trim()),
  );
  if (commercial.length === 0) return null;

  let annualCents = 0;
  for (const m of commercial) {
    for (const p of m.periods) {
      if (p.printedTotalCents !== null) annualCents += p.printedTotalCents;
    }
  }
  const rawCents = annualCents * REFUND_PCT * LOOKBACK_YEARS;
  const estimatedUpToCents = roundDownHard(rawCents);
  if (estimatedUpToCents <= 0) return null;

  return { meterCount: commercial.length, estimatedUpToCents };
}
