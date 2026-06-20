import { describe, expect, it } from "vitest";
import type { MeterPeriodView } from "@/lib/dashboard/load";
import {
  compareRates,
  cyclePriceInputFromPeriod,
  rateBill,
} from "./rate-bill";
import { priceCycleCents, planFor, type RateCard, type RatePlan } from "./rates";

// A hand-built card with simple prices so every expectation is hand-computable. Same
// discipline as rate-lever.test.ts: the card is the only price source.
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
    plan({ schedule: "AG-B2", family: "AG-B", sizeClass: "large", customerChargePerDay: 0.9 }),
    plan({
      schedule: "AG-C2",
      family: "AG-C",
      sizeClass: "large",
      customerChargePerDay: 1.4,
      demandChargeLimiterPerKwh: 0.5,
      summer: {
        energy: { peak: 0.22, partial_peak: 0.2, off_peak: 0.18 },
        demand: { maxDemandPerKw: 25, peakPeriodDemandPerKw: 9 },
      },
    }),
  ],
};

function winterPeriod(overrides: Partial<MeterPeriodView> = {}): MeterPeriodView {
  return {
    start: "2026-01-01T00:00:00.000Z",
    close: "2026-01-30T00:00:00.000Z", // inclusive span = 30 days
    printedTotalCents: null,
    demandCents: null,
    peakKw: 100,
    tariff: "AG-A2",
    lineItems: [
      { kind: "tou_energy", label: "Peak", amountCents: 0, quantity: 1000, unit: "kWh", rate: null },
      { kind: "tou_energy", label: "Part-Peak", amountCents: 0, quantity: 500, unit: "kWh", rate: null },
      { kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: 2000, unit: "kWh", rate: null },
    ],
    ...overrides,
  };
}

describe("cyclePriceInputFromPeriod", () => {
  it("derives days, season, TOU buckets, and demand from a winter period", () => {
    const input = cyclePriceInputFromPeriod(winterPeriod(), CARD);
    expect(input).not.toBeNull();
    expect(input?.days).toBe(30);
    expect(input?.season).toBe("winter");
    expect(input?.energyKwh).toEqual({ peak: 1000, partial_peak: 500, off_peak: 2000 });
    expect(input?.maxDemandKw).toBe(100);
    // Winter carries no peak-window demand.
    expect(input?.peakWindowDemandKw).toBeNull();
  });

  it("maps the 'Partial' spelling and sums duplicate buckets", () => {
    const input = cyclePriceInputFromPeriod(
      winterPeriod({
        lineItems: [
          { kind: "tou_energy", label: "Partial", amountCents: 0, quantity: 300, unit: "kWh", rate: null },
          { kind: "tou_energy", label: "Part-Peak", amountCents: 0, quantity: 200, unit: "kWh", rate: null },
        ],
      }),
      CARD,
    );
    expect(input?.energyKwh.partial_peak).toBe(500);
  });

  it("sets the peak-window demand kW for a summer period when the card prices it", () => {
    const input = cyclePriceInputFromPeriod(
      winterPeriod({
        start: "2026-07-01T00:00:00.000Z",
        close: "2026-07-30T00:00:00.000Z",
        peakKw: 80,
      }),
      CARD,
    );
    expect(input?.season).toBe("summer");
    expect(input?.peakWindowDemandKw).toBe(80);
  });

  it("returns null when there is no energy and no demand to price", () => {
    const input = cyclePriceInputFromPeriod(
      winterPeriod({ peakKw: null, lineItems: [] }),
      CARD,
    );
    expect(input).toBeNull();
  });

  it("ignores non-energy line items and unmappable TOU labels", () => {
    const input = cyclePriceInputFromPeriod(
      winterPeriod({
        peakKw: null,
        lineItems: [
          { kind: "other", label: "Customer Charge 30 days @ $0.70", amountCents: 2100, quantity: null, unit: null, rate: null },
          { kind: "tou_energy", label: "Super Off-Peak", amountCents: 0, quantity: 999, unit: "kWh", rate: null },
        ],
      }),
      CARD,
    );
    // The only TOU label was unmappable and there is no demand: nothing priceable.
    expect(input).toBeNull();
  });
});

