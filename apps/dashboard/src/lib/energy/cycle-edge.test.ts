import { describe, expect, it } from "vitest";
import { cycleEdge, type CycleEdgeInput } from "./cycle-edge";

// $10/kW from the bill (effectiveDemandRate). A pump whose cycle closes June 12.
function input(overrides: Partial<CycleEdgeInput> = {}): CycleEdgeInput {
  return {
    farmId: "farm1",
    pumpId: "pump1",
    pumpName: "East well",
    cycleClose: "2026-06-12",
    asOf: "2026-06-10",
    cycleToDatePeakKw: 60,
    typicalPeakKw: 120,
    rateUsdPerKw: 10,
    ...overrides,
  };
}

describe("cycleEdge", () => {
  it("recommends holding when close is near and no high peak is set yet", () => {
    const recs = cycleEdge([input()]);
    expect(recs).toHaveLength(1);

    const [rec] = recs;
    if (!rec) throw new Error("expected a cycle-edge rec");
    // A full set would lift the peak from 60 kW to the typical 120 kW: 60 kW of
    // fresh demand at $10/kW = $600, paid for the last 2 days of the cycle.
    expect(rec.severity).toBe("watch");
    expect(rec.impactUsd).toBe(600);
    expect(rec.situation).toBe(
      "Your East well billing cycle closes in 2 days and this month's peak is still low.",
    );
    expect(rec.action.kind).toBe("hold_sets");
    expect(rec.action.label).toBe("Hold big sets until after June 12");
    expect(rec.impactNote).toContain("$600");
    expect(rec.action.params).toEqual({
      pumpId: "pump1",
      cycleClose: "2026-06-12",
      daysToClose: 2,
      currentPeakKw: 60,
      typicalPeakKw: 120,
      avoidableKw: 60,
      ratePerKw: 10,
    });
  });

  it("says '1 day' (singular) when the cycle closes tomorrow", () => {
    const [rec] = cycleEdge([input({ asOf: "2026-06-11" })]);
    if (!rec) throw new Error("expected a cycle-edge rec");
    expect(rec.situation).toContain("closes in 1 day ");
  });

  it("stays quiet when the cycle close is still far off", () => {
    expect(cycleEdge([input({ asOf: "2026-06-01" })])).toEqual([]); // 11 days out
  });

  it("stays quiet once a high peak has already been set this cycle", () => {
    // 110 kW is past 0.8 * 120 = 96, so holding won't help this cycle.
    expect(cycleEdge([input({ cycleToDatePeakKw: 110 })])).toEqual([]);
  });

  it("stays quiet once the close date has passed", () => {
    expect(cycleEdge([input({ asOf: "2026-06-13" })])).toEqual([]); // -1 day
  });

  it("processes a mix of pumps and only flags the qualifying ones", () => {
    const recs = cycleEdge([
      input({ pumpId: "near-low", pumpName: "East" }), // qualifies
      input({ pumpId: "near-high", cycleToDatePeakKw: 115 }), // already spiked
      input({ pumpId: "far", asOf: "2026-06-01" }), // too early
    ]);
    expect(recs.map((rec) => rec.action.params?.pumpId)).toEqual(["near-low"]);
  });
});
