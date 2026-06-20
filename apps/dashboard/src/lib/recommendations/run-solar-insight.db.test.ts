import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { SOLAR_TOOL } from "@/lib/energy/solar-nem";
import { runEngines } from "./run";
import { runSolarInsight } from "./run-solar-insight";

// Integration test for the solar-insight runner (Story 3.4): persists the gated
// NEM demand insight idempotently under the solar tool. Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let solarPumpId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Solar Farm", isDemo: false } });
  farmId = farm.id;

  // A reconciled NEM solar meter on AG-C with billed demand + persisted months:
  // every gate passes -> one insight.
  const solar = await prisma.pump.create({
    data: {
      name: "P041",
      serviceId: "SA-SOLAR",
      rateSchedule: "AGC Ag35+ kW High Use",
      isSolar: true,
      coverageState: "reconciled",
      trueUpAmountCents: 290,
      farmId,
    },
  });
  solarPumpId = solar.id;
  await prisma.billingPeriod.create({
    data: {
      pumpId: solarPumpId,
      start: new Date("2026-02-11T00:00:00.000Z"),
      close: new Date("2026-03-12T00:00:00.000Z"),
      printedTotalCents: 4550,
      billingLineItems: {
        create: [
          { kind: "demand", label: null, amountCents: 250, quantity: 0.16, unit: "kW" },
          { kind: "other", label: "Customer Charge 30 days @ $1.43343", amountCents: 4300 },
        ],
      },
    },
  });
  await prisma.nemPeriod.createMany({
    data: [
      { pumpId: solarPumpId, start: new Date("2025-12-01T00:00:00.000Z"), close: new Date("2025-12-31T00:00:00.000Z"), netKwh: -5, amountCents: -80 },
      { pumpId: solarPumpId, start: new Date("2026-01-01T00:00:00.000Z"), close: new Date("2026-01-31T00:00:00.000Z"), netKwh: 14, amountCents: 240 },
      { pumpId: solarPumpId, start: new Date("2026-02-01T00:00:00.000Z"), close: new Date("2026-02-28T00:00:00.000Z"), netKwh: 3, amountCents: 50 },
    ],
  });

  // A solar AG-C meter that is NOT reconciled: must stay silent.
  const unreconciled = await prisma.pump.create({
    data: {
      name: "P038",
      serviceId: "SA-UNREC",
      rateSchedule: "AGC Ag35+ kW High Use",
      isSolar: true,
      coverageState: "needs_review",
      farmId,
    },
  });
  await prisma.nemPeriod.create({
    data: { pumpId: unreconciled.id, start: new Date("2026-01-01T00:00:00.000Z"), close: new Date("2026-01-31T00:00:00.000Z"), netKwh: 100, amountCents: 1600 },
  });

  // A reconciled solar meter on AG-A (no demand-carrying schedule): silent.
  await prisma.pump.create({
    data: {
      name: "P018",
      serviceId: "SA-AGA",
      rateSchedule: "AGA1 Ag<35 kW Low Use",
      isSolar: true,
      coverageState: "reconciled",
      farmId,
    },
  });

  // Another tool's pending rec must survive the runner's tool-scoped clear.
  await prisma.recommendation.create({
    data: {
      farmId,
      tool: "rate-optimization",
      situation: "Other tool's finding",
      action: { kind: "switch_rate", label: "Move it" },
      severity: "act",
      status: "pending",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
  });
});

afterAll(async () => {
  await db?.cleanup();
});

describe("runSolarInsight", () => {
  it("persists the gated insight with the dollar in the note, never in impactUsd", async () => {
    const result = await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(1);

    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: SOLAR_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(1);
    const rec = recs[0];
    if (!rec) throw new Error("expected a rec");
    expect(rec.severity).toBe("info");
    expect(rec.impactUsd).toBeNull(); // demand owed is not money at stake
    expect(rec.impactNote).toContain("demand charge");
    expect(rec.impactNote).toContain("$3"); // ~$2.50 rendered whole-dollar
    expect(rec.situation).toContain("between 5 and 8");
    expect(rec.situation).not.toContain("between 4 and 9"); // never the DR window
    const action = rec.action as { kind: string; params?: { pumpId?: string; position?: string } };
    expect(action.kind).toBe("review_solar_demand");
    expect(action.params?.pumpId).toBe(solarPumpId);
    expect(action.params?.position).toBe("net_zero");
  });

  it("is idempotent and tool-scoped", async () => {
    await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(1);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: "rate-optimization" } }),
    ).toBe(1);
  });

  it("never resurrects a dismissed insight", async () => {
    await prisma.recommendation.updateMany({
      where: { farmId, tool: SOLAR_TOOL, status: "pending" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    const result = await runSolarInsight(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(0);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: SOLAR_TOOL, status: "pending" } }),
    ).toBe(0);
  });
});

