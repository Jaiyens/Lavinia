import { describe, expect, it } from "vitest";
import {
  colorForRate,
  isLegacyRate,
  PIN_MAX_PX,
  PIN_MIN_PX,
  rateFamily,
  RATE_FAMILY_COLOR,
  sizeForSpend,
} from "./map-style";

describe("isLegacyRate", () => {
  it("flags AG-4 and AG-5 variants (with and without the dash/space)", () => {
    for (const r of ["AG-4", "AG-5", "AG-4B", "AG5A", "ag-5", "AG 5"]) {
      expect(isLegacyRate(r)).toBe(true);
    }
  });
  it("does not flag current ag rates or null", () => {
    for (const r of ["AG-A", "AG-B", "AG-C", "AGC", "B-1", null]) {
      expect(isLegacyRate(r)).toBe(false);
    }
  });
});

describe("rateFamily", () => {
  it("buckets each schedule into its display family; legacy wins", () => {
    expect(rateFamily("AG-A1")).toBe("ag_a");
    expect(rateFamily("AG-B")).toBe("ag_b");
    expect(rateFamily("AGC")).toBe("ag_c");
    expect(rateFamily("AG-VS")).toBe("ag_other");
    expect(rateFamily("AG-5")).toBe("legacy");
    expect(rateFamily("B-1")).toBe("commercial");
    expect(rateFamily(null)).toBe("unknown");
    expect(rateFamily("")).toBe("unknown");
  });
  it("colorForRate maps through the palette", () => {
    expect(colorForRate("AG-5")).toBe(RATE_FAMILY_COLOR.legacy);
    expect(colorForRate("AG-A2")).toBe(RATE_FAMILY_COLOR.ag_a);
    expect(colorForRate(null)).toBe(RATE_FAMILY_COLOR.unknown);
  });
});

describe("sizeForSpend", () => {
  it("returns MIN for null/zero spend or no priced fleet", () => {
    expect(sizeForSpend(null, 100_000)).toBe(PIN_MIN_PX);
    expect(sizeForSpend(0, 100_000)).toBe(PIN_MIN_PX);
    expect(sizeForSpend(50_000, 0)).toBe(PIN_MIN_PX);
  });
  it("returns MAX at the fleet max and scales between", () => {
    expect(sizeForSpend(100_000, 100_000)).toBe(PIN_MAX_PX);
    const mid = sizeForSpend(25_000, 100_000); // sqrt(0.25) = 0.5
    expect(mid).toBe(Math.round(PIN_MIN_PX + (PIN_MAX_PX - PIN_MIN_PX) * 0.5));
    expect(mid).toBeGreaterThan(PIN_MIN_PX);
    expect(mid).toBeLessThan(PIN_MAX_PX);
  });
  it("clamps spends above the max to MAX", () => {
    expect(sizeForSpend(500_000, 100_000)).toBe(PIN_MAX_PX);
  });
});
