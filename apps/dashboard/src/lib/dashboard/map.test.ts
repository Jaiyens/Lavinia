import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "./load";
import { toMapPins } from "./map";

function meter(over: Partial<MeterView> & { id: string }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: "reconciled" as CoverageState,
    accountNumber: "A1",
    ranchName: null,
    entityName: null,
    cropName: null,
    latitude: null,
    longitude: null,
    gpm: null,
    isSolar: false,
    nemType: null,
    trueUpMonth: null,
    trueUpAmountCents: null,
    trueUpDate: null,
    solarKw: null,
    benefitingArrays: [],
    growerPumpId: null,
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

describe("toMapPins", () => {
  it("splits located meters into pins and the rest into the tray; no meter dropped", () => {
    const input = [
      meter({ id: "a", latitude: 36.7, longitude: -119.8 }),
      meter({ id: "b" }), // no coordinates
      meter({ id: "c", latitude: 36.71, longitude: -119.81 }),
    ];
    const { pins, unlocated } = toMapPins(input);
    expect(pins.map((p) => p.meterId)).toEqual(["a", "c"]);
    expect(unlocated.map((u) => u.meterId)).toEqual(["b"]);
    expect(pins.length + unlocated.length).toBe(input.length);
  });

  it("sends invalid coordinates to the tray, never a fake pin", () => {
    const { pins, unlocated } = toMapPins([
      meter({ id: "nan", latitude: Number.NaN, longitude: -119.8 }),
      meter({ id: "lat91", latitude: 91, longitude: -119.8 }),
      meter({ id: "lng181", latitude: 36.7, longitude: -181 }),
      meter({ id: "halfnull", latitude: 36.7, longitude: null }),
      meter({ id: "inf", latitude: 36.7, longitude: Number.POSITIVE_INFINITY }),
    ]);
    expect(pins).toEqual([]);
    expect(unlocated).toHaveLength(5);
  });

  it("accepts boundary coordinates; exact (0,0) is treated as an unfilled-field artifact", () => {
    const { pins, unlocated } = toMapPins([
      meter({ id: "edge", latitude: -90, longitude: 180 }),
      meter({ id: "zero", latitude: 0, longitude: 0 }),
      meter({ id: "zerolat", latitude: 0, longitude: -119.8 }), // a real equatorial lat is fine
    ]);
    expect(pins.map((p) => p.meterId)).toEqual(["edge", "zerolat"]);
    expect(unlocated.map((u) => u.meterId)).toEqual(["zero"]);
  });

  it("flags attention for needs_review coverage or BAD status, calm otherwise", () => {
    const { pins } = toMapPins([
      meter({ id: "review", latitude: 1, longitude: 1, coverageState: "needs_review" as CoverageState }),
      meter({ id: "bad", latitude: 1, longitude: 1, status: "BAD" }),
      meter({ id: "good", latitude: 1, longitude: 1, status: "GOOD" }),
      meter({ id: "nobill", latitude: 1, longitude: 1, coverageState: "no_bill" as CoverageState }),
    ]);
    expect(pins.find((p) => p.meterId === "review")?.attention).toBe(true);
    expect(pins.find((p) => p.meterId === "bad")?.attention).toBe(true);
    expect(pins.find((p) => p.meterId === "good")?.attention).toBe(false);
    // no_bill is a coverage absence, not a concern signal (matching the table's law).
    expect(pins.find((p) => p.meterId === "nobill")?.attention).toBe(false);
  });

  it("is pure: does not mutate the input", () => {
    const m = meter({ id: "a", latitude: 36.7, longitude: -119.8 });
    const snapshot = JSON.parse(JSON.stringify(m));
    toMapPins([m]);
    expect(m).toEqual(snapshot);
  });
});
