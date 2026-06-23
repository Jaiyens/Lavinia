import type { PrismaClient } from "@prisma/client";
import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadFindings } from "@/lib/dashboard/findings";
import { runEngines } from "@/lib/recommendations/run";
import { seedBatthFarm } from "../../../prisma/batth-farm";
import { analyzeFarm, type FarmAnalysis } from "./analysis";
import { rankMeters, rankByEntity, summarizeRanking } from "./shape";
import {
  composeStubAnswer,
  createStubResponder,
  deriveOpenSuperlativeRank,
  isOpenSuperlativeTurn,
} from "./responder";

// The ranking core of the queryMeters tool (Almond hardening T2). Two layers of proof:
//   1. A fast PURE test over a built MeterView[]+FindingView[] fixture (no DB): top N by cost is
//      strictly descending with Westside Pump 17 first, "open priciest" (limit 1, cost desc) is
//      Westside Pump 17, and groupBy entity agrees with analysis.byEntity.
//   2. A DB integration test over the REAL Batth seed (the strongest proof): the same ranking over
//      the actual seed numbers (.night/GROUND-TRUTH.md) - top 5 by cost and the limit-1 "open
//      priciest" both lead with Westside Pump 17. Throwaway Postgres; never dev/prod.

// --- Pure fixture (mirrors analysis.test.ts's builders) -----------------------------------------

function makeMeter(over: Partial<MeterView> = {}): MeterView {
  const base: MeterView = {
    id: "m1",
    name: "Pump 1",
    serviceId: "SA-1",
    rateSchedule: "AG-A1",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: "reconciled" as MeterView["coverageState"],
    accountNumber: "1001",
    ranchName: "North Ranch",
    entityName: "Batth LLC",
    cropName: "Almonds",
    latitude: null,
    longitude: null,
    gpm: null,
    isSolar: false,
    nemType: null,
    trueUpMonth: null,
    trueUpAmountCents: null,
    trueUpDate: null,
    solarKw: null,
    benefitingArrays: [],
    nemPeriods: [],
    growerPumpId: null,
    periods: [],
  };
  return { ...base, ...over };
}

function period(
  over: Partial<MeterView["periods"][number]> = {},
): MeterView["periods"][number] {
  const base: MeterView["periods"][number] = {
    start: "2026-03-01",
    close: "2026-03-31",
    printedTotalCents: null,
    demandCents: null,
    peakKw: null,
    tariff: null,
    lineItems: [],
  };
  return { ...base, ...over };
}

function finding(over: Partial<FindingView> = {}): FindingView {
  return {
    id: over.id ?? "f1",
    tool: over.tool ?? "rate-optimization",
    situation: over.situation ?? "This meter looks mis-rated",
    actionLabel: "actionLabel" in over ? (over.actionLabel ?? null) : "Move it to AG-C",
    impactUsd: "impactUsd" in over ? (over.impactUsd ?? null) : 4_322,
    impactNote: "impactNote" in over ? (over.impactNote ?? null) : null,
    severity: over.severity ?? "act",
    status: over.status ?? "pending",
    meterId: "meterId" in over ? (over.meterId ?? null) : "m1",
    meterName: "meterName" in over ? (over.meterName ?? null) : null,
    rateSwitchTo: "rateSwitchTo" in over ? (over.rateSwitchTo ?? null) : "AG-C",
    rateSwitchFrom: "rateSwitchFrom" in over ? (over.rateSwitchFrom ?? null) : "AG-B",
    resultNote: over.resultNote ?? null,
  };
}

