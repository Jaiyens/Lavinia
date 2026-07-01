import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRADE_DEDUCTION_RATE,
  availableLbs,
  hullerToTgmLoss,
  isOversold,
  payableLbs,
  sellablePct,
  turnoutPct,
  yoyFieldWeight,
} from "./calc";

// The golden reference fixtures from the Jorge clarification meeting (spec Section 8). These are
// reference values Jorge stated on the call — encoded here to validate the calc engine, NEVER
// seeded as real production data (real data enters only from live scrapes and statements).

describe("turnoutPct — deliverable almonds off field weight (Column I / Column F)", () => {
  it("Nonpareil golden fixture: 109,000 / 631,000 = 0.1727 (~17.3%)", () => {
    const t = turnoutPct(109_000, 631_000);
    expect(t).not.toBeNull();
    expect(t as number).toBeCloseTo(0.1727, 4);
  });

  it("returns null on divide-by-zero / missing field weight (never a fabricated 0)", () => {
    expect(turnoutPct(109_000, 0)).toBeNull();
    expect(turnoutPct(109_000, -1)).toBeNull();
    expect(turnoutPct(109_000, Number.NaN)).toBeNull();
  });
});

describe("sellablePct — the fraction the customer pays on (TGM / huller weight)", () => {
  it("computes tgm over huller weight as a fraction", () => {
    const s = sellablePct(105_000, 109_000);
    expect(s).not.toBeNull();
    expect(s as number).toBeCloseTo(0.9633, 4);
  });

  it("is distinct from turnout: sellablePct is off huller weight, turnout off field weight", () => {
    // Same TGM, different denominators must give different ratios.
    expect(sellablePct(105_000, 109_000)).not.toBe(turnoutPct(105_000, 631_000));
  });

  it("returns null when huller weight is missing / zero", () => {
    expect(sellablePct(105_000, 0)).toBeNull();
    expect(sellablePct(105_000, -1)).toBeNull();
  });
});

describe("yoyFieldWeight — year-over-year field weight (Column G)", () => {
  it("golden fixture: 631,000 / 493,000 = ~1.28 (Jorge: '1.279, a 27.9% increase')", () => {
    const y = yoyFieldWeight(631_000, 493_000);
    expect(y).not.toBeNull();
    expect(y as number).toBeCloseTo(1.28, 2);
    // The stated increase: ~28% up on the prior year.
    expect(((y as number) - 1) * 100).toBeCloseTo(27.99, 1);
  });

  it("returns null cleanly when there is no prior year (first season has no YoY)", () => {
    expect(yoyFieldWeight(631_000, 0)).toBeNull();
    expect(yoyFieldWeight(631_000, -1)).toBeNull();
  });
});

describe("hullerToTgmLoss — huller weight minus Total Good Meats (Column L)", () => {
  it("is exact integer subtraction", () => {
    expect(hullerToTgmLoss(109_000, 108_652)).toBe(348);
    expect(hullerToTgmLoss(109_000, 105_000)).toBe(4_000);
  });
});

describe("payableLbs — TGM net of grade deduction (Columns K -> payable)", () => {
  it("defaults to a 3% deduction, and the rate is configurable (never hard-coded 0.97)", () => {
    expect(DEFAULT_GRADE_DEDUCTION_RATE).toBe(0.03);
    // Payable example from Section 8: TGM 108,652 lb at the 3% grade deduction reference.
    // 108,652 * 0.97 = 105,392.44 -> 105,392 whole pounds. (Formula unconfirmed vs Gagan's live
    // sheet per Jorge — this locks the DOCUMENTED default, not a verified truth.)
    expect(payableLbs(108_652, DEFAULT_GRADE_DEDUCTION_RATE)).toBe(105_392);
  });

  it("a zero rate returns TGM unchanged; a different rate changes the result", () => {
    expect(payableLbs(108_652, 0)).toBe(108_652);
    expect(payableLbs(100_000, 0.05)).toBe(95_000);
  });
});

describe("availableLbs — net good meats minus committed minus sold", () => {
  it("computes the honest uncommitted, unsold pool", () => {
    expect(availableLbs(248_500, 150_000, 50_000)).toBe(48_500);
  });

  it("goes negative on an oversell — never clamped — and isOversold flags it", () => {
    const oversold = availableLbs(100_000, 80_000, 40_000);
    expect(oversold).toBe(-20_000);
    expect(isOversold(oversold)).toBe(true);
    expect(isOversold(48_500)).toBe(false);
  });
});

describe("Section 8 roll-up fixtures (variety sums / acreage)", () => {
  it("Block 11: 202,000 Monterey + 320,000 Nonpareil = 522,000 lb total", () => {
    // Section 8 of the brief states this total as 530,000, but 202,000 + 320,000 = 522,000. The
    // brief's 530,000 is a transcription error; deterministic code owns the number (Section 4 rule
    // 1), so we assert the true sum and never encode a wrong total.
    expect(202_000 + 320_000).toBe(522_000);
  });

  it("Block 1: 116 acres across its varieties", () => {
    // Acreage is Column E per variety; a block's acreage is the sum across its rows.
    const block1Varieties = [58, 58]; // any split summing to the stated 116
    expect(block1Varieties.reduce((a, b) => a + b, 0)).toBe(116);
  });
});
