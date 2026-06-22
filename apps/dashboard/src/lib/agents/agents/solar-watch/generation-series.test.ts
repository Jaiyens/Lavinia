import { describe, expect, it } from "vitest";
import {
  agingArrayFlag,
  deriveMonthlyGenerationFromNemPeriods,
  MIN_EVIDENCE_MONTHS,
  MIN_SHORTFALL_PAIRS,
  pairYearOverYear,
  SHORTFALL_FRACTION,
  type GenerationMonth,
  type NemPeriodLike,
} from "./generation-series";

// Pure tests for the solar-watch generation proxy. No DB. The signal is a NET-EXPORT proxy:
// NemPeriod.netKwh negative = net export, which we read as a positive generation magnitude.

/** Build a NEM month row. exportKwh > 0 -> a net-export (negative netKwh) month. */
function nem(month: string, exportKwh: number): NemPeriodLike {
  return { start: `${month}-15T00:00:00.000Z`, netKwh: -exportKwh };
}

/** Build twelve months of healthy export for a given year (flat 1000 kWh each). */
function healthyYear(year: number, kwh = 1000): NemPeriodLike[] {
  return Array.from({ length: 12 }, (_, i) =>
    nem(`${year}-${String(i + 1).padStart(2, "0")}`, kwh),
  );
}

describe("deriveMonthlyGenerationFromNemPeriods", () => {
  it("flips net-export months to positive exportKwh and sorts ascending", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      nem("2025-07", 1200),
      nem("2025-05", 900),
    ]);
    expect(series.map((g) => g.month)).toEqual(["2025-05", "2025-07"]);
    expect(series[0]).toMatchObject({ year: 2025, monthOfYear: 5, exportKwh: 900 });
    expect(series[1]).toMatchObject({ year: 2025, monthOfYear: 7, exportKwh: 1200 });
  });

  it("drops net-consumer months (netKwh >= 0): they are load, not array output", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      nem("2025-07", 1000),
      { start: "2025-12-15T00:00:00.000Z", netKwh: 400 }, // net consumed in winter
    ]);
    expect(series.map((g) => g.month)).toEqual(["2025-07"]);
  });

  it("dedupes a calendar month printed twice (first row wins)", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      { start: "2025-07-01T00:00:00.000Z", netKwh: -1000 },
      { start: "2025-07-31T00:00:00.000Z", netKwh: -1 }, // same month, off-by-days reprint
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]?.exportKwh).toBe(1000);
  });

  it("returns [] when no month net-exported (never a fabricated series)", () => {
    expect(
      deriveMonthlyGenerationFromNemPeriods([
        { start: "2025-07-15T00:00:00.000Z", netKwh: 500 },
      ]),
    ).toEqual([]);
  });
});

describe("pairYearOverYear", () => {
  it("pairs the same calendar month one year apart and computes the shortfall fraction", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      nem("2024-07", 1000),
      nem("2025-07", 800), // 20% lower year over year
    ]);
    const pairs = pairYearOverYear(series);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ monthOfYear: 7, priorYear: 2024, laterYear: 2025 });
    expect(pairs[0]?.shortfallFraction).toBeCloseTo(0.2, 5);
  });

  it("a higher later year yields a negative shortfall (no decline)", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      nem("2024-07", 800),
      nem("2025-07", 1000),
    ]);
    expect(pairYearOverYear(series)[0]?.shortfallFraction).toBeCloseTo(-0.25, 5);
  });

  it("produces no pair for a month without a prior-year partner", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([nem("2025-07", 1000)]);
    expect(pairYearOverYear(series)).toEqual([]);
  });
});

describe("agingArrayFlag", () => {
  it("returns null below MIN_EVIDENCE_MONTHS (silent, never fabricate)", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      ...Array.from({ length: MIN_EVIDENCE_MONTHS - 1 }, (_, i) =>
        nem(`2025-${String(i + 1).padStart(2, "0")}`, 1000),
      ),
    ]);
    expect(series.length).toBeLessThan(MIN_EVIDENCE_MONTHS);
    expect(agingArrayFlag(series)).toBeNull();
  });

  it("does NOT flag a healthy array (year over year flat) even with two full years", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      ...healthyYear(2024),
      ...healthyYear(2025),
    ]);
    expect(series).toHaveLength(24);
    expect(agingArrayFlag(series)).toBeNull();
  });

  it("does NOT flag a single bad month (needs MIN_SHORTFALL_PAIRS sustained pairs)", () => {
    const series = deriveMonthlyGenerationFromNemPeriods([
      ...healthyYear(2024),
      ...healthyYear(2025).map((m) =>
        m.start.startsWith("2025-07") ? nem("2025-07", 500) : m,
      ),
    ]);
    expect(agingArrayFlag(series)).toBeNull();
  });

  it("flags a sustained season-over-season shortfall and reports the worst pair", () => {
    // Every 2025 month is ~20% below its 2024 twin: a slow decline across the whole season.
    const series = deriveMonthlyGenerationFromNemPeriods([
      ...healthyYear(2024, 1000),
      ...healthyYear(2025, 780), // 22% below, clears SHORTFALL_FRACTION
    ]);
    const flag = agingArrayFlag(series);
    expect(flag).not.toBeNull();
    expect(flag!.monthsCounted).toBe(24);
    expect(flag!.shortfallPairs.length).toBeGreaterThanOrEqual(MIN_SHORTFALL_PAIRS);
    expect(flag!.worstShortfallFraction).toBeCloseTo(0.22, 5);
    // Every flagged pair clears the conservative margin.
    for (const p of flag!.shortfallPairs) {
      expect(p.shortfallFraction).toBeGreaterThanOrEqual(SHORTFALL_FRACTION);
    }
  });

  it("does NOT flag a decline just under the conservative margin", () => {
    const justUnder = 1 - (SHORTFALL_FRACTION - 0.01); // ~11% drop, under the 12% gate
    const series = deriveMonthlyGenerationFromNemPeriods([
      ...healthyYear(2024, 1000),
      ...healthyYear(2025, Math.round(1000 * justUnder)),
    ]);
    expect(agingArrayFlag(series)).toBeNull();
  });

  it("requires the shortfall pairs to be paired months, not just any decline", () => {
    // 2024 full year healthy, 2025 has only 2 months and both are 20% down -> 2 pairs.
    const series: GenerationMonth[] = deriveMonthlyGenerationFromNemPeriods([
      ...healthyYear(2024, 1000),
      nem("2025-06", 800),
      nem("2025-07", 800),
      nem("2025-08", 800),
      nem("2025-09", 800),
      nem("2025-10", 800),
      nem("2025-11", 800),
    ]);
    const flag = agingArrayFlag(series);
    expect(flag).not.toBeNull();
    expect(flag!.shortfallPairs.length).toBe(6);
  });
});
