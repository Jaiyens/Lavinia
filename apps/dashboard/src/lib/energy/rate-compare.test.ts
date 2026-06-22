import { describe, expect, it } from "vitest";
import { en } from "@/copy/en";
import { loadRateCard } from "@/lib/pge/rate-card";
import { bucketUsage, rateOptimization } from "./rate-compare";
import type { CycleUsage, MeterUsageProfile, RateCard } from "./rates";
import type { CycleBill, IntervalReading } from "./types";

const TZ = "America/Los_Angeles";

// Synthetic two-rate card for the bucketing / gating unit tests, so the asserted
// numbers are hand-checkable independent of the shipped fixture's prices.
const CARD: RateCard = {
  utility: "TEST",
  effectiveDate: "2025-01-01",
  source: "test",
  summerMonths: [5, 6, 7, 8, 9, 10],
  sizeBreakKw: 35,
  plans: [
    {
      schedule: "AG-A2",
      family: "AG-A",
      sizeClass: "large",
      legacy: false,
      agricultural: true,
      customerChargePerMonth: 80,
      summer: { energy: { peak: 0.4, partial_peak: 0.3, off_peak: 0.2 }, demand: {} },
      winter: { energy: { peak: 0.3, partial_peak: 0.25, off_peak: 0.2 }, demand: {} },
    },
    {
      schedule: "AG-C2",
      family: "AG-C",
      sizeClass: "large",
      legacy: false,
      agricultural: true,
      customerChargePerMonth: 50,
      summer: {
        energy: { peak: 0.18, partial_peak: 0.13, off_peak: 0.1 },
        demand: { maxDemandPerKw: 20, peakPeriodDemandPerKw: 10 },
      },
      winter: {
        energy: { peak: 0.14, partial_peak: 0.11, off_peak: 0.1 },
        demand: { maxDemandPerKw: 20 },
      },
    },
  ],
};

const r = (start: string, kWh: number): IntervalReading => ({
  start,
  durationSec: 900,
  kWh,
});

