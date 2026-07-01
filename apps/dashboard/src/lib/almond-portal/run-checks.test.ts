import { describe, expect, it } from "vitest";
import {
  computedTurnoutPct,
  formatTurnoutPct,
  turnoutMismatch,
} from "./run-checks";

describe("formatTurnoutPct", () => {
  it("rounds to one decimal (fixes the raw '8.635159%' render)", () => {
    expect(formatTurnoutPct(8.635159667867)).toBe("8.6%");
    expect(formatTurnoutPct(17.27)).toBe("17.3%");
    expect(formatTurnoutPct(25)).toBe("25.0%");
  });
  it("dashes an absent value", () => {
    expect(formatTurnoutPct(null)).toBe("-");
  });
});

describe("computedTurnoutPct — huller bin / field load", () => {
  it("computes the weight-implied turnout", () => {
    expect(computedTurnoutPct(25_000, 100_000)).toBeCloseTo(25, 5);
  });
  it("returns null when a weight is missing or load is non-positive", () => {
    expect(computedTurnoutPct(null, 100_000)).toBeNull();
    expect(computedTurnoutPct(25_000, null)).toBeNull();
    expect(computedTurnoutPct(25_000, 0)).toBeNull();
  });
});

describe("turnoutMismatch — flag rows whose sources contradict (run-745)", () => {
  it("flags when source turnout disagrees with the weights beyond 1 pt", () => {
    // weights imply 25.0%, source says 18.0% -> contradiction
    expect(turnoutMismatch(25_000, 100_000, 18)).toBe(true);
  });
  it("does not flag when they agree within tolerance", () => {
    expect(turnoutMismatch(25_000, 100_000, 24.6)).toBe(false);
    expect(turnoutMismatch(25_000, 100_000, 25.0)).toBe(false);
  });
  it("never flags a run missing a weight or turnout (nothing to check)", () => {
    expect(turnoutMismatch(null, 100_000, 25)).toBe(false);
    expect(turnoutMismatch(25_000, 100_000, null)).toBe(false);
  });
});
