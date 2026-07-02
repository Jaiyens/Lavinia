import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";

// Proves Row Level Security on the crop ledger isolates tenants (the "RLS enforced + tested before
// any second grower" hard rule). The test harness pushes the schema with `prisma db push`, which
// does NOT emit the RLS block — so this test applies the SAME policy SQL itself, then exercises it
// as a NON-superuser role (the harness connects as the `postgres` superuser, which bypasses RLS;
// SET LOCAL ROLE drops to a role for which the policy is enforced).

const RLS_SQL = [
  `ALTER TABLE "ProductionRecord" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ProductionRecord" FORCE ROW LEVEL SECURITY`,
  `CREATE POLICY "ProductionRecord_farm_isolation" ON "ProductionRecord"
     USING ("farmId" = current_setting('app.current_farm_id', true))
     WITH CHECK ("farmId" = current_setting('app.current_farm_id', true))`,
  // CropDelivery + AlmondSnapshot (the portal-replica tables) now go through withFarmTenant on both
  // read (almond-portal/data.ts) and write (portal-load.ts), so RLS is safe. Same policy shape.
  `ALTER TABLE "CropDelivery" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "CropDelivery" FORCE ROW LEVEL SECURITY`,
  `CREATE POLICY "CropDelivery_farm_isolation" ON "CropDelivery"
     USING ("farmId" = current_setting('app.current_farm_id', true))
     WITH CHECK ("farmId" = current_setting('app.current_farm_id', true))`,
  `ALTER TABLE "AlmondSnapshot" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "AlmondSnapshot" FORCE ROW LEVEL SECURITY`,
  `CREATE POLICY "AlmondSnapshot_farm_isolation" ON "AlmondSnapshot"
     USING ("farmId" = current_setting('app.current_farm_id', true))
     WITH CHECK ("farmId" = current_setting('app.current_farm_id', true))`,
];

// The worksheet-spine + inventory tables added by the Batth build. db push creates the tables but
// emits neither the RLS block nor the customer-sourced / stage CHECK constraints, so the test applies
// both here and exercises them. Every one is farmId-scoped with the same GUC policy.
const SPINE_TABLES = ["BlockPlanting", "CropRun", "TgmRecord", "InventoryItem"] as const;
const SPINE_RLS_SQL = [
  ...SPINE_TABLES.flatMap((t) => [
    `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`,
    `CREATE POLICY "${t}_farm_isolation" ON "${t}"
       USING ("farmId" = current_setting('app.current_farm_id', true))
       WITH CHECK ("farmId" = current_setting('app.current_farm_id', true))`,
  ]),
  // The provenance / stage guards (the "TGM customer-sourced only" hard rule + inventory stage/source).
  `ALTER TABLE "TgmRecord" ADD CONSTRAINT "TgmRecord_source_customer_sourced" CHECK ("source" IN ('BLUE_DIAMOND_STATEMENT', 'MANUAL_ENTRY'))`,
  `ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_stage_check" CHECK ("stage" IN ('RAW', 'STOCKPILE', 'MEATS'))`,
  `ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_source_customer_sourced" CHECK ("source" IN ('MANUAL_ENTRY', 'TGM_DERIVED'))`,
];

