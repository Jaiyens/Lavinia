import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadCostPerPound } from "./cost-load";
import { withFarmTenant } from "./tenant-db";

// Proves cost-per-pound end-to-end through the DB edge: two meters with reconciled bills, two blocks
// with acreage, two pumps serving them (M1 -> A+B, M2 -> A only), and deliveries mapped by field ->
// block, give the KNOWN per-block and farm cents/lb to the cent, plus the honest residual lines.
// This is the SAME worked example as cost.test.ts (the pure engine), reproduced through real Prisma
// so the DB edge (loadMetersForFarm + the Block/Pump graph + CropFieldBlock + meterYearCosts) is
// proven to feed the engine correctly. Throwaway Postgres on the local cluster (db push, RLS not
// applied here — RLS isolation is covered by crop-rls.db.test.ts).
//
// Needs the local Postgres harness (src/test/global-pg.ts). Where that cluster is unavailable this
// file is skipped by the runner, but it is written to pass against it.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

const CROP_YEAR = 2025;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farm = await prisma.farm.create({ data: { name: "Cost Test Farm" } });
  farmId = farm.id;

  // --- Blocks: A (60 ac) + B (40 ac) ---
  const blockA = await prisma.block.create({ data: { farmId, name: "Block A", acreage: 60 } });
  const blockB = await prisma.block.create({ data: { farmId, name: "Block B", acreage: 40 } });

  // --- Pumps (meters): M1 serves A+B, M2 serves A only ---
  const m1 = await prisma.pump.create({
    data: {
      farmId,
      name: "Meter 1",
      coverageState: "reconciled",
      blocks: { connect: [{ id: blockA.id }, { id: blockB.id }] },
    },
  });
  const m2 = await prisma.pump.create({
    data: {
      farmId,
      name: "Meter 2",
      coverageState: "reconciled",
      blocks: { connect: [{ id: blockA.id }] },
    },
  });

  // --- Reconciled bills closing inside the 2025 crop year ---
  // M1 total 11,000,000c across two cycles; M2 total 5,000,000c in one. One bill closes in 2024
  // (excluded by the window) to prove the crop-year filter; one solar meter (excluded) too.
  await prisma.billingPeriod.createMany({
    data: [
      { pumpId: m1.id, start: new Date("2025-03-01"), close: new Date("2025-03-31"), printedTotalCents: 6_000_000 },
      { pumpId: m1.id, start: new Date("2025-09-01"), close: new Date("2025-09-30"), printedTotalCents: 5_000_000 },
      { pumpId: m1.id, start: new Date("2024-12-01"), close: new Date("2024-12-31"), printedTotalCents: 7_777 }, // prior year
      { pumpId: m2.id, start: new Date("2025-06-01"), close: new Date("2025-06-30"), printedTotalCents: 5_000_000 },
    ],
  });

  // A solar meter with a reconciled bill: it must be excluded from energy entirely.
  const solar = await prisma.pump.create({
    data: { farmId, name: "Solar Meter", coverageState: "reconciled", isSolar: true, solarKw: 100 },
  });
  await prisma.billingPeriod.create({
    data: { pumpId: solar.id, start: new Date("2025-05-01"), close: new Date("2025-05-31"), printedTotalCents: 999_999 },
  });

  // --- Field -> block map: NP-A -> A, NP-B -> B (NP-? stays unmapped) ---
  await withFarmTenant(prisma, farmId, async (tx) => {
    await tx.cropFieldBlock.create({ data: { farmId, field: "NP-A", blockId: blockA.id } });
    await tx.cropFieldBlock.create({ data: { farmId, field: "NP-B", blockId: blockB.id } });

    // --- Deliveries: A 200,000 (two loads), B 100,000, NP-? 30,000 unmapped ---
    await tx.cropDelivery.createMany({
      data: [
        { farmId, hullerId: 1, huller: "H", cropYear: CROP_YEAR, loadId: "L1", field: "NP-A", variety: "Nonpareil", netLb: 120_000 },
        { farmId, hullerId: 1, huller: "H", cropYear: CROP_YEAR, loadId: "L2", field: "NP-A", variety: "Nonpareil", netLb: 80_000 },
        { farmId, hullerId: 1, huller: "H", cropYear: CROP_YEAR, loadId: "L3", field: "NP-B", variety: "Monterey", netLb: 100_000 },
        { farmId, hullerId: 1, huller: "H", cropYear: CROP_YEAR, loadId: "L4", field: "NP-?", variety: "Nonpareil", netLb: 30_000 },
        { farmId, hullerId: 1, huller: "H", cropYear: 2024, loadId: "L5", field: "NP-A", variety: "Nonpareil", netLb: 999 }, // wrong year
      ],
    });
  });
});

