import { describe, expect, it } from "vitest";
import { availableToSell, oversoldBy, saleInput, salePositions, type SaleRaw } from "./sale";

describe("salePositions", () => {
  it("rolls TGM + commitments to available per (cropYear, variety), available signed", () => {
    const rows = salePositions(
      [
        { cropYear: 2025, variety: "np", tgmLbs: 108_652 },
        { cropYear: 2025, variety: "NONPAREIL", tgmLbs: 38_399 }, // same normalized variety -> summed
        { cropYear: 2025, variety: "m", tgmLbs: 70_049 },
      ],
      [{ cropYear: 2025, variety: "Nonpareil", pounds: 100_000 }],
    );
    const np = rows.find((r) => r.variety === "NONPAREIL")!;
    expect(np.ngmLbs).toBe(147_051); // 108,652 + 38,399
    expect(np.committedLbs).toBe(100_000);
    expect(np.availableLbs).toBe(47_051);
    const m = rows.find((r) => r.variety === "MONTEREY")!;
    expect(m.committedLbs).toBe(0);
    expect(m.availableLbs).toBe(70_049);
  });

  it("leaves an oversold cell negative (never clamped)", () => {
    const rows = salePositions(
      [{ cropYear: 2025, variety: "np", tgmLbs: 50_000 }],
      [{ cropYear: 2025, variety: "np", pounds: 90_000 }],
    );
    expect(rows[0]!.availableLbs).toBe(-40_000);
  });

  it("sorts cropYear desc then variety", () => {
    const rows = salePositions(
      [
        { cropYear: 2024, variety: "np", tgmLbs: 1 },
        { cropYear: 2025, variety: "m", tgmLbs: 1 },
        { cropYear: 2025, variety: "np", tgmLbs: 1 },
      ],
      [],
    );
    expect(rows.map((r) => `${r.cropYear}:${r.variety}`)).toEqual(["2025:MONTEREY", "2025:NONPAREIL", "2024:NONPAREIL"]);
  });
});

describe("availableToSell + oversoldBy", () => {
  it("available = ngm - committed (signed)", () => {
    expect(availableToSell(100_000, 30_000)).toBe(70_000);
    expect(availableToSell(30_000, 100_000)).toBe(-70_000);
  });
  it("oversoldBy is the overshoot beyond available, never negative", () => {
    expect(oversoldBy(50_000, 70_000)).toBe(0); // fits
    expect(oversoldBy(90_000, 70_000)).toBe(20_000); // oversells by 20k
    expect(oversoldBy(50_000, -10_000)).toBe(60_000); // already oversold -> all of it oversells
  });
});

describe("saleInput", () => {
  const base: SaleRaw = { cropYear: 2025, variety: "np", buyer: "Blue Diamond", pounds: 100_000, priceCentsPerPound: 215 };

  it("normalizes a valid sale", () => {
    expect(saleInput(base)).toMatchObject({
      cropYear: 2025,
      variety: "NONPAREIL",
      buyer: "Blue Diamond",
      pounds: 100_000,
      priceCentsPerPound: 215,
      blockId: null,
    });
  });

  it("allows a pounds-only sale (null price)", () => {
    expect(saleInput({ ...base, priceCentsPerPound: null })!.priceCentsPerPound).toBeNull();
    expect(saleInput({ cropYear: 2025, variety: "np", buyer: "X", pounds: 1 })!.priceCentsPerPound).toBeNull();
  });

  it("rejects bad fields", () => {
    expect(saleInput({ ...base, pounds: 0 })).toBeNull();
    expect(saleInput({ ...base, pounds: 10.5 })).toBeNull();
    expect(saleInput({ ...base, buyer: "  " })).toBeNull();
    expect(saleInput({ ...base, variety: "  " })).toBeNull();
    expect(saleInput({ ...base, priceCentsPerPound: -5 })).toBeNull();
    expect(saleInput({ ...base, cropYear: 1999 })).toBeNull();
  });
});
