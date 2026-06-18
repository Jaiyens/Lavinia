import { describe, expect, it } from "vitest";
import { applyNavigateAction, type NavigationSetters } from "./use-almond-navigation";

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
