import { describe, expect, it } from "vitest";
import {
  assertCustomerSourced,
  manualTgmInput,
  tgmInputsFromStatement,
  DEFAULT_GRADE_DEDUCTION_RATE,
} from "./tgm-ingest";
import type { ExtractionResult } from "./extract/reader";

describe("manualTgmInput", () => {
  const base = { cropYear: 2025, blockId: "b1", variety: "np", tgmLbs: 108_652 };

  it("normalizes a valid manual entry into a MANUAL_ENTRY, reconciled input", () => {
    const out = manualTgmInput(base)!;
    expect(out).toMatchObject({
      cropYear: 2025,
      blockId: "b1",
      variety: "NONPAREIL", // normalized from "np"
      tgmLbs: 108_652,
      source: "MANUAL_ENTRY",
      controlTotalPounds: null,
      coverageState: "reconciled",
      gradeDeductionRate: DEFAULT_GRADE_DEDUCTION_RATE,
    });
  });

  it("honors an explicit grade deduction rate", () => {
    expect(manualTgmInput({ ...base, gradeDeductionRate: 0.05 })!.gradeDeductionRate).toBe(0.05);
  });

  it("rejects bad fields rather than writing a malformed row", () => {
    expect(manualTgmInput({ ...base, tgmLbs: 0 })).toBeNull(); // non-positive
    expect(manualTgmInput({ ...base, tgmLbs: 100.5 })).toBeNull(); // not whole
    expect(manualTgmInput({ ...base, cropYear: 1999 })).toBeNull(); // implausible year
    expect(manualTgmInput({ ...base, blockId: "" })).toBeNull(); // no block
    expect(manualTgmInput({ ...base, variety: "   " })).toBeNull(); // -> UNKNOWN
    expect(manualTgmInput({ ...base, gradeDeductionRate: 1 })).toBeNull(); // rate must be < 1
  });
});

describe("tgmInputsFromStatement", () => {
  const result = (
    rows: ExtractionResult["rows"],
    controlTotalPounds: number | null,
    coverage: ExtractionResult["coverage"],
  ): ExtractionResult => ({ rows, controlTotalPounds, coverage });

  it("maps gated variety rows to BLUE_DIAMOND_STATEMENT inputs, carrying the gate verdict + total", () => {
    const out = tgmInputsFromStatement(
      result(
        [
          { variety: "Nonpareil", pounds: 108_652, settledPriceCentsPerPound: 215 },
          { variety: "Monterey", pounds: 70_049, settledPriceCentsPerPound: null },
        ],
        178_701,
        "reconciled",
      ),
      { cropYear: 2025, blockId: "b1" },
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      cropYear: 2025,
      blockId: "b1",
      variety: "NONPAREIL",
      tgmLbs: 108_652,
      source: "BLUE_DIAMOND_STATEMENT",
      controlTotalPounds: 178_701,
      coverageState: "reconciled",
    });
    expect(out[1]!.variety).toBe("MONTEREY");
  });

  it("sums same-variety lines and drops non-positive pounds", () => {
    const out = tgmInputsFromStatement(
      result(
        [
          { variety: "np", pounds: 40_000, settledPriceCentsPerPound: null },
          { variety: "NONPAREIL", pounds: 68_652, settledPriceCentsPerPound: null },
          { variety: "Fritz", pounds: 0, settledPriceCentsPerPound: null }, // dropped
        ],
        108_652,
        "reconciled",
      ),
      { cropYear: 2025, blockId: "b1" },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ variety: "NONPAREIL", tgmLbs: 108_652 });
  });

  it("passes a needs_review verdict straight through (not silently settled)", () => {
    const out = tgmInputsFromStatement(
      result([{ variety: "np", pounds: 100, settledPriceCentsPerPound: null }], 999, "needs_review"),
      { cropYear: 2025, blockId: "b1" },
    );
    expect(out[0]!.coverageState).toBe("needs_review");
  });
});

describe("assertCustomerSourced", () => {
  it("accepts the two customer sources and refuses ALMOND_LOGIC", () => {
    expect(() => assertCustomerSourced("BLUE_DIAMOND_STATEMENT")).not.toThrow();
    expect(() => assertCustomerSourced("MANUAL_ENTRY")).not.toThrow();
    expect(() => assertCustomerSourced("ALMOND_LOGIC")).toThrow(/customer-sourced/);
  });
});
