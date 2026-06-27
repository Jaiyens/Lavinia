// The reconciliation queue: the rows across the three crop tables whose pound-gate verdict is
// "needs_review" (a mismatch, a missing control total, or nothing captured). The Crops tab lists
// these and offers a MANUAL resolve. Reads go through withFarmTenant so RLS is in force, the same
// DB-edge discipline loadCropLedger uses. This is a pure read projection: it never computes a pound
// (it surfaces the stored row's `pounds` verbatim), it only selects the un-certified rows so the
// operator can clear the flag.

import type { Prisma, PrismaClient } from "@prisma/client";
import { withFarmTenant } from "./tenant-db";
import { isProductionSource, type ProductionSource } from "./types";

/** Which of the three append-only tables a queue row came from (drives the resolve target). */
export type CropReviewKind = "production" | "commitment" | "pool";

/**
 * One reconciliation-queue row, flattened for the tab. Every figure is the stored value (no
 * derivation): `pounds` is the row's own column, `source` its provenance tag so an estimate is
 * never read as a final. `party` is the buyer (commitment) or pool (pool row), null for production.
 */
export type CropReviewRow = {
  id: string;
  kind: CropReviewKind;
  cropYear: number;
  variety: string;
  pounds: number;
  source: ProductionSource;
  /** The control total stated on the source document, when one exists (null is why it failed). */
  controlTotalPounds: number | null;
  /** Buyer (commitment) or pool/handler (pool row); null for a production row. */
  party: string | null;
};

// A stored `source` is a free String column; coerce to the union, defaulting an unrecognized tag to
// the safe estimate reading (an unknown value must never read as a settled final).
function asSource(value: string): ProductionSource {
  return isProductionSource(value) ? value : "ALMOND_LOGIC";
}

const NEEDS_REVIEW = "needs_review";

/** Load every un-certified (coverageState = "needs_review") row for a farm, within the tenant
 *  transaction. Ordered oldest-first so the queue is stable and the oldest backlog reads at top. */
export async function loadCropReviewQueue(
  prisma: PrismaClient,
  farmId: string,
): Promise<CropReviewRow[]> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const [production, commitments, pools] = await Promise.all([
      tx.productionRecord.findMany({
        where: { farmId, coverageState: NEEDS_REVIEW },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          cropYear: true,
          variety: true,
          pounds: true,
          source: true,
          controlTotalPounds: true,
        },
      }),
      tx.commitmentRecord.findMany({
        where: { farmId, coverageState: NEEDS_REVIEW },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          cropYear: true,
          variety: true,
          pounds: true,
          source: true,
          controlTotalPounds: true,
          buyer: true,
        },
      }),
      tx.poolRecord.findMany({
        where: { farmId, coverageState: NEEDS_REVIEW },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          cropYear: true,
          variety: true,
          pounds: true,
          source: true,
          controlTotalPounds: true,
          pool: true,
        },
      }),
    ]);

    const rows: CropReviewRow[] = [
      ...production.map(
        (r): CropReviewRow => ({
          id: r.id,
          kind: "production",
          cropYear: r.cropYear,
          variety: r.variety,
          pounds: r.pounds,
          source: asSource(r.source),
          controlTotalPounds: r.controlTotalPounds,
          party: null,
        }),
      ),
      ...commitments.map(
        (r): CropReviewRow => ({
          id: r.id,
          kind: "commitment",
          cropYear: r.cropYear,
          variety: r.variety,
          pounds: r.pounds,
          source: asSource(r.source),
          controlTotalPounds: r.controlTotalPounds,
          party: r.buyer,
        }),
      ),
      ...pools.map(
        (r): CropReviewRow => ({
          id: r.id,
          kind: "pool",
          cropYear: r.cropYear,
          variety: r.variety,
          pounds: r.pounds,
          source: asSource(r.source),
          controlTotalPounds: r.controlTotalPounds,
          party: r.pool,
        }),
      ),
    ];
    return rows;
  });
}

/**
 * Manually flip one un-certified row to "reconciled" within the tenant transaction. The row id +
 * kind select the table; the WHERE re-asserts farm ownership AND the current needs_review state, so
 * the write is idempotent (a second resolve, or a resolve on a row that is no longer in review, is a
 * zero-row no-op) and can never touch another farm's row. It clears the review FLAG ONLY — it does
 * not recompute or change any pounds (the pound stays exactly what the ledger recorded). Returns the
 * number of rows updated (0 when nothing matched).
 */
export async function resolveCropReviewRow(
  prisma: PrismaClient,
  farmId: string,
  kind: CropReviewKind,
  id: string,
): Promise<number> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const where = { id, farmId, coverageState: NEEDS_REVIEW };
    const data = { coverageState: "reconciled" };
    let result: Prisma.BatchPayload;
    if (kind === "production") {
      result = await tx.productionRecord.updateMany({ where, data });
    } else if (kind === "commitment") {
      result = await tx.commitmentRecord.updateMany({ where, data });
    } else {
      result = await tx.poolRecord.updateMany({ where, data });
    }
    return result.count;
  });
}

/** Type guard for the kind that crosses the network into the resolve action (never trusted raw). */
export function isCropReviewKind(value: unknown): value is CropReviewKind {
  return value === "production" || value === "commitment" || value === "pool";
}
