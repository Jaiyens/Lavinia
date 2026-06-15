import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeUtilityApi } from "@/lib/normalize";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadSampleUtilityApi } from "../onboarding/source";
import { importUtilityApi, type ImportResult } from "./import";

// Integration test for the UtilityAPI ingestion path: normalize the committed
// multi-account sample (3 PG&E accounts, 4 electric + 1 gas) and land it through Prisma
// against a throwaway Postgres db. The point Bayou could not reach: ONE pull creates
// MANY Account rows. Same harness + lander as the Bayou/ESPI db tests.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let firstImport: ImportResult;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "UtilityAPI Test Farm" } });
  farmId = farm.id;
  firstImport = await importUtilityApi(prisma, { pull: loadSampleUtilityApi(), farmId });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("importUtilityApi, multi-account sample onto a fresh farm", () => {
  it("creates four electric pumps and skips the gas meter", () => {
    expect(firstImport.pumpsCreated).toBe(4);
    expect(firstImport.pumpsUpdated).toBe(0);
    expect(firstImport.metersSkipped).toBe(1); // the gas meter
    expect(firstImport.serviceIds.sort()).toEqual([
      "7720450001",
      "7720450002",
      "7720450003",
      "7720450004",
    ]);
    expect(firstImport.billingPeriods).toBe(4); // one cycle per electric meter
  });

  it("lands the interval history the hybrid normalizer derived from Green Button", () => {
    const expected = normalizeUtilityApi(loadSampleUtilityApi()).reduce(
      (n, m) => n + m.intervals.length,
      0,
    );
    expect(expected).toBeGreaterThan(0);
    expect(firstImport.intervals).toBe(expected);
  });

  it("creates one Account per distinct PG&E account number (the multi-account win)", async () => {
    expect(await prisma.account.count({ where: { farmId } })).toBe(3);
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "7720450003" } },
      include: { account: true },
    });
    expect(pump.account?.number).toBe("3007654002");
    expect(pump.account?.entityId).toBeNull(); // entity assigned later from the spreadsheet
    expect(pump.meterSerial).toBe("1010100003");
  });

  it("does not persist the gas meter as a pump", async () => {
    expect(await prisma.pump.count({ where: { farmId } })).toBe(4);
    const gas = await prisma.pump.findUnique({
      where: { farmId_serviceId: { farmId, serviceId: "7720450090" } },
    });
    expect(gas).toBeNull();
  });

  it("tags billing periods with the utilityapi source", async () => {
    const periods = await prisma.billingPeriod.findMany({
      where: { pump: { farmId } },
    });
    expect(periods).toHaveLength(4);
    expect(periods.every((p) => p.source === "utilityapi")).toBe(true);
  });

  it("re-imports idempotently (no duplicate pumps, accounts, or periods)", async () => {
    const again = await importUtilityApi(prisma, { pull: loadSampleUtilityApi(), farmId });
    expect(again.pumpsUpdated).toBe(4);
    expect(again.pumpsCreated).toBe(0);
    expect(await prisma.pump.count({ where: { farmId } })).toBe(4);
    expect(await prisma.account.count({ where: { farmId } })).toBe(3);
    expect(await prisma.billingPeriod.count({ where: { pump: { farmId } } })).toBe(4);
  });
});