describe("bucketUsage", () => {
  it("routes in-window kWh to peak and the rest to off-peak, flooring demand with the bill peak", () => {
    const intervals: IntervalReading[] = [
      r("2026-07-15T01:00:00.000Z", 28), // 18:00 PDT -> peak window; 112 kW
      r("2026-07-15T09:00:00.000Z", 5), // 02:00 PDT -> off-peak; 20 kW
    ];
    const bills: CycleBill[] = [
      { start: "2026-07-01", close: "2026-07-31", demandChargeUsd: null, peakKw: 100 },
    ];
    const { cycles, observedPeakKw } = bucketUsage(intervals, bills, TZ, CARD);
    const c = cycles[0]!;
    expect(c.season).toBe("summer");
    expect(c.energyKwh.peak).toBe(28);
    expect(c.energyKwh.off_peak).toBe(5);
    expect(c.energyKwh.partial_peak).toBe(0);
    expect(c.maxDemandKw).toBe(112); // interval 112 beats bill floor 100
    expect(c.peakWindowDemandKw).toBe(112);
    expect(observedPeakKw).toBe(112);
  });

  it("uses the stored bill peak when the interval sample is thin", () => {
    const bills: CycleBill[] = [
      { start: "2026-07-01", close: "2026-07-31", demandChargeUsd: null, peakKw: 200 },
    ];
    const { cycles } = bucketUsage([r("2026-07-15T01:00:00.000Z", 28)], bills, TZ, CARD);
    expect(cycles[0]!.maxDemandKw).toBe(200); // floored up to the bill peak
  });

  it("buckets by the export's authoritative TOU Code, not the wall-clock window", () => {
    // A real AG-C cohort: the WPK rate peak runs ~16:15-19:00, but isInPeakWindow
    // is the 4-9pm DR window, so a code-less recompute sweeps the 20:00 off-peak
    // interval into peak. The export labels each interval, so the code must win.
    const c = (start: string, kWh: number, touCode: string): IntervalReading => ({
      start,
      durationSec: 900,
      kWh,
      touCode,
    });
    const intervals: IntervalReading[] = [
      c("2026-07-15T23:30:00.000Z", 30, "WPK"), // 16:30 PDT, in-window, coded peak
      c("2026-07-16T01:30:00.000Z", 40, "WPK"), // 18:30 PDT, in-window, coded peak
      c("2026-07-16T03:30:00.000Z", 50, "WOP"), // 20:30 PDT, IN the 16-21 window but coded off-peak
      c("2026-07-16T09:30:00.000Z", 7, "WOP"), // 02:30 PDT, off-peak both ways
    ];
    const bills: CycleBill[] = [
      { start: "2026-07-01", close: "2026-07-31", demandChargeUsd: null, peakKw: 100 },
    ];
    const { cycles } = bucketUsage(intervals, bills, TZ, CARD);
    const cyc = cycles[0]!;
    // Peak = the WPK sum (30 + 40 = 70), NOT the 16-21 window sum (which would be 120).
    expect(cyc.energyKwh.peak).toBe(70);
    expect(cyc.energyKwh.off_peak).toBe(57); // the two WOP intervals
    // Peak-window demand is gated on the coded-peak intervals: the 20:30 WOP interval
    // (50 kWh -> 200 kW, in the wall-clock window) must NOT set it; 40 kWh -> 160 kW does.
    expect(cyc.peakWindowDemandKw).toBe(160);
    // Max demand still sees every interval (the 20:30 WOP 200 kW is the cycle max).
    expect(cyc.maxDemandKw).toBe(200);
  });

  it("routes WPP-coded intervals to partial_peak", () => {
    const c = (start: string, kWh: number, touCode: string): IntervalReading => ({
      start,
      durationSec: 900,
      kWh,
      touCode,
    });
    const intervals: IntervalReading[] = [
      c("2026-07-15T22:00:00.000Z", 12, "WPP"), // 15:00 PDT, coded partial peak
      c("2026-07-15T23:30:00.000Z", 30, "WPK"), // 16:30 PDT, coded peak
      c("2026-07-16T09:30:00.000Z", 7, "WOP"), // off-peak
    ];
    const bills: CycleBill[] = [
      { start: "2026-07-01", close: "2026-07-31", demandChargeUsd: null, peakKw: 0 },
    ];
    const { cycles } = bucketUsage(intervals, bills, TZ, CARD);
    const cyc = cycles[0]!;
    expect(cyc.energyKwh.peak).toBe(30);
    expect(cyc.energyKwh.partial_peak).toBe(12);
    expect(cyc.energyKwh.off_peak).toBe(7);
  });

  it("falls back to the wall-clock window when an interval carries no TOU Code (ESPI/Bayou)", () => {
    // Code-less intervals (the XML feed) keep the legacy 4-9pm bucketing untouched.
    const intervals: IntervalReading[] = [
      r("2026-07-15T01:00:00.000Z", 28), // 18:00 PDT, in 16-21 window -> peak
      r("2026-07-15T09:00:00.000Z", 5), // 02:00 PDT -> off-peak
    ];
    const bills: CycleBill[] = [
      { start: "2026-07-01", close: "2026-07-31", demandChargeUsd: null, peakKw: 100 },
    ];
    const { cycles } = bucketUsage(intervals, bills, TZ, CARD);
    expect(cycles[0]!.energyKwh.peak).toBe(28);
    expect(cycles[0]!.energyKwh.off_peak).toBe(5);
    expect(cycles[0]!.energyKwh.partial_peak).toBe(0);
  });
});

// A demand-heavy, low-energy summer cycle: the classic low-load-factor pump that
// overpays on a demand rate. One cycle keeps the arithmetic checkable.
const demandHeavy: MeterUsageProfile = {
  observedPeakKw: 100,
  cycles: [
    {
      start: "2026-07-01",
      close: "2026-07-31",
      season: "summer",
      energyKwh: { peak: 0, partial_peak: 0, off_peak: 1000 },
      maxDemandKw: 100,
      peakWindowDemandKw: 0,
    } satisfies CycleUsage,
  ],
};
// AG-C2: 1000*0.10 + 100*20 + 50 = 2150 ; AG-A2: 1000*0.20 + 80 = 280 -> save 1870

