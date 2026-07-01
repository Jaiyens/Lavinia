"use step";

// Workflow STEP: writeSettlementRecords. On deploy the WDK build adapter makes this a durable step;
// locally it is a plain async function.
//
// Writes PACKER_SETTLED ProductionRecord rows for a GATED settlement statement, each pointing
// (`supersedesId`) at the live ALMOND_LOGIC ESTIMATE it replaces for the same (farmId, cropYear,
// normalized variety). That supersede pointer is what makes the estimate->settled gap fall out of
// recomputePositions automatically: the engine looks up the superseded estimate by id and reports
// settled - estimate as `estimateToSettledGapPounds` (see positions.ts). No arithmetic happens here.
//
// Hard rules honored:
//   - Only "reconciled" rows are ever written. A needs_review verdict writes NOTHING.
//   - Match to supersede via the SHARED supersede predicate (liveRows): a settlement supersedes the
//     ONE live (non-superseded) ALMOND_LOGIC estimate whose NORMALIZED variety matches.
//       * 0 live matches  -> write the settlement with supersedesId = null (a settlement with no
//         prior estimate is still real; the gap is simply null for that cell).
//       * exactly 1 match -> write with supersedesId = that estimate's id (the gap falls out).
//       * >1 live matches -> AMBIGUOUS. NEVER guess which estimate to supersede: that variety is
//         routed to needs_review and NOTHING is written for it (the figure is withheld, not wrong).
//   - Every write goes through withFarmTenant so RLS is in force.
//   - Idempotent: a re-run skips varieties this statement already wrote (matched on the statement's
//     provenance tag stored in supersededReason). Append-only — existing rows are never edited.
//
// The DB is reached only through an injected `runInTenant` boundary, so a fake stands in with zero
// database (the gate + supersede logic is fully testable offline).

