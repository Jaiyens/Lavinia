import { describe, expect, it } from "vitest";
import { cropYearWindow, meterYearCosts } from "./meter-year-cost";
import type { MeterView } from "@/lib/dashboard/load";

// A minimal MeterView factory: only the fields meterYearCosts reads matter; the rest are filled with
// inert defaults so the test states exactly the facts under test (coverage, solar identity, periods).
function meter(over: Partial<MeterView> & { id: string }): MeterView {
  return {
    id: over.id,
    name: over.name ?? over.id,
    serviceId: null,
    rateSchedule: null,
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: over.coverageState ?? "reconciled",
    accountNumber: null,
    ranchName: null,
    entityName: null,
    cropName: null,
    latitude: null,
    longitude: null,
    gpm: null,
    isSolar: over.isSolar ?? false,
    nemType: over.nemType ?? null,
    trueUpMonth: null,
    trueUpAmountCents: null,
    trueUpDate: null,
    solarKw: over.solarKw ?? null,
    benefitingArrays: [],
    nemPeriods: [],
    growerPumpId: null,
    periods: over.periods ?? [],
  };
}

function period(closeIso: string, printedTotalCents: number | null) {
  return {
    start: closeIso,
    close: closeIso,
    printedTotalCents,
    demandCents: null,
    totalKwh: null,
    peakKw: null,
    tariff: null,
    lineItems: [],
  };
}

describe("cropYearWindow", () => {
  it("is the calendar year, half-open on the close date", () => {
    const w = cropYearWindow(2025);
    expect(w.startIso).toBe("2025-01-01T00:00:00.000Z");
    expect(w.endIso).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("meterYearCosts", () => {
  const w = cropYearWindow(2025);

  it("sums reconciled non-solar printed totals whose close falls in the window", () => {
    const meters: MeterView[] = [
      meter({
        id: "M1",
        periods: [
          period("2024-12-31T12:00:00.000Z", 100), // prior year, excluded
          period("2025-03-15T00:00:00.000Z", 5_000),
          period("2025-09-15T00:00:00.000Z", 6_000),
          period("2026-01-01T00:00:00.000Z", 999), // next year (half-open end), excluded
        ],
      }),
      meter({ id: "M2", periods: [period("2025-06-01T00:00:00.000Z", 4_000)] }),
    ];
    const { meterCosts, coverage } = meterYearCosts(meters, w.startIso, w.endIso);
    expect(meterCosts).toEqual([
      { meterId: "M1", cents: 11_000 },
      { meterId: "M2", cents: 4_000 },
    ]);
    expect(coverage).toEqual({ metersTotal: 2, metersReconciled: 2 });
  });

  it("excludes unreconciled meters from the cost but counts them in the denominator", () => {
    const meters: MeterView[] = [
      meter({ id: "M1", coverageState: "reconciled", periods: [period("2025-04-01T00:00:00.000Z", 3_000)] }),
      meter({ id: "M2", coverageState: "needs_review", periods: [period("2025-04-01T00:00:00.000Z", 9_999)] }),
      meter({ id: "M3", coverageState: "no_bill", periods: [] }),
    ];
    const { meterCosts, coverage } = meterYearCosts(meters, w.startIso, w.endIso);
    expect(meterCosts).toEqual([{ meterId: "M1", cents: 3_000 }]);
    expect(coverage).toEqual({ metersTotal: 3, metersReconciled: 1 });
  });

  it("excludes solar/NEM meters entirely (any one signal), even when reconciled", () => {
    const meters: MeterView[] = [
      meter({ id: "S1", isSolar: true, periods: [period("2025-05-01T00:00:00.000Z", 1_000)] }),
      meter({ id: "S2", solarKw: 50, periods: [period("2025-05-01T00:00:00.000Z", 1_000)] }),
      meter({ id: "S3", nemType: "nem2", periods: [period("2025-05-01T00:00:00.000Z", 1_000)] }),
      meter({ id: "M1", periods: [period("2025-05-01T00:00:00.000Z", 7_000)] }),
    ];
    const { meterCosts, coverage } = meterYearCosts(meters, w.startIso, w.endIso);
    expect(meterCosts).toEqual([{ meterId: "M1", cents: 7_000 }]);
    // Solar meters are still reconciled, so they count toward the coverage denominator.
    expect(coverage).toEqual({ metersTotal: 4, metersReconciled: 4 });
  });

  it("omits a meter with no qualifying spend (never a fabricated zero)", () => {
    const meters: MeterView[] = [
      meter({ id: "M1", periods: [period("2024-01-01T00:00:00.000Z", 5_000)] }), // all prior year
      meter({ id: "M2", periods: [period("2025-01-01T00:00:00.000Z", null)] }), // no printed total
    ];
    const { meterCosts } = meterYearCosts(meters, w.startIso, w.endIso);
    expect(meterCosts).toEqual([]);
  });
});
