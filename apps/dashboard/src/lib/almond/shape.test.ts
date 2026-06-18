import { describe, expect, it } from "vitest";
import type { MeterView } from "@/lib/dashboard/load";
import type { KpiStrip } from "@/lib/dashboard/kpi";
import type { FindingView } from "@/lib/dashboard/findings";
import {
  findMeter,
  rateSchedulesByFrequency,
  resolveMeterQuery,
  summarizeFarmOverview,
  summarizeFindings,
  summarizeMeterDetail,
  summarizeMeters,
  summarizeReconciliation,
} from "./shape";

// Spread (not `??`) so an explicit `null` override is honored for nullable fields.
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

function period(over: Partial<MeterView["periods"][number]> = {}): MeterView["periods"][number] {
  const base: MeterView["periods"][number] = {
    start: "2026-01-01",
    close: "2026-01-31",
    printedTotalCents: null,
    demandCents: null,
    peakKw: null,
    tariff: null,
    lineItems: [],
  };
  return { ...base, ...over };
}

const KPI: KpiStrip = {
  spend: { cents: 1_200_00, coverage: { loaded: 2, total: 2 }, series: [1_000_00, 1_200_00], deltaCents: 200_00 },
  demand: { hasDemand: true, cents: 340_00, series: [300_00, 340_00], deltaCents: 40_00 },
  biggestMover: {
    meterId: "m2",
    meterName: "Pump 2",
    latestCents: 800_00,
    priorCents: 500_00,
    deltaCents: 300_00,
  },
};

function finding(over: Partial<FindingView> = {}): FindingView {
  // Use `in` (not `??`) for nullable fields so an explicit `null` override is honored.
  return {
    id: over.id ?? "f1",
    tool: over.tool ?? "rate-optimization",
    situation: over.situation ?? "This meter looks mis-rated",
    actionLabel: "actionLabel" in over ? (over.actionLabel ?? null) : "Move to AG-A1",
    impactUsd: "impactUsd" in over ? (over.impactUsd ?? null) : 4_322,
    impactNote: "impactNote" in over ? (over.impactNote ?? null) : null,
    severity: over.severity ?? "act",
    status: over.status ?? "pending",
    meterId: "meterId" in over ? (over.meterId ?? null) : "m1",
    meterName: "meterName" in over ? (over.meterName ?? null) : "Pump 1",
    resultNote: over.resultNote ?? null,
  };
}

describe("summarizeFarmOverview", () => {
  it("reports counts, rate schedules, money as cents+usd, and the biggest mover", () => {
    const meters = [
      makeMeter({ id: "m1", rateSchedule: "AG-A1" }),
      makeMeter({ id: "m2", rateSchedule: "AG-A1" }),
      makeMeter({ id: "m3", rateSchedule: "AG-4", isLegacy: true, isSolar: true }),
    ];
    const o = summarizeFarmOverview("Batth Farms", meters, KPI);
    expect(o.farmName).toBe("Batth Farms");
    expect(o.meterCount).toBe(3);
    expect(o.solarMeterCount).toBe(1);
    expect(o.rateSchedules).toEqual(["AG-A1", "AG-4"]); // most common first
    expect(o.latestMonthSpend).toEqual({ cents: 1_200_00, usd: expect.stringContaining("$") });
    expect(o.spendDeltaVsPriorMonth?.cents).toBe(200_00);
    expect(o.latestDemandCharge?.cents).toBe(340_00);
    expect(o.biggestMover?.meterName).toBe("Pump 2");
    expect(o.biggestMover?.delta.cents).toBe(300_00);
  });

  it("nulls demand when the farm has none and nulls the delta with one month", () => {
    const o = summarizeFarmOverview("F", [makeMeter()], {
      spend: { cents: 0, coverage: { loaded: 0, total: 0 }, series: [], deltaCents: null },
      demand: { hasDemand: false },
      biggestMover: null,
    });
    expect(o.latestDemandCharge).toBeNull();
    expect(o.spendDeltaVsPriorMonth).toBeNull();
    expect(o.biggestMover).toBeNull();
  });

  it("nulls latestMonthSpend when no billing month has loaded (never a misleading $0)", () => {
    const o = summarizeFarmOverview("F", [makeMeter()], {
      spend: { cents: 0, coverage: { loaded: 0, total: 5 }, series: [], deltaCents: null },
      demand: { hasDemand: false },
      biggestMover: null,
    });
    expect(o.latestMonthSpend).toBeNull();
  });

  it("excludes the (unknown) rate bucket from the overview rate list", () => {
    const o = summarizeFarmOverview(
      "F",
      [makeMeter({ rateSchedule: "AG-A1" }), makeMeter({ rateSchedule: null })],
      KPI,
    );
    expect(o.rateSchedules).toEqual(["AG-A1"]);
  });

  it("carries an explicit direction on a delta so a spend drop is never read as a rise", () => {
    const o = summarizeFarmOverview("F", [makeMeter()], {
      spend: { cents: 1_000_00, coverage: { loaded: 2, total: 2 }, series: [1_340_00, 1_000_00], deltaCents: -340_00 },
      demand: { hasDemand: false },
      biggestMover: null,
    });
    expect(o.spendDeltaVsPriorMonth?.direction).toBe("down");
    // usd is the absolute amount; direction carries the sign.
    expect(o.spendDeltaVsPriorMonth?.usd).not.toContain("-");
    expect(o.spendDeltaVsPriorMonth?.cents).toBe(-340_00);
  });
});

