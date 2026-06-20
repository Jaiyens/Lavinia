import { describe, expect, it } from "vitest";
import { solarNemChecks } from "./solar-nem";
import type { CycleBill } from "./types";

const TZ = "America/Los_Angeles";

const base = {
  farmId: "f",
  pumpId: "p",
  pumpName: "Home Ranch Solar",
  timezone: TZ,
  nemType: "nem2",
  trueUpMonth: 9,
  solarKw: 840,
  asOf: "2026-06-04",
};

// 19:30 PDT (an evening peak) vs 13:00 PDT (midday, when solar is strong).
const eveningPeak: CycleBill = {
  start: "2026-07-01",
  close: "2026-07-31",
  demandChargeUsd: 4200,
  peakKw: 138,
  peakAt: "2026-07-16T02:30:00.000Z", // 19:30 PDT
};
const middayPeak: CycleBill = {
  start: "2026-08-01",
  close: "2026-08-31",
  demandChargeUsd: 1000,
  peakKw: 90,
  peakAt: "2026-08-16T20:00:00.000Z", // 13:00 PDT
};

describe("solarNemChecks", () => {
  it("flags that solar is not covering an evening-set demand charge", () => {
    const recs = solarNemChecks({ ...base, bills: [eveningPeak, middayPeak] });
    const flag = recs.find((r) => r.action.kind === "review_solar_peak");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("watch");
    expect(flag?.impactUsd).toBe(4200); // the worst evening-set charge
  });

  it("emits a NEM2 true-up tracking note", () => {
    const recs = solarNemChecks({ ...base, bills: [eveningPeak] });
    const trueUp = recs.find((r) => r.action.kind === "track_trueup");
    expect(trueUp).toBeDefined();
    expect(trueUp?.severity).toBe("info");
    expect(trueUp?.situation).toContain("September");
  });

  it("does not raise the demand-peak flag when the peak is set midday", () => {
    const recs = solarNemChecks({ ...base, bills: [middayPeak] });
    expect(recs.find((r) => r.action.kind === "review_solar_peak")).toBeUndefined();
  });

  it("says nothing for a meter with no solar", () => {
    const recs = solarNemChecks({ ...base, solarKw: null, bills: [eveningPeak] });
    expect(recs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Story 3.4: nemDemandInsight + summarizeNemMonths.
// ---------------------------------------------------------------------------

import {
  NET_ZERO_FLOOR_KWH,
  demandUncoveredShare,
  nemDemandInsight,
  summarizeNemMonths,
  type NemDemandInsightInput,
} from "./solar-nem";
import type { RateCard, RatePlan } from "./rates";

function miniPlan(schedule: string, family: string, sizeClass: "small" | "large"): RatePlan {
  return {
    schedule,
    family,
    sizeClass,
    legacy: false,
    agricultural: true,
    customerChargePerMonth: 30,
    summer: { energy: { peak: 0.3, partial_peak: 0.2, off_peak: 0.1 }, demand: {} },
    winter: { energy: { peak: 0.3, partial_peak: 0.2, off_peak: 0.1 }, demand: {} },
  };
}

const MINI_CARD: RateCard = {
  utility: "PG&E",
  effectiveDate: "2026-03-01",
  source: "test",
  summerMonths: [5, 6, 7, 8, 9, 10],
  sizeBreakKw: 35,
  plans: [
    miniPlan("AG-C2", "AG-C", "large"),
    miniPlan("AG-C1", "AG-C", "small"),
    miniPlan("AG-A1", "AG-A", "small"),
    miniPlan("AG-A2", "AG-A", "large"),
    miniPlan("AG-B2", "AG-B", "large"),
    miniPlan("AG-B1", "AG-B", "small"),
  ],
};

function insightInput(over: Partial<NemDemandInsightInput> = {}): NemDemandInsightInput {
  return {
    isSolar: true,
    scheduleLabel: "AGC Ag35+ kW High Use",
    coverageState: "reconciled",
    nemMonths: [
      { start: "2025-12-01", netKwh: 5, amountCents: 90 },
      { start: "2026-01-01", netKwh: 10, amountCents: 200 },
      { start: "2026-02-01", netKwh: -8, amountCents: -150 },
    ],
    cycleDemandCents: [250, null, 119],
    trueUpAmountCents: 290,
    card: MINI_CARD,
    ...over,
  };
}

describe("nemDemandInsight gates (AC1: fail closed)", () => {
  it("renders for a reconciled NEM solar meter on the AG-C family with demand owed", () => {
    const r = nemDemandInsight(insightInput());
    expect(r).not.toBeNull();
    expect(r?.demandOwedCents).toBe(369);
    expect(r?.position).toBe("net_zero"); // |7| kWh net under the 50 kWh floor
    expect(r?.nemChargesCents).toBe(140);
    expect(r?.trueUpAmountCents).toBe(290);
  });

  it("never renders for a non-solar meter", () => {
    expect(nemDemandInsight(insightInput({ isSolar: false }))).toBeNull();
  });

  it("never renders off the AG-C family (no demand-carrying schedule gate)", () => {
    expect(nemDemandInsight(insightInput({ scheduleLabel: "AGA1 Ag<35 kW Low Use" }))).toBeNull();
    expect(nemDemandInsight(insightInput({ scheduleLabel: "AG5C" }))).toBeNull();
    expect(nemDemandInsight(insightInput({ scheduleLabel: "B1 Bus Low Use" }))).toBeNull();
    expect(nemDemandInsight(insightInput({ scheduleLabel: null }))).toBeNull();
  });

  it("never renders for an unreconciled meter (the dollar would be unquotable)", () => {
    expect(nemDemandInsight(insightInput({ coverageState: "needs_review" }))).toBeNull();
    expect(nemDemandInsight(insightInput({ coverageState: "no_bill" }))).toBeNull();
  });

  it("never renders with no demand charge (AC1's explicit clause)", () => {
    expect(nemDemandInsight(insightInput({ cycleDemandCents: [null, null] }))).toBeNull();
    expect(nemDemandInsight(insightInput({ cycleDemandCents: [0] }))).toBeNull();
    expect(nemDemandInsight(insightInput({ cycleDemandCents: [] }))).toBeNull();
  });

  it("never renders without printed NEM months (position is never guessed)", () => {
    expect(nemDemandInsight(insightInput({ nemMonths: [] }))).toBeNull();
  });

  it("scopes the position claim to its evidence: monthsCounted rides on the insight", () => {
    const two = insightInput({
      nemMonths: [
        { start: "2026-01-01", netKwh: 0.04, amountCents: 1 },
        { start: "2026-02-01", netKwh: 0, amountCents: 0 },
      ],
    });
    const r = nemDemandInsight(two);
    // The insight renders (AC1: a qualifying meter renders), but carries the
    // month count so the copy can scope the claim ("across its last 2 solar
    // statements") instead of asserting an annual position.
    expect(r?.monthsCounted).toBe(2);
    expect(r?.position).toBe("net_zero");
  });

  it("does not mutate its inputs", () => {
    const input = insightInput();
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;
    nemDemandInsight(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });
});

describe("summarizeNemMonths positions", () => {
  it("reads net consumer / net credit outside the band, net zero inside", () => {
    const consumer = summarizeNemMonths([
      { start: "a", netKwh: 12000, amountCents: 100 },
      { start: "b", netKwh: 5000, amountCents: 100 },
    ]);
    expect(consumer?.position).toBe("net_consumer");

    const credit = summarizeNemMonths([
      { start: "a", netKwh: -12000, amountCents: -100 },
      { start: "b", netKwh: 11000, amountCents: 90 },
    ]);
    expect(credit?.position).toBe("net_credit");

    // Sum 17 kWh on a small-month series: inside the 50 kWh floor.
    const zero = summarizeNemMonths([
      { start: "a", netKwh: 14, amountCents: 240 },
      { start: "b", netKwh: 3, amountCents: 50 },
    ]);
    expect(zero?.position).toBe("net_zero");
  });

  it("the band scales with the series: 1% of the biggest month beats the floor", () => {
    // Biggest month 40,000 kWh -> band 400; a 300 kWh net is zero, 500 is consumer.
    const inside = summarizeNemMonths([
      { start: "a", netKwh: 40000, amountCents: 0 },
      { start: "b", netKwh: -39700, amountCents: 0 },
    ]);
    expect(inside?.position).toBe("net_zero");
    const outside = summarizeNemMonths([
      { start: "a", netKwh: 40000, amountCents: 0 },
      { start: "b", netKwh: -39500, amountCents: 0 },
    ]);
    expect(outside?.position).toBe("net_consumer");
    expect(NET_ZERO_FLOOR_KWH).toBe(50);
  });

  it("dedupes repeated months by CALENDAR month, absorbing off-by-a-day starts", () => {
    // Real statements print 2025-12-11 / 2025-12-12 / 2025-12-13 for one December.
    const s = summarizeNemMonths([
      { start: "2025-12-11T00:00:00.000Z", netKwh: 100, amountCents: 10 },
      { start: "2025-12-12T00:00:00.000Z", netKwh: 100, amountCents: 10 },
      { start: "2025-12-13T00:00:00.000Z", netKwh: 100, amountCents: 10 },
      { start: "2026-02-01T00:00:00.000Z", netKwh: 50, amountCents: 5 },
    ]);
    expect(s?.monthsCounted).toBe(2);
    expect(s?.netKwh).toBe(150);
    expect(s?.nemChargesCents).toBe(15);
  });

  it("returns null for an empty series", () => {
    expect(summarizeNemMonths([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Story E-1 (FR21): demandUncoveredShare.
// ---------------------------------------------------------------------------

describe("demandUncoveredShare (FR21: the uncovered share)", () => {
  it("returns the demand-vs-total share from honest billed figures", () => {
    // demand 369, offsettable 369 -> half the bill is the unoffset demand.
    expect(demandUncoveredShare({ demandOwedCents: 369, offsettableCents: 369 })).toBeCloseTo(0.5);
    // demand 600, offsettable 400 -> 60% of the bill solar does not cover.
    expect(demandUncoveredShare({ demandOwedCents: 600, offsettableCents: 400 })).toBeCloseTo(0.6);
  });

  it("is 1 when nothing is solar-offsettable (the whole bill is the demand charge)", () => {
    expect(demandUncoveredShare({ demandOwedCents: 500, offsettableCents: 0 })).toBe(1);
  });

  it("is 0 when the demand charge is zero", () => {
    expect(demandUncoveredShare({ demandOwedCents: 0, offsettableCents: 800 })).toBe(0);
  });

  it("returns null when the offsettable portion is not on file (fail closed)", () => {
    expect(demandUncoveredShare({ demandOwedCents: 369, offsettableCents: null })).toBeNull();
  });

  it("returns null when the denominator is non-positive (no divide-by-zero)", () => {
    expect(demandUncoveredShare({ demandOwedCents: 0, offsettableCents: 0 })).toBeNull();
  });

  it("returns null for a negative figure (not a quotable ratio)", () => {
    expect(demandUncoveredShare({ demandOwedCents: -100, offsettableCents: 500 })).toBeNull();
    expect(demandUncoveredShare({ demandOwedCents: 500, offsettableCents: -100 })).toBeNull();
  });

  it("carries no dollar: the return is a bare ratio, never a percentage times a dollar", () => {
    const share = demandUncoveredShare({ demandOwedCents: 250, offsettableCents: 750 });
    expect(typeof share).toBe("number");
    expect(share).toBeCloseTo(0.25);
    // A share is a pure ratio; multiplying it back by a dollar is the forbidden
    // FR10 move, so the function must never itself surface a dollar value (> 1
    // would betray a cents figure leaking through).
    expect(share).toBeLessThanOrEqual(1);
  });

  it("never produces a value outside [0,1] across a sweep of honest inputs", () => {
    const demands = [0, 1, 50, 369, 1000, 99999];
    const offsets = [0, 1, 50, 369, 1000, 99999];
    for (const demandOwedCents of demands) {
      for (const offsettableCents of offsets) {
        const share = demandUncoveredShare({ demandOwedCents, offsettableCents });
        if (share === null) continue;
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      }
    }
  });
});
