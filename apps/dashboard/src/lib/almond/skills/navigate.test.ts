import { describe, expect, it } from "vitest";
import type { MeterView } from "@/lib/dashboard/load";
import { resolveNavigate, stateForAction } from "./navigate";

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

// The post-action state for a NON-filter move (meter open or lens): the whole farm is still visible,
// no filter is active. Shared so the meter-path assertions read cleanly.
const ALL_VISIBLE = (openMeter: string | null) => ({
  visibleMeterCount: METERS.length,
  activeFilter: { entity: null, ranch: null, rate: null },
  openMeter,
});

describe("resolveNavigate — meter path", () => {
  it("single exact-name match returns a navigate action carrying the meter ID (not the query) and the name", () => {
    const result = resolveNavigate(METERS, { open: "meter", query: "Pump 17" });
    // The meter id is the URL value; the name rides alongside for Story 7.5's action chip.
    expect(result).toEqual({
      kind: "navigate",
      action: { meter: "m17" },
      meterName: "Pump 17",
      state: ALL_VISIBLE("m17"),
    });
  });

  it("resolves by SA id", () => {
    const result = resolveNavigate(METERS, { open: "meter", query: "SA-170" });
    expect(result).toEqual({
      kind: "navigate",
      action: { meter: "m170" },
      meterName: "Pump 170",
      state: ALL_VISIBLE("m170"),
    });
  });

  it("resolves by meter id", () => {
    const result = resolveNavigate(METERS, { open: "meter", query: "m4" });
    expect(result).toEqual({
      kind: "navigate",
      action: { meter: "m4" },
      meterName: "West Pump 4",
      state: ALL_VISIBLE("m4"),
    });
  });

  it("treats a bare query (no `open`) as a meter request", () => {
    const result = resolveNavigate(METERS, { query: "West Pump 4" });
    expect(result).toEqual({
      kind: "navigate",
      action: { meter: "m4" },
      meterName: "West Pump 4",
      state: ALL_VISIBLE("m4"),
    });
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
      state: ALL_VISIBLE(null),
    });
    expect(resolveNavigate(METERS, { open: "meter", query: "  ", rate: "AG-4" })).toEqual({
      kind: "navigate",
      action: { rate: "AG-4" },
      state: {
        visibleMeterCount: 1,
        activeFilter: { entity: null, ranch: null, rate: "AG-4" },
        openMeter: null,
      },
    });
  });
});

describe("resolveNavigate — lens / filter path", () => {
  it("a valid lens returns a navigate action over the lens key", () => {
    expect(resolveNavigate(METERS, { lens: "map" })).toEqual({
      kind: "navigate",
      action: { lens: "map" },
      state: ALL_VISIBLE(null),
    });
  });

  it("an unknown lens is REFUSED as unknown-surface, never coerced to a default", () => {
    expect(resolveNavigate(METERS, { lens: "spreadsheet" })).toEqual({
      kind: "unknown-surface",
      requested: "spreadsheet",
    });
  });

  it("a filter value that is a real value returns a navigate action over that filter key", () => {
    // "AG-4" is a real rate on the farm (West Pump 4), so it lands as the exact value.
    expect(resolveNavigate(METERS, { rate: "AG-4" })).toEqual({
      kind: "navigate",
      action: { rate: "AG-4" },
      state: {
        visibleMeterCount: 1,
        activeFilter: { entity: null, ranch: null, rate: "AG-4" },
        openMeter: null,
      },
    });
  });

  it("combines a lens and a filter into one action", () => {
    expect(resolveNavigate(METERS, { lens: "table", entity: "Batth LLC" })).toEqual({
      kind: "navigate",
      action: { lens: "table", entity: "Batth LLC" },
      state: {
        visibleMeterCount: 3,
        activeFilter: { entity: "Batth LLC", ranch: null, rate: null },
        openMeter: null,
      },
    });
  });

  it("a whitespace-only filter is ignored; an actionless request returns none", () => {
    expect(resolveNavigate(METERS, { rate: "   " })).toEqual({ kind: "none" });
    expect(resolveNavigate(METERS, {})).toEqual({ kind: "none" });
  });
});

