"use step";

// Workflow STEP: extract. On deploy the WDK build adapter makes this a durable step; locally it is a
// plain async function.
//
// This is a STUB extractor: it does NOT call a model. It deterministically reads the line-item
// pounds and the STATED control total out of the scraped fixture pages' data attributes
// (data-pounds / data-control-total), exactly as a real reader would surface them — line items and
// the document's own printed grand total, extracted INDEPENDENTLY. It never re-sums the rows to
// invent a control total (that would defeat the pound-gate). A page with no stated total yields a
// null controlTotalPounds, which the gate treats as needs_review.

import type { PoundLineItem } from "@/lib/crops/pound-gate";
import type { RawPage } from "@/lib/crops/scrape/types";

export type ExtractStepInput = {
  pages: readonly RawPage[];
};

export type ExtractStepOutput = {
  rows: PoundLineItem[];
  /** The document's OWN stated grand total, or null if none was printed. Never a re-sum of rows. */
  controlTotalPounds: number | null;
};

const VARIETY_ROW = /<td>([^<]+)<\/td>\s*<td[^>]*data-pounds="(\d+)"/g;
const CONTROL_TOTAL = /data-control-total="(\d+)"/;

/** Decode a page's bytes to a string for the deterministic regex extraction. */
function pageText(page: RawPage): string {
  return new TextDecoder().decode(page.bytes);
}

/**
 * Extract line items + the stated control total from the scraped pages. Pure given the pages. Reads
 * the printed total from `data-control-total` (the document's own figure); returns null when no page
 * prints one, so the gate withholds rather than certifying against a re-sum.
 */
export function extractStep(input: ExtractStepInput): Promise<ExtractStepOutput> {
  const rows: PoundLineItem[] = [];
  let controlTotalPounds: number | null = null;

  for (const page of input.pages) {
    const text = pageText(page);
    for (const match of text.matchAll(VARIETY_ROW)) {
      const variety = match[1]?.trim();
      const poundsRaw = match[2];
      if (variety === undefined || poundsRaw === undefined) continue;
      rows.push({ variety, pounds: Number.parseInt(poundsRaw, 10) });
    }
    const totalMatch = CONTROL_TOTAL.exec(text);
    if (totalMatch?.[1] !== undefined) {
      controlTotalPounds = Number.parseInt(totalMatch[1], 10);
    }
  }

  return Promise.resolve({ rows, controlTotalPounds });
}
