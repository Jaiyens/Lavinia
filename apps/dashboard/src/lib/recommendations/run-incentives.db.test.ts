import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { runIncentives, INCENTIVE_TOOL } from "./run-incentives";

// Integration test for the incentive runner: persists honest-blank, display-only 'rebate'
// findings idempotently, tool-scoped, with the resolved-finding dedupe. Throwaway Postgres
// (never dev/Neon). Proves NO dollar is ever written and another tool's recs survive the
// tool-scoped clear.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let agcPumpId: string;
let solarPumpId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Incentive Farm", isDemo: false } });
  farmId = farm.id;

  // A bare AG-C meter, no solar, no DR printed: matches the three curtailment programs.
  const agc = await prisma.pump.create({
    data: {
      name: "P031",
      serviceId: "SA-AGC",
      rateSchedule: "AGC Ag35+ kW High Use",
      isSolar: false,
      coverageState: "reconciled",
      farmId,
    },
  });
  agcPumpId = agc.id;
  await prisma.billingPeriod.create({
    data: {
      pumpId: agcPumpId,
      start: new Date("2026-02-11T00:00:00.000Z"),
      close: new Date("2026-03-12T00:00:00.000Z"),
      printedTotalCents: 4550,
      billingLineItems: {
        create: [
          { kind: "demand", label: "Max Demand 244.32 kW @$26.03", amountCents: 250, quantity: 244.32, unit: "kW" },
          { kind: "other", label: "Customer Charge 30 days @ $1.43343", amountCents: 4300 },
        ],
      },
    },
  });

  // A SOLAR AG-C meter whose bill ALREADY prints a PDP enrollment (dr.ts owns that program):
  // it gets SGIP + CBP + BIP, but NOT PDP (the dr.ts de-dupe).
  const solar = await prisma.pump.create({
    data: {
      name: "P041",
      serviceId: "SA-SOLAR",
      rateSchedule: "AGC Ag35+ kW High Use",
      isSolar: true,
      coverageState: "reconciled",
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
          { kind: "other", label: "PDP Event Day Credit 06/12", amountCents: -200 },
          { kind: "other", label: "Customer Charge 30 days @ $1.43343", amountCents: 4300 },
        ],
      },
    },
  });

  // An AG-A meter, no solar: matches nothing (silent).
  await prisma.pump.create({
    data: {
      name: "P018",
      serviceId: "SA-AGA",
      rateSchedule: "AGA1 Ag<35 kW Low Use",
      isSolar: false,
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

describe("runIncentives", () => {
  it("persists honest-blank matches with NO dollar, and de-dupes the printed DR enrollment", async () => {
    const result = await runIncentives(prisma, farmId, "2026-06-09T12:00:00.000Z");
    // P031 (AG-C bare): pdp, cbp, bip = 3. P041 (AG-C solar, PDP printed): cbp, bip, sgip = 3.
    expect(result.created).toBe(6);

    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: INCENTIVE_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(6);
    for (const rec of recs) {
      expect(rec.severity).toBe("watch");
      expect(rec.impactUsd).toBeNull(); // a rebate value is never invented
      expect(rec.impactNote).not.toMatch(/\$\s*\d/);
      const action = rec.action as { kind: string; params?: { pumpId?: string; programId?: string }; execute?: unknown };
      expect(action.kind).toBe("review_incentive");
    }

    const byPump = (pumpId: string) =>
      recs
        .map((r) => r.action as { params?: { pumpId?: string; programId?: string } })
        .filter((a) => a.params?.pumpId === pumpId)
        .map((a) => a.params?.programId)
        .sort();
    expect(byPump(agcPumpId)).toEqual(["pge-bip", "pge-cbp", "pge-pdp"]);
    // The solar meter never re-flags the PDP it already prints (dr.ts overlap).
    expect(byPump(solarPumpId)).toEqual(["ca-sgip", "pge-bip", "pge-cbp"]);
    expect(byPump(solarPumpId)).not.toContain("pge-pdp");
  });

  it("is idempotent and tool-scoped", async () => {
    await runIncentives(prisma, farmId, "2026-06-09T12:00:00.000Z");
    await runIncentives(prisma, farmId, "2026-06-09T12:00:00.000Z");
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: INCENTIVE_TOOL, status: "pending" } }),
    ).toBe(6);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: "rate-optimization" } }),
    ).toBe(1);
  });

  it("never resurrects a dismissed match (sticky dedupe on programId + pumpId)", async () => {
    // Dismiss exactly the P031 PDP match.
    const all = await prisma.recommendation.findMany({
      where: { farmId, tool: INCENTIVE_TOOL, status: "pending" },
    });
    const target = all.find((r) => {
      const a = r.action as { params?: { pumpId?: string; programId?: string } };
      return a.params?.pumpId === agcPumpId && a.params?.programId === "pge-pdp";
    });
    if (!target) throw new Error("expected the P031 PDP match");
    await prisma.recommendation.update({
      where: { id: target.id },
      data: { status: "dismissed", resolvedAt: new Date() },
    });

    const result = await runIncentives(prisma, farmId, "2026-06-09T12:00:00.000Z");
    // One fewer than before: the dismissed P031/pge-pdp match stays gone.
    expect(result.created).toBe(5);
    const stillPending = await prisma.recommendation.findMany({
      where: { farmId, tool: INCENTIVE_TOOL, status: "pending" },
    });
    const pdpForP031 = stillPending.find((r) => {
      const a = r.action as { params?: { pumpId?: string; programId?: string } };
      return a.params?.pumpId === agcPumpId && a.params?.programId === "pge-pdp";
    });
    expect(pdpForP031).toBeUndefined();
  });

  it("is tenant-scoped: another farm's meters never bleed in", async () => {
    const other = await prisma.farm.create({ data: { name: "Other Farm", isDemo: false } });
    await prisma.pump.create({
      data: {
        name: "X1",
        rateSchedule: "AGC Ag35+ kW High Use",
        isSolar: false,
        coverageState: "reconciled",
        farmId: other.id,
      },
    });
    const result = await runIncentives(prisma, other.id, "2026-06-09T12:00:00.000Z");
    expect(result.created).toBe(3); // only the other farm's one AG-C meter
    expect(
      await prisma.recommendation.count({ where: { farmId: other.id, tool: INCENTIVE_TOOL } }),
    ).toBe(3);
    // The original farm's pending set is untouched by the other farm's run.
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: INCENTIVE_TOOL, status: "pending" } }),
    ).toBe(5);
  });
});
