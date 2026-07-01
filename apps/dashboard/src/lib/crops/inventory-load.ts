// DB edge for good-meats inventory. Reads the append-only adjustment ledger (tenant-scoped so RLS is
// honored) and hands it to the pure inventory engine for rollup. No arithmetic here.

import type { PrismaClient } from "@prisma/client";
import { withFarmTenant } from "./tenant-db";
import {
  inventoryFacets,
  inventoryPositions,
  stageTotals,
  type InventoryAdjustment,
  type InventoryFilter,
  type InventoryPosition,
  type InventoryStage,
} from "./inventory";

export type InventoryView = {
  positions: InventoryPosition[];
  totals: Record<InventoryStage, number>;
  facets: { packers: string[]; varieties: string[] };
  adjustmentCount: number;
};

export async function loadInventory(
  prisma: PrismaClient,
  farmId: string,
  filter?: InventoryFilter,
): Promise<InventoryView> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const rows = await tx.inventoryItem.findMany({
      where: { farmId },
      select: {
        packer: true,
        blockId: true,
        variety: true,
        stage: true,
        netGoodMeatsLbs: true,
        cropYear: true,
        block: { select: { name: true } },
      },
    });
    const adjustments: InventoryAdjustment[] = rows.map((r) => ({
      packer: r.packer,
      blockId: r.blockId,
      blockName: r.block?.name ?? null,
      variety: r.variety,
      stage: r.stage,
      netGoodMeatsLbs: r.netGoodMeatsLbs,
      cropYear: r.cropYear,
    }));
    const positions = inventoryPositions(adjustments, filter);
    return {
      positions,
      totals: stageTotals(positions),
      facets: inventoryFacets(adjustments),
      adjustmentCount: rows.length,
    };
  }) as Promise<InventoryView>;
}
