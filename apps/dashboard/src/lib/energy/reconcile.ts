// Lever (e): reconciliation, close the loop. After a bill posts, compare the
// holds we predicted against what the farmer actually did and what the bill
// actually says: how many holds were followed, the dollars realized, and the
// dollars left on the table. Produces a plain-language digest plus each hold's
// result, so next cycle the advice is grounded in a kept score.

import { en } from "@/copy/en";
import type { CanonicalBill, CanonicalBillingPeriod } from "@/lib/normalize/types";
import type {
  CoverageState,
  DraftRecommendation,
  Recommendation,
  RecommendationResult,
} from "@/lib/recommendations";
import { pumpTimingDraft, roundUsd } from "./recommend";

export type ReconcileInput = {
  farmId: string;
  /** Farmer-facing cycle name, e.g. "June". */
  cycleLabel: string;
  /** The holds we emitted for this cycle, with the farmer's status on each. */
  holds: readonly Recommendation[];
  /** Demand charge on the posted bill. */
  actualDemandChargeUsd: number;
  /**
   * What the demand charge would have been with no holds followed (the do-nothing
   * baseline). When given, realized savings come from the real bill delta; absent,
   * they fall back to the sum of followed predictions.
   */
  baselineDemandChargeUsd?: number;
  /** Reference "today"; stamps createdAt/resolvedAt. */
  asOf: string;
};

export type Reconciliation = {
  followedCount: number;
  totalCount: number;
  /** Sum of every hold's predicted saving. */
  predictedAvoidableUsd: number;
  /** Dollars actually avoided (bill delta if a baseline was given, else followed predictions). */
  realizedAvoidedUsd: number;
  /** Predicted savings on the holds that were not followed. */
  missedUsd: number;
  actualDemandChargeUsd: number;
  /** The input holds, each with its `result` filled and `resolvedAt` stamped. */
  resolved: Recommendation[];
  /** The loop-closing digest, with `result` populated. */
  summary: DraftRecommendation;
};

/** A hold counts as followed only when the farmer marked it done. */
function wasFollowed(hold: Recommendation): boolean {
  return hold.status === "done";
}

export function reconcile(input: ReconcileInput): Reconciliation {
  const totalCount = input.holds.length;
  const followed = input.holds.filter(wasFollowed);
  const followedCount = followed.length;

  const sum = (recs: readonly Recommendation[]): number =>
    recs.reduce((total, rec) => total + (rec.impactUsd ?? 0), 0);

  const predictedAvoidableUsd = roundUsd(sum(input.holds));
  const missedUsd = roundUsd(sum(input.holds.filter((h) => !wasFollowed(h))));
  const realizedAvoidedUsd = roundUsd(
    input.baselineDemandChargeUsd !== undefined
      ? input.baselineDemandChargeUsd - input.actualDemandChargeUsd
      : sum(followed),
  );

  const resolved: Recommendation[] = input.holds.map((hold) => {
    const followedHold = wasFollowed(hold);
    const predictedUsd = roundUsd(hold.impactUsd ?? 0);
    const result: RecommendationResult = {
      followed: followedHold,
      predictedUsd,
      avoidedUsd: followedHold ? predictedUsd : 0,
      note: followedHold
        ? "Hold followed."
        : "Hold not followed; this saving was left on the table.",
    };
    return { ...hold, result, resolvedAt: input.asOf };
  });

  const summaryText = en.pumpTiming.reconcile.summary(
    followedCount,
    totalCount,
    input.actualDemandChargeUsd,
    realizedAvoidedUsd,
  );

  const summary = pumpTimingDraft({
    farmId: input.farmId,
    severity: "info",
    createdAt: input.asOf,
    resolvedAt: input.asOf,
    situation: en.pumpTiming.reconcile.situation(input.cycleLabel),
    impactUsd: realizedAvoidedUsd,
    impactNote: summaryText,
    action: {
      kind: "review_result",
      label: en.pumpTiming.reconcile.action(),
      params: {
        cycleLabel: input.cycleLabel,
        followedCount,
        totalCount,
        predictedAvoidableUsd,
        realizedAvoidedUsd,
        missedUsd,
        actualDemandChargeUsd: input.actualDemandChargeUsd,
      },
    },
    result: {
      followed: totalCount > 0 && followedCount === totalCount,
      predictedUsd: predictedAvoidableUsd,
      actualUsd: input.actualDemandChargeUsd,
      avoidedUsd: realizedAvoidedUsd,
      note: summaryText,
    },
  });

  return {
    followedCount,
    totalCount,
    predictedAvoidableUsd,
    realizedAvoidedUsd,
    missedUsd,
    actualDemandChargeUsd: input.actualDemandChargeUsd,
    resolved,
    summary,
  };
}

