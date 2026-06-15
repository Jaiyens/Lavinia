import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { SOLAR_TOOL } from "@/lib/energy/solar-nem";
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
