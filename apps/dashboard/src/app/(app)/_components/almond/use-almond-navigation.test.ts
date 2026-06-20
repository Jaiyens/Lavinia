import { describe, expect, it } from "vitest";
import {
  applyNavigateAction,
  energyPathFor,
  navigateActionToQuery,
  pathForAction,
  solarPathFor,
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
    setAccount: (value) => calls.push({ key: "setAccount", value }),
    setProgram: (value) => calls.push({ key: "setProgram", value }),
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

  // H-3: a solar action's program/account filters drive their own setters in place (the path taken
  // when the grower is already on /solar), exactly as the energy filters drive theirs on /energy.
  it("drives the program/account setters when those Solar-tab filter keys are present (H-3)", () => {
    const { setters, calls } = recordingSetters();
    applyNavigateAction(setters, { lens: "arrays", program: "NEM2", account: "1001", surface: "solar" });
    // `surface` selects the path, not a setter, so it drives nothing here; only the URL-state keys do.
    expect(calls).toEqual([
      { key: "setLens", value: "arrays" },
      { key: "setAccount", value: "1001" },
      { key: "setProgram", value: "NEM2" },
    ]);
  });

  it("honors an explicit null clear on the program/account filters", () => {
    const { setters, calls } = recordingSetters();
    applyNavigateAction(setters, { program: null, account: null });
    expect(calls).toEqual([
      { key: "setAccount", value: null },
      { key: "setProgram", value: null },
    ]);
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

  // H-3: a solar deep link must carry the Solar-tab filters (program/account) so /solar's nuqs
  // consumers narrow on mount; `surface` selects the PATH (pathForAction), never a query key.
  it("serializes the program/account filters but never the surface selector (H-3)", () => {
    expect(navigateActionToQuery({ lens: "arrays", surface: "solar", program: "NEM2" })).toBe(
      "lens=arrays&program=NEM2",
    );
    expect(
      navigateActionToQuery({ lens: "table", surface: "solar", account: "1001", program: "NEM2" }),
    ).toBe("lens=table&account=1001&program=NEM2");
    // No `surface=solar` ever leaks into the query string.
    expect(navigateActionToQuery({ surface: "solar", program: "NEM2" })).toBe("program=NEM2");
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

// H-3: the solar sibling of energyPathFor and the action->path resolver. These are the AC's
// "a test asserts a solar navigate opens /solar": pathForAction on a solar action targets /solar
// (so the bridge's router.push lands there), while an energy action stays on /energy unchanged.
describe("solarPathFor", () => {
  it("routes the public Tour to its own solar surface, never out of the Tour", () => {
    expect(solarPathFor("/tour")).toBe("/tour/solar");
    expect(solarPathFor("/tour/solar")).toBe("/tour/solar");
  });

  it("routes the live app (and an unknown/null path) to /solar", () => {
    expect(solarPathFor("/")).toBe("/solar");
    expect(solarPathFor("/solar")).toBe("/solar");
    expect(solarPathFor(null)).toBe("/solar");
  });
});

describe("pathForAction", () => {
  it("a solar navigate opens /solar (the AC's end-to-end routing promise)", () => {
    // {lens:"arrays", surface:"solar"} targets /solar, where parseSolarLens resolves `arrays` — not
    // /energy, where the energy parseLens would coerce it to the Table default and strand the grower.
    expect(pathForAction({ lens: "arrays", surface: "solar" }, "/")).toBe("/solar");
    expect(pathForAction({ lens: "arrays", surface: "solar" }, "/energy")).toBe("/solar");
    expect(pathForAction({ lens: "arrays", surface: "solar" }, "/tour")).toBe("/tour/solar");
  });

  it("an energy (or surface-absent) action stays on the energy surface, byte-identical to before", () => {
    expect(pathForAction({ lens: "table" }, "/")).toBe("/energy");
    expect(pathForAction({ lens: "table", surface: "energy" }, "/")).toBe("/energy");
    expect(pathForAction({ meter: "m-17" }, "/tour")).toBe("/tour/energy");
  });
});
