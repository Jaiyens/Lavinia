import { describe, expect, it } from "vitest";
import {
  defaultSolarLens,
  isSolarLensAvailable,
  parseSolarLens,
  solarLensQueryOptions,
  SOLAR_LENSES,
  SOLAR_LENS_KEYS,
  type SolarLens,
} from "./lens-solar";

describe("solar lens registry", () => {
  it("carries exactly the four solar lens keys in priority order (Arrays . Calendar . Map . Table)", () => {
    expect(SOLAR_LENS_KEYS).toEqual(["arrays", "calendar", "map", "table"]);
  });

  it("defaults to Arrays — the aggregation map is the at-a-glance wedge (overrides the Energy Table-first default)", () => {
    expect(isSolarLensAvailable("arrays")).toBe(true);
    expect(defaultSolarLens()).toBe("arrays");
  });

  it("registry priority order has Arrays first so it is the default", () => {
    expect(SOLAR_LENSES[0]?.key).toBe("arrays");
  });

  it("reports availability for every shipped solar lens", () => {
    expect(isSolarLensAvailable("arrays")).toBe(true);
    expect(isSolarLensAvailable("calendar")).toBe(true);
    expect(isSolarLensAvailable("map")).toBe(true);
    expect(isSolarLensAvailable("table")).toBe(true);
  });

  it("resolves an unknown, absent, or empty value to the default (Arrays)", () => {
    expect(parseSolarLens(undefined)).toBe("arrays");
    expect(parseSolarLens(null)).toBe("arrays");
    expect(parseSolarLens("")).toBe("arrays");
    expect(parseSolarLens("bogus")).toBe("arrays");
    // The energy default value must never leak through as a valid solar lens.
    expect(parseSolarLens("chart")).toBe("arrays");
  });

  it("passes through every available solar lens unchanged", () => {
    expect(parseSolarLens("arrays")).toBe("arrays");
    expect(parseSolarLens("calendar")).toBe("calendar");
    expect(parseSolarLens("map")).toBe("map");
    expect(parseSolarLens("table")).toBe("table");
  });

  it("default picker follows priority order: the highest-priority available lens wins", () => {
    const order: SolarLens[] = ["arrays", "calendar", "map", "table"];
    const pick = (avail: Record<SolarLens, boolean>): SolarLens =>
      order.find((k) => avail[k]) ?? "arrays";
    expect(pick({ arrays: true, calendar: false, map: false, table: false })).toBe("arrays");
    expect(pick({ arrays: false, calendar: true, map: true, table: false })).toBe("calendar");
    expect(pick({ arrays: false, calendar: false, map: false, table: true })).toBe("table");
  });

  it("exposes nuqs options that default to Arrays and clear the default from the URL", () => {
    const opts = solarLensQueryOptions();
    expect(opts.defaultValue).toBe("arrays");
    expect(opts.clearOnDefault).toBe(true);
  });
});