// --- Bill cent-reconciliation gate + honest coverage state (Story 1.7) ----------------
//
// A separate kind of reconciliation from the close-the-loop lever above: this is the TRUST
// gate on extracted bills. A figure renders only when its line items sum to within one cent
// of the printed total (AR-6, integer cents); otherwise it is withheld as `needs_review`,
// never shown as a wrong number (NFR-4 / SM-C1). Pure functions over the canonical shape
// (Story 1.6); persisting the derived coverage state to the DB is Story 1.8.

/**
 * The cent-reconciliation gate (AR-6): line items reconcile to the printed total iff they
 * agree within exactly one cent. Integer cents in; never compared as float dollars.
 */
export function reconcilesToCents(sumCents: number, printedTotalCents: number): boolean {
  return Math.abs(sumCents - printedTotalCents) <= 1;
}

/** Sum a period's line items in integer cents (the reconciliation surface). */
export function sumLineItemCents(period: CanonicalBillingPeriod): number {
  return period.lineItems.reduce((acc, item) => acc + item.amountCents, 0);
}

/**
 * One period's honest coverage state. An upstream `needs_review` (a Story 1.6 identity-join
 * failure - a figure attached to a possibly-wrong meter) is FINAL and never promoted, even
 * when the cents sum perfectly. Otherwise the cent gate decides reconciled vs needs_review.
 */
export function reconcilePeriod(period: CanonicalBillingPeriod): CoverageState {
  if (period.coverageState === "needs_review") return "needs_review";
  // A period with no captured line items has nothing to prove the printed total against:
  // reconciling it would render a figure backed by zero substantiation (an extraction that
  // captured nothing must never read as "reconciled" - NFR-4 / SM-C1).
  if (period.lineItems.length === 0) return "needs_review";
  return reconcilesToCents(sumLineItemCents(period), period.printedTotalCents)
    ? "reconciled"
    : "needs_review";
}

/** A copy of the bill with each period's coverageState set to its reconcile verdict (pure). */
export function reconcileBill(bill: CanonicalBill): CanonicalBill {
  return {
    ...bill,
    periods: bill.periods.map((period) => ({
      ...period,
      coverageState: reconcilePeriod(period),
    })),
  };
}

/**
 * A meter's single honest coverage state. A meter with no bill (or zero periods) is
 * `no_bill` - this is how the full inventory still renders (every meter has a state). All
 * periods reconciled -> `reconciled`; any unreconciled period -> `needs_review`.
 */
export function deriveMeterCoverage(bill: CanonicalBill | null): CoverageState {
  if (!bill || bill.periods.length === 0) return "no_bill";
  return bill.periods.every((period) => reconcilePeriod(period) === "reconciled")
    ? "reconciled"
    : "needs_review";
}

/**
 * An account's single honest coverage state. Reconciles against the ACCOUNT printed total,
 * never a partial subtotal (AC2): the account is `reconciled` only when every member meter
 * is reconciled AND the members' printed totals sum to the account printed total within one
 * cent. No members -> `no_bill`; a missing account total or any unreconciled member ->
 * `needs_review`.
 */
export function deriveAccountCoverage(
  memberStates: readonly CoverageState[],
  saPrintedTotalsCents: readonly number[],
  accountPrintedTotalCents: number | null,
): CoverageState {
  if (memberStates.length === 0) return "no_bill";
  // Each member must contribute exactly one printed total; a length mismatch means we would
  // be reconciling the account against a partial subtotal (a dropped member total), which AC2
  // forbids. Treat it as needs_review rather than certify an account on incomplete inputs.
  if (memberStates.length !== saPrintedTotalsCents.length) return "needs_review";
  if (memberStates.some((state) => state !== "reconciled")) return "needs_review";
  if (accountPrintedTotalCents === null) return "needs_review";
  const sum = saPrintedTotalsCents.reduce((acc, cents) => acc + cents, 0);
  return reconcilesToCents(sum, accountPrintedTotalCents) ? "reconciled" : "needs_review";
}
