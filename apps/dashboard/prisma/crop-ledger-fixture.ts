// A fully-known crop year, hand-entered, to prove the money logic before any scraping exists. The
// data + write logic live here (not coupled into seed.ts) so the crop-ledger db-test reuses the
// SAME numbers it ships — one source of truth for "the known crop year". Writes go through
// withFarmTenant so they work whether or not RLS is applied to the target database.
//
// Expected live position after seeding (recomputePositions over this ledger):
//   2026 Nonpareil: produced 248,500 (PACKER_SETTLED), committed 150,000, pool 50,000,
//                   unsold 48,500, isSettled true,  gap +8,500
//   2026 Monterey:  produced 120,000 (ALMOND_LOGIC),   committed  60,000, pool      0,
//                   unsold 60,000, isSettled false, gap null

import type { PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";

export const CROP_LEDGER_FIXTURE_YEAR = 2026;

export type CropLedgerSeedSummary = {
  cropYear: number;
  productionRows: number;
  commitmentRows: number;
  poolRows: number;
};

export async function seedCropLedger(
  prisma: PrismaClient,
  farmId: string,
): Promise<CropLedgerSeedSummary> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const cropYear = CROP_LEDGER_FIXTURE_YEAR;

    // --- Production -------------------------------------------------------------------------
    // Nonpareil: an Almond Logic estimate, later SUPERSEDED by a packer settlement (append-only:
    // the estimate row stays; the settlement points back at it).
    const nonpareilEstimate = await tx.productionRecord.create({
      data: {
        farmId,
        cropYear,
        variety: "Nonpareil",
        pounds: 240_000,
        source: "ALMOND_LOGIC",
        controlTotalPounds: 240_000,
        coverageState: "reconciled",
      },
    });
    await tx.productionRecord.create({
      data: {
        farmId,
        cropYear,
        variety: "Nonpareil",
        pounds: 248_500,
        source: "PACKER_SETTLED",
        supersedesId: nonpareilEstimate.id,
        supersededReason: "2026 packer settlement statement",
        controlTotalPounds: 248_500,
        coverageState: "reconciled",
      },
    });
    // Monterey: estimate only, no settlement yet.
    await tx.productionRecord.create({
      data: {
        farmId,
        cropYear,
        variety: "Monterey",
        pounds: 120_000,
        source: "ALMOND_LOGIC",
        controlTotalPounds: 120_000,
        coverageState: "reconciled",
      },
    });

    // --- Commitments ------------------------------------------------------------------------
    await tx.commitmentRecord.create({
      data: {
        farmId,
        cropYear,
        variety: "Nonpareil",
        pounds: 150_000,
        buyer: "Blue Diamond",
        priceCentsPerPound: 185,
        source: "ALMOND_LOGIC",
      },
    });
    await tx.commitmentRecord.create({
      data: {
        farmId,
        cropYear,
        variety: "Monterey",
        pounds: 60_000,
        buyer: "Wonderful",
        priceCentsPerPound: 170,
        source: "ALMOND_LOGIC",
      },
    });

    // --- Pool -------------------------------------------------------------------------------
    await tx.poolRecord.create({
      data: {
        farmId,
        cropYear,
        variety: "Nonpareil",
        pounds: 50_000,
        pool: "Blue Diamond pool",
        source: "ALMOND_LOGIC",
      },
    });

    return { cropYear, productionRows: 3, commitmentRows: 2, poolRows: 1 };
  });
}
