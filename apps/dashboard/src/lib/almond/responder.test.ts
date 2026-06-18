import { describe, expect, it } from "vitest";
import { deriveNavigateInput, isNavigationTurn } from "./responder";

// Pure tests for the stub's offline navigation parsing (Story 7.4). The stub is a deterministic
// fixture that drives the SAME shipped `navigate` skill so e2e/CI prove navigation offline; the
// end-to-end "stub emits a data-navigate part" assertion lives in tools.db.test.ts (needs a seeded
// farm). Here we pin the detector and the parser.

describe("isNavigationTurn", () => {
  it("detects a request to drive the screen (verb or lens word)", () => {
    expect(isNavigationTurn("open westside pump 17")).toBe(true);
    expect(isNavigationTurn("show me the map")).toBe(true);
    expect(isNavigationTurn("switch to the table")).toBe(true);
    expect(isNavigationTurn("filter to ag-4")).toBe(true);
  });

  it("leaves a data question for the grounded answer path", () => {
    expect(isNavigationTurn("how complete is my billing data")).toBe(false);
    expect(isNavigationTurn("which meters cost me the most")).toBe(false);
    expect(isNavigationTurn("where is the money going")).toBe(false);
  });
});

describe("deriveNavigateInput", () => {
  it("a lens word wins", () => {
    expect(deriveNavigateInput("show me the map")).toEqual({ lens: "map" });
    expect(deriveNavigateInput("switch to chart")).toEqual({ lens: "chart" });
  });

  it("an open/show verb opens the named meter (query preserved for the resolver)", () => {
    expect(deriveNavigateInput("open westside pump 17")).toEqual({
      open: "meter",
      query: "westside pump 17",
    });
    expect(deriveNavigateInput("show me dairy field pump 4")).toEqual({
      open: "meter",
      query: "dairy field pump 4",
    });
  });

  it("a rate token filters", () => {
    expect(deriveNavigateInput("filter to ag-4")).toEqual({ rate: "ag-4" });
  });

  it("a non-actionable request yields nothing", () => {
    expect(deriveNavigateInput("hello almond")).toEqual({});
  });
});