describe("resolveMeterQuery", () => {
  const meters = [
    makeMeter({ id: "a", name: "North Pump 1", serviceId: "SA-1" }),
    makeMeter({ id: "b", name: "North Pump 2", serviceId: "SA-2" }),
    makeMeter({ id: "c", name: "South Well", serviceId: "SA-3" }),
  ];
  it("returns a single hit on an exact id/SA/name match", () => {
    expect(resolveMeterQuery(meters, "a")).toEqual({ kind: "found", meter: meters[0] });
    expect(resolveMeterQuery(meters, "SA-3")).toEqual({ kind: "found", meter: meters[2] });
    expect(resolveMeterQuery(meters, "south well")).toEqual({ kind: "found", meter: meters[2] });
  });
  it("flags ambiguity when a name-contains matches several meters", () => {
    const r = resolveMeterQuery(meters, "north pump");
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.names).toEqual(["North Pump 1", "North Pump 2"]);
  });
  it("returns a hit when contains matches exactly one, and none when it matches zero", () => {
    expect(resolveMeterQuery(meters, "south")).toEqual({ kind: "found", meter: meters[2] });
    expect(resolveMeterQuery(meters, "xyz")).toEqual({ kind: "none" });
    expect(resolveMeterQuery(meters, "  ")).toEqual({ kind: "none" });
  });
});

describe("summarizeMeters", () => {
  const meters = [
    makeMeter({ id: "a", name: "North 1", rateSchedule: "AG-A1", entityName: "Batth LLC", ranchName: "North" }),
    makeMeter({ id: "b", name: "South 1", rateSchedule: "AG-4", entityName: "Sandhu LLC", ranchName: "South" }),
    makeMeter({ id: "c", name: "South 2", rateSchedule: "AG-4", entityName: "Sandhu LLC", ranchName: "South" }),
  ];

  it("filters by rate, entity, and ranch case-insensitively", () => {
    expect(summarizeMeters(meters, { rate: "ag-4" }).total).toBe(2);
    expect(summarizeMeters(meters, { entity: "batth" }).total).toBe(1);
    expect(summarizeMeters(meters, { ranch: "south" }).total).toBe(2);
    expect(summarizeMeters(meters, {}).total).toBe(3);
  });

  it("respects the limit and reports total vs shown", () => {
    const r = summarizeMeters(meters, { limit: 1 });
    expect(r.total).toBe(3);
    expect(r.shown).toBe(1);
    expect(r.meters).toHaveLength(1);
  });

  it("carries the latest printed bill, skipping unreconciled periods", () => {
    const m = makeMeter({
      periods: [
        period({ printedTotalCents: 100_00 }),
        period({ printedTotalCents: null }),
      ],
    });
    const r = summarizeMeters([m]);
    expect(r.meters[0]?.latestBill?.cents).toBe(100_00);
  });
});

