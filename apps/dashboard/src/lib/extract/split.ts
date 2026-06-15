// Split a scanned PG&E bill PDF into per-page single-page PDFs, so each page can be
// classified and extracted independently (FR-2 / AR-3). Pure pdf-lib (no rasterization,
// no native binaries, no network) - the per-page buffers are handed to the AI boundary.

import { PDFDocument } from "pdf-lib";

/** Split a PDF into one single-page PDF buffer per page, in page order. */
export async function splitPdfPages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();
  const out: Uint8Array[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    // copyPages always returns one page per requested index; throw rather than silently
    // emit a 0-page PDF (the extractBill pipeline catches this and marks needs_review).
    if (!page) throw new Error(`pdf-lib returned no page for index ${i}`);
    doc.addPage(page);
    out.push(await doc.save());
  }
  return out;
}
