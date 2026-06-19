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
    expect(LENS_KEYS).toEqual(["table", "calendar", "chart", "map"]);
  });

  it("defaults to the Table face — the grower's Excel, readable without learning anything", () => {
    expect(isLensAvailable("table")).toBe(true);
    expect(defaultLens()).toBe("table");
  });

  it("resolves an unknown, absent, or not-yet-available value to the default", () => {
    expect(parseLens(undefined)).toBe("table");
    expect(parseLens(null)).toBe("table");
    expect(parseLens("")).toBe("table");
    expect(parseLens("bogus")).toBe("table");
  });

  it("passes through an available lens unchanged (all four since Story 3.5)", () => {
    expect(parseLens("table")).toBe("table");
    expect(parseLens("chart")).toBe("chart");
    expect(parseLens("map")).toBe("map");
    expect(parseLens("calendar")).toBe("calendar");
  });

  it("default picker follows priority order: the highest-priority available lens wins", () => {
    const order: Lens[] = ["table", "calendar", "chart", "map"];
    const pick = (avail: Record<Lens, boolean>): Lens => order.find((k) => avail[k]) ?? "table";
    expect(pick({ table: true, calendar: false, chart: false, map: false })).toBe("table");
    expect(pick({ table: false, calendar: true, chart: true, map: false })).toBe("calendar");
    expect(pick({ table: false, calendar: false, chart: false, map: true })).toBe("map");
  });

  it("registry priority order has table first so it is the default (the grower's Excel)", () => {
    expect(LENSES[0]?.key).toBe("table");
  });
});
