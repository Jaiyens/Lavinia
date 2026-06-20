import { describe, expect, it } from "vitest";
import { SURFACE, SURFACE_KEYS, lensQueryOptions, parseLens } from "./surface";
import { defaultLens } from "./lens";

describe("dashboard surface registry", () => {
  it("is the single source of truth for exactly the canonical URL-state keys (incl. the A-7 account/program filters)", () => {
    expect(SURFACE_KEYS).toEqual(["lens", "entity", "ranch", "rate", "account", "program", "meter"]);
  });

  it("maps every key name to its own literal, and the map covers exactly the key set", () => {
    expect(SURFACE).toEqual({
      lens: "lens",
      entity: "entity",
      ranch: "ranch",
      rate: "rate",
      account: "account",
      program: "program",
      meter: "meter",
    });
    // No drift between the ordered key set and the registry object's keys.
    expect(Object.keys(SURFACE).sort()).toEqual([...SURFACE_KEYS].sort());
  });

  it("resolves the lens key through lens.ts: stale/absent falls back, an available value passes through", () => {
    expect(parseLens(undefined)).toBe(defaultLens());
    expect(parseLens(null)).toBe(defaultLens());
    expect(parseLens("")).toBe(defaultLens());
    expect(parseLens("bogus")).toBe(defaultLens());
    expect(parseLens("table")).toBe("table");
    expect(parseLens("chart")).toBe("chart");
  });

  it("carries the shipped lens nuqs options: default = simplest available lens, cleared on default", () => {
    const opts = lensQueryOptions();
    expect(opts.defaultValue).toBe(defaultLens());
    expect(opts.clearOnDefault).toBe(true);
  });

  it("leaves the filter/meter keys as bare nullable strings - centralizes only the key, no parser/default", () => {
    // The registry centralizes the KEY for these and nothing else; an added parser or default
    // would be the exact behavior change Story 7.1 forbids, so the registry exposes neither. The
    // A-7 account/program filters follow the same raw-nullable-string pattern.
    for (const k of ["entity", "ranch", "rate", "account", "program", "meter"] as const) {
      expect(SURFACE[k]).toBe(k);
    }
  });
});