describe("findMeter", () => {
  const meters = [
    makeMeter({ id: "abc", name: "Westside Pump 17", serviceId: "SA-99" }),
    makeMeter({ id: "def", name: "Dairy Field Pump 4", serviceId: "SA-12" }),
  ];
  it("matches by id, SA id, exact name, then contains", () => {
    expect(findMeter(meters, "abc")?.id).toBe("abc");
    expect(findMeter(meters, "SA-12")?.id).toBe("def");
    expect(findMeter(meters, "westside pump 17")?.id).toBe("abc");
    expect(findMeter(meters, "dairy")?.id).toBe("def");
  });
  it("returns null on an empty query or no match", () => {
    expect(findMeter(meters, "  ")).toBeNull();
    expect(findMeter(meters, "nonexistent")).toBeNull();
  });
});

describe("rateSchedulesByFrequency", () => {
  it("counts distinct rates, most common first, and buckets unknown", () => {
    const rows = rateSchedulesByFrequency([
      makeMeter({ rateSchedule: "AG-A1" }),
      makeMeter({ rateSchedule: "AG-A1" }),
      makeMeter({ rateSchedule: "AG-4", isLegacy: true }),
      makeMeter({ rateSchedule: null }),
    ]);
    expect(rows[0]).toEqual({ rate: "AG-A1", meterCount: 2, isLegacy: false });
    expect(rows.find((r) => r.rate === "AG-4")).toEqual({ rate: "AG-4", meterCount: 1, isLegacy: true });
    expect(rows.find((r) => r.rate === "(unknown)")?.meterCount).toBe(1);
  });
});

describe("summarizeReconciliation", () => {
  it("counts meters by coverage state, most common first", () => {
    const r = summarizeReconciliation([
      makeMeter({ coverageState: "reconciled" as MeterView["coverageState"] }),
      makeMeter({ coverageState: "reconciled" as MeterView["coverageState"] }),
      makeMeter({ coverageState: "no_bill" as MeterView["coverageState"] }),
    ]);
    expect(r.meterCount).toBe(3);
    expect(r.byCoverageState[0]).toEqual({ state: "reconciled", meterCount: 2 });
  });
});

describe("summarizeMeterDetail", () => {
  it("returns identity, rate, and the last 6 bills with money shaped", () => {
    const periods = Array.from({ length: 8 }, (_, i) =>
      period({ start: `2026-0${i + 1}-01`, printedTotalCents: (i + 1) * 100_00, demandCents: 10_00 }),
    );
    const d = summarizeMeterDetail(makeMeter({ name: "Pump 9", periods }));
    expect(d.name).toBe("Pump 9");
    expect(d.recentBills).toHaveLength(6); // last 6 only
    expect(d.recentBills[0]?.total?.cents).toBe(3 * 100_00); // periods 3..8
    expect(d.recentBills[5]?.demandCharge?.cents).toBe(10_00);
  });
});

describe("summarizeFindings", () => {
  it("converts legacy dollar impact to cents+usd and carries the meter", () => {
    const s = summarizeFindings([finding({ impactUsd: 4_322, meterName: "Pump 1" })]);
    expect(s[0]?.impact?.cents).toBe(4_322_00); // dollars -> cents
    expect(s[0]?.meterName).toBe("Pump 1");
    expect(s[0]?.severity).toBe("act");
  });
  it("nulls impact when the finding has no dollar figure", () => {
    const s = summarizeFindings([finding({ impactUsd: null, impactNote: "timing" })]);
    expect(s[0]?.impact).toBeNull();
    expect(s[0]?.impactNote).toBe("timing");
  });
  it("treats a sub-dollar impact as no dollar figure (never headline an opportunity worth $0)", () => {
    const s = summarizeFindings([finding({ impactUsd: 0.4 })]);
    expect(s[0]?.impact).toBeNull();
  });
});
