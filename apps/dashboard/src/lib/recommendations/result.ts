// Recommendation result, the close-the-loop (Story 4.2, FR-20): for an ACCEPTED
// recommendation, record the predicted impact at acceptance, then surface it against
// the realized number from the first bill that posts after acceptance. Until that
// bill posts, the result reads "pending". v1 shows the diff (predicted vs realized);
// it does NOT explain the variance.
//
// Pending by design in v1. The data is historical and acceptance happens at "today",
// so on the live account no bill posts AFTER acceptance and every freshly accepted
// rec legitimately reads pending (the PRD's [NOTE FOR PM]: do not script a closed
// loop). This module records the prediction and computes the realized view the
// moment a qualifying bill exists; the closed path is proven by the colocated tests,
// never by a backdated seed.
//
// Honesty law: the predicted impact (e.g. the rate lever's ANNUAL switch saving) and
// a single next bill are NOT the same quantity, and the grower may not have acted. So
// the realized number is shown as a FACT (what the next bill actually was), never as
// attributed savings, and the difference is shown without explaining it (FR-20).
// Never claim the grower saved the predicted amount.
//
// Concept variance: src/lib/energy/reconcile.ts also "closes the loop" but for the
// PRE-REBUILD pump-timing holds lever (demoted), tied to pumpTimingDraft and a
// per-cycle holds digest. That is a different concept from this per-recommendation
// FR-20 result for the rebuilt feed (the same split as 4.1's bill-verify.ts vs the
// legacy bill-audit.ts). This module does not touch reconcile.ts.
//
// Design note: the prediction is PERSISTED at acceptance (so an engine re-run cannot
// rewrite history); the realized number is DERIVED at read time from the persisted
// prediction + resolvedAt + the meter's current periods (a static dataset has no
// "a bill just posted" write trigger). Both are honest; the read-time derivation
// keeps the surface live without a reconcile pass.
//
// Pure: no UI, no DB, no fs, no clock (dates are ISO strings in). Colocated tests in
// result.test.ts.

import { roundUsd } from "@/lib/energy/recommend";
import type { RecommendationResult } from "./types";

/** One billing period reduced to what the realize step needs. */
export type ResultPeriod = {
  /** ISO 8601 metered period end. */
  close: string;
  /** ISO 8601 printed cycle close from the scanned bill; null/absent when not captured. */
  cycleClose?: string | null;
  /** Integer cents; null until the period is reconciled - the "posted bill" signal. */
  printedTotalCents: number | null;
};

/** The render-ready projection the drawer shows for one accepted recommendation. */
export type ResultView = {
  /** The recommendation id (React key + stability). */
  id: string;
  /** The grower-facing one-line situation, so they know which advice this tracks. */
  situation: string;
  /** Whole-ish dollar prediction frozen at acceptance; null when the rec carried no number. */
  predictedUsd: number | null;
  /** The realized figure (the first post-acceptance bill's printed total); null while pending. */
  actualUsd: number | null;
  /** True until a bill posts after acceptance (AC2's "pending"). */
  isPending: boolean;
};

/**
 * The snapshot persisted at acceptance (AC1): the prediction frozen at the moment
 * the grower accepts, so a later engine re-run cannot rewrite it. `followed: true`
 * marks an accepted rec; `predictedUsd` is omitted for an info-only rec that carried
 * no numeric impact (nothing numeric to track). No `actualUsd` yet - that is what
 * "pending" means.
 */
export function acceptanceResult(input: { impactUsd: number | null }): RecommendationResult {
  const result: RecommendationResult = { followed: true };
  if (input.impactUsd !== null) result.predictedUsd = roundUsd(input.impactUsd);
  return result;
}

/** A period's post date: the printed cycle close when captured, else the metered end. */
function postDate(period: ResultPeriod): string {
  return period.cycleClose ?? period.close;
}

/**
 * The first POSTED bill (a reconciled period carrying a printed total) whose post
 * date is STRICTLY after the acceptance instant, or null when none has posted yet.
 * Strictly-after: a same-day or earlier bill is not "the next bill after acceptance".
 */
export function firstPostedBillAfter(
  periods: readonly ResultPeriod[],
  resolvedAtIso: string,
): ResultPeriod | null {
  const acceptedAt = Date.parse(resolvedAtIso);
  if (Number.isNaN(acceptedAt)) return null;
  const posted = periods
    .filter((p) => p.printedTotalCents !== null && Date.parse(postDate(p)) > acceptedAt)
    .sort((a, b) => Date.parse(postDate(a)) - Date.parse(postDate(b)));
  return posted[0] ?? null;
}

/**
 * Compose the render projection for one accepted recommendation: its frozen
 * prediction plus the realized number from the first post-acceptance bill, or
 * pending when none has posted. Pure - the edge supplies the persisted prediction,
 * the acceptance instant, and the meter's periods.
 */
export function resultViewFor(input: {
  id: string;
  situation: string;
  /** The prediction recorded at acceptance (float dollars), or null. */
  predictedUsd: number | null;
  /** ISO 8601 acceptance instant (Recommendation.resolvedAt). */
  resolvedAtIso: string;
  periods: readonly ResultPeriod[];
}): ResultView {
  const bill = firstPostedBillAfter(input.periods, input.resolvedAtIso);
  const actualUsd =
    bill !== null && bill.printedTotalCents !== null
      ? roundUsd(bill.printedTotalCents / 100)
      : null;
  return {
    id: input.id,
    situation: input.situation,
    predictedUsd: input.predictedUsd !== null ? roundUsd(input.predictedUsd) : null,
    actualUsd,
    isPending: actualUsd === null,
  };
}
