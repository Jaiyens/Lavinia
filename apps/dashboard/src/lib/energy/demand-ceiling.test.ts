import { describe, expect, it } from "vitest";
import { derivePeakKw, type PeakSource } from "./demand-ceiling";

// A minimal PeakSource with everything off-file; spread to override one path at a time.
const base: PeakSource = {
  periods: [],
  horsepower: null,
  gpm: null,
  modeledMonthlyCents: null,
};

describe("derivePeakKw", () => {
  it("uses the billed peak when present (the highest non-null period), not derived", () => {
    const meter: PeakSource = {
      ...base,
      // Even with horsepower on file, a real billed peak wins.
      horsepower: 100,
      periods: [{ peakKw: 42 }, { peakKw: null }, { peakKw: 58.6 }],
    };
    // Highest billed peak (58.6 -> 59), flagged as real (not derived).
    expect(derivePeakKw(meter)).toEqual({ kw: 59, derived: false });
  });

  it("ignores null and zero billed peaks and falls through to a derivation", () => {
    // All periods null -> no billed peak -> derive from horsepower.
    const meter: PeakSource = { ...base, horsepower: 50, periods: [{ peakKw: null }] };
    expect(derivePeakKw(meter)).toEqual({ kw: Math.round(50 * 0.746), derived: true }); // 37
  });

  it("derives from horsepower (hp * 0.746 kW) when no billed peak", () => {
    const meter: PeakSource = { ...base, horsepower: 75 };
    // 75 * 0.746 = 55.95 -> 56
    expect(derivePeakKw(meter)).toEqual({ kw: 56, derived: true });
  });

  it("derives from gpm (~gpm / 12 kW) when no billed peak and no horsepower", () => {
    const meter: PeakSource = { ...base, gpm: 1200 };
    // 1200 / 12 = 100
    expect(derivePeakKw(meter)).toEqual({ kw: 100, derived: true });
  });

  it("prefers horsepower over gpm when both are on file", () => {
    const meter: PeakSource = { ...base, horsepower: 40, gpm: 1200 };
    // 40 * 0.746 = 29.84 -> 30 (not the 100 the gpm path would give)
    expect(derivePeakKw(meter)).toEqual({ kw: 30, derived: true });
  });

  it("derives from the modeled monthly cost when no peak, hp, or gpm", () => {
    // $146/mo at $0.20/kWh = 730 kWh; /730 h = 1 kW avg; *4 peak = 4 kW.
    const meter: PeakSource = { ...base, modeledMonthlyCents: 14_600 };
    expect(derivePeakKw(meter)).toEqual({ kw: 4, derived: true });
  });

  it("falls back to a modest 50 kW default when nothing is on file", () => {
    expect(derivePeakKw(base)).toEqual({ kw: 50, derived: true });
  });

  it("never returns 0 or a negative ceiling (clamps to at least 1 kW)", () => {
    // A tiny modeled cost would round toward 0; the clamp keeps the curve renderable.
    const meter: PeakSource = { ...base, modeledMonthlyCents: 1 };
    const result = derivePeakKw(meter);
    expect(result).not.toBeNull();
    expect(result?.kw).toBeGreaterThanOrEqual(1);
  });
});
