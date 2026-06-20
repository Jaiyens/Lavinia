import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView, MeterPeriodView, MeterLineItemView } from "./load";
import { classifyTou, toChartBars, yoyPairs, BUCKET_ORDER, type ChartBar } from "./chart";

function li(over: Partial<MeterLineItemView> & { kind: MeterLineItemView["kind"] }): MeterLineItemView {
  return { label: null, amountCents: 0, quantity: null, unit: null, rate: null, ...over };
}

function period(close: string, lineItems: MeterLineItemView[]): MeterPeriodView {
  return {
    start: "2026-02-11T00:00:00.000Z",
    close,
    printedTotalCents: 1000,
    demandCents: null,
    totalKwh: null,
    peakKw: null,
    tariff: "AGC",
    lineItems,
  };
}

function meter(over: Partial<MeterView> & { id: string; coverageState: CoverageState }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status: null,
    accountNumber: "A1",
    ranchName: null,
    entityName: null,
    cropName: null,
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
    growerPumpId: null,
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

const FEB = "2026-02-10T00:00:00.000Z";
const MAR = "2026-03-12T00:00:00.000Z";

describe("classifyTou", () => {
  it("classifies the real demo-account labels, precedence intact", () => {
    expect(classifyTou("Peak")).toBe("peak");
    expect(classifyTou("Off-Peak")).toBe("off_peak");
    expect(classifyTou("Off Peak")).toBe("off_peak");
    expect(classifyTou("Super Off-Peak")).toBe("super_off_peak");
    expect(classifyTou("Super Off Peak")).toBe("super_off_peak");
    expect(classifyTou("Part-Peak")).toBe("part_peak");
    expect(classifyTou("Partial Peak")).toBe("part_peak");
    expect(classifyTou("PEAK SUMMER")).toBe("peak");
    expect(classifyTou(null)).toBe("other");
    expect(classifyTou("Winter Energy")).toBe("other");
  });
});

describe("toChartBars (per-cycle aggregate)", () => {
  it("aggregates one bar per cycle month, summing TOU dollars across meters", () => {
    const { bars } = toChartBars([
      meter({
        id: "a",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 100 })])],
      }),
      meter({
        id: "b",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 250 })])],
      }),
    ]);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.key).toBe("2026-03");
    expect(bars[0]?.label).toBe("Mar 2026");
    expect(bars[0]?.totalCents).toBe(350);
    expect(bars[0]?.meterCount).toBe(2);
  });

  it("gates unreconciled meters out of the aggregate", () => {
    const { bars } = toChartBars([
      meter({
        id: "ok",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 100 })])],
      }),
      meter({
        id: "held",
        coverageState: "needs_review",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 999 })])],
      }),
    ]);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.totalCents).toBe(100);
    expect(bars[0]?.meterCount).toBe(1);
  });

  it("stacks summed segments by bucket in fixed order, summing same-bucket lines, TOU lines only", () => {
    const { bars } = toChartBars([
      meter({
        id: "m",
        coverageState: "reconciled",
        periods: [
          period(MAR, [
            li({ kind: "tou_energy", label: "Peak", amountCents: 300 }),
            li({ kind: "tou_energy", label: "Peak", amountCents: 200 }),
            li({ kind: "tou_energy", label: "Off-Peak", amountCents: 400 }),
            li({ kind: "tou_energy", label: "Part-Peak", amountCents: 50 }),
            li({ kind: "demand", label: "Max Demand", amountCents: 9999 }),
            li({ kind: "other", label: "Customer Charge", amountCents: 777 }),
          ]),
        ],
      }),
    ]);
    expect(bars[0]?.segments).toEqual([
      { bucket: "off_peak", cents: 400 },
      { bucket: "part_peak", cents: 50 },
      { bucket: "peak", cents: 500 },
    ]);
    expect(bars[0]?.totalCents).toBe(950);
  });

  it("each cycle's buckets reflect only that month's meters (two-tier vs three-tier, AC2)", () => {
    const { bars } = toChartBars([
      meter({
        id: "two",
        coverageState: "reconciled",
        periods: [
          period(FEB, [
            li({ kind: "tou_energy", label: "Peak", amountCents: 1 }),
            li({ kind: "tou_energy", label: "Off-Peak", amountCents: 2 }),
          ]),
        ],
      }),
      meter({
        id: "three",
        coverageState: "reconciled",
        periods: [
          period(MAR, [
            li({ kind: "tou_energy", label: "Peak", amountCents: 1 }),
            li({ kind: "tou_energy", label: "Part-Peak", amountCents: 2 }),
            li({ kind: "tou_energy", label: "Off-Peak", amountCents: 3 }),
          ]),
        ],
      }),
    ]);
    const feb = bars.find((b) => b.key === "2026-02");
    const mar = bars.find((b) => b.key === "2026-03");
    expect(feb?.segments.some((s) => s.bucket === "part_peak")).toBe(false);
    expect(mar?.segments.some((s) => s.bucket === "part_peak")).toBe(true);
  });

  it("counts reconciled meters without TOU detail instead of charting them", () => {
    const { bars, metersWithoutTou } = toChartBars([
      meter({
        id: "flat",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "other", label: "Customer Charge", amountCents: 100 })])],
      }),
      meter({ id: "nobill", coverageState: "no_bill" }),
      meter({
        id: "tou",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 1 })])],
      }),
    ]);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.totalCents).toBe(1);
    expect(metersWithoutTou).toBe(1); // flat counted; nobill is a coverage matter, not a TOU one
  });

  it("orders bars chronologically by cycle month and sums each month across meters", () => {
    const { bars } = toChartBars([
      meter({
        id: "mar-small",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 10 })])],
      }),
      meter({
        id: "mar-big",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 999 })])],
      }),
      meter({
        id: "feb",
        coverageState: "reconciled",
        periods: [period(FEB, [li({ kind: "tou_energy", label: "Peak", amountCents: 1 })])],
      }),
    ]);
    expect(bars.map((b) => b.key)).toEqual(["2026-02", "2026-03"]);
    expect(bars.find((b) => b.key === "2026-03")?.totalCents).toBe(1009);
  });

  it("BUCKET_ORDER puts cheap hours at the base and peak on top", () => {
    expect(BUCKET_ORDER.indexOf("super_off_peak")).toBeLessThan(BUCKET_ORDER.indexOf("off_peak"));
    expect(BUCKET_ORDER.indexOf("off_peak")).toBeLessThan(BUCKET_ORDER.indexOf("peak"));
  });
});

describe("yoyPairs (per-cycle)", () => {
  const bar = (key: string, close: string, cents: number): ChartBar => ({
    key,
    label: key,
    close,
    segments: [{ bucket: "peak" as const, cents }],
    totalCents: cents,
    meterCount: 1,
  });

  it("pairs a cycle with the same calendar month one year earlier; others stay unpaired", () => {
    const pairs = yoyPairs([
      bar("2025-03", "2025-03-12T00:00:00.000Z", 100),
      bar("2026-03", "2026-03-10T00:00:00.000Z", 150),
      bar("2026-04", "2026-04-11T00:00:00.000Z", 70), // different month, no prior
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.current.totalCents).toBe(150);
    expect(pairs[0]?.prior.totalCents).toBe(100);
  });

  it("returns empty on a single-year account (the honest disabled toggle)", () => {
    expect(
      yoyPairs([
        bar("2026-02", "2026-02-10T00:00:00.000Z", 1),
        bar("2026-03", "2026-03-12T00:00:00.000Z", 2),
      ]),
    ).toEqual([]);
  });
});
