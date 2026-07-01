// Crop production commitment ledger: the TS contract for the pound ledger. Union fields are
// String in Prisma (the repo convention; SQLite history) and mirrored here as literal unions so
// no unlisted value can reach the deterministic core typed. These DTOs are the serializable shape
// recomputePositions() consumes — it never touches Prisma models, only these (no DB, no clock),
// which is what makes the position rebuildable from the ledger and testable to the pound.

/**
 * The provenance/trust tag on every pound figure. ALMOND_LOGIC is an ESTIMATE (the grower's
 * login-gated yield tool); PACKER_SETTLED is FINAL (a packer settlement statement). An estimate is
 * never rendered as a final — the dashboard keys off Position.isSettled and always shows the gap.
 */
export type ProductionSource = "ALMOND_LOGIC" | "PACKER_SETTLED";
export const PRODUCTION_SOURCES: readonly ProductionSource[] = ["ALMOND_LOGIC", "PACKER_SETTLED"];

export function isProductionSource(value: string): value is ProductionSource {
  return (PRODUCTION_SOURCES as readonly string[]).includes(value);
}

/**
 * Where a commitment sits in the production -> sale -> collection lifecycle. The status advances by
 * SUPERSEDE (a new append-only row carries the next status; the prior row physically remains for
 * audit), never by mutation, so the lifecycle is rebuildable from the ledger:
 * "committed" — pounds are under contract to a named buyer (the contract is in, price may be TBD).
 * "settled"   — the packer settlement landed; the final $/lb is known.
 * "collected" — the cash was received; collectedCents records the integer cents actually in hand.
 */
export type CommitmentStatus = "committed" | "settled" | "collected";
export const COMMITMENT_STATUSES: readonly CommitmentStatus[] = [
  "committed",
  "settled",
  "collected",
];

export function isCommitmentStatus(value: string): value is CommitmentStatus {
  return (COMMITMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * One document's reconciliation verdict (the pound-gate output). Mirrors energy CoverageState.
 * "no_doc"       — no source document / control total exists yet (a hand-entered row).
 * "reconciled"   — line items summed to within tolerance of the stated control total: real.
 * "needs_review" — could not be certified (mismatch, no control total, or nothing captured).
 */
export type PoundCoverage = "no_doc" | "reconciled" | "needs_review";

// --- Ledger entry DTOs (one flattened view per ledger row) -----------------------------------
// The loader maps ProductionRecord / CommitmentRecord / PoolRecord rows into these. supersedesId
// points at the row this one replaces (a settlement supersedes an estimate); a row whose id is
// some other row's supersedesId is dead and excluded from the live position (append-only: the
// superseded row physically remains for audit, recompute just stops counting it).

export type ProductionEntry = {
  id: string;
  cropYear: number;
  variety: string;
  pounds: number; // whole pounds, integer
  source: ProductionSource;
  supersedesId: string | null;
};

export type CommitmentEntry = {
  id: string;
  cropYear: number;
  variety: string;
  pounds: number;
  buyer: string;
  source: ProductionSource;
  supersedesId: string | null;
  /** Lifecycle stage of the LIVE row for this commitment (committed -> settled -> collected). */
  status: CommitmentStatus;
  /** Contracted price as integer cents per pound; null when the contract is pounds-only (price TBD). */
  priceCentsPerPound: number | null;
  /** The final $/lb (integer cents per pound) once a settlement lands; null before settled. */
  settledPriceCentsPerPound: number | null;
  /** Integer cents actually received once collected; null until cash is in hand. */
  collectedCents: number | null;
  /** ISO timestamp the collection was recorded; null until collected. */
  collectedAt: string | null;
};

export type PoolEntry = {
  id: string;
  cropYear: number;
  variety: string;
  pounds: number;
  pool: string;
  source: ProductionSource;
  supersedesId: string | null;
};

/** The whole ledger as recomputePositions consumes it: three append-only arrays, nothing else. */
export type CropLedger = {
  production: readonly ProductionEntry[];
  commitments: readonly CommitmentEntry[];
  pools: readonly PoolEntry[];
};

/**
 * The computed position for one (cropYear, variety) cell. Every number here is produced ONLY by
 * recomputePositions — no model, no component, ever computes a pound. unsold may be negative
 * (oversold); it is surfaced honestly, never clamped.
 */
export type Position = {
  cropYear: number;
  variety: string;
  producedPounds: number; // live (post-supersede) produced
  committedPounds: number;
  poolPounds: number;
  unsoldPounds: number; // produced - committed - pool (exact integer subtraction)
  /**
   * How many pounds a settlement moved the production estimate (settled - superseded estimate).
   * Null when no PACKER_SETTLED row has superseded an ALMOND_LOGIC estimate for this cell yet.
   */
  estimateToSettledGapPounds: number | null;
  /** True once any live PACKER_SETTLED production row exists for this cell. Drives the label. */
  isSettled: boolean;
};

export type Positions = readonly Position[];
