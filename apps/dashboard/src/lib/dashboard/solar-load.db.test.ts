import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadArrayAllocationBases } from "./solar-load";

// Integration test for the allocation DB edge (C-2, FR8, NFR4). It proves the two halves the
// architecture pins for `solar-load.ts`:
//   1. `BillingPeriod.totalKwh` IS loaded and summed per benefiting meter (the allocation basis).
//   2. NO per-interval query runs on the allocation path (the documented 183-meter OOM constraint):
//      a query-logging client confirms the edge never SELECTs the UsageInterval table, even when
//      interval rows exist for the meters.
// Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;
/** A second client bound to the SAME test db, logging every SQL query for the no-interval assertion. */
let logged: PrismaClient;
let sqlLog: string[];
let farmId: string;
let arrayId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  logged = new PrismaClient({
    datasources: { db: { url: db.url } },
    log: [{ emit: "event", level: "query" }],
  });
  // Prisma's typed event payload carries `query` (the SQL text); collect it for the assertion. The
  // `query` event is only present on the $on union when the log config is a literal, which the
  // generic constructor widens away; cast to the query-event client shape to read e.query.
  (logged as PrismaClient<{ log: [{ emit: "event"; level: "query" }] }>).$on("query", (e) => {
    sqlLog.push(e.query);
  });
  sqlLog = [];

  const farm = await prisma.farm.create({ data: { name: "Solar Farm", isDemo: false } });
  farmId = farm.id;

  const array = await prisma.solarArray.create({
    data: { name: "840 kW", nameplateKw: 840, nemType: "nem2_agg", farmId },
  });
  arrayId = array.id;

  // Meter A: two cycles carrying totalKwh (30 = 12 + 18) + interval rows that MUST NOT be read.
  const a = await prisma.pump.create({
    data: { name: "Pump A", coverageState: "reconciled", isSolar: false, farmId },
  });
  await prisma.billingPeriod.createMany({
    data: [
      { pumpId: a.id, start: new Date("2025-01-01"), close: new Date("2025-02-01"), totalKwh: 12 },
      { pumpId: a.id, start: new Date("2025-02-01"), close: new Date("2025-03-01"), totalKwh: 18 },
    ],
  });
  await prisma.usageInterval.createMany({
    data: [
      { pumpId: a.id, start: new Date("2025-01-01T00:00:00Z"), kWh: 3 },
      { pumpId: a.id, start: new Date("2025-01-01T00:15:00Z"), kWh: 4 },
    ],
  });

  // Meter B: one cycle, totalKwh 10.
  const b = await prisma.pump.create({
    data: { name: "Pump B", coverageState: "reconciled", isSolar: false, farmId },
  });
  await prisma.billingPeriod.create({
    data: { pumpId: b.id, start: new Date("2025-01-01"), close: new Date("2025-02-01"), totalKwh: 10 },
  });

  // Meter C: a benefiting meter with NO totalKwh on any cycle -> cumulativeKwh null (not on file).
  const c = await prisma.pump.create({
    data: { name: "Pump C", coverageState: "no_bill", isSolar: false, farmId },
  });
  await prisma.billingPeriod.create({
    data: { pumpId: c.id, start: new Date("2025-01-01"), close: new Date("2025-02-01"), totalKwh: null },
  });

  await prisma.solarArray.update({
    where: { id: array.id },
    data: { benefitingMeters: { connect: [{ id: a.id }, { id: b.id }, { id: c.id }] } },
  });
}, 120_000);

afterAll(async () => {
  await logged?.$disconnect();
  await db?.cleanup();
});

describe("loadArrayAllocationBases", () => {
  it("loads totalKwh summed per benefiting meter as the cumulative usage basis", async () => {
    const bases = await loadArrayAllocationBases(prisma, farmId);
    expect(bases).toHaveLength(1);
    const array = bases[0];
    if (!array) throw new Error("missing array basis");
    expect(array.arrayId).toBe(arrayId);
    expect(array.arrayName).toBe("840 kW");
    // Meters in name order, each with its summed totalKwh.
    expect(array.meters.map((m) => m.meterName)).toEqual(["Pump A", "Pump B", "Pump C"]);
    expect(array.meters.find((m) => m.meterName === "Pump A")?.cumulativeKwh).toBe(30); // 12 + 18
    expect(array.meters.find((m) => m.meterName === "Pump B")?.cumulativeKwh).toBe(10);
    // No totalKwh on any cycle => not on file (null), NEVER a fabricated zero.
    expect(array.meters.find((m) => m.meterName === "Pump C")?.cumulativeKwh).toBeNull();
  });

  it("is active-farm scoped: another farm's arrays never appear", async () => {
    const other = await prisma.farm.create({ data: { name: "Other Farm", isDemo: false } });
    await prisma.solarArray.create({
      data: { name: "Other Array", nameplateKw: 100, farmId: other.id },
    });
    const bases = await loadArrayAllocationBases(prisma, farmId);
    expect(bases.map((b) => b.arrayName)).toEqual(["840 kW"]);
  });

  it("reads ONLY per-cycle summaries: no UsageInterval query runs on the allocation path (NFR4)", async () => {
    sqlLog = [];
    await loadArrayAllocationBases(logged, farmId);
    // The edge loaded data...
    expect(sqlLog.length).toBeGreaterThan(0);
    // ...but never touched the interval table, even though Meter A has interval rows.
    const touchedIntervals = sqlLog.filter((q) => /usageinterval/i.test(q));
    expect(touchedIntervals).toEqual([]);
    // And it DID read the billing-period summaries (totalKwh lives there).
    const touchedSummaries = sqlLog.some((q) => /billingperiod/i.test(q));
    expect(touchedSummaries).toBe(true);
  });
});
