import { describe, expect, it } from "vitest";
import { dailyRiskRead, freshnessHours, freshnessPhrase } from "./read";
import { assessMeter } from "./risk";
import type { MeterSnapshot } from "./types";

function meter(over: Partial<MeterSnapshot>): MeterSnapshot {
  return {
    id: "m1",
    name: "Avenue 7 Pump 3",
    kind: "pump",
    group: null,
    lat: null,
    lng: null,
    rateSchedule: "AG-A1",
    dollarsPerKw: 19.71,
    peakSoFarKw: 150,
    currentKw: 100,
    currentAsOf: "2026-06-19T18:00:00.000Z",
    peakAtMinute: 900,
    loadFactor: 0.35,
    seed: "m1",
    cycleStartIso: "2026-06-01",
    cycleCloseIso: "2026-06-30",
    ...over,
  };
}

const NOW = new Date("2026-06-20T20:00:00.000Z");

describe("freshness (the ~1-day lag, made visible)", () => {
  it("measures hours behind now", () => {
    expect(freshnessHours("2026-06-20T18:00:00.000Z", NOW)).toBeCloseTo(2, 5);
  });
  it("phrases a day-old read as about 1 day ago, never live", () => {
    expect(freshnessPhrase("2026-06-19T18:00:00.000Z", NOW)).toBe("about 1 day ago");
    expect(freshnessPhrase("2026-06-20T14:00:00.000Z", NOW)).toBe("about 6 hours ago");
  });
});

describe("dailyRiskRead", () => {
  it("is high and names the meter when one is setting a new peak", () => {
    const r = dailyRiskRead([assessMeter(meter({ peakSoFarKw: 64, currentKw: 70 }))], "hot");
    expect(r.level).toBe("high");
    expect(r.line).toContain("Avenue 7 Pump 3");
  });
  it("is high on a hot day when a meter hugs its ceiling", () => {
    const r = dailyRiskRead([assessMeter(meter({ peakSoFarKw: 150, currentKw: 145 }))], "hot");
    expect(r.level).toBe("high");
    expect(r.line.toLowerCase()).toContain("hot");
  });
  it("is low when everything is comfortably below its peak", () => {
    const r = dailyRiskRead([assessMeter(meter({ peakSoFarKw: 200, currentKw: 60 }))], "hot");
    expect(r.level).toBe("low");
  });
  it("never invents cross-meter stagger advice", () => {
    const risks = [
      assessMeter(meter({ id: "a", name: "Avenue 7 Pump 1", peakSoFarKw: 100, currentKw: 98 })),
      assessMeter(meter({ id: "b", name: "Westside Well 1", peakSoFarKw: 100, currentKw: 99 })),
    ];
    const r = dailyRiskRead(risks, "hot");
    expect(r.line.toLowerCase()).not.toContain("stagger");
  });
});
