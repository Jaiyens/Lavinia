import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedSampleFarm } from "../../../prisma/sample-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { importGreenButton, type ImportResult } from "./import";

// Integration test: run the importer through Prisma against a throwaway Postgres
// database on the local test cluster (no network, never touches the dev/prod db).
// Same harness as prisma/sample-farm seed.db.test.ts.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function fixture(name: string): string {
  return readFileSync(join(repoRoot, "fixtures", "greenbutton", name), "utf8");
}

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let multiImport: ImportResult;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await seedSampleFarm(prisma);
  farmId = farm.id;
  multiImport = await importGreenButton(prisma, {
    xml: fixture("sandhu-multi-meter.xml"),
    farmId,
  });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("importGreenButton, multi-meter onto the seeded farm", () => {
  it("matches the three pumps by service ID and updates, creating none", () => {
    expect(multiImport.pumpsUpdated).toBe(3);
    expect(multiImport.pumpsCreated).toBe(0);
    // Home Ranch (6+4) + North (4+3) + River (3+3) = 23 readings.
    expect(multiImport.intervals).toBe(6 + 4 + 4 + 3 + 3 + 3);
    expect(multiImport.billingPeriods).toBe(6);
  });

  it("refreshes metered fields but keeps the farmer's pump name", async () => {
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8590312001" } },
    });
    expect(pump.name).toBe("Home Ranch Well"); // preserved from the seed
    expect(pump.rateSchedule).toBe("AG-C");
    expect(pump.location).toBe("16400 Avenue 12, Madera, CA 93637"); // refreshed from feed
  });

  it("stores per-cycle billing periods with the derived peak and demand charge", async () => {
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8590312001" } },
    });
    const periods = await prisma.billingPeriod.findMany({
      where: { pumpId: pump.id },
      orderBy: { start: "asc" },
    });
    expect(periods).toHaveLength(2);

    const [a, b] = periods;
    expect(a?.tariff).toBe("AG-C");
    expect(a?.peakKw).toBe(112);
    expect(a?.peakAt?.toISOString()).toBe("2026-06-02T22:30:00.000Z");
    expect(a?.demandChargeUsd).toBe(3276);
    expect(a?.totalBillUsd).toBe(8540.5);
    expect(a?.source).toBe("green_button");

    expect(b?.peakKw).toBe(138);
    expect(b?.demandChargeUsd).toBe(4209);
  });

  it("scales mult-3 River Well correctly through to stored kW", async () => {
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8590312003" } },
    });
    const periods = await prisma.billingPeriod.findMany({
      where: { pumpId: pump.id },
      orderBy: { start: "asc" },
    });
    expect(periods.map((p) => p.peakKw)).toEqual([72, 80]);
    const intervals = await prisma.usageInterval.count({ where: { pumpId: pump.id } });
    expect(intervals).toBe(6);
  });

  it("re-imports idempotently (no duplicate pumps, intervals, or periods)", async () => {
    await importGreenButton(prisma, {
      xml: fixture("sandhu-multi-meter.xml"),
      farmId,
    });
    expect(await prisma.pump.count({ where: { farmId } })).toBe(6); // seeded count, no dupes
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8590312001" } },
    });
    expect(await prisma.usageInterval.count({ where: { pumpId: pump.id } })).toBe(10);
    expect(await prisma.billingPeriod.count({ where: { pumpId: pump.id } })).toBe(2);
  });

  it("creates a new pump for a service ID not on the farm", async () => {
    const result = await importGreenButton(prisma, {
      xml: fixture("single-meter.xml"),
      farmId,
    });
    expect(result.pumpsCreated).toBe(1);
    expect(result.pumpsUpdated).toBe(0);
    expect(await prisma.pump.count({ where: { farmId } })).toBe(7);

    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8590312009" } },
    });
    expect(pump.name).toBe("Service 8590312009"); // derived, no human name in ESPI
    expect(pump.rateSchedule).toBe("AG-B");
    const periods = await prisma.billingPeriod.findMany({
      where: { pumpId: pump.id },
      orderBy: { start: "asc" },
    });
    expect(periods.map((p) => p.peakKw)).toEqual([60, 68]);
    expect(await prisma.usageInterval.count({ where: { pumpId: pump.id } })).toBe(6);
  }, 60_000);
});
