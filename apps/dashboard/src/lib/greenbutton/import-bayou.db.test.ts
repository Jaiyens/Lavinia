import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadSampleBayou } from "../onboarding/source";
import { importBayou, type ImportResult } from "./import";

// Integration test for the Bayou ingestion path: normalize the committed Speculoos
// pull and land it through Prisma against a throwaway Postgres db. Same harness as
// import.db.test.ts; proves the second source reuses the same lander and creates the
// Entity/Account link while dropping the gas meter (engine is electric-only).

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let firstImport: ImportResult;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Bayou Test Farm" } });
  farmId = farm.id;
  firstImport = await importBayou(prisma, { pull: loadSampleBayou(), farmId });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("importBayou, Speculoos pull onto a fresh farm", () => {
  it("creates one electric pump and skips the gas meter", () => {
    expect(firstImport.pumpsCreated).toBe(1);
    expect(firstImport.pumpsUpdated).toBe(0);
    expect(firstImport.metersSkipped).toBe(1); // the gas meter
    expect(firstImport.serviceIds).toEqual(["8003663029"]);
    expect(firstImport.billingPeriods).toBe(12);
    expect(firstImport.intervals).toBe(960);
  });

  it("keys the pump on the SA ID and stores the churnable serial separately", async () => {
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8003663029" } },
    });
    expect(pump.meterSerial).toBe("E4490291");
    expect(pump.fuel).toBe("electric");
    expect(pump.rateSchedule).toBe("Residential - Electric");
  });

  it("links the pump to a first-class Account by the account number", async () => {
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8003663029" } },
    });
    expect(pump.accountId).not.toBeNull();
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: pump.accountId! },
    });
    expect(account.number).toBe("498154477303083");
    expect(account.entityId).toBeNull(); // entity assigned later from the spreadsheet
    expect(await prisma.account.count({ where: { farmId } })).toBe(1);
  });

  it("does not persist the gas meter as a pump", async () => {
    expect(await prisma.pump.count({ where: { farmId } })).toBe(1);
    const gas = await prisma.pump.findUnique({
      where: { farmId_serviceId: { farmId, serviceId: "3990978695" } },
    });
    expect(gas).toBeNull();
  });

  it("tags billing periods with the bayou source", async () => {
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8003663029" } },
    });
    const periods = await prisma.billingPeriod.findMany({ where: { pumpId: pump.id } });
    expect(periods).toHaveLength(12);
    expect(periods.every((p) => p.source === "bayou")).toBe(true);
  });

  it("re-imports idempotently (no duplicate pumps, accounts, or periods)", async () => {
    const again = await importBayou(prisma, { pull: loadSampleBayou(), farmId });
    expect(again.pumpsUpdated).toBe(1);
    expect(again.pumpsCreated).toBe(0);
    expect(await prisma.pump.count({ where: { farmId } })).toBe(1);
    expect(await prisma.account.count({ where: { farmId } })).toBe(1);
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId, serviceId: "8003663029" } },
    });
    expect(await prisma.billingPeriod.count({ where: { pumpId: pump.id } })).toBe(12);
    expect(await prisma.usageInterval.count({ where: { pumpId: pump.id } })).toBe(960);
  });
});