describe("resolveNavigate — fuzzy filter -> real value (schema/predicate alignment)", () => {
  it("maps a case-insensitive CONTAINS phrase onto the real value present on the farm", () => {
    // "a1" is not an exact rate, but it is contained in the real "AG-A1" the two pumps carry (and not
    // in "AG-4"). The action MUST carry the real value (AG-A1), not the raw phrase, or filterMeters
    // (exact match) would silently filter to nothing.
    const result = resolveNavigate(METERS, { rate: "a1" });
    expect(result.kind).toBe("navigate");
    if (result.kind !== "navigate") throw new Error("expected navigate");
    expect(result.action).toEqual({ rate: "AG-A1" });
    // And the count is verified against the real value: Pump 17 + Pump 170 carry AG-A1.
    expect(result.state.visibleMeterCount).toBe(2);
  });

  it("matches case-insensitively on the entity name", () => {
    const result = resolveNavigate(METERS, { entity: "batth" });
    expect(result.kind).toBe("navigate");
    if (result.kind !== "navigate") throw new Error("expected navigate");
    expect(result.action).toEqual({ entity: "Batth LLC" });
    expect(result.state.visibleMeterCount).toBe(3);
  });

  it("a phrase matching NO real value returns clarify naming the real values, never an empty filter", () => {
    const result = resolveNavigate(METERS, { rate: "AG-999" });
    expect(result.kind).toBe("clarify");
    if (result.kind !== "clarify") throw new Error("expected clarify");
    // It names what the farm actually has rather than silently filtering to zero meters.
    expect(result.candidates).toEqual(["AG-A1", "AG-4"]);
    expect("action" in result).toBe(false);
  });

  it("an ambiguous phrase (several real values contain it) returns clarify with those values", () => {
    // Both "AG-A1" and "AG-A2" contain "ag-a". Add a third rate so the phrase is genuinely ambiguous.
    const meters = [
      ...METERS,
      makeMeter({ id: "m5", name: "Pump 5", serviceId: "SA-5", rateSchedule: "AG-A2" }),
    ];
    const result = resolveNavigate(meters, { rate: "ag-a" });
    expect(result.kind).toBe("clarify");
    if (result.kind !== "clarify") throw new Error("expected clarify");
    expect(result.candidates).toEqual(["AG-A1", "AG-A2"]);
  });
});

describe("resolveNavigate — clear filters (the bug: show the whole farm again)", () => {
  it("clear:true nulls all three filter keys so the bridge resets them", () => {
    const result = resolveNavigate(METERS, { clear: true });
    expect(result).toEqual({
      kind: "navigate",
      action: { entity: null, ranch: null, rate: null },
      state: {
        visibleMeterCount: METERS.length,
        activeFilter: { entity: null, ranch: null, rate: null },
        openMeter: null,
      },
    });
  });

  it("a filter then a clear returns the visible count to the FULL meter total (proven by state)", () => {
    const filtered = resolveNavigate(METERS, { rate: "AG-4" });
    if (filtered.kind !== "navigate") throw new Error("expected navigate");
    expect(filtered.state.visibleMeterCount).toBe(1); // the filter narrowed to one meter

    const cleared = resolveNavigate(METERS, { clear: true });
    if (cleared.kind !== "navigate") throw new Error("expected navigate");
    // The whole farm is back. The agent can only narrate "back to N" because the computed state IS N.
    expect(cleared.state.visibleMeterCount).toBe(METERS.length);
    expect(cleared.action).toEqual({ entity: null, ranch: null, rate: null });
  });

  it("a clear may carry a lens (show the table for the whole farm)", () => {
    const result = resolveNavigate(METERS, { clear: true, lens: "table" });
    expect(result).toEqual({
      kind: "navigate",
      action: { lens: "table", entity: null, ranch: null, rate: null },
      state: {
        visibleMeterCount: METERS.length,
        activeFilter: { entity: null, ranch: null, rate: null },
        openMeter: null,
      },
    });
  });

  it("a clear wins over a filter phrase carried in the same request (no contradiction)", () => {
    const result = resolveNavigate(METERS, { clear: true, rate: "AG-4" });
    if (result.kind !== "navigate") throw new Error("expected navigate");
    expect(result.action).toEqual({ entity: null, ranch: null, rate: null });
    expect(result.state.visibleMeterCount).toBe(METERS.length);
  });
});

describe("stateForAction — verify-before-narrate seam", () => {
  it("a no-op action (lens only) reports the whole farm visible", () => {
    expect(stateForAction(METERS, { lens: "map" })).toEqual({
      visibleMeterCount: METERS.length,
      activeFilter: { entity: null, ranch: null, rate: null },
      openMeter: null,
    });
  });

  it("a filter that matches nothing reports zero (the honest empty signal)", () => {
    // A real value that no meter happens to carry would count zero; here we pass the exact value an
    // empty result would need by filtering on an entity none has after a hypothetical apply.
    expect(stateForAction(METERS, { entity: "Ghost LLC" }).visibleMeterCount).toBe(0);
  });
});
