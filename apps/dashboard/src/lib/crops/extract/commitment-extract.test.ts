import { describe, expect, it } from "vitest";
import {
  type CommitmentReader,
  runCommitmentExtraction,
  shouldEscalate,
} from "./commitment-reader";
import type { CommitmentExtraction } from "./commitment-schema";

// The commitment reader's central invariant (same as the settlement reader's): NO model number
// becomes a pound figure on its own word. The verdict (coverage) is the deterministic pound-gate's
// output over committed pounds vs the SEPARATELY-stated control total, never the model's. A STUB
// reader is fed fixed extractions (synthetic, NOT a real grower's data) so the suite makes zero
// external calls. The per-row price RIDES ALONG; the gate certifies pounds only.

function fixedReader(extraction: CommitmentExtraction): CommitmentReader {
  return { extract: () => Promise.resolve(extraction) };
}

// Reconciling: committed pounds (100k + 50k) sum to the printed control total 150k.
const RECONCILING: CommitmentExtraction = {
  rows: [
    { handler: "Holland Nut", variety: "Nonpareil", committedPounds: 100_000, priceCentsPerPound: 215 },
    { handler: "Holland Nut", variety: "Monterey", committedPounds: 50_000, priceCentsPerPound: null },
  ],
  controlTotalPounds: 150_000,
  confidence: 0.95,
};

// Corrupted: Monterey mis-read as 49,000 -> rows sum to 149,000, control total 150,000.
const CORRUPTED: CommitmentExtraction = {
  rows: [
    { handler: "Holland Nut", variety: "Nonpareil", committedPounds: 100_000, priceCentsPerPound: 215 },
    { handler: "Holland Nut", variety: "Monterey", committedPounds: 49_000, priceCentsPerPound: null },
  ],
  controlTotalPounds: 150_000,
  confidence: 0.95,
};

const NO_TOTAL: CommitmentExtraction = {
  rows: [{ handler: "Holland Nut", variety: "Nonpareil", committedPounds: 100_000, priceCentsPerPound: null }],
  controlTotalPounds: null,
  confidence: 0.95,
};

const PAGE = "ignored by the stub";

describe("runCommitmentExtraction routes every document through the pound-gate", () => {
  it("rows that sum to the SEPARATELY-stated control total reconcile (real)", async () => {
    const result = await runCommitmentExtraction(fixedReader(RECONCILING), PAGE);
    expect(result.coverage).toBe("reconciled");
    expect(result.controlTotalPounds).toBe(150_000);
    expect(result.rows).toHaveLength(2);
    // Price rides along, in cents/lb (null preserved).
    expect(result.rows[0]).toEqual({
      handler: "Holland Nut",
      variety: "Nonpareil",
      committedPounds: 100_000,
      priceCentsPerPound: 215,
    });
    expect(result.rows[1]!.priceCentsPerPound).toBeNull();
  });

  it("a corrupted row -> needs_review (the sum no longer matches the printed total)", async () => {
    const result = await runCommitmentExtraction(fixedReader(CORRUPTED), PAGE);
    expect(result.coverage).toBe("needs_review");
  });

  it("no printed control total -> needs_review (the gate never self-checks the rows)", async () => {
    const result = await runCommitmentExtraction(fixedReader(NO_TOTAL), PAGE);
    expect(result.coverage).toBe("needs_review");
  });

  it("high confidence never overrides the gate", async () => {
    const result = await runCommitmentExtraction(fixedReader({ ...CORRUPTED, confidence: 1 }), PAGE);
    expect(result.coverage).toBe("needs_review");
  });

  it("a reader failure degrades to needs_review, never a throw or a fabricated figure", async () => {
    const throwing: CommitmentReader = { extract: () => Promise.reject(new Error("boom")) };
    const result = await runCommitmentExtraction(throwing, PAGE);
    expect(result.coverage).toBe("needs_review");
    expect(result.rows).toEqual([]);
    expect(result.controlTotalPounds).toBeNull();
  });
});

describe("shouldEscalate (commitment) decides Sonnet -> Opus, never a gate bypass", () => {
  it("does not escalate a clean, confident, reconciling extraction", () => {
    expect(shouldEscalate(RECONCILING)).toBe(false);
  });
  it("escalates on low confidence even when the rows reconcile", () => {
    expect(shouldEscalate({ ...RECONCILING, confidence: 0.5 })).toBe(true);
  });
  it("escalates a near-miss (within the near-miss window) to try a cleaner read", () => {
    expect(shouldEscalate(CORRUPTED)).toBe(true); // 1,000 lb gap is inside NEAR_MISS_POUNDS
  });
});
