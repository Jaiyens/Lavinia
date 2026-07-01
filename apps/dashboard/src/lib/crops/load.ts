// The DB edge for the crop ledger: read the append-only rows for a farm and map them to the
// serializable DTOs recomputePositions() consumes. Reads go through withFarmTenant so RLS is in
// force. This is the ONLY place the position's inputs are fetched; the deterministic core then owns
// every derived number.

import type { Prisma, PrismaClient } from "@prisma/client";
import { withFarmTenant } from "./tenant-db";
import type {
  CommitmentEntry,
  CropLedger,
  PoolEntry,
  ProductionEntry,
} from "./types";
import {
  isCommitmentStatus,
  isProductionSource,
  type CommitmentStatus,
  type ProductionSource,
} from "./types";

// A row's stored `source` is a free String column; coerce to the union, defaulting an unknown value
// to ALMOND_LOGIC (the safe "estimate" reading — an unrecognized tag must never read as a final).
function asSource(value: string): ProductionSource {
  return isProductionSource(value) ? value : "ALMOND_LOGIC";
}

// `status` is a free String column too; coerce to the union, defaulting an unknown value to the
// safest reading "committed" (an unrecognized tag must never read as already collected cash).
function asStatus(value: string): CommitmentStatus {
  return isCommitmentStatus(value) ? value : "committed";
}

/** Load the full ledger for a farm (within the tenant transaction). */
export async function loadCropLedger(prisma: PrismaClient, farmId: string): Promise<CropLedger> {
  return withFarmTenant(prisma, farmId, (tx) => loadCropLedgerTx(tx, farmId));
}

/** Load the ledger using an existing tenant transaction client (for callers already inside one). */
export async function loadCropLedgerTx(
  tx: Prisma.TransactionClient,
  farmId: string,
): Promise<CropLedger> {
  const [production, commitments, pools] = await Promise.all([
    tx.productionRecord.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } }),
    tx.commitmentRecord.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } }),
    tx.poolRecord.findMany({ where: { farmId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    production: production.map(
      (r): ProductionEntry => ({
        id: r.id,
        cropYear: r.cropYear,
        variety: r.variety,
        pounds: r.pounds,
        source: asSource(r.source),
        supersedesId: r.supersedesId,
      }),
    ),
    commitments: commitments.map(
      (r): CommitmentEntry => ({
        id: r.id,
        cropYear: r.cropYear,
        variety: r.variety,
        pounds: r.pounds,
        buyer: r.buyer,
        source: asSource(r.source),
        supersedesId: r.supersedesId,
        status: asStatus(r.status),
        priceCentsPerPound: r.priceCentsPerPound,
        settledPriceCentsPerPound: r.settledPriceCentsPerPound,
        collectedCents: r.collectedCents,
        collectedAt: r.collectedAt ? r.collectedAt.toISOString() : null,
      }),
    ),
    pools: pools.map(
      (r): PoolEntry => ({
        id: r.id,
        cropYear: r.cropYear,
        variety: r.variety,
        pounds: r.pounds,
        pool: r.pool,
        source: asSource(r.source),
        supersedesId: r.supersedesId,
      }),
    ),
  };
}
