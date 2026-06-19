import { describe, expect, it } from "vitest";
import {
  applyNavigateAction,
  energyPathFor,
  navigateActionToQuery,
  type NavigationSetters,
} from "./use-almond-navigation";

// Pure test of the action -> setter mapping (the bridge's client contract). The hook itself wires
// these setters to nuqs's `useQueryState` under the adapter; the in-browser "URL changed" behavior
// is the e2e layer (see the story's Testing requirements). Here we prove every present key drives
// exactly its setter, a `null` clears, and an absent key is untouched.

function recordingSetters() {
  const calls: Array<{ key: keyof NavigationSetters; value: unknown }> = [];
  const setters: NavigationSetters = {
    setLens: (value) => calls.push({ key: "setLens", value }),
    setEntity: (value) => calls.push({ key: "setEntity", value }),
    setRanch: (value) => calls.push({ key: "setRanch", value }),
    setRate: (value) => calls.push({ key: "setRate", value }),
    setMeter: (value) => calls.push({ key: "setMeter", value }),
  };
  return { setters, calls };
}

describe("applyNavigateAction", () => {
  it("opens a meter by setting only the meter key", () => {
    const { setters, calls } = recordingSetters();
    applyNavigateAction(setters, { meter: "m-17" });
    expect(calls).toEqual([{ key: "setMeter", value: "m-17" }]);
  });

  it("switches the lens", () => {
    const { setters, calls } = recordingSetters();
    applyNavigateAction(setters, { lens: "map" });
    expect(calls).toEqual([{ key: "setLens", value: "map" }]);
  });

  it("applies present filter keys, leaving absent keys untouched", () => {
    const { setters, calls } = recordingSetters();
    applyNavigateAction(setters, { lens: "table", rate: "AG-4" });
    expect(calls).toEqual([
      { key: "setLens", value: "table" },
      { key: "setRate", value: "AG-4" },
    ]);
  });

  it("honors an explicit null clear (not skipped as falsy)", () => {
    const { setters, calls } = recordingSetters();
    applyNavigateAction(setters, { meter: null });
    expect(calls).toEqual([{ key: "setMeter", value: null }]);
  });

  it("an empty action touches nothing", () => {
    const { setters, calls } = recordingSetters();
    applyNavigateAction(setters, {});
    expect(calls).toEqual([]);
  });
});

// The deep-link path (open-meter / show-map fix): when Almond drives the screen from a surface that
// does NOT mount the meter drawer or lens views (Home), the action is routed to the energy surface as
// a query string instead of applied in place. These prove the serialization the route push depends on.
describe("navigateActionToQuery", () => {
  it("serializes a meter open to the meter key", () => {
    expect(navigateActionToQuery({ meter: "m-17" })).toBe("meter=m-17");
  });

  it("serializes a lens switch", () => {
    expect(navigateActionToQuery({ lens: "map" })).toBe("lens=map");
  });

  it("serializes filters in canonical key order and url-encodes their values", () => {
    expect(navigateActionToQuery({ lens: "table", rate: "AG-A1", ranch: "Home Ranch" })).toBe(
      "lens=table&ranch=Home+Ranch&rate=AG-A1",
    );
  });

  it("omits null/undefined keys (a fresh deep link has nothing to clear)", () => {
    expect(navigateActionToQuery({ meter: null })).toBe("");
    expect(navigateActionToQuery({})).toBe("");
  });
});

describe("energyPathFor", () => {
  it("routes the public Tour to its own energy surface, never out of the Tour", () => {
    expect(energyPathFor("/tour")).toBe("/tour/energy");
    expect(energyPathFor("/tour/energy")).toBe("/tour/energy");
  });

  it("routes the live app (and an unknown/null path) to /energy", () => {
    expect(energyPathFor("/")).toBe("/energy");
    expect(energyPathFor("/energy")).toBe("/energy");
    expect(energyPathFor(null)).toBe("/energy");
  });
});
