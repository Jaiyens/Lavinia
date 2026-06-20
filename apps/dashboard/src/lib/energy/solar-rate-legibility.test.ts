import { describe, expect, it } from "vitest";
import {
  HOURS_PER_YEAR,
  LOW_MEASURED_HOURS,
  measuredAnnualHours,
  rateLegibilityFlag,
  type RateLegibilityCycle,
} from "./solar-rate-legibility";
import type { RateCard, RatePlan } from "./rates";

// Story E-3 (FR24/FR25): the rate-legibility derivation, proven in isolation. The flag is NON-dollar
// (no impactUsd, no $/kW, no $/kWh - the priced rate-fit on a solar meter is staged) and the hours
// come PURELY from per-cycle totalKwh + peakKw summaries, never the interval series (NFR4). Every
// null/absence case is pinned so the flag never fabricates a low-hours reading.

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

/** A 365-day span (one whole year of cycles) so `yearFactor` is exactly 1 and the
 *  hours read as the raw sum(totalKwh)/peakKw, making the arithmetic easy to verify. */
function fullYearCycle(totalKwh: number | null, peakKw: number | null): RateLegibilityCycle {
  return {
    totalKwh,
    peakKw,
    start: "2025-06-01T00:00:00.000Z",
    close: "2026-06-01T00:00:00.000Z",
  };
}

describe("measuredAnnualHours", () => {
  it("derives hours = sum(totalKwh) / peakKw over a full-year span (yearFactor 1)", () => {
    // 100,000 kWh / 50 kW = 2000 hours over a 365-day span.
    const hours = measuredAnnualHours({ cycles: [fullYearCycle(100_000, 50)] });
    expect(hours).toBeCloseTo(2000, 6);
  });

  it("sums energy across cycles and divides by the biggest peak draw", () => {
    const hours = measuredAnnualHours({
      cycles: [
        { totalKwh: 60_000, peakKw: 40, start: "2025-06-01", close: "2025-12-01" },
        { totalKwh: 40_000, peakKw: 50, start: "2025-12-01", close: "2026-06-01" },
      ],
    });
    // sum 100,000 kWh / max peak 50 kW = 2000 hours; the span is the full year (yearFactor 1).
    expect(hours).toBeCloseTo(2000, 0);
  });

  it("scales a partial year of bills up to a full year (a half year is not read as low hours)", () => {
    // 50,000 kWh / 50 kW = 1000 hours over a ~182-day span, scaled to ~2000 annual hours.
    const hours = measuredAnnualHours({
      cycles: [{ totalKwh: 50_000, peakKw: 50, start: "2025-06-01", close: "2025-12-01" }],
    });
    expect(hours).not.toBeNull();
    // 365 / 183 days ~= 1.995, so ~1995 annual hours - NOT the 1000 raw on-file hours.
    expect(hours as number).toBeGreaterThan(1900);
    expect(hours as number).toBeLessThan(2100);
  });

  it("returns null with no billed usage (honest absence, never a fabricated zero)", () => {
    expect(measuredAnnualHours({ cycles: [fullYearCycle(null, 50)] })).toBeNull();
    expect(measuredAnnualHours({ cycles: [fullYearCycle(0, 50)] })).toBeNull();
    expect(measuredAnnualHours({ cycles: [] })).toBeNull();
  });

  it("returns null with no peak demand (no divide-by-zero, never a guess)", () => {
    expect(measuredAnnualHours({ cycles: [fullYearCycle(100_000, null)] })).toBeNull();
    expect(measuredAnnualHours({ cycles: [fullYearCycle(100_000, 0)] })).toBeNull();
  });

  it("returns null when the span is unmeasurable (zero-length or invalid dates)", () => {
    expect(
      measuredAnnualHours({
        cycles: [{ totalKwh: 100_000, peakKw: 50, start: "2025-06-01", close: "2025-06-01" }],
      }),
    ).toBeNull();
  });

  it("does not mutate its inputs", () => {
    const cycles = [fullYearCycle(100_000, 50)];
    const snapshot = JSON.parse(JSON.stringify(cycles)) as unknown;
    measuredAnnualHours({ cycles });
    expect(JSON.parse(JSON.stringify(cycles))).toEqual(snapshot);
  });

  it("exposes the year-hours basis as a documented constant", () => {
    expect(HOURS_PER_YEAR).toBe(8760);
  });
});

function flagArgs(over: Partial<Parameters<typeof rateLegibilityFlag>[0]> = {}) {
  return {
    isSolar: true,
    scheduleLabel: "AGC Ag35+ kW High Use",
    measuredAnnualHours: LOW_MEASURED_HOURS - 500,
    card: MINI_CARD,
    pumpId: "p1",
    meterName: "P041",
    ...over,
  };
}

describe("rateLegibilityFlag", () => {
  it("flags a low-hours solar meter on AG-C, naming the meter and schedule", () => {
    const flag = rateLegibilityFlag(flagArgs());
    expect(flag).not.toBeNull();
    expect(flag?.pumpId).toBe("p1");
    expect(flag?.meterName).toBe("P041");
    expect(flag?.scheduleLabel).toBe("AGC Ag35+ kW High Use");
  });

  it("never flags a non-solar meter (the non-solar rate lever owns that, FR25)", () => {
    expect(rateLegibilityFlag(flagArgs({ isSolar: false }))).toBeNull();
  });

  it("never flags off the AG-C demand-charge family", () => {
    expect(rateLegibilityFlag(flagArgs({ scheduleLabel: "AGA1 Ag<35 kW Low Use" }))).toBeNull();
    expect(rateLegibilityFlag(flagArgs({ scheduleLabel: "AGB Ag Large" }))).toBeNull();
    expect(rateLegibilityFlag(flagArgs({ scheduleLabel: null }))).toBeNull();
    expect(rateLegibilityFlag(flagArgs({ scheduleLabel: "not a real schedule" }))).toBeNull();
  });

  it("never flags a meter at or above the low-hours threshold (it runs enough hours)", () => {
    expect(rateLegibilityFlag(flagArgs({ measuredAnnualHours: LOW_MEASURED_HOURS }))).toBeNull();
    expect(rateLegibilityFlag(flagArgs({ measuredAnnualHours: LOW_MEASURED_HOURS + 1 }))).toBeNull();
  });

  it("never flags with unknown hours (honest absence fails closed, never a guess)", () => {
    expect(rateLegibilityFlag(flagArgs({ measuredAnnualHours: null }))).toBeNull();
  });

  it("carries no dollar field on the flag (FR25: no impactUsd, no $/kW, no $/kWh)", () => {
    const flag = rateLegibilityFlag(flagArgs());
    expect(flag).not.toBeNull();
    // The flag shape is exactly { pumpId, meterName, scheduleLabel } - no dollar leaks through.
    expect(Object.keys(flag ?? {}).sort()).toEqual(["meterName", "pumpId", "scheduleLabel"]);
  });
});