import type { Prisma, PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { liveRows } from "@/lib/crops/supersede";
import { normalizeVariety } from "@/lib/crops/extract/variety";
import type { PoundCoverage } from "@/lib/crops/types";

/** The provenance tag stamped on rows written from one settlement statement (for idempotent re-runs). */
export function settlementProvenance(statementId: string): string {
  return `crop settlement ${statementId}`;
}

/** A settled row to write: variety (verbatim), gated pounds, and the price that rides along. */
export type SettlementWriteRow = {
  variety: string;
  pounds: number;
  settledPriceCentsPerPound: number | null;
};

/** One existing production row as this step needs to see it for the supersede match. */
export type ExistingProductionRow = {
  id: string;
  variety: string;
  pounds: number;
  source: string;
  supersedesId: string | null;
  supersededReason: string | null;
};

/**
 * The minimal tenant-scoped DB surface this step needs. Implemented by Prisma's TransactionClient at
 * runtime; a fake implements it in tests. It reads the year's production rows (to find the live
 * estimate to supersede AND to know what this statement already wrote) and creates settled rows.
 */
export type SettlementTx = {
  productionRecord: {
    findMany(args: {
      where: { farmId: string; cropYear: number };
      select: {
        id: true;
        variety: true;
        pounds: true;
        source: true;
        supersedesId: true;
        supersededReason: true;
      };
    }): Promise<ExistingProductionRow[]>;
    create(args: {
      data: {
        farmId: string;
        cropYear: number;
        variety: string;
        pounds: number;
        source: "PACKER_SETTLED";
        supersedesId: string | null;
        supersededReason: string;
        controlTotalPounds: number | null;
        coverageState: PoundCoverage;
      };
    }): Promise<{ id: string }>;
  };
};

/** The injected tenant boundary: run `fn` with RLS pinned to `farmId`. */
export type RunInSettlementTenant = <T>(
  farmId: string,
  fn: (tx: SettlementTx) => Promise<T>,
) => Promise<T>;

export type WriteSettlementRecordsInput = {
  farmId: string;
  /** Stable id for THIS statement (e.g. its R2 sha or report id). The idempotency / provenance key. */
  statementId: string;
  cropYear: number;
  rows: readonly SettlementWriteRow[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
};

export type WriteSettlementRecordsOutput = {
  written: number;
  skipped: number;
  /** Varieties routed to needs_review because >1 live estimate matched (ambiguous; nothing written). */
  ambiguous: string[];
  /** True when the gate withheld the whole document (nothing written). */
  withheld: boolean;
  varietiesWritten: string[];
  /** True for each written variety that found exactly one estimate to supersede (the gap falls out). */
  supersededVarieties: string[];
};

/**
 * The production default tenant boundary, backed by the real Prisma client through withFarmTenant.
 * Passed as `runInTenant` in production; tests pass a fake instead.
 */
export function prismaRunInSettlementTenant(prisma: PrismaClient): RunInSettlementTenant {
  return (farmId, fn) =>
    withFarmTenant(prisma, farmId, (tx) => fn(tx as unknown as SettlementTx & Prisma.TransactionClient));
}

/**
 * Write the gated settlement rows. When coverage !== "reconciled", writes NOTHING and reports
 * withheld. Otherwise, inside one tenant transaction:
 *   1. Load the year's production rows; compute the LIVE set (liveRows) and index the live
 *      ALMOND_LOGIC estimates by normalized variety.
 *   2. For each settlement row: skip if this statement already wrote that variety (idempotent);
 *      if >1 live estimate matches the normalized variety -> ambiguous, write nothing for it;
 *      else create a PACKER_SETTLED row with supersedesId = the single match's id (or null).
 */
export async function writeSettlementRecordsStep(
  input: WriteSettlementRecordsInput,
  runInTenant: RunInSettlementTenant,
): Promise<WriteSettlementRecordsOutput> {
  const empty: WriteSettlementRecordsOutput = {
    written: 0,
    skipped: 0,
    ambiguous: [],
    withheld: true,
    varietiesWritten: [],
    supersededVarieties: [],
  };
  if (input.coverage !== "reconciled") return empty;

  const provenance = settlementProvenance(input.statementId);

  return runInTenant(input.farmId, async (tx) => {
    const existing = await tx.productionRecord.findMany({
      where: { farmId: input.farmId, cropYear: input.cropYear },
      select: {
        id: true,
        variety: true,
        pounds: true,
        source: true,
        supersedesId: true,
        supersededReason: true,
      },
    });

    // Which varieties did THIS statement already write (idempotency)?
    const alreadyWritten = new Set(
      existing
        .filter((r) => r.supersededReason === provenance)
        .map((r) => normalizeVariety(r.variety)),
    );

    // The live (non-superseded) ALMOND_LOGIC estimates, grouped by normalized variety.
    const live = liveRows(existing.map((r) => ({ id: r.id, supersedesId: r.supersedesId, row: r })));
    const estimatesByVariety = new Map<string, ExistingProductionRow[]>();
    for (const wrapped of live) {
      const r = wrapped.row;
      if (r.source !== "ALMOND_LOGIC") continue;
      const key = normalizeVariety(r.variety);
      const bucket = estimatesByVariety.get(key);
      if (bucket) bucket.push(r);
      else estimatesByVariety.set(key, [r]);
    }

    const varietiesWritten: string[] = [];
    const supersededVarieties: string[] = [];
    const ambiguous: string[] = [];
    let skipped = 0;

    for (const row of input.rows) {
      const key = normalizeVariety(row.variety);
      if (alreadyWritten.has(key)) {
        skipped += 1;
        continue;
      }
      const matches = estimatesByVariety.get(key) ?? [];
      if (matches.length > 1) {
        // Ambiguous: never guess which estimate to supersede. Withhold this variety to needs_review.
        ambiguous.push(row.variety);
        continue;
      }
      const supersedesId = matches.length === 1 ? (matches[0] as ExistingProductionRow).id : null;
      await tx.productionRecord.create({
        data: {
          farmId: input.farmId,
          cropYear: input.cropYear,
          variety: row.variety,
          pounds: row.pounds,
          source: "PACKER_SETTLED",
          supersedesId,
          supersededReason: provenance,
          controlTotalPounds: input.controlTotalPounds,
          coverageState: input.coverage,
        },
      });
      varietiesWritten.push(row.variety);
      if (supersedesId !== null) supersededVarieties.push(row.variety);
    }

    return {
      written: varietiesWritten.length,
      skipped,
      ambiguous,
      withheld: false,
      varietiesWritten,
      supersededVarieties,
    };
  });
}
