import { describe, expect, it } from "vitest";
import { assessMeter, byUrgency, classifyRisk, mostUrgent, worstLevel } from "./risk";
import type { MeterSnapshot } from "./types";

function meter(over: Partial<MeterSnapshot>): MeterSnapshot {
  return {
    id: "m1",
    name: "Avenue 7 Pump 1",
    kind: "pump",
    group: null,
    lat: null,
    lng: null,
    rateSchedule: "AG-A1",
    dollarsPerKw: 19.71,
    peakSoFarKw: 200,
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

describe("classifyRisk", () => {
  it("is safe with plenty of headroom", () => {
    expect(classifyRisk(0.5, false)).toBe("safe");
  });
  it("is watch when closing in", () => {
    expect(classifyRisk(0.06, false)).toBe("watch");
  });
  it("is danger right under the ceiling", () => {
    expect(classifyRisk(0.02, false)).toBe("danger");
  });
  it("is danger whenever a new peak is being set, regardless of fraction", () => {
    expect(classifyRisk(0.9, true)).toBe("danger");
  });
});

describe("assessMeter (THE per-meter rule)", () => {
  it("a high-draw meter that already peaked higher is SAFE (ceiling set)", () => {
    // 180 kW now, but already peaked at 200 -> safe. Absolute kW does not decide risk.
    const r = assessMeter(meter({ peakSoFarKw: 200, currentKw: 180 }));
    expect(r.level).toBe("safe");
    expect(r.headroomKw).toBe(20);
    expect(r.settingNewPeak).toBe(false);
  });

  it("a lower-draw meter hugging a low ceiling is DANGEROUS", () => {
    // 145 kW now with a 150 ceiling -> danger, even though it draws less than the 180 above.
    const r = assessMeter(meter({ peakSoFarKw: 150, currentKw: 145 }));
    expect(r.level).toBe("danger");
    expect(r.headroomKw).toBe(5);
  });

  it("a meter drawing at or above its old peak is setting a new peak (danger)", () => {
    const r = assessMeter(meter({ peakSoFarKw: 64, currentKw: 68 }));
    expect(r.settingNewPeak).toBe(true);
    expect(r.level).toBe("danger");
    expect(r.headroomKw).toBeLessThan(0);
  });

  it("prices demand off the shared rate card (positive $/kW, locked >= 0)", () => {
    const r = assessMeter(meter({ peakSoFarKw: 200, currentKw: 100 }));
    expect(r.dollarsPerKw).toBeGreaterThan(0);
    expect(r.lockedDemandUsd).toBeCloseTo(200 * r.dollarsPerKw, 6);
    expect(r.crossPeakCostUsd).toBeGreaterThanOrEqual(0);
  });
});

describe("ordering helpers", () => {
  const safe = assessMeter(meter({ id: "s", peakSoFarKw: 200, currentKw: 50 }));
  const watch = assessMeter(meter({ id: "w", peakSoFarKw: 100, currentKw: 94 }));
  const danger = assessMeter(meter({ id: "d", peakSoFarKw: 100, currentKw: 98 }));

  it("byUrgency sorts danger first, safe last", () => {
    const sorted = byUrgency([safe, watch, danger]);
    expect(sorted.map((r) => r.meter.id)).toEqual(["d", "w", "s"]);
  });
  it("mostUrgent picks the worst", () => {
    expect(mostUrgent([safe, watch, danger])?.meter.id).toBe("d");
    expect(mostUrgent([])).toBeNull();
  });
  it("worstLevel is the worst, never an average", () => {
    expect(worstLevel([safe, watch, danger])).toBe("danger");
    expect(worstLevel([safe, watch])).toBe("watch");
    expect(worstLevel([safe])).toBe("safe");
  });
});
