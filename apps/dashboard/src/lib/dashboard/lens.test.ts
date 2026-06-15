import { describe, expect, it } from "vitest";
import {
  defaultLens,
  isLensAvailable,
  LENSES,
  LENS_KEYS,
  parseLens,
  type Lens,
} from "./lens";

describe("dashboard lens registry", () => {
  it("carries exactly the four canonical lens keys (architecture nuqs union)", () => {
    expect(LENS_KEYS).toEqual(["chart", "table", "map", "calendar"]);
  });

  it("defaults to the Chart face now that 2.8 shipped it (DESIGN.md default hero)", () => {
    expect(isLensAvailable("chart")).toBe(true);
    expect(defaultLens()).toBe("chart");
  });

  it("resolves an unknown, absent, or not-yet-available value to the default", () => {
    expect(parseLens(undefined)).toBe("chart");
    expect(parseLens(null)).toBe("chart");
    expect(parseLens("")).toBe("chart");
    expect(parseLens("bogus")).toBe("chart");
  });

  it("passes through an available lens unchanged (all four since Story 3.5)", () => {
    expect(parseLens("table")).toBe("table");
    expect(parseLens("chart")).toBe("chart");
    expect(parseLens("map")).toBe("map");
    expect(parseLens("calendar")).toBe("calendar");
  });

  it("default picker follows priority order: once a higher-priority lens is available it wins", () => {
    // Simulate the 2.8 flip without mutating the shipped registry.
    const order: Lens[] = ["chart", "table", "map", "calendar"];
    const pick = (avail: Record<Lens, boolean>): Lens =>
      order.find((k) => avail[k]) ?? "table";
    expect(pick({ chart: false, table: true, map: false, calendar: false })).toBe("table");
    expect(pick({ chart: true, table: true, map: false, calendar: false })).toBe("chart");
    expect(pick({ chart: false, table: false, map: true, calendar: false })).toBe("map");
  });

  it("registry priority order has chart first so it becomes the default the moment it ships", () => {
    expect(LENSES[0]?.key).toBe("chart");
  });
});
