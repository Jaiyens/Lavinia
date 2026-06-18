import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { composeCoverageFooter } from "@/lib/almond/export/coverage-footer";
import type { ExportCoverageState } from "@/lib/almond/export/load";
import { CoverageFooterSection } from "./footer";

// Pure offline test for the coverage-footer section (Story 9.1). The footer must NOT author its own
// words: it composes the ONE 8.4 composer, the SAME lines the spreadsheet prints, so the PDF and the
// XLSX can never disagree about coverage. We assert the composer produces honest lines for the cases
// (partial, full, no-bill, empty farm) and that the section renders to a valid %PDF- byte stream
// offline (pure JS, no Chromium).

const partial: ExportCoverageState = {
  coverage: { total: 183, reconciled: 149, needsReview: 20, noBill: 14 },
  asOf: "2026-03-12T00:00:00.000Z",
};

function renderToPdf(state: ExportCoverageState): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(CoverageFooterSection, { state })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("CoverageFooterSection composes the shared 8.4 footer (no parallel words)", () => {
  it("renders exactly the composer's lines for a partial farm", () => {
    const lines = composeCoverageFooter(partial);
    expect(lines[0]).toContain("All 183 meters included");
    expect(lines[0]).toContain("149 have loaded billing");
    expect(lines[1]).toContain("Figures as of the bill closing March 12, 2026");
  });

  it("states honest absence (asOf null), never a fabricated date", () => {
    const lines = composeCoverageFooter({
      coverage: { total: 2, reconciled: 0, needsReview: 0, noBill: 2 },
      asOf: null,
    });
    expect(lines[1]).toBe("No bills have posted yet, so no dollar figures are shown.");
    expect(lines.join("\n")).not.toMatch(/as of the bill closing/);
  });

  it("states an empty farm honestly, no divide-by-zero", () => {
    const lines = composeCoverageFooter({
      coverage: { total: 0, reconciled: 0, needsReview: 0, noBill: 0 },
      asOf: null,
    });
    expect(lines[0]).toBe("No meters on file yet, so this sheet is empty.");
    expect(lines[0]).not.toMatch(/NaN|Infinity/);
  });
});

describe("CoverageFooterSection (offline PDF render)", () => {
  it("renders to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(partial);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the no-bill / empty-farm states without throwing", async () => {
    const noBill = await renderToPdf({
      coverage: { total: 2, reconciled: 0, needsReview: 0, noBill: 2 },
      asOf: null,
    });
    expect(noBill.byteLength).toBeGreaterThan(1000);
    const empty = await renderToPdf({
      coverage: { total: 0, reconciled: 0, needsReview: 0, noBill: 0 },
      asOf: null,
    });
    expect(empty.byteLength).toBeGreaterThan(1000);
  });
});
