// The misclassification-refund detector. Distinct from the go-forward rate switch: this is
// money already overpaid, not money to save next cycle. A meter that BEHAVES like an
// irrigation pump (its usage signature classifies as a pump) but is BILLED on a COMMERCIAL,
// non-agricultural tariff (B-1 / B-19 / B-20) has been put on the wrong rate class. Under
// PG&E Rule 17.1 a genuine billing error of that kind can be corrected retroactively, so the
// difference between what the commercial rate charged and what the correct agricultural rate
// would have charged, on the SAME usage, is recoverable. We cap the look-back at 36 months
// (the conservative recovery window), round the estimate DOWN, and frame it as an "up to"
// figure: an amount that may be owed and is worth a claim, never a promised payout.
//
// This is deliberately NOT triggered by a valid rate CHOICE (an AG-B meter that would be a
// little cheaper on AG-C is a switch, not a refund) - only by a pump sitting on a commercial
// rate it was never eligible for. The caller supplies the pump/non-pump verdict (from
// classifyMeter on the meter's own interval signature) so this module stays pure rate math.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in refund.test.ts.

import type { PumpKind } from "@/lib/recommendations/types";

/** The commercial, non-agricultural PG&E rate classes a pump should never be billed on.
 *  A pump on one of these is the misclassification this detector looks for. Matched on the
 *  family prefix so "B-19S" / "B-20" variants are covered, while "AG-B" (agricultural,
 *  starts with AG) is explicitly NOT a commercial B rate. */
const COMMERCIAL_FAMILIES = ["B-1", "B-6", "B-10", "B-19", "B-20"] as const;

/** The conservative retroactive recovery window, in months. PG&E billing-error adjustments
 *  reach back a bounded period; 36 months is the cap this estimate never exceeds. */
export const REFUND_LOOKBACK_MONTHS = 36;

/**
 * Whether a tariff is a commercial (non-ag) B rate. An agricultural rate ("AG-..." including
 * "AG-B") is never commercial; a bare "B-1" / "B-19" / "B-20" (and their letter suffixes) is.
 */
export function isCommercialTariff(tariff: string | null | undefined): boolean {
  if (tariff === null || tariff === undefined) return false;
  const t = tariff.trim().toUpperCase();
  if (t === "" || t.startsWith("AG")) return false;
  return COMMERCIAL_FAMILIES.some((fam) => t === fam || t.startsWith(`${fam}`));
}

/** One trailing billed cycle and the cost the correct ag rate would have charged on the same
 *  usage. `billedCents` is what PG&E charged on the commercial rate (the printed total);
 *  `agCostCents` is the same cycle's usage priced on the eligible agricultural schedule.
 *  `months` is the cycle's length in whole months for the look-back cap (a normal cycle is 1). */
export type RefundCycle = {
  /** ISO close date, for ordering and the trailing-window cut. */
  close: string;
  /** What the commercial rate billed this cycle, integer cents (the printed total). */
  billedCents: number;
  /** What the correct agricultural rate would have billed the same usage, integer cents. */
  agCostCents: number;
  /** Whole months this cycle spans toward the 36-month cap (default 1). */
  months?: number;
};

export type RefundInput = {
  /** The meter's behavioural verdict from classifyMeter (its own interval signature). */
  classification: PumpKind;
  /** The tariff PG&E actually billed (the printed/inventory rate schedule). */
  billedTariff: string | null;
  /** Trailing reconciled cycles, any order; the detector sorts and caps them. */
  cycles: RefundCycle[];
};

export type RefundEstimate = {
  /** True only when a pump is billed on a commercial rate AND the trailing cycles overpaid. */
  qualifies: boolean;
  /** Conservative recoverable amount, integer cents, rounded DOWN. 0 when not qualifying. */
  recoverableCents: number;
  /** The commercial tariff that triggered the finding (echoed for copy), null when none. */
  billedTariff: string | null;
  /** How many trailing cycles (within the 36-month cap) the estimate summed. */
  cyclesCounted: number;
  /** Why it did not qualify, for callers that want to log/test the negative path. */
  reason:
    | "qualifies"
    | "not_a_pump"
    | "not_commercial"
    | "no_cycles"
    | "no_overpayment";
};

/** Round a cent amount DOWN to the dollar so an "up to" estimate never overstates. */
function floorToDollars(cents: number): number {
  return Math.floor(cents / 100) * 100;
}

/**
 * Estimate the retroactive refund a misclassified pump may be owed. Qualifies only when the
 * meter classifies as a pump AND is billed on a commercial rate. Sums, over the trailing
 * cycles whose cumulative span stays within REFUND_LOOKBACK_MONTHS, the positive difference
 * (commercial billed minus ag cost) per cycle; a cycle where the ag rate would have cost MORE
 * contributes nothing (we never net a refund down with a cycle that favoured the commercial
 * rate - an overpayment is recoverable, a "savings" the customer already got is not owed
 * back). The total is floored to whole dollars and surfaced as "up to". Returns a
 * non-qualifying zero estimate (with a reason) otherwise.
 */
export function estimateRefund(input: RefundInput): RefundEstimate {
  const base = (reason: RefundEstimate["reason"]): RefundEstimate => ({
    qualifies: false,
    recoverableCents: 0,
    billedTariff: input.billedTariff,
    cyclesCounted: 0,
    reason,
  });

  if (input.classification !== "pump") return base("not_a_pump");
  if (!isCommercialTariff(input.billedTariff)) return base("not_commercial");
  if (input.cycles.length === 0) return base("no_cycles");

  // Newest first, so the trailing-window cap keeps the most recent cycles (the ones still
  // within the recoverable period).
  const ordered = [...input.cycles].sort((a, b) => b.close.localeCompare(a.close));

  let monthsUsed = 0;
  let recoverableCents = 0;
  let cyclesCounted = 0;
  for (const cycle of ordered) {
    const span = cycle.months !== undefined && cycle.months > 0 ? cycle.months : 1;
    if (monthsUsed + span > REFUND_LOOKBACK_MONTHS) break;
    monthsUsed += span;
    cyclesCounted += 1;
    // Only cycles where the commercial rate overcharged add to the claim. A cycle where the
    // ag rate would have cost more is not money owed back; skip it (do not subtract).
    const overpaidCents = cycle.billedCents - cycle.agCostCents;
    if (overpaidCents > 0) recoverableCents += overpaidCents;
  }

  const floored = floorToDollars(recoverableCents);
  if (floored <= 0) {
    return { ...base("no_overpayment"), cyclesCounted };
  }

  return {
    qualifies: true,
    recoverableCents: floored,
    billedTariff: input.billedTariff,
    cyclesCounted,
    reason: "qualifies",
  };
}
