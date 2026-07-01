import { describe, expect, it } from "vitest";
import { extractReportDocument } from "./extract";
import type { RawPage } from "@/lib/crops/scrape/types";
import type { PoundReader } from "@/lib/crops/extract/reader";
import type { CommitmentReader } from "@/lib/crops/extract/commitment-reader";
import type { PoundExtraction } from "@/lib/crops/extract/schema";
import type { CommitmentExtraction } from "@/lib/crops/extract/commitment-schema";

// extractReportDocument: PDF bytes -> text (injected) -> classify -> matching ZDR reader (injected
// fake) -> the pound-gate. Zero external calls. Synthetic text fixtures (NOT real grower data).

function pdfPage(url: string, bytes = new Uint8Array([1, 2, 3])): RawPage {
  return { url, sha: "sha_" + url, contentType: "application/pdf", bytes };
}

const SETTLEMENT_TEXT = "Packer Settlement Statement — net pounds — grand total 245,000";
const COMMITMENT_TEXT = "Handler commitment report — committed pounds to buyer — total committed 150,000";

const settlementReconciling: PoundExtraction = {
  rows: [
    { variety: "Nonpareil", pounds: 120_000, settledPriceCentsPerPound: 215 },
    { variety: "Monterey", pounds: 125_000 },
  ],
  controlTotalPounds: 245_000,
  confidence: 0.95,
};

// Corrupted settlement: rows sum to 244,000 vs printed 245,000.
const settlementCorrupted: PoundExtraction = {
  rows: [
    { variety: "Nonpareil", pounds: 120_000 },
    { variety: "Monterey", pounds: 124_000 },
  ],
  controlTotalPounds: 245_000,
  confidence: 0.95,
};

const commitmentReconciling: CommitmentExtraction = {
  rows: [
    { handler: "Holland Nut", variety: "Nonpareil", committedPounds: 100_000, priceCentsPerPound: 215 },
    { handler: "Holland Nut", variety: "Monterey", committedPounds: 50_000 },
  ],
  controlTotalPounds: 150_000,
  confidence: 0.95,
};

function fakeSettlement(ex: PoundExtraction): PoundReader {
  return { extract: () => Promise.resolve(ex) };
}
function fakeCommitment(ex: CommitmentExtraction): CommitmentReader {
  return { extract: () => Promise.resolve(ex) };
}

describe("extractReportDocument", () => {
  it("classifies + extracts a settlement; reconciling rows -> reconciled", async () => {
    const out = await extractReportDocument(pdfPage("s1"), {
      settlementReader: fakeSettlement(settlementReconciling),
      pdfToText: () => Promise.resolve(SETTLEMENT_TEXT),
    });
    expect(out.docClass).toBe("settlement");
    expect(out.coverage).toBe("reconciled");
    expect(out.controlTotalPounds).toBe(245_000);
  });

  it("a corrupted settlement -> needs_review (the gate, not the model, decides)", async () => {
    const out = await extractReportDocument(pdfPage("s2"), {
      settlementReader: fakeSettlement(settlementCorrupted),
      pdfToText: () => Promise.resolve(SETTLEMENT_TEXT),
    });
    expect(out.docClass).toBe("settlement");
    expect(out.coverage).toBe("needs_review");
  });

  it("classifies + extracts a commitment doc through its reader", async () => {
    const out = await extractReportDocument(pdfPage("c1"), {
      commitmentReader: fakeCommitment(commitmentReconciling),
      pdfToText: () => Promise.resolve(COMMITMENT_TEXT),
    });
    expect(out.docClass).toBe("commitment");
    expect(out.coverage).toBe("reconciled");
  });

  it("with no reader injected, a document degrades to needs_review (zero-call, nothing leaks)", async () => {
    const out = await extractReportDocument(pdfPage("s3"), {
      pdfToText: () => Promise.resolve(SETTLEMENT_TEXT),
    });
    expect(out.coverage).toBe("needs_review");
    expect(out.rows).toEqual([]);
  });
});
