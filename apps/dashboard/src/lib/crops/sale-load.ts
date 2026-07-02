// DB edge for sales: gather live TGM (NGM) + live commitments and roll them up to available-to-sell
// per (cropYear, variety) via the pure engine. Tenant-scoped so RLS is honored. No arithmetic here.

import type { PrismaClient } from "@prisma/client";
import { withFarmTenant } from "./tenant-db";
import { salePositions, type SalePosition } from "./sale";

export async function loadSalePositions(prisma: PrismaClient, farmId: string): Promise<SalePosition[]> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const [tgm, commitments] = await Promise.all([
      // Live AND certified TGM only: a superseded figure is dead, and a needs_review figure the
      // pound-gate could not certify is NOT sellable good-meats-on-hand (never trade against it).
      tx.tgmRecord.findMany({
        where: { farmId, supersededBy: { none: {} }, coverageState: "reconciled" },
        select: { cropYear: true, variety: true, tgmLbs: true },
      }),
      // Live commitments only.
      tx.commitmentRecord.findMany({
        where: { farmId, supersededBy: { none: {} } },
        select: { cropYear: true, variety: true, pounds: true },
      }),
    ]);
    return salePositions(
      tgm.map((t) => ({ cropYear: t.cropYear, variety: t.variety, tgmLbs: t.tgmLbs })),
      commitments.map((c) => ({ cropYear: c.cropYear, variety: c.variety, pounds: c.pounds })),
    );
  }) as Promise<SalePosition[]>;
}
