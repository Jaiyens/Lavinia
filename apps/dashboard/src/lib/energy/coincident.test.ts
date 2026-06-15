import { describe, expect, it } from "vitest";
import {
  coincidentPeakRecommendations,
  type CoincidentInput,
} from "./coincident";
import type { PumpRun } from "./types";

const TZ = "America/Los_Angeles";

// PDT: the 4-9pm window is 23:00Z to 04:00Z the next day. All runs below sit in
// the evening of June 14. $10/kW comes from the bill (effectiveDemandRate).
function run(
  pumpId: string,
  pumpName: string,
  start: string,
  end: string,
  kw: number,
  deferrable?: boolean,
): PumpRun {
  const base: PumpRun = { pumpId, pumpName, start, end, kw };
  return deferrable === undefined ? base : { ...base, deferrable };
}

const BASE: Omit<CoincidentInput, "runs"> = {
  farmId: "farm1",
  timezone: TZ,
  rateUsdPerKw: 10,
  asOf: "2026-06-14",
};

describe("coincidentPeakRecommendations", () => {
  it("staggers two overlapping pumps and prices the shaved kW", () => {
    const runs = [
      run("east", "East", "2026-06-14T23:00:00.000Z", "2026-06-15T01:00:00.000Z", 100),
      run("west", "West", "2026-06-15T00:00:00.000Z", "2026-06-15T02:00:00.000Z", 80),
    ];
    const recs = coincidentPeakRecommendations({ ...BASE, runs });
    expect(recs).toHaveLength(1);

    const [rec] = recs;
    if (!rec) throw new Error("expected a stagger rec");
    // Together they stack to 180 kW; run East alone and the peak is 100 kW, so
    // 80 kW shaved at $10/kW = $800.
    expect(rec.severity).toBe("act");
    expect(rec.impactUsd).toBe(800);
    expect(rec.situation).toBe(
      "East and West run at the same time in the evening, stacking into one big spike on your bill.",
    );
    expect(rec.action.kind).toBe("stagger_pumps");
    expect(rec.action.label).toBe("Hold West until East finishes");
    expect(rec.impactNote).toContain("$800");
    expect(rec.action.params).toEqual({
      pumpIds: ["east", "west"],
      holdPumpIds: ["west"],
      anchorPumpId: "east",
      coincidentKw: 180,
      staggeredKw: 100,
      shavedKw: 80,
      ratePerKw: 10,
      overlapStart: "2026-06-15T00:00:00.000Z",
      overlapEnd: "2026-06-15T01:00:00.000Z",
    });
  });

  it("sums three overlapping pumps at the moment of peak overlap", () => {
    const runs = [
      run("a", "A", "2026-06-14T23:00:00.000Z", "2026-06-15T02:00:00.000Z", 100),
      run("b", "B", "2026-06-14T23:30:00.000Z", "2026-06-15T01:00:00.000Z", 60),
      run("c", "C", "2026-06-15T00:00:00.000Z", "2026-06-15T00:30:00.000Z", 40),
    ];
    const [rec] = coincidentPeakRecommendations({ ...BASE, runs });
    if (!rec) throw new Error("expected a stagger rec");
    // 100 + 60 + 40 = 200 stacked; anchor A alone is 100, so 100 kW * $10 = $1,000.
    expect(rec.impactUsd).toBe(1000);
    expect(rec.action.params?.coincidentKw).toBe(200);
    expect(rec.action.params?.holdPumpIds).toEqual(["b", "c"]);
    expect(rec.action.label).toBe("Hold B and C until A finishes");
  });

  it("treats non-overlapping runs as separate clusters and emits nothing", () => {
    const runs = [
      run("east", "East", "2026-06-14T23:00:00.000Z", "2026-06-14T23:30:00.000Z", 100),
      run("west", "West", "2026-06-15T03:30:00.000Z", "2026-06-15T03:45:00.000Z", 80),
    ];
    expect(coincidentPeakRecommendations({ ...BASE, runs })).toEqual([]);
  });

  it("does not stagger when the only overlap partner is non-deferrable", () => {
    const runs = [
      run("east", "East", "2026-06-14T23:00:00.000Z", "2026-06-15T01:00:00.000Z", 100),
      run("frost", "Frost block", "2026-06-15T00:00:00.000Z", "2026-06-15T02:00:00.000Z", 80, false),
    ];
    // East is the anchor; the only thing to hold is a frost run we must not move.
    expect(coincidentPeakRecommendations({ ...BASE, runs })).toEqual([]);
  });

  it("ignores runs outside the 4-9pm window", () => {
    const runs = [
      run("east", "East", "2026-06-14T20:00:00.000Z", "2026-06-14T22:00:00.000Z", 100),
      run("west", "West", "2026-06-14T20:30:00.000Z", "2026-06-14T22:30:00.000Z", 80),
    ];
    // They overlap, but at 1-3pm local, not in the evening peak.
    expect(coincidentPeakRecommendations({ ...BASE, runs })).toEqual([]);
  });

  it("skips clusters whose saving falls at or below minImpactUsd", () => {
    const runs = [
      run("east", "East", "2026-06-14T23:00:00.000Z", "2026-06-15T01:00:00.000Z", 100),
      run("west", "West", "2026-06-15T00:00:00.000Z", "2026-06-15T02:00:00.000Z", 80),
    ];
    // $800 saving filtered out by an $800 floor.
    expect(
      coincidentPeakRecommendations({ ...BASE, runs, minImpactUsd: 800 }),
    ).toEqual([]);
  });
});
