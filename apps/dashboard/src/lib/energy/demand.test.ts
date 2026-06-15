import { describe, expect, it } from "vitest";
import type { IntervalReading } from "./types";
import {
  effectiveDemandRate,
  intervalKw,
  maxDemand,
  maxDemandInWindow,
} from "./demand";

// A 15-minute reading helper. kWh is the energy in the interval; kW is kWh * 4.
function r(start: string, kWh: number): IntervalReading {
  return { start, durationSec: 900, kWh };
}

describe("intervalKw", () => {
  it("converts 15-minute energy to average power (kWh / 0.25h)", () => {
    expect(intervalKw(r("2026-06-02T22:30:00.000Z", 28))).toBe(112);
    expect(intervalKw(r("2026-06-02T22:30:00.000Z", 0))).toBe(0);
  });

  it("handles non-900s durations (hourly reading)", () => {
    expect(intervalKw({ start: "x", durationSec: 3600, kWh: 50 })).toBe(50);
  });

  it("reads a zero-length interval as 0 kW rather than dividing by zero", () => {
    expect(intervalKw({ start: "x", durationSec: 0, kWh: 9 })).toBe(0);
  });
});

describe("maxDemand", () => {
  it("returns null on an empty series", () => {
    expect(maxDemand([])).toBeNull();
  });

  it("finds the highest 15-minute kW and when it occurred", () => {
    const peak = maxDemand([
      r("2026-06-02T22:00:00.000Z", 22), // 88 kW
      r("2026-06-02T22:15:00.000Z", 25), // 100 kW
      r("2026-06-02T22:30:00.000Z", 28), // 112 kW  <- peak
      r("2026-06-02T22:45:00.000Z", 26), // 104 kW
    ]);
    expect(peak).toEqual({ kw: 112, at: "2026-06-02T22:30:00.000Z" });
  });

  it("keeps the earliest interval on a tie", () => {
    const peak = maxDemand([
      r("2026-06-02T22:00:00.000Z", 25),
      r("2026-06-02T22:15:00.000Z", 25),
    ]);
    expect(peak?.at).toBe("2026-06-02T22:00:00.000Z");
  });
});

describe("maxDemandInWindow", () => {
  const series = [
    r("2026-06-02T22:30:00.000Z", 28), // 112 kW, cycle A
    r("2026-07-01T22:15:00.000Z", 34.5), // 138 kW, cycle B
  ];

  it("scopes the peak to a half-open [start, end) window", () => {
    const cycleA = maxDemandInWindow(
      series,
      "2026-05-15T00:00:00.000Z",
      "2026-06-12T00:00:00.000Z",
    );
    expect(cycleA).toEqual({ kw: 112, at: "2026-06-02T22:30:00.000Z" });

    const cycleB = maxDemandInWindow(
      series,
      "2026-06-13T00:00:00.000Z",
      "2026-07-15T00:00:00.000Z",
    );
    expect(cycleB).toEqual({ kw: 138, at: "2026-07-01T22:15:00.000Z" });
  });

  it("excludes the exact end instant and returns null when nothing lands inside", () => {
    expect(
      maxDemandInWindow(
        series,
        "2026-06-02T22:30:00.000Z",
        "2026-06-02T22:30:00.000Z",
      ),
    ).toBeNull();
  });
});

describe("effectiveDemandRate", () => {
  it("derives $/kW from the bill's demand charge and the peak that set it", () => {
    // $1,200 of demand charge set by a 100 kW peak reads back as $12/kW.
    expect(effectiveDemandRate(1200, 100)).toBe(12);
  });

  it("returns null when the charge or the peak is missing", () => {
    expect(effectiveDemandRate(null, 100)).toBeNull();
    expect(effectiveDemandRate(1200, null)).toBeNull();
  });

  it("returns null for a non-positive peak (no rate can be inferred)", () => {
    expect(effectiveDemandRate(1200, 0)).toBeNull();
    expect(effectiveDemandRate(1200, -5)).toBeNull();
  });
});
