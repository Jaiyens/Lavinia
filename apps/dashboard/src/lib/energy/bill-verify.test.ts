import { describe, expect, it } from "vitest";
import { BACK_TEST_BAND_PCT, type LeverPeriod } from "./rate-lever";
import { verifyBill } from "./bill-verify";
import { priceCycleCents, type RateCard, type RatePlan } from "./rates";

// A hand-built card with simple prices so every expectation is hand-computable,
// mirroring rate-lever.test.ts (the card is the only price source).
function plan(
  overrides: Partial<RatePlan> & Pick<RatePlan, "schedule" | "family" | "sizeClass">,
): RatePlan {
  return {
    legacy: false,
    agricultural: true,
    customerChargePerMonth: 30,
    customerChargePerDay: 1,
    summer: {
      energy: { peak: 0.4, partial_peak: 0.3, off_peak: 0.2 },
      demand: { maxDemandPerKw: 20 },
    },
    winter: {
      energy: { peak: 0.3, partial_peak: 0.25, off_peak: 0.15 },
      demand: { maxDemandPerKw: 20 },
    },
    ...overrides,
  };
}

const CARD: RateCard = {
  utility: "PG&E",
  effectiveDate: "2026-03-01",
  version: "test-1",
  source: "hand-built test card",
  summerMonths: [5, 6, 7, 8, 9, 10],
  sizeBreakKw: 35,
  plans: [
    plan({ schedule: "AG-A1", family: "AG-A", sizeClass: "small", customerChargePerDay: 0.5 }),
    plan({ schedule: "AG-A2", family: "AG-A", sizeClass: "large", customerChargePerDay: 0.7 }),
    plan({ schedule: "AG-B1", family: "AG-B", sizeClass: "small", customerChargePerDay: 0.9 }),
    plan({ schedule: "AG-B2", family: "AG-B", sizeClass: "large", customerChargePerDay: 0.9 }),
    plan({ schedule: "AG-C1", family: "AG-C", sizeClass: "small", customerChargePerDay: 1.4 }),
    plan({ schedule: "AG-C2", family: "AG-C", sizeClass: "large", customerChargePerDay: 1.4 }),
    plan({ schedule: "AG-4", family: "AG-4", sizeClass: "small", legacy: true, customerChargePerDay: 2.15 }),
    plan({ schedule: "AG-4", family: "AG-4", sizeClass: "large", legacy: true, customerChargePerDay: 2.15 }),
    plan({ schedule: "AG-5", family: "AG-5", sizeClass: "small", legacy: true, customerChargePerDay: 5.3 }),
    plan({ schedule: "AG-5", family: "AG-5", sizeClass: "large", legacy: true, customerChargePerDay: 1.2 }),
  ],
};

// A winter cycle on AG-A1: 29 inclusive days, 100 kWh off-peak. The card prices
// it at 29 * $0.50 (customer) + 100 * $0.15 (off-peak) = $14.50 + $15.00 = $29.50.
const RECOMPUTED_A1_CENTS = 2950;

function billPeriod(overrides: Partial<LeverPeriod> = {}): LeverPeriod {
  return {
    start: "2026-01-01T00:00:00.000Z",
    close: "2026-01-29T00:00:00.000Z",
    printedTotalCents: RECOMPUTED_A1_CENTS,
    lineItems: [
      { kind: "other", label: "Customer Charge 29 days @ $0.50", amountCents: 1450, quantity: null, unit: null, rate: null },
      { kind: "tou_energy", label: "Off-Peak", amountCents: 1500, quantity: 100, unit: "kWh", rate: 0.15 },
    ],
    ...overrides,
  };
}

