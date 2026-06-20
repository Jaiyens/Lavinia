import { describe, expect, it } from "vitest";
import {
  BASELINE_DEGRADATION_PER_YEAR,
  MIN_EVIDENCE_MONTHS,
  SHORTFALL_MARGIN_PP,
  agingArrayFlag,
} from "./solar-degradation";

const asOf = "2026-06-20T12:00:00.000Z";
const EXPECTED_MONTHLY_KWH_PER_KW = 120;

/** Build N months of generation at a fixed kWh, for the evidence-window tests. */
function months(n: number, kwh: number): { month: string; kwh: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    kwh,
  }));
}

describe("agingArrayFlag (F-2, FR19/FR20)", () => {
  it("is silent (null) with no generation series - DM2 absent, not broken", () => {
    expect(
      agingArrayFlag({
        generationByMonthKwh: [],
        nameplateKw: 840,
        interconnectionDate: "2018-01-01T00:00:00.000Z",
        asOf,
      }),
    ).toBeNull();
  });

  it("is silent (null) when the interconnection date is not on file (cannot age the baseline)", () => {
    expect(
      agingArrayFlag({
        generationByMonthKwh: months(12, 1000),
        nameplateKw: 840,
        interconnectionDate: null,
        asOf,
      }),
    ).toBeNull();
  });

  it("does not fire on a shortfall observed over fewer than the minimum evidence months", () => {
    // A deep shortfall, but only 5 months of data: below MIN_EVIDENCE_MONTHS, so no annual claim.
    expect(MIN_EVIDENCE_MONTHS).toBe(6);
    expect(
      agingArrayFlag({
        generationByMonthKwh: months(5, 10),
        nameplateKw: 840,
        interconnectionDate: "2018-01-01T00:00:00.000Z",
        asOf,
      }),
    ).toBeNull();
  });

  it("does not fire on a shortfall within the baseline margin (a healthy array)", () => {
    // Measured ~ expectation (a tiny shortfall well under the 10pp margin): no flag.
    const nameplateKw = 840;
    const age = (Date.parse(asOf) - Date.parse("2018-01-01T00:00:00.000Z")) / (365.25 * 24 * 3600 * 1000);
    const expectedMonthly = nameplateKw * EXPECTED_MONTHLY_KWH_PER_KW * (1 - BASELINE_DEGRADATION_PER_YEAR * age);
    const within = expectedMonthly * 0.97; // 3pp shortfall, under the margin
    expect(
      agingArrayFlag({
        generationByMonthKwh: months(12, within),
        nameplateKw,
        interconnectionDate: "2018-01-01T00:00:00.000Z",
        asOf,
      }),
    ).toBeNull();
  });

  it("fires when a sustained shortfall exceeds the margin over the evidence window, naming the window", () => {
    const nameplateKw = 840;
    const age = (Date.parse(asOf) - Date.parse("2018-01-01T00:00:00.000Z")) / (365.25 * 24 * 3600 * 1000);
    const expectedMonthly = nameplateKw * EXPECTED_MONTHLY_KWH_PER_KW * (1 - BASELINE_DEGRADATION_PER_YEAR * age);
    const deep = expectedMonthly * 0.75; // 25pp shortfall, well past the 10pp margin
    const flag = agingArrayFlag({
      generationByMonthKwh: months(9, deep),
      nameplateKw,
      interconnectionDate: "2018-01-01T00:00:00.000Z",
      asOf,
    });
    expect(flag).not.toBeNull();
    if (flag === null) throw new Error("expected a flag");
    expect(flag.shortfallPct).toBeGreaterThanOrEqual(SHORTFALL_MARGIN_PP);
    expect(flag.monthsObserved).toBe(9); // names its evidence window, never an annual claim
  });

  it("never carries a dollar (impactNote-only contract) - the flag shape has no dollar field", () => {
    const nameplateKw = 840;
    const age = (Date.parse(asOf) - Date.parse("2018-01-01T00:00:00.000Z")) / (365.25 * 24 * 3600 * 1000);
    const expectedMonthly = nameplateKw * EXPECTED_MONTHLY_KWH_PER_KW * (1 - BASELINE_DEGRADATION_PER_YEAR * age);
    const flag = agingArrayFlag({
      generationByMonthKwh: months(8, expectedMonthly * 0.7),
      nameplateKw,
      interconnectionDate: "2018-01-01T00:00:00.000Z",
      asOf,
    });
    if (flag === null) throw new Error("expected a flag");
    // The flag exposes only a percentage and a count, never cents/usd.
    expect(Object.keys(flag).sort()).toEqual(["monthsObserved", "shortfallPct"]);
  });

  it("treats the launch fleet (no series) as silent, which is correct not broken", () => {
    // The realistic launch state: the export carries no per-array generation series.
    expect(
      agingArrayFlag({
        generationByMonthKwh: [],
        nameplateKw: 1092,
        interconnectionDate: null,
        asOf,
      }),
    ).toBeNull();
  });
});
