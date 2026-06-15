import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadMetersForFarm } from "./load";

// Integration test for the dashboard read edge (Story 2.3): loadMetersForFarm projects pumps +
// billing periods + line items into the canonical MeterView, passing coverageState through and
// deriving demand cents. Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Test Farm", isDemo: false } });
  farmId = farm.id;
  const ranch = await prisma.ranch.create({ data: { name: "North Ranch", farmId } });
  const account = await prisma.account.create({ data: { number: "ACCT-1", farmId } });

  // A reconciled meter with one period carrying a demand line item + an energy line item.
  const recon = await prisma.pump.create({
    data: {
      name: "Pump 21",
      serviceId: "SA-1",
      rateSchedule: "AGC",
      isLegacy: false,
      status: "GOOD",
      coverageState: "reconciled",
      accountId: account.id,
      ranchId: ranch.id,
      farmId,
    },
  });
  const period = await prisma.billingPeriod.create({
    data: {
      pumpId: recon.id,
      start: new Date("2026-02-11"),
      close: new Date("2026-03-12"),
      printedTotalCents: 282622,
      demandChargeUsd: null,
      tariff: "AGC",
      source: "scanned_bill",
    },
  });
  await prisma.billingLineItem.createMany({
    data: [
      { billingPeriodId: period.id, kind: "demand", label: "Max Demand", amountCents: 278322, quantity: 278.88, unit: "kW", rate: null },
      { billingPeriodId: period.id, kind: "other", label: "Customer Charge", amountCents: 4300, quantity: null, unit: null, rate: null },
    ],
  });

  // A needs_review meter (figure withheld) and a no_bill meter (no periods) still project.
  await prisma.pump.create({
    data: { name: "Pump 4", serviceId: "SA-2", coverageState: "needs_review", farmId },
  });
  await prisma.pump.create({
    data: { name: "Pump 9", serviceId: "SA-3", coverageState: "no_bill", farmId },
  });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("loadMetersForFarm", () => {
  it("projects every meter (full inventory) sorted by name with coverage passed through", async () => {
    const meters = await loadMetersForFarm(prisma, farmId);
    expect(meters.map((m) => m.name)).toEqual(["Pump 21", "Pump 4", "Pump 9"]);
    expect(meters.map((m) => m.coverageState)).toEqual(["reconciled", "needs_review", "no_bill"]);
  });

  it("projects the reconciled meter's period, line items, account, and ranch", async () => {
    const meters = await loadMetersForFarm(prisma, farmId);
    const recon = meters.find((m) => m.name === "Pump 21");
    if (!recon) throw new Error("missing reconciled meter");
    expect(recon.accountNumber).toBe("ACCT-1");
    expect(recon.ranchName).toBe("North Ranch");
    expect(recon.status).toBe("GOOD");
    expect(recon.periods).toHaveLength(1);
    const p = recon.periods[0];
    if (!p) throw new Error("missing period");
    expect(p.printedTotalCents).toBe(282622);
    expect(p.demandCents).toBe(278322); // derived from the demand line item
    expect(p.lineItems).toHaveLength(2);
    expect(p.lineItems.map((li) => li.kind).sort()).toEqual(["demand", "other"]);
  });

  it("a no_bill meter projects with zero periods, never a fabricated bill", async () => {
    const meters = await loadMetersForFarm(prisma, farmId);
    const noBill = meters.find((m) => m.name === "Pump 9");
    if (!noBill) throw new Error("missing no_bill meter");
    expect(noBill.periods).toEqual([]);
  });

  it("projects serialCode verbatim (Story 3.5); null when never captured", async () => {
    const pump = await prisma.pump.findFirstOrThrow({ where: { name: "Pump 21" } });
    await prisma.pump.update({ where: { id: pump.id }, data: { serialCode: "Q" } });
    const meters = await loadMetersForFarm(prisma, farmId);
    expect(meters.find((m) => m.name === "Pump 21")?.serialCode).toBe("Q");
    expect(meters.find((m) => m.name === "Pump 9")?.serialCode).toBeNull();
  });

  it("projects persisted NEM months and true-up facts (Story 3.4)", async () => {
    const pump = await prisma.pump.findFirstOrThrow({ where: { name: "Pump 21" } });
    await prisma.pump.update({
      where: { id: pump.id },
      data: {
        isSolar: true,
        trueUpAmountCents: 713031,
        trueUpDate: new Date("2025-12-15T00:00:00.000Z"),
      },
    });
    await prisma.nemPeriod.createMany({
      data: [
        { pumpId: pump.id, start: new Date("2025-06-10T00:00:00.000Z"), close: new Date("2025-07-10T00:00:00.000Z"), netKwh: -11804, amountCents: -234268 },
        { pumpId: pump.id, start: new Date("2025-05-10T00:00:00.000Z"), close: new Date("2025-06-09T00:00:00.000Z"), netKwh: 12077, amountCents: 327235 },
      ],
    });

    const meters = await loadMetersForFarm(prisma, farmId);
    const solar = meters.find((m) => m.name === "Pump 21");
    if (!solar) throw new Error("missing solar meter");
    expect(solar.trueUpAmountCents).toBe(713031);
    expect(solar.trueUpDate).toBe("2025-12-15T00:00:00.000Z");
    // Sorted by start ascending, ISO strings, integer cents.
    expect(solar.nemPeriods).toEqual([
      { start: "2025-05-10T00:00:00.000Z", close: "2025-06-09T00:00:00.000Z", netKwh: 12077, amountCents: 327235 },
      { start: "2025-06-10T00:00:00.000Z", close: "2025-07-10T00:00:00.000Z", netKwh: -11804, amountCents: -234268 },
    ]);

    // Meters with no NEM data project honest absence.
    const noBill = meters.find((m) => m.name === "Pump 9");
    expect(noBill?.nemPeriods).toEqual([]);
    expect(noBill?.trueUpAmountCents).toBeNull();
    expect(noBill?.trueUpDate).toBeNull();
  });
});
