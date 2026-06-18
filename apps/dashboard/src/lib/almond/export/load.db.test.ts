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
  // A live-connected meter: it HAS a billing period (a metered `close` is set) but NO posted bill
  // (printedTotalCents stays null, exactly the Green Button upsert shape). This is the realistic
  // failure case the posted-bill gate guards: the metered close must NEVER surface as the export's
  // as-of, so the big farm's as-of must stay null even though this meter carries a period.
  const liveMeter = await prisma.pump.create({
    data: { name: "Big Pump Live", coverageState: "no_bill", farmId: big.id },
  });
  await prisma.billingPeriod.create({
    data: {
      pumpId: liveMeter.id,
      start: new Date("2026-06-01"),
      close: new Date("2026-06-30"), // a metered/scheduled end, NOT a billed cycle
      printedTotalCents: null, // no scanned bill: never to be shown as "as-of"
    },
  });
  depsBig = { prisma, farmId: big.id, farmName: big.name };
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("loadExportData over a real database", () => {
  it("returns EVERY meter for a farm seeded above the chat cap (the export is not a sample)", async () => {
    // BIG_FARM_METER_COUNT bill-less pumps + the one live-connected meter that carries a period.
    const expectedTotal = BIG_FARM_METER_COUNT + 1;
    const data = await loadExportData(depsBig);
    expect(data.meters).toHaveLength(expectedTotal);
    expect(data.meters.length).toBeGreaterThan(50);
    expect(data.state.coverage.total).toBe(expectedTotal);
    expect(data.state.coverage.noBill).toBe(expectedTotal);
    // No POSTED bill anywhere -> as-of is explicitly null. The live meter HAS a metered period
    // (close = 2026-06-30) with printedTotalCents null; the posted-bill gate must not surface it,
    // so the metered close is never shown as a billed as-of date.
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
