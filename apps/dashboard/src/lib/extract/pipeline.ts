// The scanned-bill extraction pipeline (FR-2): split -> classify -> extract -> validate.
// It produces in-memory RawPage results; it does NOT persist, normalize, join to
// inventory, or reconcile (Stories 1.6/1.7/1.8). The AI call is the injected PageReader
// boundary, so this runs with zero external calls in dev/CI. A page that fails Zod
// validation (or whose reader throws after its retries) becomes a `needs_review` result -
// never a fabricated number reaching the user (NFR-4 / AC5).

import { type PageType, type RawPage, RawPageSchema } from "./schema";
import type { PageReader } from "./reader";
import { splitPdfPages } from "./split";

/** One page's extraction outcome. A per-SA charge-detail / NEM page carries its SA. */
export type ExtractedPage =
  | { pageIndex: number; pageType: PageType; ok: true; page: RawPage }
  | {
      pageIndex: number;
      pageType: PageType | null;
      saId: string | null;
      ok: false;
      status: "needs_review";
      reason: string;
    };

/** Read an saId off a raw extraction object without trusting its shape. */
function readSaId(raw: unknown): string | null {
  if (raw && typeof raw === "object" && "saId" in raw) {
    const value = raw.saId;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/**
 * Extract one scanned bill PDF into per-page results, fanning a multi-meter account out
 * to one result per Service Agreement (AC4). Classification happens before extraction
 * (AC1); each page is validated against the Story 1.3 page schema (AC2/AC3); a validation
 * failure or a reader error yields `needs_review` (AC5). Bounded-concurrency execution is
 * Story 1.8's concern - this maps pages in order.
 */
export async function extractBill(
  bytes: Uint8Array,
  reader: PageReader,
): Promise<ExtractedPage[]> {
  let pages: Uint8Array[];
  try {
    pages = await splitPdfPages(bytes);
  } catch (err) {
    // A bill pdf-lib cannot parse is surfaced as needs_review, never thrown to the caller
    // as an error or a number (NFR-4 / AC5: OCR/read errors surface as needs review).
    return [
      {
        pageIndex: 0,
        pageType: null,
        saId: null,
        ok: false,
        status: "needs_review",
        reason: `could not read PDF: ${err instanceof Error ? err.message : "parse failed"}`,
      },
    ];
  }
  const results: ExtractedPage[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex]!;
    let pageType: PageType | null = null;
    try {
      pageType = await reader.classify(page, pageIndex); // AC1: classify first
      const raw = await reader.extract(page, pageType);
      const parsed = RawPageSchema.safeParse(raw);
      if (parsed.success && parsed.data.pageType === pageType) {
        results.push({ pageIndex, pageType, ok: true, page: parsed.data });
      } else {
        const reason = parsed.success
          ? `classified ${pageType} but extracted ${parsed.data.pageType}`
          : parsed.error.message;
        results.push({
          pageIndex,
          pageType,
          saId: readSaId(raw),
          ok: false,
          status: "needs_review",
          reason,
        });
      }
    } catch (err) {
      results.push({
        pageIndex,
        pageType,
        saId: null,
        ok: false,
        status: "needs_review",
        reason: err instanceof Error ? err.message : "extraction failed",
      });
    }
  }

  return results;
}
