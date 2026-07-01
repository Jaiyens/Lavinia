// TGM writer: the DB edge for good-meats ingestion. Append-only with supersede — a new figure for a
// (cropYear, blockId, variety) key NEVER mutates the prior row; it inserts a new TgmRecord whose
// supersedesId points at the prior LIVE row (the one nothing supersedes), so the old figure physically
// remains for the audit trail and the worksheet loader (which reads live rows only) simply stops
// counting it. Tenant-scoped via withFarmTenant so RLS is honored; the customer-sourced guard runs
// here too (belt-and-suspenders with the DB check constraint). No pound is computed — inputs arrive
// already validated + gated from tgm-ingest.ts.

import type { PrismaClient } from "@prisma/client";
import { withFarmTenant } from "./tenant-db";
import { assertCustomerSourced, type TgmWriteInput } from "./tgm-ingest";

export type TgmWriteSummary = { written: number; superseded: number };

/**
 * Persist validated TGM inputs, superseding the prior live row per key. Returns how many rows were
 * written and how many prior figures they superseded. A run with no inputs is a no-op.
 */
export async function writeTgmRecords(
  prisma: PrismaClient,
  farmId: string,
  inputs: readonly TgmWriteInput[],
  reason: string,
): Promise<TgmWriteSummary> {
  if (inputs.length === 0) return { written: 0, superseded: 0 };

  return withFarmTenant(prisma, farmId, async (tx) => {
    let written = 0;
    let superseded = 0;
    for (const inp of inputs) {
      assertCustomerSourced(inp.source);
      // The current live figure for this key: a row nothing else supersedes. Farm-scoped by RLS + the
      // explicit WHERE.
      const prior = await tx.tgmRecord.findFirst({
        where: {
          farmId,
          cropYear: inp.cropYear,
          blockId: inp.blockId,
          variety: inp.variety,
          supersededBy: { none: {} },
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      await tx.tgmRecord.create({
        data: {
          farmId,
          cropYear: inp.cropYear,
          blockId: inp.blockId,
          variety: inp.variety,
          tgmLbs: inp.tgmLbs,
          gradeDeductionRate: inp.gradeDeductionRate,
          source: inp.source,
          controlTotalPounds: inp.controlTotalPounds,
          coverageState: inp.coverageState,
          supersedesId: prior?.id ?? null,
          supersededReason: reason,
        },
      });
      written += 1;
      if (prior) superseded += 1;
    }
    return { written, superseded };
  }) as Promise<TgmWriteSummary>;
}
