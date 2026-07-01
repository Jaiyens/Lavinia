import { describe, expect, it } from "vitest";
import {
  type ExtractionResult,
  type PoundReader,
  runExtraction,
  shouldEscalate,
} from "./reader";
import type { PoundExtraction } from "./schema";

// These tests prove the central invariant of Track C: NO model number becomes a pound figure on its
// own word. Whatever the reader returns, the verdict (`coverage`) is the deterministic pound-gate's
// output, never the model's. We feed a STUB reader fixed extractions (the committed fixtures'
// content, hand-transcribed to the schema shape) so the suite makes zero external calls and needs no
// key. The page text is passed through but the stub ignores it — what matters is the rows + the
// SEPARATELY-stated control total it returns, which is exactly what a real reader would yield.

/** A reader that returns a fixed extraction regardless of input — the test double for the boundary. */
function fixedReader(extraction: PoundExtraction): PoundReader {
  return { extract: () => Promise.resolve(extraction) };
}

// The clean packer-statement fixture: rows sum to 245,000 and the statement prints 245,000.
const RECONCILING: PoundExtraction = {
  rows: [
    { variety: "Nonpareil", pounds: 120_000 },
    { variety: "Monterey", pounds: 125_000 },
  ],
  controlTotalPounds: 245_000,
  confidence: 0.95,
};

// The corrupted fixture: Monterey mis-read as 124,000 -> rows sum to 244,000, control total 245,000.
const CORRUPTED: PoundExtraction = {
  rows: [
    { variety: "Nonpareil", pounds: 120_000 },
    { variety: "Monterey", pounds: 124_000 },
  ],
  controlTotalPounds: 245_000,
  confidence: 0.95,
};

// The no-control-total fixture (delivery receipt): rows present, but no printed grand total.
const NO_TOTAL: PoundExtraction = {
  rows: [
    { variety: "Nonpareil", pounds: 120_000 },
    { variety: "Monterey", pounds: 125_000 },
  ],
  controlTotalPounds: null,
  confidence: 0.95,
};

const PAGE = "ignored by the stub";

describe("runExtraction routes every document through the pound-gate", () => {
  it("self-consistent rows reconcile against the SEPARATELY-stated control total (real)", async () => {
    const result = await runExtraction(fixedReader(RECONCILING), PAGE);
    expect(result.coverage).toBe("reconciled");
    expect(result.controlTotalPounds).toBe(245_000);
    expect(result.rows).toHaveLength(2);
  });

  it("a corrupted row -> needs_review (the sum no longer matches the printed total)", async () => {
    const result = await runExtraction(fixedReader(CORRUPTED), PAGE);
    expect(result.coverage).toBe("needs_review");
    // The bad figure is still surfaced for a human to fix — it is just never certified as real. The
    // per-row settled price rides along (null when the fixture prints none).
    expect(result.rows).toContainEqual({
      variety: "Monterey",
      pounds: 124_000,
      settledPriceCentsPerPound: null,
    });
  });

  it("no printed control total -> needs_review (the gate never self-checks the rows)", async () => {
    const result = await runExtraction(fixedReader(NO_TOTAL), PAGE);
    expect(result.coverage).toBe("needs_review");
    expect(result.controlTotalPounds).toBeNull();
  });

  it("high confidence never overrides the gate: a non-reconciling extraction is still review", async () => {
    const overconfident: PoundExtraction = { ...CORRUPTED, confidence: 1 };
    const result = await runExtraction(fixedReader(overconfident), PAGE);
    expect(result.coverage).toBe("needs_review");
  });

  it("a reader failure degrades to needs_review, never a thrown error or a fabricated figure", async () => {
    const throwing: PoundReader = { extract: () => Promise.reject(new Error("read failed")) };
    const result: ExtractionResult = await runExtraction(throwing, PAGE);
    expect(result.coverage).toBe("needs_review");
    expect(result.rows).toEqual([]);
    expect(result.controlTotalPounds).toBeNull();
  });
});

describe("shouldEscalate decides Sonnet -> Opus (cost lever, never a gate bypass)", () => {
  it("does not escalate a clean, confident, reconciling extraction", () => {
    expect(shouldEscalate(RECONCILING)).toBe(false);
  });

  it("escalates on low confidence even when the rows reconcile", () => {
    expect(shouldEscalate({ ...RECONCILING, confidence: 0.5 })).toBe(true);
  });

  it("escalates a near-miss (rows within the near-miss window of the total) to try a cleaner read", () => {
    // 244,000 vs 245,000 is a 1,000 lb gap — inside NEAR_MISS_POUNDS — so it is worth a second pass.
    expect(shouldEscalate(CORRUPTED)).toBe(true);
  });

  it("does not escalate a structural miss with no control total to check against", () => {
    // Confident, but null total -> not a near-miss; re-running rarely helps, so no escalation.
    expect(shouldEscalate(NO_TOTAL)).toBe(false);
  });
});
