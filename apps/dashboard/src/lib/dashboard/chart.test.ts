import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView, MeterPeriodView, MeterLineItemView } from "./load";
import { classifyTou, toChartBars, yoyPairs, BUCKET_ORDER } from "./chart";

function li(over: Partial<MeterLineItemView> & { kind: MeterLineItemView["kind"] }): MeterLineItemView {
  return { label: null, amountCents: 0, quantity: null, unit: null, rate: null, ...over };
}

function period(close: string, lineItems: MeterLineItemView[]): MeterPeriodView {
  return {
    start: "2026-02-11T00:00:00.000Z",
    close,
    printedTotalCents: 1000,
    demandCents: null,
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

describe("toChartBars", () => {
  it("bars reconciled meter-periods only and gates the unreconciled out", () => {
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
    expect(bars.map((b) => b.meterId)).toEqual(["ok"]);
  });

  it("stacks segments by bucket in fixed order, summing same-bucket lines, TOU lines only", () => {
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

  it("a two-tier meter has no part_peak segment; a three-tier meter does (AC2)", () => {
    const { bars } = toChartBars([
      meter({
        id: "two",
        coverageState: "reconciled",
        periods: [
          period(MAR, [
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
    const two = bars.find((b) => b.meterId === "two");
    const three = bars.find((b) => b.meterId === "three");
    expect(two?.segments.some((s) => s.bucket === "part_peak")).toBe(false);
    expect(three?.segments.some((s) => s.bucket === "part_peak")).toBe(true);
  });

  it("counts reconciled meters without TOU detail instead of rendering zero bars", () => {
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
    expect(bars.map((b) => b.meterId)).toEqual(["tou"]);
    expect(metersWithoutTou).toBe(1); // flat counted; nobill is a coverage matter, not a TOU one
  });

  it("orders by close ascending, then TOU total descending, then name", () => {
    const feb = "2026-02-10T00:00:00.000Z";
    const { bars } = toChartBars([
      meter({
        id: "small-mar",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 10 })])],
      }),
      meter({
        id: "big-mar",
        coverageState: "reconciled",
        periods: [period(MAR, [li({ kind: "tou_energy", label: "Peak", amountCents: 999 })])],
      }),
      meter({
        id: "feb",
        coverageState: "reconciled",
        periods: [period(feb, [li({ kind: "tou_energy", label: "Peak", amountCents: 1 })])],
      }),
    ]);
    expect(bars.map((b) => b.meterId)).toEqual(["feb", "big-mar", "small-mar"]);
  });

  it("BUCKET_ORDER puts cheap hours at the base and peak on top", () => {
    expect(BUCKET_ORDER.indexOf("super_off_peak")).toBeLessThan(BUCKET_ORDER.indexOf("off_peak"));
    expect(BUCKET_ORDER.indexOf("off_peak")).toBeLessThan(BUCKET_ORDER.indexOf("peak"));
  });
});

describe("yoyPairs", () => {
  const bar = (meterId: string, close: string, cents: number) => ({
    meterId,
    meterName: meterId,
    close,
    segments: [{ bucket: "peak" as const, cents }],
    totalCents: cents,
  });

  it("pairs the same meter's same UTC month one year apart; unpaired bars stay unpaired", () => {
    const pairs = yoyPairs([
      bar("a", "2025-03-12T00:00:00.000Z", 100),
      bar("a", "2026-03-10T00:00:00.000Z", 150),
      bar("b", "2026-03-12T00:00:00.000Z", 50), // no prior year
      bar("a", "2026-04-11T00:00:00.000Z", 70), // different month, no prior
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.current.totalCents).toBe(150);
    expect(pairs[0]?.prior.totalCents).toBe(100);
  });

  it("returns empty on a single-cycle account (the honest disabled toggle)", () => {
    expect(yoyPairs([bar("a", MAR, 1), bar("b", MAR, 2)])).toEqual([]);
  });

  it("pairs rebills one-to-one in close order, never double-counting a prior", () => {
    const pairs = yoyPairs([
      bar("a", "2025-03-01T00:00:00.000Z", 10),
      bar("a", "2025-03-30T00:00:00.000Z", 20),
      bar("a", "2026-03-02T00:00:00.000Z", 11),
      bar("a", "2026-03-29T00:00:00.000Z", 21),
    ]);
    expect(pairs.map((p) => [p.current.totalCents, p.prior.totalCents])).toEqual([
      [11, 10],
      [21, 20],
    ]);

    // One current, two priors: only one pair; one prior stays unused.
    const lopsided = yoyPairs([
      bar("a", "2025-03-01T00:00:00.000Z", 10),
      bar("a", "2025-03-30T00:00:00.000Z", 20),
      bar("a", "2026-03-02T00:00:00.000Z", 11),
    ]);
    expect(lopsided).toHaveLength(1);
    expect(lopsided[0]?.prior.totalCents).toBe(10);
  });
});