let db: TestDb;
let prisma: PrismaClient;
let farmA: string;
let farmB: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  // Apply the RLS policy (db push skipped it) and a non-superuser role to exercise it under.
  for (const stmt of [...RLS_SQL, ...SPINE_RLS_SQL]) await prisma.$executeRawUnsafe(stmt);
  await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS crop_rls_tester`);
  await prisma.$executeRawUnsafe(`CREATE ROLE crop_rls_tester NOLOGIN`);
  for (const table of ["ProductionRecord", "CropDelivery", "AlmondSnapshot", ...SPINE_TABLES]) {
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO crop_rls_tester`,
    );
  }

  // Seed one row per farm as the superuser (RLS bypassed for setup).
  const a = await prisma.farm.create({ data: { name: "Farm A" } });
  const b = await prisma.farm.create({ data: { name: "Farm B" } });
  farmA = a.id;
  farmB = b.id;
  await prisma.productionRecord.create({
    data: { farmId: farmA, cropYear: 2026, variety: "Nonpareil", pounds: 100_000, source: "ALMOND_LOGIC" },
  });
  await prisma.productionRecord.create({
    data: { farmId: farmB, cropYear: 2026, variety: "Monterey", pounds: 200_000, source: "ALMOND_LOGIC" },
  });
  await prisma.cropDelivery.create({
    data: { farmId: farmA, hullerId: 10, huller: "Holland Hulling", cropYear: 2026, loadId: "A1", variety: "Nonpareil" },
  });
  await prisma.cropDelivery.create({
    data: { farmId: farmB, hullerId: 32, huller: "Sierra Valley Hulling", cropYear: 2026, loadId: "B1", variety: "Monterey" },
  });
  await prisma.almondSnapshot.create({
    data: { farmId: farmA, endpoint: "getHullers.php", paramsKey: "", payload: [{ id: 10 }] },
  });
  await prisma.almondSnapshot.create({
    data: { farmId: farmB, endpoint: "getHullers.php", paramsKey: "", payload: [{ id: 32 }] },
  });

  // A block per farm, then one spine row per table per farm (blockId-bearing rows reference the
  // same-farm block).
  const blockA = await prisma.block.create({ data: { farmId: farmA, name: "1" } });
  const blockB = await prisma.block.create({ data: { farmId: farmB, name: "1" } });
  await prisma.blockPlanting.create({ data: { farmId: farmA, blockId: blockA.id, variety: "NONPAREIL", acres: 80, cropYear: 2025 } });
  await prisma.blockPlanting.create({ data: { farmId: farmB, blockId: blockB.id, variety: "MONTEREY", acres: 40, cropYear: 2025 } });
  await prisma.cropRun.create({ data: { farmId: farmA, hullerId: 10, cropYear: 2025, runId: "A-1", variety: "NONPAREIL", binWeight: 60_000 } });
  await prisma.cropRun.create({ data: { farmId: farmB, hullerId: 32, cropYear: 2025, runId: "B-1", variety: "MONTEREY", binWeight: 20_000 } });
  await prisma.tgmRecord.create({ data: { farmId: farmA, cropYear: 2025, blockId: blockA.id, variety: "NONPAREIL", tgmLbs: 108_652, source: "MANUAL_ENTRY", coverageState: "reconciled" } });
  await prisma.tgmRecord.create({ data: { farmId: farmB, cropYear: 2025, blockId: blockB.id, variety: "MONTEREY", tgmLbs: 70_049, source: "MANUAL_ENTRY", coverageState: "reconciled" } });
  await prisma.inventoryItem.create({ data: { farmId: farmA, cropYear: 2025, blockId: blockA.id, variety: "NONPAREIL", stage: "MEATS", netGoodMeatsLbs: 100_000, source: "MANUAL_ENTRY", reason: "seed" } });
  await prisma.inventoryItem.create({ data: { farmId: farmB, cropYear: 2025, blockId: blockB.id, variety: "MONTEREY", stage: "RAW", netGoodMeatsLbs: 50_000, source: "MANUAL_ENTRY", reason: "seed" } });
});

afterAll(async () => {
  await db?.cleanup();
});

