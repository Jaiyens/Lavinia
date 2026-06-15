import { describe, expect, it } from "vitest";
import { offPeakRecommendations, type OffPeakInput } from "./off-peak";
import type { PumpRun } from "./types";

const TZ = "America/Los_Angeles";

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

const BASE: Omit<OffPeakInput, "runs"> = {
  farmId: "farm1",
  timezone: TZ,
  rateUsdPerKw: 5, // from the bill's peak-period demand charge
  asOf: "2026-06-14",
};

describe("offPeakRecommendations", () => {
  it("flags a deferrable run sitting in the 4-9pm window", () => {
    const runs = [
      run("east", "East", "2026-06-14T23:30:00.000Z", "2026-06-15T01:00:00.000Z", 90),
    ];
    const recs = offPeakRecommendations({ ...BASE, runs });
    expect(recs).toHaveLength(1);

    const [rec] = recs;
    if (!rec) throw new Error("expected an off-peak rec");
    // 90 kW in the window priced at $5/kW = up to $450.
    expect(rec.severity).toBe("watch");
    expect(rec.impactUsd).toBe(450);
    expect(rec.situation).toBe(
      "The East set runs into the 4 to 9 evening window, your costliest hours.",
    );
    expect(rec.action.kind).toBe("shift_load");
    expect(rec.action.label).toBe("Move it before 4pm or after 9pm");
    expect(rec.impactNote).toContain("$450");
    expect(rec.action.params).toEqual({
      pumpId: "east",
      runStart: "2026-06-14T23:30:00.000Z",
      runEnd: "2026-06-15T01:00:00.000Z",
      peakWindowStart: "2026-06-14T23:30:00.000Z",
      peakWindowEnd: "2026-06-15T01:00:00.000Z",
      inWindowKw: 90,
      ratePerKw: 5,
    });
  });

  it("ignores runs that sit entirely outside the window", () => {
    const runs = [
      run("north", "North", "2026-06-14T22:00:00.000Z", "2026-06-14T22:45:00.000Z", 70),
    ];
    expect(offPeakRecommendations({ ...BASE, runs })).toEqual([]);
  });

  it("leaves a non-deferrable run (frost, heat) alone even in the window", () => {
    const runs = [
      run("frost", "Frost block", "2026-06-15T00:00:00.000Z", "2026-06-15T01:00:00.000Z", 100, false),
    ];
    expect(offPeakRecommendations({ ...BASE, runs })).toEqual([]);
  });

  it("flags each in-window run independently", () => {
    const runs = [
      run("east", "East", "2026-06-14T23:30:00.000Z", "2026-06-15T01:00:00.000Z", 90),
      run("north", "North", "2026-06-14T22:00:00.000Z", "2026-06-14T22:45:00.000Z", 70), // out
      run("west", "West", "2026-06-15T02:00:00.000Z", "2026-06-15T03:00:00.000Z", 60), // in
    ];
    const recs = offPeakRecommendations({ ...BASE, runs });
    expect(recs.map((rec) => rec.action.params?.pumpId)).toEqual(["east", "west"]);
  });
});
