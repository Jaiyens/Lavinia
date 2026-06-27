// The pound-gate: the cent-gate (src/lib/energy/reconcile.ts) ported to pounds. It is the TRUST
// gate on extracted yield rows. A figure becomes real ONLY when the line items sum to within
// tolerance of a control total taken from the SAME source document; otherwise it is withheld as
// needs_review, never shown as a wrong number. The model suggests rows; this deterministic gate
// decides what is real. No model output becomes a pound figure on its own word.
//
// Hard rule encoded here: never check an extraction against itself. The control total must be the
// document's own STATED total (e.g. a packer statement's printed grand total), extracted
// independently of the line items — not a re-sum of the rows we just read. A null control total
// cannot certify anything, so it is needs_review.

import type { PoundCoverage } from "./types";

/** One weight line from a single source document. */
export type PoundLineItem = { variety: string; pounds: number };

/**
 * Whole-pound tolerance, in pounds. 0 = exact. The cent-gate allows ±1 cent because OCR rounding
 * of fractional cents legitimately drifts a penny; whole pounds summed from whole-pound line items
 * have no sub-unit to round, so any difference is a real discrepancy -> review. Named so it is a
 * one-line change if a packer statement turns out to round (then store hundredths-of-a-pound as the
 * integer unit, never a float).
 */
export const POUND_TOLERANCE = 0;

/**
 * The pound-reconciliation gate: line items reconcile to the stated control total iff they agree
 * within POUND_TOLERANCE. Integer pounds in; never compared as floats. Mirror of reconcilesToCents.
 */
export function reconcilesToPounds(sumPounds: number, controlTotalPounds: number): boolean {
  return Math.abs(sumPounds - controlTotalPounds) <= POUND_TOLERANCE;
}

/** Sum a document's weight line items in whole pounds (the reconciliation surface). */
export function sumLineItemPounds(items: readonly PoundLineItem[]): number {
  return items.reduce((acc, it) => acc + it.pounds, 0);
}

/**
 * One document's honest coverage state. NEVER self-checks: controlTotalPounds must be the SAME
 * document's stated total, not a re-sum of `items`.
 *  - null control total  -> needs_review (nothing to certify against).
 *  - zero captured items  -> needs_review (an extraction that captured nothing must never read as
 *    reconciled, even against a 0 total — mirrors reconcilePeriod's empty-line-items guard).
 *  - else                 -> the gate decides reconciled vs needs_review.
 */
export function reconcileDocument(
  items: readonly PoundLineItem[],
  controlTotalPounds: number | null,
): PoundCoverage {
  if (controlTotalPounds === null) return "needs_review";
  if (items.length === 0) return "needs_review";
  return reconcilesToPounds(sumLineItemPounds(items), controlTotalPounds)
    ? "reconciled"
    : "needs_review";
}
