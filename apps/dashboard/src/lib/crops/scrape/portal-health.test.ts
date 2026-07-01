import { describe, expect, it } from "vitest";
import {
  assertPortalShape,
  matchesSierraValleyHolding,
  selectSierraValleyHoller,
  SourceChangedError,
  type HullerRef,
} from "./portal-health";

const SVH: HullerRef = { id: 7, name: "Sierra Valley Holding", cropYears: [2024, 2025] };
const OTHER: HullerRef = { id: 9, name: "Central Cal Hulling", cropYears: [2025] };

describe("matchesSierraValleyHolding — tolerant, but only the whole phrase", () => {
  it("matches case / whitespace / trailing-s variants", () => {
    expect(matchesSierraValleyHolding("Sierra Valley Holding")).toBe(true);
    expect(matchesSierraValleyHolding("  sierra   valley   holding ")).toBe(true);
    expect(matchesSierraValleyHolding("SIERRA VALLEY HOLDINGS")).toBe(true);
  });

  it("does not match an unrelated or partial name", () => {
    expect(matchesSierraValleyHolding("Central Cal Hulling")).toBe(false);
    expect(matchesSierraValleyHolding("Sierra Valley")).toBe(false);
  });
});

describe("selectSierraValleyHoller — the one huller yield ingestion reads", () => {
  it("finds SVH among many hullers", () => {
    const sel = selectSierraValleyHoller([OTHER, SVH]);
    expect(sel.ok).toBe(true);
    if (sel.ok) expect(sel.huller.id).toBe(7);
  });

  it("signals source-changed (never falls back to another huller) when SVH is absent", () => {
    const sel = selectSierraValleyHoller([OTHER]);
    expect(sel).toEqual({ ok: false, reason: "sierra_valley_holding_missing" });
  });
});

describe("assertPortalShape — fail closed on a source change, never write partial data", () => {
  it("returns the SVH huller when the account is healthy", () => {
    expect(assertPortalShape([OTHER, SVH], []).id).toBe(7);
  });

  it("throws SourceChangedError(endpoint_error) when a required endpoint errored", () => {
    try {
      assertPortalShape([SVH], ["getHullers.php HTTP 500"]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SourceChangedError);
      expect((err as SourceChangedError).reason).toBe("endpoint_error");
    }
  });

  it("throws SourceChangedError(no_hullers_enumerated) on an empty huller list", () => {
    expect(() => assertPortalShape([], [])).toThrowError(SourceChangedError);
    try {
      assertPortalShape([], []);
    } catch (err) {
      expect((err as SourceChangedError).reason).toBe("no_hullers_enumerated");
    }
  });

  it("throws SourceChangedError(sierra_valley_holding_missing) when SVH is gone", () => {
    try {
      assertPortalShape([OTHER], []);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SourceChangedError).reason).toBe("sierra_valley_holding_missing");
    }
  });
});
