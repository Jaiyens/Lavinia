import { describe, expect, it } from "vitest";
import { POINTS_PER_DAY } from "./load-shape";
import { analyzeSpike } from "./spike";

function maxKw(points: { kw: number }[]): number {
  return points.reduce((m, p) => Math.max(m, p.kw), 0);
}

describe("analyzeSpike - overlap path", () => {
  const pumps = [
    { name: "North", share: 0.4 },
    { name: "Middle", share: 0.35 },
    { name: "South", share: 0.25 },
  ];

  it("identifies overlap, drops the peak, and reconciles to billed demand cents", () => {
    const result = analyzeSpike({
      peakKw: 300,
      demandCents: 700000, // $7,000 demand charge
      demandRatePerKw: 23.333333,
      pumps,
      seed: "ranch",
    });
    expect(result.cause).toBe("overlap");
    expect(result.demandCents).toBe(700000); // reconciled, never invented
    expect(result.fix.kind).toBe("stagger");
    // The stacked combined curve still maxes at the billed peak.
    expect(result.combined).toHaveLength(POINTS_PER_DAY);
    expect(maxKw(result.combined)).toBe(300);
    expect(result.byPump).toHaveLength(3);
    // Staggering drops the peak to the largest single pump (0.4 * 300 = 120).
    expect(result.fix.newPeakKw).toBeCloseTo(120, 1);
    expect(result.fix.newPeakKw).toBeLessThan(300);
    // saveCents reconciles to demandCents - newDemandCents and is positive.
    expect(result.fix.saveCents).toBe(700000 - result.fix.newDemandCents);
    expect(result.fix.saveCents).toBeGreaterThan(0);
  });

  it("labels the fix with the pump count", () => {
    const result = analyzeSpike({ peakKw: 300, demandCents: 700000, pumps, seed: "ranch" });
    expect(result.fix.label).toBe("Stagger the 3 pumps so they do not overlap");
  });

  it("derives the $/kW from the bill when not passed (demandCents / peakKw)", () => {
    const result = analyzeSpike({ peakKw: 300, demandCents: 700000, pumps, seed: "ranch" });
    // 700000 cents = $7000 over 300 kW = $23.333.../kW.
    expect(result.demandRatePerKw).toBeCloseTo(23.3333, 3);
    // New demand cents = newPeakKw * rate * 100, consistent with the derived rate.
    expect(result.fix.newDemandCents).toBe(
      Math.round(result.fix.newPeakKw * result.demandRatePerKw * 100),
    );
  });
});

describe("analyzeSpike - peak_window path", () => {
  it("identifies a single-load peak-window spike and recommends shifting off-peak", () => {
    const result = analyzeSpike({
      peakKw: 244.32,
      demandCents: 635952, // 244.32 kW * $26.03/kW = $6359.52
      demandRatePerKw: 26.03,
      peakAtMinute: 18 * 60, // 6pm, inside the 5-8pm window
      seed: "single",
    });
    expect(result.cause).toBe("peak_window");
    expect(result.demandCents).toBe(635952);
    expect(result.fix.kind).toBe("shift_offpeak");
    expect(result.fix.label).toBe("Shift this run off the 5 to 8pm peak window");
    expect(result.byPump).toBeUndefined();
    // The curve reconciles to the billed peak.
    expect(maxKw(result.combined)).toBe(244.32);
    expect(result.peakMinute).toBe(18 * 60);
    // Off-peak residual is below the original peak; the saving is positive.
    expect(result.fix.newPeakKw).toBeLessThan(244.32);
    expect(result.fix.saveCents).toBe(635952 - result.fix.newDemandCents);
    expect(result.fix.saveCents).toBeGreaterThan(0);
  });

  it("treats a single-pump list as the peak_window case", () => {
    const result = analyzeSpike({
      peakKw: 100,
      demandCents: 200000,
      pumps: [{ name: "Only", share: 1 }],
      seed: "one",
    });
    expect(result.cause).toBe("peak_window");
  });
});

describe("analyzeSpike - determinism", () => {
  it("is deterministic by seed for both paths", () => {
    const a = analyzeSpike({ peakKw: 300, demandCents: 700000, pumps: [{ name: "A", share: 0.6 }, { name: "B", share: 0.4 }], seed: "s" });
    const b = analyzeSpike({ peakKw: 300, demandCents: 700000, pumps: [{ name: "A", share: 0.6 }, { name: "B", share: 0.4 }], seed: "s" });
    expect(a).toEqual(b);

    const c = analyzeSpike({ peakKw: 120, demandCents: 312000, seed: "single" });
    const d = analyzeSpike({ peakKw: 120, demandCents: 312000, seed: "single" });
    expect(c).toEqual(d);
  });
});