describe("verifyBill", () => {
  it("verifies an on-band bill (recompute matches the print to within the band)", () => {
    const v = verifyBill({ scheduleLabel: "AG-A1", period: billPeriod() }, CARD);
    expect(v).not.toBeNull();
    expect(v?.printedTotalCents).toBe(RECOMPUTED_A1_CENTS);
    expect(v?.recomputedTotalCents).toBe(RECOMPUTED_A1_CENTS);
    expect(v?.deviationPct).toBe(0);
    expect(v?.verified).toBe(true);
  });

  it("matches the lever's own recompute exactly (the FR-14 licensing relationship)", () => {
    // The badge must price through the same path the lever back-tests with: prove
    // the recomputed total equals a direct priceCycleCents call for the cycle.
    const expected = priceCycleCents(
      { days: 29, season: "winter", energyKwh: { off_peak: 100 }, maxDemandKw: null },
      CARD.plans.find((p) => p.schedule === "AG-A1")!,
    ).totalCents;
    const v = verifyBill({ scheduleLabel: "AG-A1", period: billPeriod() }, CARD);
    expect(v?.recomputedTotalCents).toBe(expected);
  });

  it("fails (verified=false) an off-band bill but still reports the figures", () => {
    // Printed total inflated far above the recompute: a real mismatch, not absence.
    const v = verifyBill(
      { scheduleLabel: "AG-A1", period: billPeriod({ printedTotalCents: 5000 }) },
      CARD,
    );
    expect(v).not.toBeNull();
    expect(v?.verified).toBe(false);
    expect(v?.printedTotalCents).toBe(5000);
    expect(v?.recomputedTotalCents).toBe(RECOMPUTED_A1_CENTS);
    // (2950 - 5000) / 5000 * 100 = -41%
    expect(v?.deviationPct).toBeCloseTo(-41, 5);
  });

  it("returns null (could not check) for an absent or blank schedule", () => {
    expect(verifyBill({ scheduleLabel: null, period: billPeriod() }, CARD)).toBeNull();
    expect(verifyBill({ scheduleLabel: "  ", period: billPeriod() }, CARD)).toBeNull();
  });

  it("returns null for an unmapped / non-ag schedule (no recompute possible)", () => {
    expect(verifyBill({ scheduleLabel: "B1 Bus Low Use", period: billPeriod() }, CARD)).toBeNull();
    expect(verifyBill({ scheduleLabel: "E-19", period: billPeriod() }, CARD)).toBeNull();
  });

  it("returns null for an excluded cycle, never a failed verdict", () => {
    // credit cycle (negative total), zero total, and missing total are all "could
    // not check": absence, not a mismatch.
    expect(verifyBill({ scheduleLabel: "AG-A1", period: billPeriod({ printedTotalCents: -500 }) }, CARD)).toBeNull();
    expect(verifyBill({ scheduleLabel: "AG-A1", period: billPeriod({ printedTotalCents: 0 }) }, CARD)).toBeNull();
    expect(verifyBill({ scheduleLabel: "AG-A1", period: billPeriod({ printedTotalCents: null }) }, CARD)).toBeNull();
    // invalid span (close before start)
    expect(
      verifyBill(
        {
          scheduleLabel: "AG-A1",
          period: billPeriod({ start: "2026-02-01T00:00:00.000Z", close: "2026-01-01T00:00:00.000Z" }),
        },
        CARD,
      ),
    ).toBeNull();
    // a TOU bucket the card cannot price (Super Off-Peak)
    expect(
      verifyBill(
        {
          scheduleLabel: "AG-A1",
          period: billPeriod({
            lineItems: [
              { kind: "tou_energy", label: "Super Off-Peak", amountCents: 1500, quantity: 100, unit: "kWh", rate: 0.15 },
            ],
          }),
        },
        CARD,
      ),
    ).toBeNull();
  });

  it("defaults the band to BACK_TEST_BAND_PCT and honors an override", () => {
    // A ~4% drift: inside the 5% default, outside a tight 2% override.
    const drifted = billPeriod({ printedTotalCents: Math.round(RECOMPUTED_A1_CENTS / 1.04) });
    const dev = Math.abs(verifyBill({ scheduleLabel: "AG-A1", period: drifted }, CARD)!.deviationPct);
    expect(dev).toBeGreaterThan(2);
    expect(dev).toBeLessThan(BACK_TEST_BAND_PCT);
    expect(verifyBill({ scheduleLabel: "AG-A1", period: drifted }, CARD)?.verified).toBe(true);
    expect(verifyBill({ scheduleLabel: "AG-A1", period: drifted }, CARD, { bandPct: 2 })?.verified).toBe(false);
  });

  it("treats a deviation exactly at the band as verified (the boundary is inclusive)", () => {
    // A bill that drifts a few percent hot, then band it at exactly its own
    // deviation: |deviation| == band must verify (<=, not <), and a hair tighter
    // must not. Pins the boundary semantics independent of the exact figures.
    const drifted = billPeriod({ printedTotalCents: 2809 });
    const dev = Math.abs(verifyBill({ scheduleLabel: "AG-A1", period: drifted }, CARD)!.deviationPct);
    expect(verifyBill({ scheduleLabel: "AG-A1", period: drifted }, CARD, { bandPct: dev })?.verified).toBe(true);
    expect(
      verifyBill({ scheduleLabel: "AG-A1", period: drifted }, CARD, { bandPct: dev - 0.0001 })?.verified,
    ).toBe(false);
  });

  it("compares in integer cents (AR-6): no float total ever crosses the verdict", () => {
    const v = verifyBill({ scheduleLabel: "AG-A1", period: billPeriod() }, CARD);
    expect(Number.isInteger(v?.printedTotalCents)).toBe(true);
    expect(Number.isInteger(v?.recomputedTotalCents)).toBe(true);
  });

  it("is pure: same inputs, same verdict, no observable side effects", () => {
    const input = { scheduleLabel: "AG-A1", period: billPeriod() };
    const a = verifyBill(input, CARD);
    const b = verifyBill(input, CARD);
    expect(a).toEqual(b);
  });
});
