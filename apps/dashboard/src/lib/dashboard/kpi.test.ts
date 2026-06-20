import { describe, expect, it } from "vitest";
import { computeKpiStrip } from "./kpi";
import type { MeterView, MeterPeriodView } from "./load";
import type { CoverageState } from "@/lib/recommendations/types";

function period(close: string, printedTotalCents: number | null, demandCents: number | null = null): MeterPeriodView {
  return {
    start: close,
    close,
    printedTotalCents,
    demandCents,
    totalKwh: null,
    peakKw: null,
    tariff: "AGC",
    lineItems: [],
  };
}

function meter(
  id: string,
  coverageState: CoverageState,
  periods: MeterPeriodView[],
): MeterView {
  return {
    id,
    name: id,
    serviceId: id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState,
    accountNumber: "A1",
    ranchName: null,
    entityName: null,
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
    cropName: null,
    growerPumpId: null,
    nemPeriods: [],
    periods,
  };
}

describe("computeKpiStrip", () => {
  it("sums spend over reconciled meters only; withholds needs_review and no_bill", () => {
    const k = computeKpiStrip([
      meter("a", "reconciled", [period("2026-03-12", 10000)]),
      meter("b", "needs_review", [period("2026-03-12", 99999)]),
      meter("c", "no_bill", []),
    ]);
    expect(k.spend.cents).toBe(10000); // only the reconciled meter counts
    expect(k.spend.coverage).toEqual({ loaded: 1, total: 3 }); // 1 of 3 loaded
  });

  it("coverage denominator is the full inventory (loaded of total)", () => {
    const k = computeKpiStrip([
      meter("a", "reconciled", [period("2026-03-12", 5000)]),
      meter("b", "reconciled", [period("2026-03-12", 5000)]),
      meter("c", "no_bill", []),
      meter("d", "needs_review", []),
    ]);
    expect(k.spend.coverage).toEqual({ loaded: 2, total: 4 });
    expect(k.spend.cents).toBe(10000);
  });

  it("hides the spend sparkline/delta with a single covered month (degrade, not fake)", () => {
    const k = computeKpiStrip([meter("a", "reconciled", [period("2026-03-12", 8000)])]);
    expect(k.spend.series).toEqual([8000]);
    expect(k.spend.deltaCents).toBeNull(); // < 2 months -> no delta
  });

  it("builds a spend sparkline + delta across >= 2 months", () => {
    const k = computeKpiStrip([
      meter("a", "reconciled", [period("2026-02-12", 8000), period("2026-03-12", 6000)]),
    ]);
    expect(k.spend.series).toEqual([8000, 6000]); // ascending by month
    expect(k.spend.deltaCents).toBe(-2000); // spend fell (favorable)
  });

  it("reports no demand charges honestly when none of the reconciled meters carry one", () => {
    const k = computeKpiStrip([meter("a", "reconciled", [period("2026-03-12", 8000, null)])]);
    expect(k.demand).toEqual({ hasDemand: false }); // never a fabricated $0 hero
  });

  it("sums demand exposure when reconciled meters carry a demand charge", () => {
    const k = computeKpiStrip([
      meter("a", "reconciled", [period("2026-03-12", 50000, 12000)]),
      meter("b", "reconciled", [period("2026-03-12", 40000, 8000)]),
      meter("c", "needs_review", [period("2026-03-12", 99999, 99999)]), // withheld
    ]);
    if (!k.demand.hasDemand) throw new Error("expected demand");
    expect(k.demand.cents).toBe(20000); // 12000 + 8000, needs_review excluded
  });

  it("hides the biggest-mover card when no reconciled meter has >= 2 periods", () => {
    const k = computeKpiStrip([meter("a", "reconciled", [period("2026-03-12", 8000)])]);
    expect(k.biggestMover).toBeNull();
  });

  it("picks the largest absolute period-over-period mover among reconciled meters", () => {
    const k = computeKpiStrip([
      meter("a", "reconciled", [period("2026-02-12", 1000), period("2026-03-12", 1500)]), // +500
      meter("b", "reconciled", [period("2026-02-12", 9000), period("2026-03-12", 2000)]), // -7000
      meter("c", "needs_review", [period("2026-02-12", 0), period("2026-03-12", 99999)]), // withheld
    ]);
    if (k.biggestMover === null) throw new Error("expected a mover");
    expect(k.biggestMover.meterId).toBe("b");
    expect(k.biggestMover.deltaCents).toBe(-7000); // latest - prior
    expect(k.biggestMover.latestCents).toBe(2000);
    expect(k.biggestMover.priorCents).toBe(9000);
  });

  it("never fabricates a number when there is nothing loaded", () => {
    const k = computeKpiStrip([meter("a", "no_bill", []), meter("b", "needs_review", [])]);
    expect(k.spend.cents).toBe(0);
    expect(k.spend.coverage).toEqual({ loaded: 0, total: 2 });
    expect(k.spend.series).toEqual([]);
    expect(k.spend.deltaCents).toBeNull();
    expect(k.demand).toEqual({ hasDemand: false });
    expect(k.biggestMover).toBeNull();
  });
});
