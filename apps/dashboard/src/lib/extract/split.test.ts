import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { splitPdfPages } from "./split";

/** A synthetic N-page PDF (no real bill needed; the live PDF is Story 1.8). */
async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 200]);
  return doc.save();
}

describe("splitPdfPages", () => {
  it("splits an N-page PDF into N single-page PDFs", async () => {
    const pages = await splitPdfPages(await makePdf(3));
    expect(pages).toHaveLength(3);
    for (const buf of pages) {
      const doc = await PDFDocument.load(buf);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it("handles a single-page PDF", async () => {
    expect(await splitPdfPages(await makePdf(1))).toHaveLength(1);
  });
});
