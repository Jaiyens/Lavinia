import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";

// Integration test for the Story 1.3 billing schema: BillingPeriod gains cycleClose +
// printedTotalCents, BillingLineItem is a cascade child in integer cents, and Pump/Account
// carry a defaulted coverageState. Throwaway Postgres on the local test cluster; never dev.db.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("billing canonical-shape schema", () => {
  it("persists a BillingPeriod with cycleClose + printedTotalCents and integer-cents line items", async () => {
    const farm = await prisma.farm.create({ data: { name: "Billing Test Farm" } });
    const pump = await prisma.pump.create({
      data: { farmId: farm.id, name: "Well 1", serviceId: "SA-1" },
    });

    const period = await prisma.billingPeriod.create({
      data: {
        pumpId: pump.id,
        start: new Date("2026-04-01T00:00:00Z"),
        close: new Date("2026-04-30T00:00:00Z"),
        cycleClose: new Date("2026-05-02T00:00:00Z"),
        printedTotalCents: 245657,
        tariff: "AG-5B",
        billingLineItems: {
          create: [
            { kind: "tou_energy", label: "Peak", amountCents: 51012, quantity: 1234.567891, unit: "kWh", rate: 0.41327 },
            { kind: "demand", label: "Demand", amountCents: 88100, quantity: 47.2, unit: "kW" },
          ],
        },
      },
      include: { billingLineItems: true },
    });

    expect(period.cycleClose?.toISOString()).toBe("2026-05-02T00:00:00.000Z");
    expect(period.printedTotalCents).toBe(245657);
    expect(period.billingLineItems).toHaveLength(2);
    // amounts are exact integers (the reconciliation surface)
    const sumCents = period.billingLineItems.reduce((acc, li) => acc + li.amountCents, 0);
    expect(sumCents).toBe(139112);
    // quantity keeps full precision (not rounded to cents)
    const peak = period.billingLineItems.find((li) => li.label === "Peak");
    expect(peak?.quantity).toBeCloseTo(1234.567891, 6);

    // coverageState defaults to no_bill on both Meter and Account (FR-6)
    expect(pump.coverageState).toBe("no_bill");
    const account = await prisma.account.create({ data: { farmId: farm.id, number: "AC-1" } });
    expect(account.coverageState).toBe("no_bill");

    // line items cascade-delete with their period
    await prisma.billingPeriod.delete({ where: { id: period.id } });
    expect(
      await prisma.billingLineItem.count({ where: { billingPeriodId: period.id } }),
    ).toBe(0);
  });
});
