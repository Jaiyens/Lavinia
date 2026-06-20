import { describe, expect, it } from "vitest";
import {
  POINTS_PER_DAY,
  monthlyPeakTrend,
  staggeredPeakKw,
  synthesizeDay,
  synthesizeStackedDay,
} from "./load-shape";

function maxKw(points: { kw: number }[]): number {
  return points.reduce((m, p) => Math.max(m, p.kw), 0);
}

describe("synthesizeDay", () => {
  it("produces exactly 96 fifteen-minute points on the grid", () => {
    const { points } = synthesizeDay({ peakKw: 100, seed: "pump-1" });
    expect(points).toHaveLength(POINTS_PER_DAY);
    points.forEach((p, i) => {
      expect(p.minute).toBe(i * 15);
    });
    expect(points[POINTS_PER_DAY - 1]?.minute).toBe(1425);
  });

  it("reconciles the max kW to the billed peak EXACTLY, at the peak index", () => {
    const { points, peakIndex } = synthesizeDay({ peakKw: 244.32, seed: "spike" });
    expect(maxKw(points)).toBe(244.32);
    expect(points[peakIndex]?.kw).toBe(244.32);
    // No other interval beats the peak.
    points.forEach((p, i) => {
      if (i !== peakIndex) expect(p.kw).toBeLessThanOrEqual(244.32);
    });
  });

  it("puts the peak at the requested minute (snapped to the grid)", () => {
    const { peakIndex } = synthesizeDay({ peakKw: 50, peakAtMinute: 17 * 60, seed: "x" });
    expect(peakIndex).toBe((17 * 60) / 15);
  });

  it("defaults the peak to mid-afternoon (15:00)", () => {
    const { peakIndex } = synthesizeDay({ peakKw: 50, seed: "x" });
    expect(peakIndex).toBe((15 * 60) / 15);
  });

  it("keeps a low baseline (a duty cycle, not a flat line)", () => {
    const { points, peakIndex } = synthesizeDay({ peakKw: 100, loadFactor: 0.35, seed: "x" });
    // Midnight is far from any run block: well below the peak.
    expect(points[0]?.kw ?? 0).toBeLessThan(50);
    // The peak interval is the clear maximum.
    expect(points[peakIndex]?.kw).toBe(100);
  });

  it("is deterministic by seed and varies across seeds", () => {
    const a = synthesizeDay({ peakKw: 80, seed: "same" }).points;
    const b = synthesizeDay({ peakKw: 80, seed: "same" }).points;
    const c = synthesizeDay({ peakKw: 80, seed: "different" }).points;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("a higher load factor raises the day's average without breaking reconciliation", () => {
    const low = synthesizeDay({ peakKw: 100, loadFactor: 0.2, seed: "lf" }).points;
    const high = synthesizeDay({ peakKw: 100, loadFactor: 0.7, seed: "lf" }).points;
    const avg = (pts: { kw: number }[]) => pts.reduce((s, p) => s + p.kw, 0) / pts.length;
    expect(avg(high)).toBeGreaterThan(avg(low));
    expect(maxKw(low)).toBe(100);
    expect(maxKw(high)).toBe(100);
  });
});

describe("synthesizeStackedDay", () => {
  const pumps = [
    { name: "North", share: 0.4 },
    { name: "Middle", share: 0.35 },
    { name: "South", share: 0.25 },
  ];

  it("overlaps the pumps so the COMBINED max equals peakKw exactly", () => {
    const { combined, peakIndex } = synthesizeStackedDay({ peakKw: 300, pumps, seed: "ranch" });
    expect(combined).toHaveLength(POINTS_PER_DAY);
    expect(maxKw(combined)).toBe(300);
    expect(combined[peakIndex]?.kw).toBe(300);
  });

  it("each pump contributes share*peakKw at the shared peak interval", () => {
    const { byPump, peakIndex } = synthesizeStackedDay({ peakKw: 300, pumps, seed: "ranch" });
    expect(byPump.map((p) => p.name)).toEqual(["North", "Middle", "South"]);
    expect(byPump[0]?.points[peakIndex]?.kw).toBeCloseTo(120, 1);
    expect(byPump[1]?.points[peakIndex]?.kw).toBeCloseTo(105, 1);
    expect(byPump[2]?.points[peakIndex]?.kw).toBeCloseTo(75, 1);
  });

  it("normalizes shares that do not sum to exactly 1", () => {
    const off = [
      { name: "A", share: 2 },
      { name: "B", share: 2 },
    ];
    const { combined } = synthesizeStackedDay({ peakKw: 200, pumps: off, seed: "z" });
    expect(maxKw(combined)).toBe(200);
  });

  it("is deterministic by seed", () => {
    const a = synthesizeStackedDay({ peakKw: 300, pumps, seed: "ranch" }).combined;
    const b = synthesizeStackedDay({ peakKw: 300, pumps, seed: "ranch" }).combined;
    expect(a).toEqual(b);
  });
});

describe("staggeredPeakKw", () => {
  it("is the largest single pump's share times peakKw, below the overlapped peak", () => {
    const pumps = [
      { name: "North", share: 0.4 },
      { name: "Middle", share: 0.35 },
      { name: "South", share: 0.25 },
    ];
    expect(staggeredPeakKw(pumps, 300)).toBeCloseTo(120, 3);
    expect(staggeredPeakKw(pumps, 300)).toBeLessThan(300);
  });

  it("equals the peak for a single pump (nothing to stagger)", () => {
    expect(staggeredPeakKw([{ name: "Only", share: 1 }], 150)).toBe(150);
  });

  it("is zero for no pumps", () => {
    expect(staggeredPeakKw([], 150)).toBe(0);
  });
});

describe("monthlyPeakTrend", () => {
  it("emits one labeled point per period that carries a peak, dropping nulls", () => {
    const trend = monthlyPeakTrend([
      { close: "2026-01-30T00:00:00.000Z", peakKw: 120 },
      { close: "2026-02-28T00:00:00.000Z", peakKw: null },
      { close: "2026-06-15", peakKw: 244.32 },
    ]);
    expect(trend).toEqual([
      { label: "Jan", peakKw: 120 },
      { label: "Jun", peakKw: 244.32 },
    ]);
  });

  it("returns an empty array when no period carries a peak", () => {
    expect(monthlyPeakTrend([{ close: "2026-01-30T00:00:00.000Z", peakKw: null }])).toEqual([]);
  });
});
