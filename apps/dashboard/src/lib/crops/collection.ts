// The cash side of the commitment ledger: the pure, integer-cent money math for the production ->
// sale -> COLLECTION lifecycle. The module's law extends here from pounds to dollars: NO money is
// computed inside a React component (no * or - on cents in JSX). Every figure on the cash strip and
// every per-row Expected / Collected / Outstanding is produced HERE, once, from already-loaded
// CommitmentEntry DTOs (no DB, no clock). Money is integer CENTS throughout — never a float dollar —
// and negatives are honest (an overpayment makes outstanding negative; it is never clamped to zero).

import { liveRows } from "./supersede";
import type { CommitmentEntry } from "./types";

/**
 * The cash figures for one LIVE commitment row, all integer cents:
 * expectedCents   — committedPounds * priceCentsPerPound (the contract's stated value). Null when
 *                   the contract is pounds-only (no priceCentsPerPound yet), so we never fabricate
 *                   a dollar figure from a missing price.
 * collectedCents  — cents actually received (the row's own column), 0 until any cash is in hand.
 * outstandingCents— expectedCents - collectedCents; null when expected is null (nothing to owe yet).
 *                   May be negative (overpaid) and is surfaced honestly, never clamped.
 */
export type CommitmentCash = {
  expectedCents: number | null;
  collectedCents: number;
  outstandingCents: number | null;
};

/** Expected cents for one commitment: committedPounds * price. Null when no price is set yet. */
export function expectedCents(commitment: CommitmentEntry): number | null {
  if (commitment.priceCentsPerPound === null) return null;
  return commitment.pounds * commitment.priceCentsPerPound;
}

/** The integer cents collected against one commitment (0 until any cash is recorded). */
export function collectedCents(commitment: CommitmentEntry): number {
  return commitment.collectedCents ?? 0;
}

/** Outstanding cents = expected - collected; null when expected is unknown. Honest negatives. */
export function outstandingCents(commitment: CommitmentEntry): number | null {
  const expected = expectedCents(commitment);
  if (expected === null) return null;
  return expected - collectedCents(commitment);
}

/** All three cash figures for one commitment, computed once. */
export function commitmentCash(commitment: CommitmentEntry): CommitmentCash {
  return {
    expectedCents: expectedCents(commitment),
    collectedCents: collectedCents(commitment),
    outstandingCents: outstandingCents(commitment),
  };
}

/**
 * The cash KPI strip's three totals across a set of commitments, integer cents. Only LIVE rows
 * count (a superseded committed/settled row is dead once a later row carries the next status), so a
 * collection that supersedes a settlement is counted once, not twice. A commitment with no price
 * contributes nothing to committed/outstanding (we never invent a dollar from a missing price) but
 * its collected cents, if any, still count. Negatives are honest (a net overpayment shows below
 * zero outstanding), never clamped.
 */
export type CashSummary = {
  committedCents: number;
  collectedCents: number;
  outstandingCents: number;
};

export function cashSummary(commitments: readonly CommitmentEntry[]): CashSummary {
  let committed = 0;
  let collected = 0;
  let outstanding = 0;
  for (const c of liveRows(commitments)) {
    const expected = expectedCents(c);
    const got = collectedCents(c);
    if (expected !== null) {
      committed += expected;
      outstanding += expected - got;
    }
    collected += got;
  }
  return { committedCents: committed, collectedCents: collected, outstandingCents: outstanding };
}