afterAll(async () => {
  await db?.cleanup();
});

describe("cost per pound end-to-end (DB edge -> engine)", () => {
  it("computes per-block and farm cents/lb to the cent, with honest residuals", async () => {
    const cost = await loadCostPerPound(prisma, farmId, CROP_YEAR);

    const a = cost.blocks.find((b) => b.blockName === "Block A")!;
    const b = cost.blocks.find((b) => b.blockName === "Block B")!;

    // M1 (11,000,000c) splits 60/40 -> A 6,600,000, B 4,400,000. M2 adds 5,000,000 to A.
    expect(a.energyCents).toBe(11_600_000);
    expect(a.netLb).toBe(200_000);
    expect(a.centsPerLb).toBe(58); // 11,600,000 / 200,000

    expect(b.energyCents).toBe(4_400_000);
    expect(b.netLb).toBe(100_000);
    expect(b.centsPerLb).toBe(44); // 4,400,000 / 100,000

    // Farm: 16,000,000c / (200k + 100k + 30k unmapped) = 48.48 -> 48. Solar + the 2024 bill excluded.
    expect(cost.farm.energyCents).toBe(16_000_000);
    expect(cost.farm.netLb).toBe(330_000);
    expect(cost.farm.centsPerLb).toBe(48);

    // Residuals: the unmapped 30,000 lb, no unallocatable energy (both blocks have acreage).
    expect(cost.residual.unmappedYieldLb).toBe(30_000);
    expect(cost.residual.unallocatableEnergyCents).toBe(0);

    // No cent lost: per-block energy + unallocatable == total reconciled non-solar in-window cents.
    const blockEnergy = cost.blocks.reduce((s, bl) => s + bl.energyCents, 0);
    expect(blockEnergy + cost.residual.unallocatableEnergyCents).toBe(16_000_000);

    // Coverage denominator counts every meter (incl. solar), and how many are reconciled.
    expect(cost.residual.metersTotal).toBe(3);
    expect(cost.residual.metersReconciled).toBe(3);
  });

  it("a ProductionRecord blockId override trumps the mapped deliveries for that block", async () => {
    // Attribute a settled 250,000 lb to Block A; it must win over the 200,000 from deliveries.
    const blockA = await prisma.block.findFirstOrThrow({ where: { farmId, name: "Block A" } });
    const created = await withFarmTenant(prisma, farmId, (tx) =>
      tx.productionRecord.create({
        data: {
          farmId,
          cropYear: CROP_YEAR,
          variety: "Nonpareil",
          pounds: 250_000,
          source: "PACKER_SETTLED",
          blockId: blockA.id,
        },
      }),
    );

    const cost = await loadCostPerPound(prisma, farmId, CROP_YEAR);
    const a = cost.blocks.find((b) => b.blockName === "Block A")!;
    expect(a.netLb).toBe(250_000); // the settled override, not the 200,000 from deliveries
    expect(a.centsPerLb).toBe(46); // 11,600,000 / 250,000 = 46.4 -> 46

    // Clean up so the first test stays independent if the suite re-orders.
    await withFarmTenant(prisma, farmId, (tx) =>
      tx.productionRecord.delete({ where: { id: created.id } }),
    );
  });
});
