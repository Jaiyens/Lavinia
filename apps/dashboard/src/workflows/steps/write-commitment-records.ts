"use step";

// Workflow STEP: writeCommitmentRecords. On deploy the WDK build adapter makes this a durable step;
// locally it is a plain async function.
//
// Writes one CommitmentRecord per gated commitment line {handler -> buyer, variety, committedPounds,
// priceCentsPerPound}, source ALMOND_LOGIC (the commitment report is the grower's own login-gated
// tool, an estimate-class source). The committed pounds become a live commitment in the ledger;
// recomputePositions subtracts them from produced to derive unsold (see positions.ts). No arithmetic
// happens here.
//
// Hard rules honored:
//   - Only "reconciled" rows are ever written. A needs_review verdict writes NOTHING.
//   - Every write goes through withFarmTenant so RLS is in force.
//   - Price is stored as INTEGER CENTS PER POUND (money law); null is preserved as a pounds-only
//     commitment (price TBD at pool true-up). The gate certifies POUNDS only; price rides along.
//   - Idempotent: a re-run skips (buyer, variety) pairs this report already wrote (matched on the
//     report's provenance tag in supersededReason). Append-only — existing rows are never edited.
//
// The DB is reached only through an injected `runInTenant` boundary, so a fake stands in with zero
// database.

import type { Prisma, PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import type { PoundCoverage } from "@/lib/crops/types";

/** The provenance tag stamped on rows written from one commitment report (for idempotent re-runs). */
export function commitmentProvenance(reportId: string): string {
  return `crop commitment ${reportId}`;
}

/** One commitment line to write: buyer (handler), variety, committed pounds, price (cents/lb, nullable). */
export type CommitmentWriteRow = {
  buyer: string;
  variety: string;
  committedPounds: number;
  priceCentsPerPound: number | null;
};

/** One existing commitment row as this step needs to see it for idempotency. */
export type ExistingCommitmentRow = {
  buyer: string;
  variety: string;
  supersededReason: string | null;
};

/**
 * The minimal tenant-scoped DB surface this step needs. Implemented by Prisma's TransactionClient at
 * runtime; a fake implements it in tests. Reads what this report already wrote, then creates the
 * missing commitment rows.
 */
export type CommitmentTx = {
  commitmentRecord: {
    findMany(args: {
      where: { farmId: string; cropYear: number; supersededReason: string };
      select: { buyer: true; variety: true };
    }): Promise<{ buyer: string; variety: string }[]>;
    create(args: {
      data: {
        farmId: string;
        cropYear: number;
        variety: string;
        pounds: number;
        buyer: string;
        priceCentsPerPound: number | null;
        source: "ALMOND_LOGIC";
        supersededReason: string;
        controlTotalPounds: number | null;
        coverageState: PoundCoverage;
      };
    }): Promise<{ id: string }>;
  };
};

/** The injected tenant boundary: run `fn` with RLS pinned to `farmId`. */
export type RunInCommitmentTenant = <T>(
  farmId: string,
  fn: (tx: CommitmentTx) => Promise<T>,
) => Promise<T>;

export type WriteCommitmentRecordsInput = {
  farmId: string;
  /** Stable id for THIS report (e.g. its R2 sha or report id). The idempotency / provenance key. */
  reportId: string;
  cropYear: number;
  rows: readonly CommitmentWriteRow[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
};

export type WriteCommitmentRecordsOutput = {
  written: number;
  skipped: number;
  /** True when the gate withheld the whole document (nothing written). */
  withheld: boolean;
  /** The (buyer, variety) pairs written, for observability. */
  pairsWritten: { buyer: string; variety: string }[];
};

/** A (buyer, variety) idempotency key. Buyer + variety are stored verbatim; both must match to skip. */
function pairKey(buyer: string, variety: string): string {
  return `${buyer} | ${variety}`;
}

/**
 * The production default tenant boundary, backed by the real Prisma client through withFarmTenant.
 * Passed as `runInTenant` in production; tests pass a fake instead.
 */
export function prismaRunInCommitmentTenant(prisma: PrismaClient): RunInCommitmentTenant {
  return (farmId, fn) =>
    withFarmTenant(prisma, farmId, (tx) => fn(tx as unknown as CommitmentTx & Prisma.TransactionClient));
}

/**
 * Write the gated commitment rows. When coverage !== "reconciled", writes NOTHING and reports
 * withheld. Otherwise, inside one tenant transaction: read which (buyer, variety) pairs this report
 * already wrote, then create only the missing ones (idempotent re-run). Append-only.
 */
export async function writeCommitmentRecordsStep(
  input: WriteCommitmentRecordsInput,
  runInTenant: RunInCommitmentTenant,
): Promise<WriteCommitmentRecordsOutput> {
  if (input.coverage !== "reconciled") {
    return { written: 0, skipped: 0, withheld: true, pairsWritten: [] };
  }

  const provenance = commitmentProvenance(input.reportId);

  return runInTenant(input.farmId, async (tx) => {
    const existing = await tx.commitmentRecord.findMany({
      where: { farmId: input.farmId, cropYear: input.cropYear, supersededReason: provenance },
      select: { buyer: true, variety: true },
    });
    const already = new Set(existing.map((r) => pairKey(r.buyer, r.variety)));

    const pairsWritten: { buyer: string; variety: string }[] = [];
    let skipped = 0;
    for (const row of input.rows) {
      if (already.has(pairKey(row.buyer, row.variety))) {
        skipped += 1;
        continue;
      }
      await tx.commitmentRecord.create({
        data: {
          farmId: input.farmId,
          cropYear: input.cropYear,
          variety: row.variety,
          pounds: row.committedPounds,
          buyer: row.buyer,
          priceCentsPerPound: row.priceCentsPerPound,
          source: "ALMOND_LOGIC",
          supersededReason: provenance,
          controlTotalPounds: input.controlTotalPounds,
          coverageState: input.coverage,
        },
      });
      pairsWritten.push({ buyer: row.buyer, variety: row.variety });
    }

    return { written: pairsWritten.length, skipped, withheld: false, pairsWritten };
  });
}