/** Run a query as the non-superuser role with app.current_farm_id pinned (or unset if null). */
function asTenant<T>(
  farmId: string | null,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE crop_rls_tester`);
    if (farmId !== null) {
      await tx.$executeRaw`SELECT set_config('app.current_farm_id', ${farmId}, true)`;
    }
    return fn(tx as unknown as PrismaClient);
  });
}

describe("crop ledger RLS", () => {
  it("a tenant sees only its own rows", async () => {
    const aRows = await asTenant(farmA, (tx) => tx.productionRecord.findMany());
    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.farmId).toBe(farmA);

    const bRows = await asTenant(farmB, (tx) => tx.productionRecord.findMany());
    expect(bRows).toHaveLength(1);
    expect(bRows[0]?.farmId).toBe(farmB);
  });

  it("a connection with no farm set sees zero rows (fail closed)", async () => {
    const rows = await asTenant(null, (tx) => tx.productionRecord.findMany());
    expect(rows).toHaveLength(0);
  });

  it("cannot write a row under another farm (WITH CHECK)", async () => {
    await expect(
      asTenant(farmB, (tx) =>
        tx.productionRecord.create({
          data: { farmId: farmA, cropYear: 2026, variety: "X", pounds: 1, source: "ALMOND_LOGIC" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("CropDelivery + AlmondSnapshot isolate by tenant (the portal-replica tables)", async () => {
    const aDeliveries = await asTenant(farmA, (tx) => tx.cropDelivery.findMany());
    expect(aDeliveries).toHaveLength(1);
    expect(aDeliveries[0]?.farmId).toBe(farmA);

    const aSnaps = await asTenant(farmA, (tx) => tx.almondSnapshot.findMany());
    expect(aSnaps).toHaveLength(1);
    expect(aSnaps[0]?.farmId).toBe(farmA);
  });

  it("CropDelivery + AlmondSnapshot fail closed with no farm set", async () => {
    expect(await asTenant(null, (tx) => tx.cropDelivery.findMany())).toHaveLength(0);
    expect(await asTenant(null, (tx) => tx.almondSnapshot.findMany())).toHaveLength(0);
  });
});

describe("worksheet-spine + inventory RLS", () => {
  it("each spine table isolates by tenant", async () => {
    const [plantings, runs, tgm, inv] = await asTenant(farmA, (tx) =>
      Promise.all([
        tx.blockPlanting.findMany(),
        tx.cropRun.findMany(),
        tx.tgmRecord.findMany(),
        tx.inventoryItem.findMany(),
      ]),
    );
    expect(plantings.map((r) => r.farmId)).toEqual([farmA]);
    expect(runs.map((r) => r.farmId)).toEqual([farmA]);
    expect(tgm.map((r) => r.farmId)).toEqual([farmA]);
    expect(inv.map((r) => r.farmId)).toEqual([farmA]);
  });

  it("each spine table fails closed with no farm set", async () => {
    const [plantings, runs, tgm, inv] = await asTenant(null, (tx) =>
      Promise.all([
        tx.blockPlanting.findMany(),
        tx.cropRun.findMany(),
        tx.tgmRecord.findMany(),
        tx.inventoryItem.findMany(),
      ]),
    );
    expect(plantings).toHaveLength(0);
    expect(runs).toHaveLength(0);
    expect(tgm).toHaveLength(0);
    expect(inv).toHaveLength(0);
  });

  it("cannot write a spine row under another farm (WITH CHECK)", async () => {
    await expect(
      asTenant(farmB, (tx) =>
        tx.tgmRecord.create({
          data: { farmId: farmA, cropYear: 2025, variety: "NONPAREIL", tgmLbs: 1, source: "MANUAL_ENTRY", coverageState: "reconciled" },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("customer-sourced + stage CHECK constraints", () => {
  it("TgmRecord refuses an ALMOND_LOGIC source (TGM is never scrape-derived)", async () => {
    await expect(
      asTenant(farmA, (tx) =>
        tx.tgmRecord.create({
          data: { farmId: farmA, cropYear: 2025, variety: "NONPAREIL", tgmLbs: 1, source: "ALMOND_LOGIC", coverageState: "reconciled" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("InventoryItem refuses an unknown stage and a non-customer source", async () => {
    await expect(
      asTenant(farmA, (tx) =>
        tx.inventoryItem.create({
          data: { farmId: farmA, cropYear: 2025, variety: "NONPAREIL", stage: "BOGUS", netGoodMeatsLbs: 1, source: "MANUAL_ENTRY", reason: "x" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      asTenant(farmA, (tx) =>
        tx.inventoryItem.create({
          data: { farmId: farmA, cropYear: 2025, variety: "NONPAREIL", stage: "MEATS", netGoodMeatsLbs: 1, source: "ALMOND_LOGIC", reason: "x" },
        }),
      ),
    ).rejects.toThrow();
  });
});
