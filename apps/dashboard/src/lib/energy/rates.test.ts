import { describe, expect, it } from "vitest";
import {
  annualCostUnderRate,
  cycleCostUnderPlan,
  familyOf,
  planFor,
  priceCycleCents,
  seasonFor,
  sizeClassFor,
  type CycleUsage,
  type MeterUsageProfile,
  type RateCard,
  type RatePlan,
} from "./rates";

// A tiny hand-priced card so the cost math is asserted against numbers we can
// verify by hand, independent of the shipped fixture's exact prices.
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

const cycle = (over: Partial<CycleUsage> = {}): CycleUsage => ({
  start: "2026-07-01",
  close: "2026-07-31",
  season: "summer",
  energyKwh: { peak: 0, partial_peak: 0, off_peak: 0 },
  maxDemandKw: 0,
  peakWindowDemandKw: 0,
  ...over,
});

describe("seasonFor / sizeClassFor / familyOf", () => {
  it("assigns May-Oct to summer, the rest to winter", () => {
    expect(seasonFor(7, CARD)).toBe("summer");
    expect(seasonFor(12, CARD)).toBe("winter");
    expect(seasonFor("2026-06-01", CARD)).toBe("summer");
    expect(seasonFor("2026-01-15T08:00:00.000Z", CARD)).toBe("winter");
  });

  it("splits at 35 kW", () => {
    expect(sizeClassFor(36, CARD)).toBe("large");
    expect(sizeClassFor(35, CARD)).toBe("small");
  });

  it("normalizes a schedule label to its family", () => {
    expect(familyOf("AG-C2")).toBe("AG-C");
    expect(familyOf("AG-C")).toBe("AG-C");
    expect(familyOf("ag-a1")).toBe("AG-A");
    expect(familyOf("AG-4")).toBe("AG-4");
  });
});

describe("cycleCostUnderPlan", () => {
  const agA2 = planFor(CARD, "AG-A", "large")!;
  const agC2 = planFor(CARD, "AG-C", "large")!;

  it("prices AG-C with energy + max-demand + summer peak-period demand + customer charge", () => {
    const u = cycle({
      energyKwh: { peak: 1000, partial_peak: 0, off_peak: 5000 },
      maxDemandKw: 100,
      peakWindowDemandKw: 90,
    });
    // 1000*0.18 + 5000*0.10 + 100*20 + 90*10 + 50 = 180 + 500 + 2000 + 900 + 50
    expect(cycleCostUnderPlan(u, agC2)).toBe(3630);
  });

  it("prices AG-A with energy + customer charge only (no demand charge)", () => {
    const u = cycle({
      energyKwh: { peak: 1000, partial_peak: 0, off_peak: 5000 },
      maxDemandKw: 100,
      peakWindowDemandKw: 90,
    });
    // 1000*0.40 + 5000*0.20 + 80 = 400 + 1000 + 80; demand ignored
    expect(cycleCostUnderPlan(u, agA2)).toBe(1480);
  });

  it("drops the peak-period demand charge in winter", () => {
    const u = cycle({
      season: "winter",
      start: "2026-01-01",
      close: "2026-01-31",
      energyKwh: { peak: 0, partial_peak: 0, off_peak: 1000 },
      maxDemandKw: 50,
      peakWindowDemandKw: 50,
    });
    // 1000*0.10 + 50*20 (max only) + 50 = 100 + 1000 + 50; no peak-period demand
    expect(cycleCostUnderPlan(u, agC2)).toBe(1150);
  });
});

