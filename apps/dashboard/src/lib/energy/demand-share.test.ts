import { describe, expect, it } from "vitest";
import { demandShare } from "./demand-share";
import type { MeterView, MeterPeriodView } from "@/lib/dashboard/load";
import type { CoverageState } from "@/lib/recommendations/types";

function period(
  close: string,
  printedTotalCents: number | null,
  demandCents: number | null = null,
): MeterPeriodView {
  return {
    start: close,
    close,
    printedTotalCents,
    demandCents,
    totalKwh: null,
    peakKw: demandCents !== null ? 100 : null,
    tariff: "AG-C",
    lineItems: [],
  };
}

function meter(id: string, coverageState: CoverageState, periods: MeterPeriodView[]): MeterView {
  return {
    id,
    name: id,
    serviceId: id,
    rateSchedule: "AG-C",
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

describe("demandShare", () => {
  it("computes demand as a fraction of total reconciled spend", () => {
    const result = demandShare([
      meter("a", "reconciled", [period("2026-05-31", 100_000, 41_000)]),
    ]);
    expect(result.demandCents).toBe(41_000);
    expect(result.totalCents).toBe(100_000);
    expect(result.fraction).toBeCloseTo(0.41, 5);
    expect(result.percent).toBe(41);
    expect(result.periodsCounted).toBe(1);
  });

  it("sums across reconciled meters and periods", () => {
    const result = demandShare([
      meter("a", "reconciled", [
        period("2026-04-30", 60_000, 20_000),
        period("2026-05-31", 40_000, 20_000),
      ]),
      meter("b", "reconciled", [period("2026-05-31", 100_000, 40_000)]),
    ]);
    // demand 80,000 / total 200,000 = 0.40
    expect(result.demandCents).toBe(80_000);
    expect(result.totalCents).toBe(200_000);
    expect(result.percent).toBe(40);
    expect(result.periodsCounted).toBe(3);
  });

  it("dilutes the share with no-demand periods (counts their total, not zero-excludes)", () => {
    const result = demandShare([
      meter("a", "reconciled", [
        period("2026-05-31", 100_000, 50_000), // has demand
        period("2026-04-30", 100_000, null), // no demand line
      ]),
    ]);
    // 50,000 / 200,000 = 25%, NOT 50%
    expect(result.percent).toBe(25);
    expect(result.periodsCounted).toBe(2);
  });

  it("excludes non-reconciled meters and unpriced periods", () => {
    const result = demandShare([
      meter("a", "reconciled", [period("2026-05-31", 100_000, 41_000)]),
      meter("b", "needs_review", [period("2026-05-31", 999_999, 999_999)]),
      meter("c", "reconciled", [period("2026-05-31", null, 50_000)]), // no printed total
    ]);
    expect(result.totalCents).toBe(100_000);
    expect(result.percent).toBe(41);
    expect(result.periodsCounted).toBe(1);
  });

  it("withholds a fraction (null) when nothing reconciled, never a fabricated 0%", () => {
    const result = demandShare([meter("a", "no_bill", [])]);
    expect(result.fraction).toBeNull();
    expect(result.percent).toBeNull();
    expect(result.totalCents).toBe(0);
  });
});
