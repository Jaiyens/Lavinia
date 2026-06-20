import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NEM2_GRANDFATHER_YEARS,
  expandTripWire,
  grandfatherPosition,
} from "./solar-grandfather";

describe("grandfatherPosition (F-1, FR16)", () => {
  const asOf = "2026-06-20T12:00:00.000Z";

  it("returns honest-unknown when the interconnection date is not on file (DM1 absent)", () => {
    // The launch state: the Batth export carries no PTO date, so every array is honest-unknown.
    expect(
      grandfatherPosition({ interconnectionDate: null, nemType: "nem2", asOf }),
    ).toEqual({ state: "unknown" });
  });

  it("computes the 20-year-from-PTO expiry year and whole years remaining when a date is on file", () => {
    // Interconnected 2018 -> grandfather expires 2038; ~12 years remaining as of mid-2026.
    const position = grandfatherPosition({
      interconnectionDate: "2018-03-01T00:00:00.000Z",
      nemType: "nem2",
      asOf,
    });
    expect(position.state).toBe("known");
    if (position.state !== "known") throw new Error("expected a known position");
    expect(position.expiryYear).toBe(2038);
    expect(position.yearsRemaining).toBe(11);
  });

  it("uses the documented 20-year window constant", () => {
    expect(NEM2_GRANDFATHER_YEARS).toBe(20);
    const position = grandfatherPosition({
      interconnectionDate: "2020-01-01T00:00:00.000Z",
      nemType: "nem2_agg",
      asOf,
    });
    if (position.state !== "known") throw new Error("expected a known position");
    expect(position.expiryYear).toBe(2020 + NEM2_GRANDFATHER_YEARS);
  });

  it("clamps an already-expired array at zero years remaining, never negative", () => {
    const position = grandfatherPosition({
      interconnectionDate: "2000-01-01T00:00:00.000Z",
      nemType: "nem2",
      asOf,
    });
    if (position.state !== "known") throw new Error("expected a known position");
    expect(position.yearsRemaining).toBe(0);
    expect(position.expiryYear).toBe(2020);
  });

  it("never produces a countdown for a non-NEM2 (net-billing) array - cohort isolation (FR18)", () => {
    // A NEM3 / net-billing token has no grandfathered value to count down; honest-unknown.
    expect(
      grandfatherPosition({ interconnectionDate: "2024-01-01T00:00:00.000Z", nemType: "nem3", asOf }),
    ).toEqual({ state: "unknown" });
  });

  it("returns honest-unknown for an unknown program token rather than assuming NEM2", () => {
    expect(
      grandfatherPosition({
        interconnectionDate: "2019-01-01T00:00:00.000Z",
        nemType: "something_else",
        asOf,
      }),
    ).toEqual({ state: "unknown" });
  });

  it("returns honest-unknown for an unparseable date", () => {
    expect(
      grandfatherPosition({ interconnectionDate: "not-a-date", nemType: "nem2", asOf }),
    ).toEqual({ state: "unknown" });
  });
});

describe("expandTripWire (F-1, FR17/FR18)", () => {
  it("applies to a NEM2-cohort array (grandfathered value to protect)", () => {
    expect(expandTripWire({ nemType: "nem2" }).applies).toBe(true);
    expect(expandTripWire({ nemType: "nem2_agg" }).applies).toBe(true);
  });

  it("never applies to a net-billing array (no grandfathered value to protect)", () => {
    expect(expandTripWire({ nemType: "nem3" }).applies).toBe(false);
    expect(expandTripWire({ nemType: null }).applies).toBe(false);
  });
});

describe("cohort isolation (FR18, NFR11)", () => {
  it("carries no net-billing (NEM3) per-kWh export rate constant in the executable code", () => {
    // The grandfather path must never embed a net-billing $/kWh export figure; a NEM2 grandfather
    // countdown is a pure date calculation. This guards against a future edit slipping a rate in.
    // Strip comments first: the doc comments legitimately discuss cohort isolation by name; the
    // guarantee is about EXECUTABLE code, not prose.
    const raw = readFileSync(new URL("./solar-grandfather.ts", import.meta.url), "utf8");
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/\/\/.*$/gm, ""); // line comments
    expect(code).not.toMatch(/nem3/i);
    // No per-kWh money constant (a decimal cents/dollar export rate) hardcoded in the code.
    expect(code).not.toMatch(/\$\/kWh|perKwhCents|exportRate|exportCents/i);
  });
});
