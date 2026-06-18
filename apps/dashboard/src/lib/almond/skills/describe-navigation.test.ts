import { describe, expect, it } from "vitest";
import { describeNavigation } from "./describe-navigation";
import type { NavigateAction } from "./navigate";

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