describe("rateBill", () => {
  it("prices the input under a schedule and matches priceCycleCents directly", () => {
    const input = cyclePriceInputFromPeriod(winterPeriod(), CARD);
    expect(input).not.toBeNull();
    const bill = rateBill(input!, "AG-A2", "large", CARD);
    const plan = planFor(CARD, "AG-A2", "large")!;
    expect(bill?.schedule).toBe("AG-A2");
    expect(bill?.sizeClass).toBe("large");
    expect(bill?.breakdown).toEqual(priceCycleCents(input!, plan));
  });

  it("returns null when the card carries no plan for the family/size", () => {
    // The card has AG-B only at the large tier; the small AG-B row is absent.
    const input = cyclePriceInputFromPeriod(winterPeriod(), CARD);
    expect(rateBill(input!, "AG-B2", "small", CARD)).toBeNull();
  });
});

describe("compareRates", () => {
  it("runs the SAME usage through both plans and returns a signed saving", () => {
    const input = cyclePriceInputFromPeriod(winterPeriod(), CARD);
    expect(input).not.toBeNull();
    const cmp = compareRates(input!, "AG-A2", "AG-B2", "large", CARD);
    expect(cmp).not.toBeNull();
    // Both bills priced the identical input.
    const fromPlan = planFor(CARD, "AG-A2", "large")!;
    const toPlan = planFor(CARD, "AG-B2", "large")!;
    const fromTotal = priceCycleCents(input!, fromPlan).totalCents;
    const toTotal = priceCycleCents(input!, toPlan).totalCents;
    expect(cmp?.from.breakdown.totalCents).toBe(fromTotal);
    expect(cmp?.to.breakdown.totalCents).toBe(toTotal);
    expect(cmp?.saveCents).toBe(fromTotal - toTotal);
  });

  it("saveCents can be negative (the target rate is more expensive)", () => {
    const input = cyclePriceInputFromPeriod(winterPeriod(), CARD);
    const cheaper = compareRates(input!, "AG-A2", "AG-C2", "large", CARD);
    const dearer = compareRates(input!, "AG-C2", "AG-A2", "large", CARD);
    expect(cheaper).not.toBeNull();
    expect(dearer).not.toBeNull();
    // The two directions are exact negatives of each other.
    expect(cheaper?.saveCents).toBe(-(dearer?.saveCents ?? NaN));
  });

  it("returns null when either schedule has no plan at the size class", () => {
    // AG-C has no small row in this card, so the `to` side cannot be priced.
    const input = cyclePriceInputFromPeriod(winterPeriod(), CARD);
    expect(compareRates(input!, "AG-A1", "AG-C2", "small", CARD)).toBeNull();
  });

  it("a real-card winter cycle priced on its own schedule reconciles near its bill", () => {
    // Hand-price one winter cycle the way a bill would print it on AG-A2, then confirm
    // pricing the SAME input on AG-A2 reproduces that total within a cent (the comparator
    // is exactly the bill recompute, so the only drift is the card's own rounding).
    const input = cyclePriceInputFromPeriod(winterPeriod(), CARD);
    const plan = planFor(CARD, "AG-A2", "large")!;
    // Expected: energy 1000*0.3 + 500*0.25 + 2000*0.15 = 300 + 125 + 300 = $725.00
    // demand 100*20 = $2000.00; customer 30*0.7 = $21.00; total $2746.00 = 274600 cents.
    const billedTotalCents = 274600;
    const recomputed = rateBill(input!, "AG-A2", "large", CARD)!.breakdown.totalCents;
    expect(recomputed).toBe(priceCycleCents(input!, plan).totalCents);
    expect(Math.abs(recomputed - billedTotalCents)).toBeLessThanOrEqual(1);
  });
});
