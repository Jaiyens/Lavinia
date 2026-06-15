// Bill-accuracy verification (Story 4.1, FR-19): independently recompute ONE
// posted bill from the dated tariff card and the meter's own billed TOU usage +
// demand, and report whether that recompute matched PG&E's printed total inside a
// calibrated band. This is the accuracy claim behind the drawer's verification
// badge, and it LICENSES FR-14's alternative-schedule numbers: the badge must
// recompute through the exact same machinery the rate lever uses to back-test, so
// the two can never disagree about whether a meter's current charges reconcile.
//
// Reuse, never fork. The recompute already exists - Story 3.3 built it as
// `cycleFromPeriod` (canonical period -> price input), `priceCycleCents` (integer
// cents, AR-6) and `backTestMeter` (recompute vs printed total, signed per-cycle
// deviation) in rate-lever.ts + rates.ts. This module is a thin pure wrapper over
// THAT machinery for a single bill plus the verdict the badge renders. If the badge
// and the lever ever priced from different code, an on-band lever finding could sit
// next to an off-band badge on the same meter, which would un-license FR-14.
//
// Naming variance (AC4): the epic and architecture call this "/lib/energy
// (bill-audit)", but the existing bill-audit.ts is the PRE-REBUILD anomaly module
// (a cycle vs the meter's own same-season median; emits "act" recs; demoted but
// kept). It is a DIFFERENT concept from FR-19's tariff recompute. The planning docs
// predate the 3.3 rebuild that moved the recompute into rate-lever.ts; this is the
// FR-19 home. bill-audit.ts is left untouched.
//
// Per-bill, not per-meter: the badge verifies the bill on screen (the drawer's
// latest displayed period). Whole-meter aggregates are the lever's concern.
//
// Honest band, honest words: a fixture recompute does NOT hit the cent (riders
// outside the card, the 2026-03-01 mid-cycle rate change, day-prorated demand), so
// `verified` is "matched within BACK_TEST_BAND_PCT", never "to the cent". The
// cent-exact claim belongs only to the Epic-1 line-item reconciliation, which the
// drawer states as a separate layer. `verified: false` is "checked and missed";
// `null` is "could not check" (unmapped schedule, excluded cycle) - a different
// thing, and the only one of the two that must never imply PG&E mis-billed.
//
// Pure: no UI, no DB, no clock, no fs (the card is passed in). Colocated tests in
// bill-verify.test.ts.

import {
  BACK_TEST_BAND_PCT,
  backTestMeter,
  billedDemandFromLineItems,
  cycleFromPeriod,
  mapScheduleLabel,
  type LeverPeriod,
} from "./rate-lever";
import type { RateCard } from "./rates";

export type BillVerification = {
  /** PG&E's printed total for the bill, integer cents (AR-6). */
  printedTotalCents: number;
  /** Terra's independent recompute of that bill, integer cents. */
  recomputedTotalCents: number;
  /** Signed percent: positive = the card recomputes hot vs the print. */
  deviationPct: number;
  /** True when |deviationPct| <= the band: an honest "matched", never "to the cent". */
  verified: boolean;
};

export type VerifyBillInput = {
  /** The meter's stored schedule, as the bill prints it (same input the lever maps). */
  scheduleLabel: string | null;
  /** The single posted bill to verify (the drawer's latest displayed period). */
  period: LeverPeriod;
};

export type VerifyBillOptions = {
  /** Band in percent; defaults to BACK_TEST_BAND_PCT so the badge and lever agree. */
  bandPct?: number;
};

/**
 * Verify one posted bill against an independent recompute, or return null when the
 * bill cannot be checked at all.
 *
 * Returns null (NOT a failed verdict) when:
 *   - the schedule is absent or never maps to a card plan (no recompute is possible);
 *   - the cycle is excluded by cycleFromPeriod (no printed total, credit/zero total,
 *     invalid span, or a TOU bucket the card cannot price).
 * "Could not check" is categorically different from "checked and missed", and only
 * the latter exists as `verified: false`. The caller renders nothing for null.
 */
export function verifyBill(
  input: VerifyBillInput,
  card: RateCard,
  options: VerifyBillOptions = {},
): BillVerification | null {
  const bandPct = options.bandPct ?? BACK_TEST_BAND_PCT;

  if (input.scheduleLabel === null || input.scheduleLabel.trim() === "") return null;

  const billedMaxKw = billedDemandFromLineItems(input.period.lineItems);
  const mapped = mapScheduleLabel(input.scheduleLabel, card, billedMaxKw);
  if (mapped === null) return null;

  const reduced = cycleFromPeriod(input.period, card);
  if ("excluded" in reduced) return null;

  // The exact recompute the lever back-tests with, over this one cycle.
  const backTest = backTestMeter([reduced.cycle], mapped.plan);
  const c = backTest.perCycle[0];
  if (c === undefined) return null; // unreachable: one cycle in, one result out.

  return {
    printedTotalCents: c.printedTotalCents,
    recomputedTotalCents: c.recomputedTotalCents,
    deviationPct: c.deviationPct,
    verified: Math.abs(c.deviationPct) <= bandPct,
  };
}