// Six meters across two entities, with a clean cost ordering so a top-5 by cost is unambiguous and
// Westside Pump 17 is the priciest. Entity A (Batth LLC): Westside Pump 17 (priciest), Pump C, Pump E.
// Entity B (Westside Holdings): Pump B, Pump D, Pump F (no bill, ranks last by cost).
const meters: MeterView[] = [
  makeMeter({
    id: "west17",
    name: "Westside Pump 17",
    entityName: "Batth LLC",
    ranchName: "Westside",
    rateSchedule: "AG-B",
    periods: [period({ printedTotalCents: 17_000_00, demandCents: 900_00 })],
  }),
  makeMeter({
    id: "c",
    name: "Pump C",
    entityName: "Batth LLC",
    rateSchedule: "AG-C",
    periods: [period({ printedTotalCents: 9_000_00, demandCents: 100_00 })],
  }),
  makeMeter({
    id: "b",
    name: "Pump B",
    entityName: "Westside Holdings",
    rateSchedule: "AG-C",
    periods: [period({ printedTotalCents: 7_000_00, demandCents: 4_000_00 })],
  }),
  makeMeter({
    id: "d",
    name: "Pump D",
    entityName: "Westside Holdings",
    rateSchedule: "AG-C",
    periods: [period({ printedTotalCents: 5_000_00, demandCents: 200_00 })],
  }),
  makeMeter({
    id: "e",
    name: "Pump E",
    entityName: "Batth LLC",
    rateSchedule: "AG-C",
    periods: [period({ printedTotalCents: 3_000_00, demandCents: null })],
  }),
  makeMeter({
    id: "f",
    name: "Pump F",
    entityName: "Westside Holdings",
    coverageState: "no_bill" as MeterView["coverageState"],
    periods: [],
  }),
];

const findings: FindingView[] = [
  // Westside Pump 17: the biggest rate-switch savings (AG-B -> AG-C), like the real seed.
  finding({ id: "f-west", meterId: "west17", impactUsd: 61_417, rateSwitchTo: "AG-C", rateSwitchFrom: "AG-B" }),
  // Pump C: a smaller rate-switch savings.
  finding({ id: "f-c", meterId: "c", impactUsd: 6_825, rateSwitchTo: "AG-B", rateSwitchFrom: "AG-C" }),
  // Pump D: the smallest rate-switch savings.
  finding({ id: "f-d", meterId: "d", impactUsd: 993, rateSwitchTo: "AG-B", rateSwitchFrom: "AG-C" }),
];

function fixtureAnalysis(): FarmAnalysis {
  return analyzeFarm(meters, findings);
}

function isStrictlyDescending(values: number[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? 0) >= (values[i - 1] ?? 0)) return false;
  }
  return true;
}

describe("rankMeters (pure)", () => {
  it("Top 5 by cost: 5 rows, strictly descending, Westside Pump 17 first", () => {
    const top5 = rankMeters(fixtureAnalysis(), { sortBy: "cost", limit: 5 });
    expect(top5).toHaveLength(5);
    expect(top5[0]?.name).toBe("Westside Pump 17");
    const costs = top5.map((m) => m.thisCycleCents ?? 0);
    expect(isStrictlyDescending(costs)).toBe(true);
    // The no-bill Pump F (null cost) sorts last and is excluded from the top 5.
    expect(top5.map((m) => m.name)).not.toContain("Pump F");
  });

  it("Open priciest: the limit-1 cost-desc result is Westside Pump 17", () => {
    const winner = rankMeters(fixtureAnalysis(), { sortBy: "cost", order: "desc", limit: 1 });
    expect(winner).toHaveLength(1);
    expect(winner[0]?.name).toBe("Westside Pump 17");
  });

  it("order asc returns the least-expensive first, null cost still last", () => {
    const asc = rankMeters(fixtureAnalysis(), { sortBy: "cost", order: "asc" });
    // Pump F has no bill (null), so it sorts LAST even ascending (unknown is never the least).
    expect(asc[asc.length - 1]?.name).toBe("Pump F");
    expect(asc[0]?.name).toBe("Pump E"); // $3,000, the cheapest with a bill
  });

  it("savings rank is the mis-rated opportunities, biggest saving first (Westside Pump 17)", () => {
    const bySavings = rankMeters(fixtureAnalysis(), { sortBy: "savings" });
    // Only the three rate-switch meters are opportunities; Pump B/E/F (no switch) are excluded.
    expect(bySavings.map((m) => m.name)).toEqual(["Westside Pump 17", "Pump C", "Pump D"]);
    const savings = bySavings.map((m) => m.flags.estAnnualSavingsCents);
    expect(isStrictlyDescending(savings)).toBe(true);
  });

  it("demand rank leads with the biggest demand charge (Pump B)", () => {
    const byDemand = rankMeters(fixtureAnalysis(), { sortBy: "demand", limit: 1 });
    expect(byDemand[0]?.name).toBe("Pump B");
  });

  it("filterEntity narrows to one company before ranking", () => {
    const batth = rankMeters(fixtureAnalysis(), { sortBy: "cost", filterEntity: "Batth" });
    expect(batth.map((m) => m.name)).toEqual(["Westside Pump 17", "Pump C", "Pump E"]);
  });

  it("groupBy entity rollups are consistent with analysis.byEntity (cost)", () => {
    const a = fixtureAnalysis();
    const rollups = rankByEntity(a, { sortBy: "cost" });
    // The per-entity cost rollup must equal analysis.byEntity's spendCents for each entity.
    for (const row of rollups) {
      const fromAnalysis = a.byEntity.find((e) => e.entity === row.entity);
      expect(fromAnalysis).toBeDefined();
      expect(row.totalCents).toBe(fromAnalysis?.spendCents);
      expect(row.meterCount).toBe(fromAnalysis?.meterCount);
    }
    // Sorted desc by summed cost: Batth LLC (17,000 + 9,000 + 3,000) leads Westside Holdings.
    expect(rollups[0]?.entity).toBe("Batth LLC");
    expect(rollups[0]?.totalCents).toBe(17_000_00 + 9_000_00 + 3_000_00);
  });
});

