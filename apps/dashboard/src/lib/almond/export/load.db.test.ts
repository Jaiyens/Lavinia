import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedSampleFarm } from "../../../../prisma/sample-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadExportData, type ExportLoadDeps } from "./load";

// Integration test for the uncapped export loader (Story 8.1) against a throwaway Postgres database
// on the local test cluster (src/test/pg-harness.ts), never the dev/prod Neon db. Proves two things
// a pure test cannot: (1) the loader returns the FULL inventory of a farm seeded ABOVE the chat cap
// (>50 meters) straight from the database, and (2) it is strictly farm-scoped — it never returns
// another farm's rows, because scope comes only from deps.farmId.
//
// NOTE: this file is intentionally NOT run in the overnight pass (local Postgres is unavailable). It
// is authored to the AC's requirement and runs in CI / locally where the cluster is up.

let db: TestDb;
let prisma: PrismaClient;
let depsA: ExportLoadDeps;
let depsBig: ExportLoadDeps;
let farmAPumpNames: string[];
const FARM_A_SECRET_PUMP = "ZZZ Secret Pump A";
const BIG_FARM_METER_COUNT = 60; // deliberately > the chat-tool cap of 50

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  // Farm A: the full sample farm (the "other" farm whose rows must never leak into the big export).
  const farmA = await seedSampleFarm(prisma);
  await prisma.pump.create({ data: { name: FARM_A_SECRET_PUMP, farmId: farmA.id } });
  farmAPumpNames = [...farmA.pumps.map((p) => p.name), FARM_A_SECRET_PUMP];
  depsA = { prisma, farmId: farmA.id, farmName: farmA.name };

  // Big farm: 60 meters, above the chat-tool cap, to prove the export is not a sample.
  const big = await prisma.farm.create({ data: { name: "Big Acreage Farms", isDemo: false } });
  await prisma.pump.createMany({
    data: Array.from({ length: BIG_FARM_METER_COUNT }, (_, i) => ({
      name: `Big Pump ${String(i + 1).padStart(3, "0")}`,
      coverageState: "no_bill",
      farmId: big.id,
    })),
  });
  depsBig = { prisma, farmId: big.id, farmName: big.name };
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("loadExportData over a real database", () => {
  it("returns EVERY meter for a farm seeded above the chat cap (the export is not a sample)", async () => {
    const data = await loadExportData(depsBig);
    expect(data.meters).toHaveLength(BIG_FARM_METER_COUNT);
    expect(data.meters.length).toBeGreaterThan(50);
    expect(data.state.coverage.total).toBe(BIG_FARM_METER_COUNT);
    expect(data.state.coverage.noBill).toBe(BIG_FARM_METER_COUNT);
    // No bills posted -> as-of is explicitly null, never a fabricated date.
    expect(data.state.asOf).toBeNull();
  });

  it("scopes strictly to deps.farmId and NEVER returns another farm's rows", async () => {
    const big = await loadExportData(depsBig);
    const bigNames = new Set(big.meters.map((m) => m.name));
    // None of farm A's pumps appear in the big farm's export.
    for (const n of farmAPumpNames) expect(bigNames.has(n)).toBe(false);

    const a = await loadExportData(depsA);
    const aNames = a.meters.map((m) => m.name);
    expect(aNames).toContain(FARM_A_SECRET_PUMP);
    // The big farm's pumps never leak into farm A's export.
    expect(aNames.some((n) => n.startsWith("Big Pump"))).toBe(false);
    expect(a.farm.id).toBe(depsA.farmId);
  });
});