// Story B-1: engine reconciliation (ADR-S05). Exactly one engine owns SOLAR_TOOL per
// farm. For a real farm runEngines must NOT touch SOLAR_TOOL (no clear, no insert):
// runSolarInsight is the sole owner. For a demo/seed farm the legacy solarNemChecks
// branch inside runEngines still owns the key so the Tour/seed solar finding survives.
describe("SOLAR_TOOL ownership reconciliation (B-1)", () => {
  it("runEngines emits zero SOLAR_TOOL rows on a real farm; runSolarInsight is the sole owner; no duplicates", async () => {
    const realFarm = await prisma.farm.create({
      data: { name: "Real Solar Farm", isDemo: false },
    });
    const realFarmId = realFarm.id;

    // A reconciled NEM solar meter on AG-C with billed demand + persisted months:
    // every nemDemandInsight gate passes, so runSolarInsight emits one SOLAR_TOOL row.
    // Its solarKw is set, so the LEGACY solarNemChecks branch in runEngines WOULD have
    // fired here too (a true-up note) before B-1 - the no-duplicate proof.
    const solar = await prisma.pump.create({
      data: {
        name: "P101",
        serviceId: "SA-REAL-SOLAR",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 840,
        nemType: "nem2",
        trueUpMonth: 4,
        coverageState: "reconciled",
        trueUpAmountCents: 290,
        farmId: realFarmId,
      },
    });
    await prisma.billingPeriod.create({
      data: {
        pumpId: solar.id,
        start: new Date("2026-02-11T00:00:00.000Z"),
        close: new Date("2026-03-12T00:00:00.000Z"),
        printedTotalCents: 4550,
        billingLineItems: {
          create: [
            { kind: "demand", label: null, amountCents: 250, quantity: 0.16, unit: "kW" },
            { kind: "other", label: "Customer Charge", amountCents: 4300 },
          ],
        },
      },
    });
    await prisma.nemPeriod.createMany({
      data: [
        { pumpId: solar.id, start: new Date("2025-12-01T00:00:00.000Z"), close: new Date("2025-12-31T00:00:00.000Z"), netKwh: -5, amountCents: -80 },
        { pumpId: solar.id, start: new Date("2026-01-01T00:00:00.000Z"), close: new Date("2026-01-31T00:00:00.000Z"), netKwh: 14, amountCents: 240 },
        { pumpId: solar.id, start: new Date("2026-02-01T00:00:00.000Z"), close: new Date("2026-02-28T00:00:00.000Z"), netKwh: 3, amountCents: 50 },
      ],
    });

    // runEngines first (the onboarding finalize order), then runSolarInsight.
    await runEngines(prisma, realFarmId);
    const afterEngines = await prisma.recommendation.count({
      where: { farmId: realFarmId, tool: SOLAR_TOOL },
    });
    expect(afterEngines).toBe(0); // runEngines never touches SOLAR_TOOL on a real farm

    const solarResult = await runSolarInsight(prisma, realFarmId);
    expect(solarResult.created).toBe(1);

    const solarRows = await prisma.recommendation.findMany({
      where: { farmId: realFarmId, tool: SOLAR_TOOL },
    });
    // Exactly one SOLAR_TOOL row, from runSolarInsight, never doubled by the legacy path.
    expect(solarRows).toHaveLength(1);
    const row = solarRows[0];
    if (!row) throw new Error("expected a solar row");
    const action = row.action as { kind?: string };
    expect(action.kind).toBe("review_solar_demand"); // the canonical emitter, not legacy track_trueup

    // A re-run of runEngines must still not insert or clobber the SOLAR_TOOL row.
    await runEngines(prisma, realFarmId);
    expect(
      await prisma.recommendation.count({ where: { farmId: realFarmId, tool: SOLAR_TOOL } }),
    ).toBe(1);
  });

  it("a demo/seed farm still produces a Tour solar finding from the legacy path", async () => {
    const demoFarm = await prisma.farm.create({
      data: { name: "Demo Solar Farm", isDemo: true },
    });
    const demoFarmId = demoFarm.id;

    // A solar meter with a NEM type + true-up month: the legacy solarNemChecks
    // track_trueup branch fires (no intervals/demand peak needed).
    await prisma.pump.create({
      data: {
        name: "DEMO-P1",
        serviceId: "SA-DEMO-SOLAR",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: true,
        solarKw: 1092,
        nemType: "nem2",
        trueUpMonth: 9,
        farmId: demoFarmId,
      },
    });

    await runEngines(prisma, demoFarmId);
    const demoSolar = await prisma.recommendation.findMany({
      where: { farmId: demoFarmId, tool: SOLAR_TOOL },
    });
    expect(demoSolar.length).toBeGreaterThan(0); // the seed/Tour solar finding survives
    const kinds = demoSolar.map((r) => (r.action as { kind?: string }).kind);
    expect(kinds).toContain("track_trueup"); // the legacy emitter still owns SOLAR_TOOL here
  });
});
