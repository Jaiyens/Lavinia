import { describe, expect, it } from "vitest";
import {
  POUND_TOLERANCE,
  reconcileDocument,
  reconcilesToPounds,
  sumLineItemPounds,
  type PoundLineItem,
} from "./pound-gate";

// A two-variety packer statement whose printed grand total is 245,000 lb.
const ROWS: PoundLineItem[] = [
  { variety: "Nonpareil", pounds: 120_000 },
  { variety: "Monterey", pounds: 125_000 },
];
const CONTROL_TOTAL = 245_000;

describe("reconcilesToPounds, the integer-pound gate", () => {
  it("is exact: tolerance is 0, not the cent-gate's +/-1", () => {
    expect(POUND_TOLERANCE).toBe(0);
    expect(reconcilesToPounds(245_000, 245_000)).toBe(true);
  });

  it("rejects an off-by-one (any whole-pound drift is a real discrepancy)", () => {
    expect(reconcilesToPounds(244_999, 245_000)).toBe(false);
    expect(reconcilesToPounds(245_001, 245_000)).toBe(false);
  });

  it("handles negatives symmetrically (a clawback / credit)", () => {
    expect(reconcilesToPounds(-5_000, -5_000)).toBe(true);
    expect(reconcilesToPounds(-5_000, -4_999)).toBe(false);
  });
});

describe("sumLineItemPounds", () => {
  it("sums whole pounds across the lines", () => {
    expect(sumLineItemPounds(ROWS)).toBe(245_000);
    expect(sumLineItemPounds([])).toBe(0);
  });
});

describe("reconcileDocument, the honest coverage verdict", () => {
  it("marks self-consistent rows reconciled against the stated total", () => {
    expect(reconcileDocument(ROWS, CONTROL_TOTAL)).toBe("reconciled");
  });

  it("flags a corrupted/dropped row for review (sum no longer matches the total)", () => {
    const corrupted: PoundLineItem[] = [
      { variety: "Nonpareil", pounds: 120_000 },
      { variety: "Monterey", pounds: 124_000 }, // 1,000 lb short
    ];
    expect(reconcileDocument(corrupted, CONTROL_TOTAL)).toBe("needs_review");
    // A dropped line entirely (only Nonpareil survives):
    expect(reconcileDocument([{ variety: "Nonpareil", pounds: 120_000 }], CONTROL_TOTAL)).toBe(
      "needs_review",
    );
  });

  it("leaves rows in review when the document states no control total (never self-checks)", () => {
    expect(reconcileDocument(ROWS, null)).toBe("needs_review");
  });

  it("never vacuously reconciles: zero captured rows is review even against a 0 total", () => {
    expect(reconcileDocument([], 245_000)).toBe("needs_review");
    expect(reconcileDocument([], 0)).toBe("needs_review");
  });
});
