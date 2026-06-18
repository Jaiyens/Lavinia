import { describe, expect, it } from "vitest";
import type { MeterView } from "@/lib/dashboard/load";
import { resolveNavigate } from "./navigate";

/**
 * Pure tests for the navigate resolver — zero external calls (NFR3). Covers the four AC cases:
 * single-match, multi-match (the ambiguity rule, FR3), no-match, and unknown-surface, plus the
 * lens and filter paths. The fixture deliberately includes two meters that share a name token so the
 * case-insensitive contains match is ambiguous (the Batth reality: names repeat across ranches).
 */

// Full MeterView so the resolver's reuse of `resolveMeterQuery` (which reads id/serviceId/name) is
// exercised against real shapes. Mirrors shape.test.ts's local factory.
function makeMeter(over: Partial<MeterView> = {}): MeterView {
  const base: MeterView = {
    id: "m1",
    name: "Pump 1",
    serviceId: "SA-1",
    rateSchedule: "AG-A1",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: "reconciled" as MeterView["coverageState"],
    accountNumber: "1001",
    ranchName: "North Ranch",
    entityName: "Batth LLC",
    cropName: "Almonds",
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
    nemPeriods: [],
    growerPumpId: null,
    periods: [],
  };
  return { ...base, ...over };
}

// "Pump 17" and "Pump 170" both contain "pump 17"; "West Pump 4" is unique.
const METERS: MeterView[] = [
  makeMeter({ id: "m17", name: "Pump 17", serviceId: "SA-17" }),
  makeMeter({ id: "m170", name: "Pump 170", serviceId: "SA-170" }),
  makeMeter({ id: "m4", name: "West Pump 4", serviceId: "SA-4", rateSchedule: "AG-4" }),
];

describe("resolveNavigate — meter path", () => {
  it("single exact-name match returns a navigate action carrying the meter ID (not the query)", () => {
    const result = resolveNavigate(METERS, { open: "meter", query: "Pump 17" });
    expect(result).toEqual({ kind: "navigate", action: { meter: "m17" } });
  });

  it("resolves by SA id", () => {
    const result = resolveNavigate(METERS, { open: "meter", query: "SA-170" });
    expect(result).toEqual({ kind: "navigate", action: { meter: "m170" } });
  });

  it("resolves by meter id", () => {
    const result = resolveNavigate(METERS, { open: "meter", query: "m4" });
    expect(result).toEqual({ kind: "navigate", action: { meter: "m4" } });
  });

  it("treats a bare query (no `open`) as a meter request", () => {
    const result = resolveNavigate(METERS, { query: "West Pump 4" });
    expect(result).toEqual({ kind: "navigate", action: { meter: "m4" } });
  });

  it("AMBIGUITY RULE: >= 2 name matches return clarify and emit NO action (FR3)", () => {
    const result = resolveNavigate(METERS, { open: "meter", query: "Pump 1" });
    expect(result.kind).toBe("clarify");
    if (result.kind !== "clarify") throw new Error("expected clarify");
    expect(result.candidates).toEqual(["Pump 17", "Pump 170"]);
    // The load-bearing safety guarantee: a clarify result never carries a navigation action.
    expect("action" in result).toBe(false);
  });

  it("no match returns none and never fabricates a target", () => {
    expect(resolveNavigate(METERS, { open: "meter", query: "Pump 999" })).toEqual({ kind: "none" });
  });

  it("an empty query returns none", () => {
    expect(resolveNavigate(METERS, { open: "meter", query: "   " })).toEqual({ kind: "none" });
  });

  it("an empty-query open:\"meter\" still honors a lens/filter carried alongside it", () => {
    // A stray `open: "meter"` with no usable query must not swallow a real lens/filter request.
    expect(resolveNavigate(METERS, { open: "meter", lens: "map" })).toEqual({
      kind: "navigate",
      action: { lens: "map" },
    });
    expect(resolveNavigate(METERS, { open: "meter", query: "  ", rate: "AG-4" })).toEqual({
      kind: "navigate",
      action: { rate: "AG-4" },
    });
  });
});

describe("resolveNavigate — lens / filter path", () => {
  it("a valid lens returns a navigate action over the lens key", () => {
    expect(resolveNavigate(METERS, { lens: "map" })).toEqual({
      kind: "navigate",
      action: { lens: "map" },
    });
  });

  it("an unknown lens is REFUSED as unknown-surface, never coerced to a default", () => {
    expect(resolveNavigate(METERS, { lens: "spreadsheet" })).toEqual({
      kind: "unknown-surface",
      requested: "spreadsheet",
    });
  });

  it("a filter value returns a navigate action over that filter key", () => {
    expect(resolveNavigate(METERS, { rate: "AG-4" })).toEqual({
      kind: "navigate",
      action: { rate: "AG-4" },
    });
  });

  it("combines a lens and a filter into one action", () => {
    expect(resolveNavigate(METERS, { lens: "table", entity: "Batth LLC" })).toEqual({
      kind: "navigate",
      action: { lens: "table", entity: "Batth LLC" },
    });
  });

  it("a whitespace-only filter is ignored; an actionless request returns none", () => {
    expect(resolveNavigate(METERS, { rate: "   " })).toEqual({ kind: "none" });
    expect(resolveNavigate(METERS, {})).toEqual({ kind: "none" });
  });
});