describe("summarizeRanking (the queryMeters tool shape, pure)", () => {
  it("returns numbers (integer cents), a count, and the summed total over the returned rows", () => {
    const view = summarizeRanking(fixtureAnalysis(), { sortBy: "cost", limit: 3 });
    expect(view.sortBy).toBe("cost");
    expect(view.order).toBe("desc");
    expect(view.count).toBe(3);
    expect(view.meters[0]?.name).toBe("Westside Pump 17");
    // The aggregate total is over the RETURNED rows (the top 3), not the whole farm.
    expect(view.totalCents).toBe(17_000_00 + 9_000_00 + 7_000_00);
    // Numbers stay numbers - no formatted strings on the surface.
    for (const m of view.meters) {
      if (m.thisCycleCents !== null) expect(typeof m.thisCycleCents).toBe("number");
      expect(typeof m.estSavingsCents).toBe("number");
    }
    expect(view.byEntity).toBeUndefined();
  });

  it("groupBy entity carries the per-entity rollups", () => {
    const view = summarizeRanking(fixtureAnalysis(), { sortBy: "cost", groupBy: "entity" });
    expect(view.byEntity).toBeDefined();
    expect(view.byEntity?.[0]?.entity).toBe("Batth LLC");
  });
});

// --- DB integration over the REAL Batth seed (the strongest proof) ------------------------------

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const seeded = await seedBatthFarm(prisma);
  farmId = seeded.id;
  await runEngines(prisma, farmId);
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("rankMeters over the real Batth seed", () => {
  it("Top 5 by cost lead with Westside Pump 17, strictly descending", async () => {
    const [meterViews, findingViews] = await Promise.all([
      loadMetersForFarm(prisma, farmId),
      loadFindings(prisma, farmId),
    ]);
    const a = analyzeFarm(meterViews, findingViews);
    const top5 = rankMeters(a, { sortBy: "cost", limit: 5 });
    expect(top5).toHaveLength(5);
    expect(top5[0]?.name).toBe("Westside Pump 17");
    const costs = top5.map((m) => m.thisCycleCents ?? 0);
    expect(isStrictlyDescending(costs)).toBe(true);
  });

  it("Open priciest (limit 1, cost desc) is Westside Pump 17", async () => {
    const [meterViews, findingViews] = await Promise.all([
      loadMetersForFarm(prisma, farmId),
      loadFindings(prisma, farmId),
    ]);
    const a = analyzeFarm(meterViews, findingViews);
    const winner = rankMeters(a, { sortBy: "cost", order: "desc", limit: 1 });
    expect(winner).toHaveLength(1);
    expect(winner[0]?.name).toBe("Westside Pump 17");
  });

  it("savings rank leads with Westside Pump 17 (the AG-B -> AG-C switch), 4 opportunities", async () => {
    const [meterViews, findingViews] = await Promise.all([
      loadMetersForFarm(prisma, farmId),
      loadFindings(prisma, farmId),
    ]);
    const a = analyzeFarm(meterViews, findingViews);
    const bySavings = rankMeters(a, { sortBy: "savings" });
    // The findings.ts fix populates 4 rate-switch opportunities (was empty); Westside Pump 17 leads.
    expect(bySavings).toHaveLength(4);
    expect(bySavings[0]?.name).toBe("Westside Pump 17");
    expect(bySavings[0]?.flags.suggestedRate).toBe("AG-C");
    const savings = bySavings.map((m) => m.flags.estAnnualSavingsCents);
    expect(isStrictlyDescending(savings)).toBe(true);
  });

  it("groupBy entity rollups agree with analysis.byEntity over the seed", async () => {
    const [meterViews, findingViews] = await Promise.all([
      loadMetersForFarm(prisma, farmId),
      loadFindings(prisma, farmId),
    ]);
    const a = analyzeFarm(meterViews, findingViews);
    const rollups = rankByEntity(a, { sortBy: "cost" });
    expect(rollups.length).toBeGreaterThan(0);
    for (const row of rollups) {
      const fromAnalysis = a.byEntity.find((e) => e.entity === row.entity);
      expect(fromAnalysis).toBeDefined();
      expect(row.totalCents).toBe(fromAnalysis?.spendCents);
      expect(row.meterCount).toBe(fromAnalysis?.meterCount);
    }
  });
});

