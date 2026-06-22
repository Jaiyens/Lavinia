import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { SOLAR_TOOL } from "@/lib/energy/solar-nem";
import {
  runSolarWatchForFarm,
  SOLAR_WATCH_TOOL,
  INVESTIGATE_ARRAY_KIND,
  FLAG_UNDERPERFORMANCE_KIND,
} from "./run";

// Integration test for the solar-watch agent against a throwaway Postgres database on the local
// test cluster (never Neon). Proves the collision guard (writes only under SOLAR_WATCH_TOOL,
// never SOLAR_TOOL), the honest silence (< 6 months, healthy array), the flag path (a finding +
// an audit action), idempotency, and that a resolved finding is not resurrected.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

/** A non-demo farm with one solar-paired meter. */
async function makeSolarFarm(opts?: { isDemo?: boolean }): Promise<{ farmId: string; pumpId: string }> {
  const farm = await prisma.farm.create({
    data: { name: "Solar Farm", isDemo: opts?.isDemo ?? false },
  });
  const pump = await prisma.pump.create({
    data: { name: "South Array Meter", farmId: farm.id, solarKw: 840, nemType: "nem2" },
  });
  return { farmId: farm.id, pumpId: pump.id };
}

/** Seed N net-export months. exportKwh is a positive magnitude (stored as negative netKwh). */
async function seedExport(pumpId: string, months: { month: string; exportKwh: number }[]): Promise<void> {
  for (const m of months) {
    await prisma.nemPeriod.create({
      data: {
        pumpId,
        start: new Date(`${m.month}-01T00:00:00.000Z`),
        close: new Date(`${m.month}-28T00:00:00.000Z`),
        netKwh: -m.exportKwh,
        amountCents: -100,
      },
    });
  }
}

/** Two years, the later year a flat `laterKwh` against `priorKwh` (a sustained shortfall). */
function twoYearDecline(priorKwh: number, laterKwh: number): { month: string; exportKwh: number }[] {
  const out: { month: string; exportKwh: number }[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const mm = String(i).padStart(2, "0");
    out.push({ month: `2024-${mm}`, exportKwh: priorKwh });
    out.push({ month: `2025-${mm}`, exportKwh: laterKwh });
  }
  return out;
}

describe("solar-watch agent", () => {
  it("skips a demo farm entirely (no run opened): runEngines owns demo solar", async () => {
    const { farmId, pumpId } = await makeSolarFarm({ isDemo: true });
    await seedExport(pumpId, twoYearDecline(1000, 750)); // would flag if not demo
    await runSolarWatchForFarm(prisma, farmId);
    expect(await prisma.agentRun.count({ where: { farmId } })).toBe(0);
    expect(await prisma.recommendation.count({ where: { farmId } })).toBe(0);
  });

  it("is silent (no finding) on a healthy array but still records a succeeded run", async () => {
    const { farmId, pumpId } = await makeSolarFarm();
    await seedExport(pumpId, twoYearDecline(1000, 1000)); // flat year over year = healthy
    await runSolarWatchForFarm(prisma, farmId);

    const runs = await prisma.agentRun.findMany({ where: { farmId, kind: "solar_watch" } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("succeeded");
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: SOLAR_WATCH_TOOL } }),
    ).toBe(0);
    expect(await prisma.agentAction.count({ where: { farmId } })).toBe(0);
  });

  it("is silent below 6 months of export evidence (never fabricates)", async () => {
    const { farmId, pumpId } = await makeSolarFarm();
    await seedExport(pumpId, [
      { month: "2024-07", exportKwh: 1000 },
      { month: "2025-07", exportKwh: 500 }, // a big drop but only one pair, < 6 months
    ]);
    await runSolarWatchForFarm(prisma, farmId);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: SOLAR_WATCH_TOOL } }),
    ).toBe(0);
  });

  it("flags a sustained shortfall under SOLAR_WATCH_TOOL with an audit action, never SOLAR_TOOL", async () => {
    const { farmId, pumpId } = await makeSolarFarm();
    await seedExport(pumpId, twoYearDecline(1000, 780)); // 22% down across the season
    await runSolarWatchForFarm(prisma, farmId);

    // The finding is under OUR key, severity "watch", carries NO impactUsd (a proxy, not a dollar).
    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: SOLAR_WATCH_TOOL },
    });
    expect(recs).toHaveLength(1);
    const rec = recs[0]!;
    expect(rec.severity).toBe("watch");
    expect(rec.status).toBe("pending");
    expect(rec.impactUsd).toBeNull();
    const action = rec.action as { kind: string; params: { pumpId: string } };
    expect(action.kind).toBe(INVESTIGATE_ARRAY_KIND);
    expect(action.params.pumpId).toBe(pumpId);

    // COLLISION GUARD: it wrote ZERO rows under runEngines' SOLAR_TOOL key.
    expect(await prisma.recommendation.count({ where: { farmId, tool: SOLAR_TOOL } })).toBe(0);

    // One audit action, kind flag_underperformance, linked to the finding (no approval gate:
    // the action stays in its recorded "proposed" audit state, it is not an approval ask).
    const actions = await prisma.agentAction.findMany({ where: { farmId } });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe(FLAG_UNDERPERFORMANCE_KIND);
    expect(actions[0]!.recommendationId).toBe(rec.id);
  });

  it("is idempotent: a second run replaces the pending finding, never duplicates", async () => {
    const { farmId, pumpId } = await makeSolarFarm();
    await seedExport(pumpId, twoYearDecline(1000, 780));
    await runSolarWatchForFarm(prisma, farmId);
    await runSolarWatchForFarm(prisma, farmId);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: SOLAR_WATCH_TOOL } }),
    ).toBe(1);
    // Two runs recorded (monthly cadence skip lives in the dispatcher, not here).
    expect(await prisma.agentRun.count({ where: { farmId, kind: "solar_watch" } })).toBe(2);
  });

  it("does not resurrect a finding the grower already resolved", async () => {
    const { farmId, pumpId } = await makeSolarFarm();
    await seedExport(pumpId, twoYearDecline(1000, 780));
    await runSolarWatchForFarm(prisma, farmId);

    // Grower dismisses the finding.
    const rec = await prisma.recommendation.findFirstOrThrow({
      where: { farmId, tool: SOLAR_WATCH_TOOL },
    });
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { status: "dismissed", resolvedAt: new Date() },
    });

    // A re-run must NOT create a fresh pending finding for the same meter.
    await runSolarWatchForFarm(prisma, farmId);
    expect(
      await prisma.recommendation.count({
        where: { farmId, tool: SOLAR_WATCH_TOOL, status: "pending" },
      }),
    ).toBe(0);
  });

  it("does not touch a runEngines SOLAR_TOOL finding on the same farm", async () => {
    const { farmId, pumpId } = await makeSolarFarm();
    // Simulate runEngines having persisted a solar finding on this farm.
    const engineRec = await prisma.recommendation.create({
      data: {
        farmId,
        tool: SOLAR_TOOL,
        situation: "Solar does not cover the demand charge",
        action: { kind: "review_solar_demand", label: "Review it" },
        severity: "info",
        status: "pending",
      },
    });
    await seedExport(pumpId, twoYearDecline(1000, 780));
    await runSolarWatchForFarm(prisma, farmId);

    // The runEngines row is untouched.
    const stillThere = await prisma.recommendation.findUnique({ where: { id: engineRec.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.status).toBe("pending");
    expect(stillThere!.tool).toBe(SOLAR_TOOL);
  });
});
