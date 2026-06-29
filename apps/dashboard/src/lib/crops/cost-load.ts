// The DB edge that feeds the pure cost-per-pound engine (crops/cost.ts). It reads the four facts the
// engine needs for one farm + crop year and hands them to costPerPound, which produces the only
// numbers: farm and per-block cents/lb plus the honest residual lines. Nothing here computes a
// per-pound figure — this module only gathers and shapes.
//
//   energy  -> loadMetersForFarm (the canonical MeterView[]) folded through meterYearCosts, so the
//              SAME reconciled/non-solar exclusions and the crop-year window the rest of the app uses.
//   links   -> Block.pumps (the m-n pump<->block graph): each pump (meter) serving a block becomes a
//              MeterBlockLink carrying the block's acreage, so a meter's dollars split across the
//              blocks it serves proportional to acreage.
//   yield   -> loadCropDeliveries routed through the CropFieldBlock field->block map, with any
//              ProductionRecord.blockId-attributed pounds overriding the scraped deliveries.
//   blocks  -> Block id/name/acreage for the per-block rows.
//
// The crop tables (CropFieldBlock, CropDelivery, ProductionRecord) are read inside withFarmTenant so
// Postgres RLS is in force. Block/Pump are application-scoped on farmId like the rest of the app.

import type { PrismaClient } from "@prisma/client";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadCropDeliveries } from "@/lib/crops/deliveries";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { meterYearCosts, cropYearWindow } from "@/lib/energy/meter-year-cost";
import {
  blockYields,
  costPerPound,
  type BlockInfo,
  type CostPerPound,
  type MeterBlockLink,
} from "@/lib/crops/cost";

/**
 * Load and compute the cost-per-pound for one farm and crop year. Pure-engine in, DB out: every
 * figure on the returned CostPerPound is produced by costPerPound from the loaded facts. Safe on a
 * farm with no mapping yet — the farm headline is correct from day one (total reconciled energy /
 * total yield), and unmapped yield + unallocatable energy surface as explicit residual lines.
 */
export async function loadCostPerPound(
  prisma: PrismaClient,
  farmId: string,
  cropYear: number,
): Promise<CostPerPound> {
  // --- Energy: reconciled, non-solar dollars closing inside the crop year ---
  const meters = await loadMetersForFarm(prisma, farmId);
  const window = cropYearWindow(cropYear);
  const { meterCosts, coverage } = meterYearCosts(meters, window.startIso, window.endIso);

  // --- Yield: every per-load delivery for the farm (filtered to the crop year inside the engine) ---
  const deliveries = await loadCropDeliveries(prisma, farmId);

  // --- Blocks + the pump<->block graph + the field->block map + production overrides (RLS-scoped) ---
  const { blocks, meterBlockLinks, fieldBlockMap, productionByBlock } = await withFarmTenant(
    prisma,
    farmId,
    async (tx) => {
      // Blocks with the pumps (meters) that serve them. acreage drives the per-meter split.
      const blockRows = await tx.block.findMany({
        where: { farmId },
        select: {
          id: true,
          name: true,
          acreage: true,
          pumps: { select: { id: true } },
        },
        orderBy: { name: "asc" },
      });

      const blocks: BlockInfo[] = blockRows.map((b) => ({
        id: b.id,
        name: b.name,
        acreage: b.acreage,
      }));
      // One link per (serving pump, block); the pump id IS the meter id in MeterView/meterYearCosts.
      const meterBlockLinks: MeterBlockLink[] = blockRows.flatMap((b) =>
        b.pumps.map((p) => ({ meterId: p.id, blockId: b.id, acreage: b.acreage })),
      );

      // The Almond Logic field -> Terra block map (one block per field; re-mapping is an update).
      const fieldRows = await tx.cropFieldBlock.findMany({
        where: { farmId },
        select: { field: true, blockId: true },
      });
      const fieldBlockMap = new Map(fieldRows.map((r) => [r.field, r.blockId]));

      // ProductionRecord pounds ATTRIBUTED to a block (a settled/hand-entered figure trumps the
      // scraped deliveries for that block). Sum the block-attributed rows for this crop year.
      const productionRows = await tx.productionRecord.findMany({
        where: { farmId, cropYear, blockId: { not: null } },
        select: { blockId: true, pounds: true },
      });
      const byBlock = new Map<string, number>();
      for (const r of productionRows) {
        if (r.blockId === null) continue;
        byBlock.set(r.blockId, (byBlock.get(r.blockId) ?? 0) + r.pounds);
      }
      const productionByBlock = [...byBlock.entries()].map(([blockId, pounds]) => ({
        blockId,
        pounds,
      }));

      return { blocks, meterBlockLinks, fieldBlockMap, productionByBlock };
    },
  );

  const yields = blockYields({
    deliveries: deliveries.map((d) => ({ field: d.field, netLb: d.netLb, cropYear: d.cropYear })),
    fieldBlockMap,
    productionByBlock,
    cropYear,
  });

  return costPerPound({
    cropYear,
    meterCosts,
    meterBlockLinks,
    blocks,
    yields,
    coverage,
  });
}