// --- The stub "open priciest" path (no-punt proof, over the real seed) ---------------------------
//
// The two punting behaviors this task removes: (1) a ranking question is no longer answered from a
// client-side guess, and (2) "open the pump that costs me the most" no longer dead-ends - it ranks,
// then fires the open-meter navigate action. Proven offline with zero external calls. A read-only
// (non-export) actor is used so no file/Reports/Blob path is touched.

const READ_ONLY = { authedOwner: false, canExport: false, userId: null } as const;
const ask = (text: string): UIMessage => ({ id: "u", role: "user", parts: [{ type: "text", text }] });

describe("the stub responder resolves 'open priciest' over the real Batth seed", () => {
  it("detects the open-superlative turn and ranks by cost desc, limit 1", () => {
    expect(isOpenSuperlativeTurn("open the pump that costs me the most")).toBe(true);
    expect(deriveOpenSuperlativeRank("open the pump that costs me the most")).toEqual({
      sortBy: "cost",
      order: "desc",
      limit: 1,
    });
    // A plain ranking QUESTION (no open verb) is not an open-superlative turn.
    expect(isOpenSuperlativeTurn("which pump costs me the most")).toBe(false);
  });

  it("opens Westside Pump 17 (the priciest) and emits the open-meter navigate action", async () => {
    const res = await createStubResponder().toResponse({
      uiMessages: [ask("open the pump that costs me the most")],
      system: "ignored by the stub",
      deps: { prisma, farmId, farmName: "Batth Family Farms" },
      actor: READ_ONLY,
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    // It names the priciest meter and FIRES the navigate action (the open-meter part), instead of
    // punting that it cannot rank or open.
    expect(body).toContain("Westside Pump 17");
    expect(body).toContain("data-navigate");
    expect(body).toContain("Opened Westside Pump 17");
    // The emitted action carries the resolved meter id (what the `meter` URL key holds).
    const winnerId = (await loadMetersForFarm(prisma, farmId)).find(
      (m) => m.name === "Westside Pump 17",
    )?.id;
    expect(winnerId).toBeTruthy();
    expect(body).toContain(winnerId as string);
    // It is NOT a dead-end ("I could not find that on your farm").
    expect(body).not.toContain("could not find");
  });

  it("composeStubAnswer ranks the costliest meter (Westside Pump 17), no longer punting", async () => {
    const answer = await composeStubAnswer({ prisma, farmId, farmName: "Batth Family Farms" }, [
      ask("which meters cost me the most"),
    ]);
    expect(answer).toMatch(/costliest/i);
    expect(answer).toContain("Westside Pump 17");
  });
});
