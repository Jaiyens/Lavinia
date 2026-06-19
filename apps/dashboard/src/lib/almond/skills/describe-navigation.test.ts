import { describe, expect, it } from "vitest";
import { describeNavigation } from "./describe-navigation";
import type { NavigateAction, NavState } from "./navigate";

// A NavState helper for the verify-before-narrate tests: the count the table actually shows, plus the
// active filter the copy describes.
function state(
  visibleMeterCount: number,
  activeFilter: NavState["activeFilter"] = { entity: null, ranch: null, rate: null },
  openMeter: string | null = null,
): NavState {
  return { visibleMeterCount, activeFilter, openMeter };
}

// Pure tests for the action-chip label composer (Story 7.5, FR2/FR20). The composer turns a
// resolved `NavigateAction` into one plain-operator-English sentence for the chip and the ARIA
// live-region announcement. The meter NAME is resolved server-side and passed in (the action only
// carries the id), so the composer is pure and offline-testable.

describe("describeNavigation", () => {
  it("describes a meter open by name (not the id)", () => {
    expect(describeNavigation({ meter: "pump-abc-123" }, "Westside Pump 17")).toBe(
      "Opened Westside Pump 17",
    );
  });

  it("falls back to a neutral noun when a meter open has no resolvable name", () => {
    expect(describeNavigation({ meter: "pump-xyz" }, null)).toBe("Opened the meter");
    expect(describeNavigation({ meter: "pump-xyz" })).toBe("Opened the meter");
  });

  it("describes a lens switch in plain words", () => {
    expect(describeNavigation({ lens: "map" })).toBe("Showed the map");
    expect(describeNavigation({ lens: "table" })).toBe("Showed the table");
    expect(describeNavigation({ lens: "chart" })).toBe("Showed the chart");
    expect(describeNavigation({ lens: "calendar" })).toBe("Showed the calendar");
  });

  it("describes each filter kind", () => {
    expect(describeNavigation({ rate: "AG-4" })).toBe("Filtered the table to AG-4 meters");
    expect(describeNavigation({ ranch: "Westside" })).toBe("Filtered the table to Westside ranch");
    expect(describeNavigation({ entity: "Batth Farms LLC" })).toBe(
      "Filtered the table to Batth Farms LLC",
    );
  });

  it("composes one sentence for multiple filters", () => {
    expect(describeNavigation({ entity: "Batth Farms LLC", rate: "AG-4" })).toBe(
      "Filtered the table to Batth Farms LLC, AG-4 meters",
    );
  });

  it("composes one sentence for a lens combined with a filter (live-model path)", () => {
    expect(describeNavigation({ lens: "map", rate: "AG-4" })).toBe(
      "Showed the map and filtered to AG-4 meters",
    );
  });

  it("describes a meter close (the shape admits a null clear)", () => {
    expect(describeNavigation({ meter: null })).toBe("Closed the meter");
  });

  it("is honest, not blank, for an empty action", () => {
    expect(describeNavigation({})).toBe("Moved the screen");
  });

  it("uses plain operator voice across every shape: no em dashes, no exclamation marks", () => {
    const samples: Array<[NavigateAction, string | null]> = [
      [{ meter: "m1" }, "Pump 9"],
      [{ lens: "map" }, null],
      [{ rate: "AG-4" }, null],
      [{ ranch: "Westside" }, null],
      [{ entity: "Batth Farms LLC" }, null],
      [{ lens: "table", entity: "Batth Farms LLC", rate: "AG-4" }, null],
      [{}, null],
    ];
    for (const [action, name] of samples) {
      const label = describeNavigation(action, name);
      expect(label).not.toContain("—"); // em dash
      expect(label).not.toContain("!");
    }
  });
});

describe("describeNavigation — verify before narrate (copy from post-action state, T5)", () => {
  it("a clear that lands on 183 says 'Showing all 183 meters' (from the real count, not the request)", () => {
    const clear: NavigateAction = { entity: null, ranch: null, rate: null };
    expect(describeNavigation(clear, null, state(183))).toBe("Showing all 183 meters");
  });

  it("a clear quotes whatever the real total is, never an assumed number", () => {
    const clear: NavigateAction = { entity: null, ranch: null, rate: null };
    // If the farm has 42 meters, the copy says 42, not 183 — it is generated from the state.
    expect(describeNavigation(clear, null, state(42))).toBe("Showing all 42 meters");
  });

  it("a filter that matches 0 meters says nothing matched, NOT a success", () => {
    const filtered: NavigateAction = { rate: "AG-999" };
    const label = describeNavigation(filtered, null, state(0, { entity: null, ranch: null, rate: "AG-999" }));
    expect(label).toBe("No meters match that filter");
    // The honest-empty variant must never read as a confident filtered-success line.
    expect(label).not.toContain("Filtered to");
  });

  it("a filter that lands on a real subset states BOTH the dimension and the verified count", () => {
    const filtered: NavigateAction = { rate: "AG-A1" };
    const label = describeNavigation(filtered, null, state(21, { entity: null, ranch: null, rate: "AG-A1" }));
    expect(label).toBe("Filtered to AG-A1 meters, 21 meters");
  });

  it("an entity filter reads naturally with its verified count", () => {
    const filtered: NavigateAction = { entity: "Batth LLC" };
    const label = describeNavigation(filtered, null, state(60, { entity: "Batth LLC", ranch: null, rate: null }));
    expect(label).toBe("Filtered to Batth LLC, 60 meters");
  });

  it("a clear with a lens carries both the lens word and the verified all-meters count", () => {
    const clear: NavigateAction = { lens: "table", entity: null, ranch: null, rate: null };
    expect(describeNavigation(clear, null, state(183))).toBe("Showed the table. Showing all 183 meters");
  });

  it("a meter open ignores the count (it changed no filter)", () => {
    const open: NavigateAction = { meter: "m1" };
    expect(describeNavigation(open, "Pump 17", state(183, { entity: null, ranch: null, rate: null }, "m1"))).toBe(
      "Opened Pump 17",
    );
  });

  it("the state-derived copy stays in plain operator voice: no em dashes, no exclamation marks", () => {
    const samples: Array<[NavigateAction, NavState]> = [
      [{ entity: null, ranch: null, rate: null }, state(183)],
      [{ rate: "AG-A1" }, state(21, { entity: null, ranch: null, rate: "AG-A1" })],
      [{ rate: "AG-999" }, state(0, { entity: null, ranch: null, rate: "AG-999" })],
      [{ lens: "map", entity: null, ranch: null, rate: null }, state(183)],
    ];
    for (const [action, s] of samples) {
      const label = describeNavigation(action, null, s);
      expect(label).not.toContain("—");
      expect(label).not.toContain("!");
    }
  });
});