describe("priceCycleCents", () => {
  // A hand-priced demand-carrying plan with the limiter, AG-C-shaped.
  const demandPlan: RatePlan = {
    schedule: "AG-C2",
    family: "AG-C",
    sizeClass: "large",
    legacy: false,
    agricultural: true,
    customerChargePerMonth: 45,
    customerChargePerDay: 1.5,
    demandChargeLimiterPerKwh: 0.5,
    summer: {
      energy: { peak: 0.2, partial_peak: 0.15, off_peak: 0.1 },
      demand: { maxDemandPerKw: 20, peakPeriodDemandPerKw: 10 },
    },
    winter: {
      energy: { peak: 0.15, partial_peak: 0.12, off_peak: 0.1 },
      demand: { maxDemandPerKw: 20 },
    },
  };
  const energyOnlyPlan: RatePlan = {
    ...demandPlan,
    schedule: "AG-A2",
    family: "AG-A",
    demandChargeLimiterPerKwh: undefined,
    summer: { energy: demandPlan.summer.energy, demand: {} },
    winter: { energy: demandPlan.winter.energy, demand: {} },
  };

  it("prices a summer cycle per component in integer cents, limiter engaged", () => {
    const b = priceCycleCents(
      {
        days: 30,
        season: "summer",
        energyKwh: { peak: 100, off_peak: 1000 }, // partial_peak absent = 0 kWh
        maxDemandKw: 50,
        peakWindowDemandKw: 40,
      },
      demandPlan,
    );
    // customer 30 x 1.50 = $45.00; energy 100x0.20 + 1000x0.10 = $120.00;
    // max demand 50x20 = $1,000.00; peak demand raw 40x10 = $400 capped at
    // 0.50 x 100 peak kWh = $50.00 (the limiter protects the spike).
    expect(b.customerCents).toBe(4500);
    expect(b.energyCents).toBe(12000);
    expect(b.demandCents).toBe(100000 + 5000);
    expect(b.totalCents).toBe(4500 + 12000 + 105000);
  });

  it("leaves the peak-period demand uncapped when no limiter is on the plan", () => {
    const noLimiter: RatePlan = { ...demandPlan, demandChargeLimiterPerKwh: undefined };
    const b = priceCycleCents(
      {
        days: 30,
        season: "summer",
        energyKwh: { peak: 100, off_peak: 1000 },
        maxDemandKw: 50,
        peakWindowDemandKw: 40,
      },
      noLimiter,
    );
    expect(b.demandCents).toBe(100000 + 40000);
  });

  it("does not engage the limiter below the cap", () => {
    const b = priceCycleCents(
      {
        days: 30,
        season: "summer",
        energyKwh: { peak: 10000, off_peak: 0 }, // cap = 0.50 x 10000 = $5,000
        maxDemandKw: 0,
        peakWindowDemandKw: 40, // raw $400 < cap
      },
      demandPlan,
    );
    expect(b.demandCents).toBe(40000);
  });

  it("prices no peak-period demand in winter (the card carries none there)", () => {
    const b = priceCycleCents(
      {
        days: 30,
        season: "winter",
        energyKwh: { off_peak: 1000 },
        maxDemandKw: 50,
        peakWindowDemandKw: 40,
      },
      demandPlan,
    );
    // 50x20 max demand only.
    expect(b.demandCents).toBe(100000);
  });

  it("prices an energy-only plan with a zero demand component", () => {
    const b = priceCycleCents(
      {
        days: 30,
        season: "summer",
        energyKwh: { peak: 100, off_peak: 1000 },
        maxDemandKw: 50,
        peakWindowDemandKw: 40,
      },
      energyOnlyPlan,
    );
    expect(b.demandCents).toBe(0);
    expect(b.totalCents).toBe(4500 + 12000);
  });

  it("prices a null billed demand at 0, never an invented kW", () => {
    const b = priceCycleCents(
      { days: 30, season: "summer", energyKwh: { off_peak: 1000 }, maxDemandKw: null },
      demandPlan,
    );
    expect(b.demandCents).toBe(0);
  });

  it("rounds each component like the bill prints it (real AGB line: 4.873 kWh @ 0.34015 = $1.66)", () => {
    const agbLike: RatePlan = {
      ...energyOnlyPlan,
      winter: { energy: { peak: 0.34015, partial_peak: 0, off_peak: 0.31089 }, demand: {} },
    };
    const b = priceCycleCents(
      { days: 0, season: "winter", energyKwh: { peak: 4.873 }, maxDemandKw: null },
      agbLike,
    );
    expect(b.energyCents).toBe(166);
  });

  it("floors the limiter cap at zero: NEM-export peak kWh never creates a demand credit", () => {
    const b = priceCycleCents(
      {
        days: 30,
        season: "summer",
        energyKwh: { peak: -100, off_peak: 1000 }, // a net-export peak bucket
        maxDemandKw: 0,
        peakWindowDemandKw: 40,
      },
      demandPlan,
    );
    // cap = max(0, 0.50 x -100) = 0 -> the component prices 0, never -5000.
    expect(b.demandCents).toBe(0);
  });

  it("prices negative energy as a credit line but throws on non-finite or negative structural inputs", () => {
    const credit = priceCycleCents(
      { days: 30, season: "winter", energyKwh: { off_peak: -100 }, maxDemandKw: null },
      energyOnlyPlan,
    );
    expect(credit.energyCents).toBe(-1000); // -100 x 0.10
    expect(() =>
      priceCycleCents({ days: NaN, season: "winter", energyKwh: {}, maxDemandKw: null }, energyOnlyPlan),
    ).toThrow(/day count/);
    expect(() =>
      priceCycleCents(
        { days: 30, season: "winter", energyKwh: { peak: Infinity }, maxDemandKw: null },
        energyOnlyPlan,
      ),
    ).toThrow(/energy/);
    expect(() =>
      priceCycleCents({ days: 30, season: "winter", energyKwh: {}, maxDemandKw: -5 }, demandPlan),
    ).toThrow(/demand kW/);
  });

  it("derives the per-day customer charge from the monthly figure when a card omits it", () => {
    const monthlyOnly: RatePlan = { ...energyOnlyPlan, customerChargePerDay: undefined, customerChargePerMonth: 73 };
    const b = priceCycleCents(
      { days: 30, season: "summer", energyKwh: {}, maxDemandKw: null },
      monthlyOnly,
    );
    // 73 x 12 / 365 = $2.40/day x 30 = $72.00
    expect(b.customerCents).toBe(7200);
  });
});

describe("annualCostUnderRate", () => {
  it("sums the cycles under a plan", () => {
    const profile: MeterUsageProfile = {
      observedPeakKw: 100,
      cycles: [
        cycle({ energyKwh: { peak: 0, partial_peak: 0, off_peak: 1000 }, maxDemandKw: 100, peakWindowDemandKw: 0 }),
        cycle({ energyKwh: { peak: 0, partial_peak: 0, off_peak: 1000 }, maxDemandKw: 100, peakWindowDemandKw: 0 }),
      ],
    };
    const agC2 = planFor(CARD, "AG-C", "large")!;
    // per cycle: 1000*0.10 + 100*20 + 50 = 2150; x2 = 4300
    expect(annualCostUnderRate(profile, agC2)).toBe(4300);
  });
});
