// The grower SETTLEMENT reader: the AI boundary for packer-statement pounds, injected exactly like
// the bill engine's PageReader so the pipeline runs with ZERO external calls in dev/CI (no key ->
// `stubPoundReader`). The LIVE reader is built ONLY on `createZdrModel` (the direct Anthropic
// zero-data-retention endpoint) — it MUST import from `@/lib/ai/zdr`, and MUST NOT import
// `@/lib/ai/gateway`. The import-guard test enforces that rule 6 can never be broken by a later edit.
//
// The cascade (Crops rule 6 floor) is shared with the commitment reader via `./cascade`: Sonnet 4.6
// first -> escalate to Opus 4.8 when the model's confidence is low OR the rows are a pound-gate
// NEAR-MISS (they nearly reconcile, suggesting one mis-read digit Opus can fix). The bill engine's
// FLOOR is a zero-retention Gemini pass; here there is NO zero-retention non-Anthropic path, so the
// floor is to DEGRADE TO needs_review rather than route grower data through any non-ZDR provider.
// Withholding a figure is always safe; leaking grower data to a retaining provider is not.

import {
  ESCALATE_BELOW_CONFIDENCE,
  NEAR_MISS_POUNDS,
  OPUS_MODEL,
  SONNET_MODEL,
  runCascade,
  shouldEscalate as cascadeShouldEscalate,
  type GateableExtraction,
} from "./cascade";
import { reconcileDocument, type PoundLineItem } from "@/lib/crops/pound-gate";
import type { PoundCoverage } from "@/lib/crops/types";
import { PoundExtraction, PoundExtractionSchema } from "./schema";

// Re-export the cascade tier vocabulary so existing importers of these names keep working.
export { ESCALATE_BELOW_CONFIDENCE, NEAR_MISS_POUNDS, OPUS_MODEL, SONNET_MODEL };

/** A single packet-statement page as raw text/markdown (the OCR/text layer fed to the reader). */
export type RawPage = string;

/** The injected extraction boundary. `extract` returns the raw object; callers validate via Zod. */
export interface PoundReader {
  extract(page: RawPage): Promise<PoundExtraction>;
}

const EXTRACT_PROMPT =
  "You are reading ONE packer settlement statement for an almond grower. Extract three things " +
  "SEPARATELY:\n" +
  "1) `rows`: every printed variety weight line, each as { variety, pounds, settledPriceCentsPerPound } " +
  "where pounds is a WHOLE integer pound figure (e.g. 120,000 lb -> 120000) and " +
  "settledPriceCentsPerPound is the settled price for that line in WHOLE cents per pound " +
  "(e.g. $2.15/lb -> 215) or null if the statement prints no per-line price. Capture the variety " +
  "name exactly as printed.\n" +
  "2) `controlTotalPounds`: the statement's PRINTED grand total in whole pounds. Read this from the " +
  "document's own total line. DO NOT add up the rows yourself — report the printed total verbatim. " +
  "If the page prints no grand total, return null.\n" +
  "Also return `confidence`: your own 0..1 rating of how cleanly the page scanned. " +
  "Never invent a total to make the rows add up.";

/**
 * The un-wired reader: throws if used without injection. Tests inject a fake fed the committed
 * fixture; the live reader is `createZdrPoundReader`. Mirrors the bill engine's `stubPageReader`.
 */
export const stubPoundReader: PoundReader = {
  extract() {
    return Promise.reject(
      new Error("PoundReader not wired: inject a reader (createZdrPoundReader is the live one)"),
    );
  },
};

/**
 * The LIVE reader over the direct Anthropic ZERO-DATA-RETENTION endpoint. Sonnet first; escalate to
 * Opus when confidence is low or the result is a pound-gate near-miss (the shared cascade decides).
 * Only constructed on the server import path where `hasZdrKey()` is true.
 */
export function createZdrPoundReader(): PoundReader {
  return {
    extract(page) {
      return runCascade<PoundExtraction>({
        schema: PoundExtractionSchema,
        schemaName: "PoundExtraction",
        prompt: EXTRACT_PROMPT,
        page,
        gate: toGateable,
      });
    },
  };
}

/** Project a settlement extraction onto the cascade's escalation surface (variety + pounds only). */
function toGateable(extraction: PoundExtraction): GateableExtraction {
  return {
    rows: toLineItems(extraction.rows),
    controlTotalPounds: extraction.controlTotalPounds,
    confidence: extraction.confidence,
  };
}

/** Whether a Sonnet pass warrants the costlier Opus pass. Kept for the existing reader.test.ts. */
export function shouldEscalate(extraction: PoundExtraction): boolean {
  return cascadeShouldEscalate(toGateable(extraction));
}

/** Map the Zod rows to the gate's PoundLineItem shape (the gate owns the pound arithmetic). */
function toLineItems(rows: readonly PoundExtraction["rows"][number][]): PoundLineItem[] {
  return rows.map((r) => ({ variety: r.variety, pounds: r.pounds }));
}

/** One settled price row: the gated pound surface plus the price that rides along (cents/lb, nullable). */
export type SettledPriceRow = PoundLineItem & { settledPriceCentsPerPound: number | null };

/** What one extraction yields: the captured rows (with prices), the SEPARATE total, and the verdict. */
export type ExtractionResult = {
  rows: SettledPriceRow[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
};

/**
 * The pure entry point: run the injected reader over one page, then hand the rows and the
 * independently-stated control total to the pound-gate. `coverage` is the gate's verdict, NOTHING
 * the model said — no model number becomes "real" except through `reconcileDocument`. On any reader
 * failure the document degrades to needs_review (never a thrown error or a fabricated figure), the
 * same fail-safe as the bill pipeline and the ZDR floor. The per-row settled price RIDES ALONG with
 * the gated pounds (the gate certifies pounds only; price is never gated).
 */
export async function runExtraction(
  reader: PoundReader,
  rawPage: RawPage,
): Promise<ExtractionResult> {
  let extraction: PoundExtraction;
  try {
    extraction = await reader.extract(rawPage);
  } catch {
    return { rows: [], controlTotalPounds: null, coverage: "needs_review" };
  }
  const rows: SettledPriceRow[] = extraction.rows.map((r) => ({
    variety: r.variety,
    pounds: r.pounds,
    settledPriceCentsPerPound: r.settledPriceCentsPerPound ?? null,
  }));
  const controlTotalPounds = extraction.controlTotalPounds;
  return {
    rows,
    controlTotalPounds,
    coverage: reconcileDocument(rows, controlTotalPounds),
  };
}