describe("rateOptimization gating", () => {
  it("emits an 'act' switch when the model reproduces the real bill and savings are material", () => {
    const res = rateOptimization({
      farmId: "f",
      pumpId: "p",
      pumpName: "South Well",
      currentSchedule: "AG-C",
      profile: demandHeavy,
      actualAnnualBillUsd: 2150, // matches the AG-C model exactly
      card: CARD,
      asOf: "2026-06-04",
    });
    expect(res.modeledCurrentUsd).toBe(2150);
    expect(res.reproductionError).toBe(0);
    expect(res.withinTolerance).toBe(true);
    expect(res.bestSchedule).toBe("AG-A");
    expect(res.savingsUsd).toBe(1870);
    expect(res.recommendation?.severity).toBe("act");
    expect(res.recommendation?.impactUsd).toBe(1870);
    expect(res.recommendation?.action.kind).toBe("switch_rate");
    expect((res.recommendation?.action.params as Record<string, unknown>).toSchedule).toBe("AG-A");
  });

  it("demotes to a rough 'info' estimate when the model cannot reproduce the bill", () => {
    const res = rateOptimization({
      farmId: "f",
      pumpId: "p",
      pumpName: "South Well",
      currentSchedule: "AG-C",
      profile: demandHeavy,
      actualAnnualBillUsd: 4300, // model is off by 50%
      card: CARD,
      asOf: "2026-06-04",
    });
    expect(res.withinTolerance).toBe(false);
    expect(res.recommendation?.severity).toBe("info");
    expect(res.recommendation?.impactNote).toBe(en.rateOptimization.lowConfidence(50));
  });

  it("recommends nothing when the meter is already on its cheapest eligible rate", () => {
    // Huge energy, modest demand: AG-C's cheap energy beats AG-A's premium -> AG-C is best.
    const energyHeavy: MeterUsageProfile = {
      observedPeakKw: 100,
      cycles: [
        {
          start: "2026-07-01",
          close: "2026-07-31",
          season: "summer",
          energyKwh: { peak: 0, partial_peak: 0, off_peak: 100000 },
          maxDemandKw: 100,
          peakWindowDemandKw: 0,
        },
      ],
    };
    const res = rateOptimization({
      farmId: "f",
      pumpId: "p",
      pumpName: "Flat Load",
      currentSchedule: "AG-C",
      profile: energyHeavy,
      actualAnnualBillUsd: 12050,
      card: CARD,
      asOf: "2026-06-04",
    });
    expect(res.savingsUsd).toBeLessThanOrEqual(0);
    expect(res.recommendation).toBeNull();
  });

  it("says nothing about a non-ag meter", () => {
    const res = rateOptimization({
      farmId: "f",
      pumpId: "p",
      pumpName: "Shop",
      currentSchedule: "B-1",
      profile: demandHeavy,
      actualAnnualBillUsd: 2150,
      card: CARD,
      asOf: "2026-06-04",
    });
    expect(res.recommendation).toBeNull();
  });
});

describe("rateOptimization against the shipped rate card", () => {
  const card = loadRateCard();

  // A 150 HP well: hard, short summer bursts (low load factor), dormant in winter.
  const summer = (): CycleUsage => ({
    start: "2026-07-01",
    close: "2026-07-31",
    season: "summer",
    energyKwh: { peak: 2000, partial_peak: 0, off_peak: 10000 },
    maxDemandKw: 112,
    peakWindowDemandKw: 95,
  });
  const winter = (): CycleUsage => ({
    start: "2026-01-01",
    close: "2026-01-31",
    season: "winter",
    energyKwh: { peak: 0, partial_peak: 0, off_peak: 500 },
    maxDemandKw: 12,
    peakWindowDemandKw: 0,
  });
  const hero: MeterUsageProfile = {
    observedPeakKw: 112,
    cycles: [...Array(6)].map(summer).concat([...Array(6)].map(winter)),
  };

  it("finds the hero case: a low-load-factor AG-C pump should move to AG-B and save thousands a year", () => {
    // Hand-computed from the 2026-06.2 card (OFFICIAL secondary-voltage rates eff
    // 2026-03-01): AG-C2 summer = 2000x0.21329 + 10000x0.17385 + 112x21.43 + 95x29.92
    // + 43.60 = 7451.24; winter = 500x0.15981 + 12x21.43 + 43.60 = 380.665 ->
    // 6x7451.24 + 6x380.665 = 46991.43. The cheapest eligible alternative is now AG-B
    // (corrected to NO demand charge), not AG-A2 (which carries an 11.79/kW max-demand).
    const modeledAgC = 46991.43;
    const res = rateOptimization({
      farmId: "batth",
      pumpId: "hero",
      pumpName: "Lateral 3 Booster",
      currentSchedule: "AG-C",
      profile: hero,
      actualAnnualBillUsd: modeledAgC, // bills reconstructed from AG-C -> error 0
      card,
      asOf: "2026-06-04",
    });
    expect(res.modeledCurrentUsd).toBe(modeledAgC);
    expect(res.reproductionError).toBe(0);
    expect(res.bestSchedule).toBe("AG-B");
    expect(res.savingsUsd).toBeGreaterThan(2000);
    expect(res.savingsUsd).toBe(19180.02);
    expect(res.recommendation?.severity).toBe("act");
  });

  it("treats legacy AG-4/AG-5 as a source but never a target", () => {
    const res = rateOptimization({
      farmId: "batth",
      pumpId: "legacy",
      pumpName: "Old North Well",
      currentSchedule: "AG-4",
      profile: hero,
      actualAnnualBillUsd: 1, // force out of tolerance; we only check the target here
      card,
      asOf: "2026-06-04",
    });
    expect(res.bestSchedule).not.toBeNull();
    expect(["AG-A", "AG-B", "AG-C"]).toContain(res.bestSchedule);
  });
});
