// DB edge for Gagan's worksheet: gather the facts for one crop year and hand them to the pure
// worksheetRows(). All reads run inside withFarmTenant so RLS is honored. No arithmetic here — the
// numbers are all owned by src/lib/crops/worksheet.ts.

import type { PrismaClient } from "@prisma/client";
import { withFarmTenant } from "./tenant-db";
import { worksheetRows, type WorksheetResult, type WorksheetRow } from "./worksheet";
import { yearOverYear, type YoyResult } from "./yoy";

/**
 * The crop years this farm has any worksheet-relevant data for (deliveries, huller runs, or TGM),
 * newest first. Drives the season switcher. Tenant-scoped.
 */
export async function worksheetSeasons(prisma: PrismaClient, farmId: string): Promise<number[]> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const [deliveries, runs, tgm] = await Promise.all([
      tx.cropDelivery.findMany({ where: { farmId }, select: { cropYear: true }, distinct: ["cropYear"] }),
      tx.cropRun.findMany({ where: { farmId }, select: { cropYear: true }, distinct: ["cropYear"] }),
      tx.tgmRecord.findMany({ where: { farmId }, select: { cropYear: true }, distinct: ["cropYear"] }),
    ]);
    const years = new Set<number>([
      ...deliveries.map((d) => d.cropYear),
      ...runs.map((r) => r.cropYear),
      ...tgm.map((t) => t.cropYear),
    ]);
    return [...years].sort((a, b) => b - a);
  }) as Promise<number[]>;
}

/** How many recent seasons the year-over-year view spans by default (bounds the per-season loads). */
export const YOY_DEFAULT_WINDOW = 6;

/**
 * Load the year-over-year comparison: run loadWorksheet for each recent season and pivot the rows.
 * Bounded to the most recent `maxSeasons` seasons so a farm with a decade of scrape does not fan out
 * unboundedly. Every figure is the season's own gated worksheet figure; this only reshapes them.
 */
export async function loadYearOverYear(
  prisma: PrismaClient,
  farmId: string,
  opts?: { maxSeasons?: number },
): Promise<YoyResult> {
  const seasons = await worksheetSeasons(prisma, farmId);
  const window = seasons.slice(0, opts?.maxSeasons ?? YOY_DEFAULT_WINDOW);
  const perYear = new Map<number, WorksheetRow[]>();
  for (const year of window) {
    const { rows } = await loadWorksheet(prisma, farmId, year);
    perYear.set(year, rows);
  }
  return yearOverYear({ perYear });
}

export async function loadWorksheet(
  prisma: PrismaClient,
  farmId: string,
  cropYear: number,
): Promise<WorksheetResult> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const [deliveries, priorDeliveries, runs, fieldBlocks, blocks, plantings, tgm] = await Promise.all([
      tx.cropDelivery.findMany({ where: { farmId, cropYear }, select: { field: true, variety: true, netLb: true } }),
      tx.cropDelivery.findMany({ where: { farmId, cropYear: cropYear - 1 }, select: { field: true, variety: true, netLb: true } }),
      tx.cropRun.findMany({ where: { farmId, cropYear }, select: { field: true, variety: true, binWeight: true, loadWeight: true } }),
      tx.cropFieldBlock.findMany({ where: { farmId }, select: { field: true, blockId: true } }),
      tx.block.findMany({ where: { farmId }, select: { id: true, name: true, entity: { select: { name: true } } } }),
      tx.blockPlanting.findMany({
        where: { farmId, OR: [{ cropYear }, { cropYear: null }] },
        select: { blockId: true, variety: true, acres: true },
      }),
      tx.tgmRecord.findMany({
        where: { farmId, cropYear },
        select: {
          blockId: true, variety: true, tgmLbs: true, gradeDeductionRate: true, source: true,
          coverageState: true, supersededBy: { select: { id: true } },
        },
      }),
    ]);

    return worksheetRows({
      cropYear,
      deliveries,
      priorDeliveries,
      runs,
      fieldBlockMap: new Map(fieldBlocks.map((f) => [f.field, f.blockId])),
      blocks: blocks.map((b) => ({ id: b.id, name: b.name, entityName: b.entity?.name ?? null })),
      plantings,
      // Live TGM = not superseded (statement updates supersede; the seed writes live rows).
      tgm: tgm
        .filter((t) => t.supersededBy.length === 0)
        .map((t) => ({
          blockId: t.blockId,
          variety: t.variety,
          tgmLbs: t.tgmLbs,
          gradeDeductionRate: t.gradeDeductionRate,
          source: t.source,
          coverageState: t.coverageState,
        })),
    });
  }) as Promise<WorksheetResult>;
}
