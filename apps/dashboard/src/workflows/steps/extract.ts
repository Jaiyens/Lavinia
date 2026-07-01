"use step";

// Workflow STEP: extract. On deploy the WDK build adapter makes this a durable step; locally it is a
// plain async function.
//
// This step turns scraped raw pages into line-item pounds + the document's OWN stated control total,
// each extracted INDEPENDENTLY (never a re-sum of the rows — that would defeat the pound-gate). It has
// TWO paths, selected by what is injected so dev/CI stay ZERO-call:
//
//   1. STUB (default, no readers injected): the deterministic regex extractor over the committed HTML
//      fixture pages (data-pounds / data-control-total). No model, no PDF parse. This is what the
//      existing ingest-crop-year workflow + tests use, unchanged.
//
//   2. LIVE (settlement/commitment readers + pdfToText injected): for each PDF page, get its text
//      layer (pdfToText), CLASSIFY it (settlement vs commitment), and run the matching ZDR reader
//      through the shared Sonnet->Opus cascade. Grower data never transits the gateway (the readers
//      import only the ZDR boundary). Returns a class-tagged extraction the report workflow routes to
//      the settlement or commitment write step.
//
// Either way the figures the model/regex surface are NOT yet real: the pound-gate (the next step)
// certifies them. This step never decides a pound is true.

import type { PoundLineItem } from "@/lib/crops/pound-gate";
import type { RawPage } from "@/lib/crops/scrape/types";
import { classifyDoc, type DocClass } from "@/lib/crops/extract/doc-class";
import { pdfToText } from "@/lib/crops/extract/pdf-text";
import {
  runExtraction,
  type PoundReader,
  type SettledPriceRow,
} from "@/lib/crops/extract/reader";
import {
  runCommitmentExtraction,
  type CommitmentReader,
  type CommitmentResultRow,
} from "@/lib/crops/extract/commitment-reader";
import type { PoundCoverage } from "@/lib/crops/types";

/** The legacy stub step input: just the scraped pages (the regex extractor uses nothing else). */
export type ExtractStepInput = {
  pages: readonly RawPage[];
};

/**
 * The injected boundaries the LIVE per-document extraction needs. Omit the readers and the document
 * degrades to a needs_review extraction of its detected class (zero-call, nothing fabricated). The
 * pdfToText boundary lets tests pass committed text fixtures with zero PDF bytes.
 */
export type ReportExtractDeps = {
  /** Live settlement reader. Omit -> settlement docs degrade to needs_review. */
  settlementReader?: PoundReader;
  /** Live commitment reader. Omit -> commitment docs degrade to needs_review. */
  commitmentReader?: CommitmentReader;
  /** PDF -> text. Injectable so tests pass committed text fixtures; defaults to the pdf-parse reader. */
  pdfToText?: (bytes: Uint8Array) => Promise<string>;
};

/** The legacy stub output: rows + the document's own stated control total. Never a re-sum of rows. */
export type ExtractStepOutput = {
  rows: PoundLineItem[];
  /** The document's OWN stated grand total, or null if none was printed. Never a re-sum of rows. */
  controlTotalPounds: number | null;
};

/** A class-tagged live extraction: a settlement (with the gate verdict) of one document. */
export type SettlementExtraction = {
  docClass: "settlement";
  rows: SettledPriceRow[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
};

/** A class-tagged live extraction: a commitment (with the gate verdict) of one document. */
export type CommitmentExtraction = {
  docClass: "commitment";
  rows: CommitmentResultRow[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
};

/** One live, class-tagged, already-gated extraction of a single report document. */
export type ReportExtraction = SettlementExtraction | CommitmentExtraction;

const VARIETY_ROW = /<td>([^<]+)<\/td>\s*<td[^>]*data-pounds="(\d+)"/g;
const CONTROL_TOTAL = /data-control-total="(\d+)"/;

/** Decode a page's bytes to a string for the deterministic regex extraction. */
function pageText(page: RawPage): string {
  return new TextDecoder().decode(page.bytes);
}

/**
 * Extract line items + the stated control total from the scraped pages via the deterministic regex
 * stub (the committed HTML fixtures). Pure given the pages. Reads the printed total from
 * `data-control-total` (the document's own figure); returns null when no page prints one, so the gate
 * withholds rather than certifying against a re-sum. This is the legacy path the crop-YEAR workflow
 * uses; it makes ZERO calls and needs no key.
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

/** Whether a captured page is a PDF (the live report path); else it is an HTML fixture (the stub). */
export function isPdf(page: RawPage): boolean {
  return page.contentType.includes("pdf");
}

/**
 * Live extraction of ONE report PDF: get its text, classify it, and run the matching ZDR reader
 * through the shared cascade + the pound-gate. The verdict on the returned extraction is the gate's,
 * never the model's. If a reader for the detected class was not injected, the document degrades to a
 * needs_review extraction of that class (nothing is fabricated, nothing leaks).
 */
export async function extractReportDocument(
  page: RawPage,
  deps: ReportExtractDeps,
): Promise<ReportExtraction> {
  const toText = deps.pdfToText ?? ((bytes: Uint8Array) => pdfToText(bytes));
  const text = await toText(page.bytes);
  const docClass: DocClass = classifyDoc(text);

  if (docClass === "commitment") {
    if (!deps.commitmentReader) {
      return { docClass, rows: [], controlTotalPounds: null, coverage: "needs_review" };
    }
    const result = await runCommitmentExtraction(deps.commitmentReader, text);
    return { docClass, ...result };
  }

  if (!deps.settlementReader) {
    return { docClass: "settlement", rows: [], controlTotalPounds: null, coverage: "needs_review" };
  }
  const result = await runExtraction(deps.settlementReader, text);
  return { docClass: "settlement", ...result };
}
