import { describe, expect, it } from "vitest";
import { classifyDoc } from "./doc-class";

// Synthetic report text (NOT a real grower's data) exercising the deterministic doc-class heuristic.

const SETTLEMENT_TEXT = `Packer Settlement Statement
Crop Year 2024 — Settled meat pounds
Variety        Net Pounds
Nonpareil      120,000
Monterey        80,000
Grand Total    200,000`;

const COMMITMENT_TEXT = `Handler Assignment / Commitment Report
Committed pounds by handler and variety
Handler      Variety     Committed   Contract Price
Holland Nut  Nonpareil   100,000     $2.15/lb
Holland Nut  Monterey     50,000     buyer TBD
Total Committed 150,000`;

describe("classifyDoc", () => {
  it("classifies a packer settlement statement as settlement", () => {
    expect(classifyDoc(SETTLEMENT_TEXT)).toBe("settlement");
  });

  it("classifies a handler commitment report as commitment", () => {
    expect(classifyDoc(COMMITMENT_TEXT)).toBe("commitment");
  });

  it("defaults to settlement on no signal (the conservative class)", () => {
    expect(classifyDoc("a page with no recognizable terms at all")).toBe("settlement");
  });
});
