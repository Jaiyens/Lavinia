"use step";

// Workflow STEP: writeYieldRecords. On deploy the WDK build adapter makes this a durable step;
// locally it is a plain async function.
//
// Writes ProductionRecord rows for the GATED yield. Hard rules honored:
//   - Only "reconciled" rows are ever written. A needs_review verdict writes NOTHING (the figure is
//     withheld, never persisted as a wrong number).
//   - Every write goes through withFarmTenant so RLS is in force (this step touches the DB).
//   - The numbers come straight from the pound-gate output; this step never computes a pound.
//
// Idempotency: there is no DB-level unique key for (farmId, entityId, cropYear) and the schema is
// frozen for this track, so idempotency is enforced at the application level INSIDE the tenant
// transaction — a re-run for the same (farmId, cropYear, entityId) skips varieties already written
// by a prior run (matched on the entityId provenance tag stored in `supersededReason`). Append-only:
// existing rows are never edited.
//
// Testability: the DB is reached only through an injected `runInTenant` boundary, so a fake can
// stand in with zero database.

import type { Prisma, PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import type { PoundLineItem } from "@/lib/crops/pound-gate";
import type { PoundCoverage, ProductionSource } from "@/lib/crops/types";

/** The provenance tag we stamp on rows so a re-run can recognize what it already wrote. */
export function entityProvenance(entityId: string): string {
  return `crop ingest entity ${entityId}`;
}

/**
 * The minimal tenant-scoped DB surface this step needs. Implemented by Prisma's TransactionClient at
 * runtime; a fake implements it in tests. Only the two operations the step actually performs.
 */
export type CropProductionTx = {
  productionRecord: {
    findMany(args: {
      where: { farmId: string; cropYear: number; supersededReason: string };
      select: { variety: true };
    }): Promise<{ variety: string }[]>;
    create(args: {
      data: {
        farmId: string;
        cropYear: number;
        variety: string;
        pounds: number;
        source: ProductionSource;
        controlTotalPounds: number | null;
        coverageState: PoundCoverage;
        supersededReason: string;
      };
    }): Promise<{ id: string }>;
  };
};

/** The injected tenant boundary: run `fn` with RLS pinned to `farmId`. */
export type RunInTenant = <T>(farmId: string, fn: (tx: CropProductionTx) => Promise<T>) => Promise<T>;

export type WriteYieldRecordsInput = {
  farmId: string;
  entityId: string;
  cropYear: number;
  rows: readonly PoundLineItem[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
  /** The provenance tag for these rows. Defaults to ALMOND_LOGIC (the scrape is an estimate source). */
  source?: ProductionSource;
};

export type WriteYieldRecordsOutput = {
  written: number;
  skipped: number;
  /** True when the gate withheld the whole document (nothing written). */
  withheld: boolean;
  varietiesWritten: string[];
};

/**
 * The production default tenant boundary, backed by the real Prisma client through withFarmTenant.
 * Passed as `runInTenant` in production; tests pass a fake instead.
 */
export function prismaRunInTenant(prisma: PrismaClient): RunInTenant {
  return (farmId, fn) =>
    withFarmTenant(prisma, farmId, (tx) => fn(tx as unknown as CropProductionTx & Prisma.TransactionClient));
}

/**
 * Write the gated yield rows. When coverage !== "reconciled", writes NOTHING and reports withheld.
 * Otherwise, inside one tenant transaction: reads which varieties this entity already wrote for the
 * year, then creates only the missing ones (idempotent re-run). Append-only.
 */
export async function writeYieldRecordsStep(
  input: WriteYieldRecordsInput,
  runInTenant: RunInTenant,
): Promise<WriteYieldRecordsOutput> {
  if (input.coverage !== "reconciled") {
    return { written: 0, skipped: 0, withheld: true, varietiesWritten: [] };
  }

  const source: ProductionSource = input.source ?? "ALMOND_LOGIC";
  const provenance = entityProvenance(input.entityId);

  return runInTenant(input.farmId, async (tx) => {
    const existing = await tx.productionRecord.findMany({
      where: { farmId: input.farmId, cropYear: input.cropYear, supersededReason: provenance },
      select: { variety: true },
    });
    const already = new Set(existing.map((r) => r.variety));

    const varietiesWritten: string[] = [];
    let skipped = 0;
    for (const row of input.rows) {
      if (already.has(row.variety)) {
        skipped += 1;
        continue;
      }
      await tx.productionRecord.create({
        data: {
          farmId: input.farmId,
          cropYear: input.cropYear,
          variety: row.variety,
          pounds: row.pounds,
          source,
          controlTotalPounds: input.controlTotalPounds,
          coverageState: input.coverage,
          supersededReason: provenance,
        },
      });
      varietiesWritten.push(row.variety);
    }

    return {
      written: varietiesWritten.length,
      skipped,
      withheld: false,
      varietiesWritten,
    };
  });
}
