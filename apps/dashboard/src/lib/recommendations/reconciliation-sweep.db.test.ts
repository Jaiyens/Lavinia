import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadRateCard } from "@/lib/pge/rate-card";
import { priceCycleCents } from "@/lib/energy/rates";
import { runReconciliationSweep } from "./reconciliation-sweep";

// Integration test for the reconciliation sweep core (the verification harness). It
// reconciles every reconciled, non-solar meter on a farm and never writes anything.
// Throwaway Postgres; never dev.db. seedSampleFarm seeds no bills, so this builds its
// own billed meters: a PASS meter whose printed total equals the card recompute
// exactly (deviation 0), a FAIL meter that straddles the 2026-03-01 rate change with
// a far-off printed total (cause: rate_change_straddle), a SOLAR meter (must be
// excluded), and an UNMAPPED-schedule meter (testable: false).

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let passPumpId: string;
let solarPumpId: string;

const card = loadRateCard();

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Reconcile Farm", isDemo: false } });
  farmId = farm.id;

  const ag5Small = card.plans.find((p) => p.family === "AG-5" && p.sizeClass === "small");
  if (!ag5Small) throw new Error("card is missing the AG-5 small plan");

  // PASS: a winter cycle whose printed total is EXACTLY the card recompute -> deviation 0.
  const passPrinted = priceCycleCents(
    { days: 30, season: "winter", energyKwh: { peak: 20, off_peak: 300 }, maxDemandKw: 4 },
    ag5Small,
  ).totalCents;
  const passPump = await prisma.pump.create({
    data: { name: "P-PASS", serviceId: "SA-PASS", rateSchedule: "AG5C", coverageState: "reconciled", farmId },
  });
  passPumpId = passPump.id;
  await prisma.billingPeriod.create({
    data: {
      pumpId: passPumpId,
      start: new Date("2026-01-01T00:00:00.000Z"),
      close: new Date("2026-01-30T00:00:00.000Z"),
      printedTotalCents: passPrinted,
      billingLineItems: {
        create: [
          { kind: "tou_energy", label: "Peak", amountCents: 0, quantity: 20, unit: "kWh" },
          { kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: 300, unit: "kWh" },
          { kind: "other", label: "Max Demand 01/01-01/30 4.000000 kW @ $14.90000", amountCents: 0 },
        ],
      },
    },
  });

  // FAIL: a cycle straddling 2026-03-01 with a far-off printed total -> fails the band,
  // and the straddle is the documented systematic cause.
  const failPump = await prisma.pump.create({
    data: { name: "P-FAIL", serviceId: "SA-FAIL", rateSchedule: "AG5C", coverageState: "reconciled", farmId },
  });
  await prisma.billingPeriod.create({
    data: {
      pumpId: failPump.id,
      start: new Date("2026-02-15T00:00:00.000Z"),
      close: new Date("2026-03-20T00:00:00.000Z"),
      printedTotalCents: 9_999_999, // far from any real recompute -> guaranteed off-band
      billingLineItems: {
        create: [{ kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: 300, unit: "kWh" }],
      },
    },
  });

  // SOLAR: reconciled but solar -> must be excluded from the sweep entirely.
  const solarPump = await prisma.pump.create({
    data: {
      name: "P-SOLAR",
      serviceId: "SA-SOLAR",
      rateSchedule: "AG5C",
      coverageState: "reconciled",
      isSolar: true,
      farmId,
    },
  });
  solarPumpId = solarPump.id;
  await prisma.billingPeriod.create({
    data: {
      pumpId: solarPumpId,
      start: new Date("2026-01-01T00:00:00.000Z"),
      close: new Date("2026-01-30T00:00:00.000Z"),
      printedTotalCents: passPrinted,
      billingLineItems: {
        create: [{ kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: 300, unit: "kWh" }],
      },
    },
  });

  // UNMAPPED: a non-ag schedule the AG card cannot price -> testable: false (no plan).
  const unmappedPump = await prisma.pump.create({
    data: { name: "P-UNMAPPED", serviceId: "SA-UNMAPPED", rateSchedule: "B1", coverageState: "reconciled", farmId },
  });
  await prisma.billingPeriod.create({
    data: {
      pumpId: unmappedPump.id,
      start: new Date("2026-06-01T00:00:00.000Z"),
      close: new Date("2026-06-30T00:00:00.000Z"),
      printedTotalCents: 50_000,
      billingLineItems: {
        create: [{ kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: 300, unit: "kWh" }],
      },
    },
  });
});

afterAll(async () => {
  await db?.cleanup();
});

describe("runReconciliationSweep", () => {
  it("reconciles every billed non-solar meter and excludes solar", async () => {
    const report = await runReconciliationSweep(prisma, { farmId });

    // pass + fail + unmapped are billed non-solar; the solar meter is excluded.
    expect(report.meterCount).toBe(3);
    expect(report.records.map((r) => r.meterName).sort()).toEqual(["P-FAIL", "P-PASS", "P-UNMAPPED"]);
    expect(report.records.some((r) => r.meterName === "P-SOLAR")).toBe(false);

    // Only the two AG5C meters are testable; the unmapped schedule yields no plan.
    expect(report.testableCount).toBe(2);
    expect(report.notTestableCount).toBe(1);

    // The report carries the rate-card version it priced against.
    expect(report.rateCardVersion).toBe(card.version ?? null);
    expect(report.cardEffectiveDate).toBe(card.effectiveDate);
  });

  it("passes the exact-match meter and fails the straddle meter with the right cause", async () => {
    const report = await runReconciliationSweep(prisma, { farmId });

    const pass = report.records.find((r) => r.meterName === "P-PASS");
    expect(pass?.pass).toBe(true);
    expect(pass?.pctError ?? 1).toBeCloseTo(0, 6);
    expect(pass?.cause).toBe("unknown");
    expect(pass?.computedCents).toBe(pass?.realCents);

    expect(report.passCount).toBe(1);
    expect(report.failures).toHaveLength(1);
    const fail = report.failures[0];
    expect(fail?.meterName).toBe("P-FAIL");
    expect(fail?.pass).toBe(false);
    expect(fail?.cause).toBe("rate_change_straddle");
    expect(report.passRate).toBeCloseTo(0.5, 6);
  });

  it("reports pass-rate at several bands, monotonic non-decreasing in the band", async () => {
    const report = await runReconciliationSweep(prisma, { farmId, thresholds: [1, 2, 3, 4, 5, 6] });
    const rates = report.passRateByThreshold;
    expect(rates.map((r) => r.bandPct)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!.passRate).toBeGreaterThanOrEqual(rates[i - 1]!.passRate);
    }
  });

  it("honors a tightened tolerance via the tolerance option", async () => {
    // The exact-match meter passes at any positive band; the straddle meter fails at all.
    const tight = await runReconciliationSweep(prisma, { farmId, tolerance: 1 });
    expect(tight.passCount).toBe(1);
    expect(tight.failures).toHaveLength(1);
  });

  it("writes nothing to the database (read-only harness)", async () => {
    const before = await prisma.recommendation.count({ where: { farmId } });
    await runReconciliationSweep(prisma, { farmId });
    const after = await prisma.recommendation.count({ where: { farmId } });
    expect(after).toBe(before);
  });
});
