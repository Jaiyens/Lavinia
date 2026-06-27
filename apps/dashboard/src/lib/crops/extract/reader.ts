// The grower-extraction reader: the AI boundary for packer-statement pounds, injected exactly like
// the bill engine's PageReader so the pipeline runs with ZERO external calls in dev/CI (no key ->
// `stubPoundReader`). The LIVE reader is built ONLY on `createZdrModel` (the direct Anthropic
// zero-data-retention endpoint) — it MUST import from `@/lib/ai/zdr`, and MUST NOT import
// `@/lib/ai/gateway`. The import-guard test enforces that rule 6 can never be broken by a later edit.
//
// The cascade (Crops rule 6 floor): Sonnet 4.6 first -> escalate to Opus 4.8 when the model's
// confidence is low OR the rows are a pound-gate NEAR-MISS (they nearly reconcile, suggesting one
// mis-read digit Opus can fix). The bill engine's FLOOR is a zero-retention Gemini pass; here there
// is NO zero-retention non-Anthropic path, so the floor is to DEGRADE TO needs_review rather than
// route grower data through any non-ZDR provider. Withholding a figure is always safe; leaking
// grower data to a retaining provider is not.

import { generateObject } from "ai";
import { createZdrModel } from "@/lib/ai/zdr";
import { reconcileDocument, type PoundLineItem } from "@/lib/crops/pound-gate";
import type { PoundCoverage } from "@/lib/crops/types";
import { PoundExtraction, PoundExtractionSchema } from "./schema";

/** A single packet-statement page as raw text/markdown (the OCR/text layer fed to the reader). */
export type RawPage = string;

/** The injected extraction boundary. `extract` returns the raw object; callers validate via Zod. */
export interface PoundReader {
  extract(page: RawPage): Promise<PoundExtraction>;
}

/** The reader's tier vocabulary. Sonnet first, Opus on escalation — both over the ZDR endpoint. */
export const SONNET_MODEL = "claude-sonnet-4-6";
export const OPUS_MODEL = "claude-opus-4-8";

/**
 * Below this self-rated confidence we escalate Sonnet -> Opus. Advisory only: confidence never
 * certifies a figure (the pound-gate does), it only decides whether a second, stronger pass is worth
 * the cost.
 */
export const ESCALATE_BELOW_CONFIDENCE = 0.85;

/**
 * A "near-miss" is a non-reconciling extraction whose row sum lands within this many pounds of the
 * stated control total — the signature of a single mis-read digit Opus may correct. A wider gap is a
 * structural miss (a dropped row); re-running rarely helps, so we do not escalate on it. The gate
 * tolerance itself stays 0 (see pound-gate.ts) — this window only gates ESCALATION, never certifies.
 */
export const NEAR_MISS_POUNDS = 2_000;

const EXTRACT_PROMPT =
  "You are reading ONE packer settlement statement for an almond grower. Extract two things " +
  "SEPARATELY:\n" +
  "1) `rows`: every printed variety weight line, each as { variety, pounds } where pounds is a " +
  "WHOLE integer pound figure (e.g. 120,000 lb -> 120000). Capture the variety name exactly as " +
  "printed.\n" +
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

/** One generateObject pass over a ZDR-backed model. Centralizes the prompt + schema for both tiers. */
async function extractWith(modelId: string, page: RawPage): Promise<PoundExtraction> {
  const { object } = await generateObject({
    model: createZdrModel(modelId),
    schema: PoundExtractionSchema,
    schemaName: "PoundExtraction",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACT_PROMPT },
          { type: "text", text: page },
        ],
      },
    ],
  });
  return object;
}

/**
 * The LIVE reader over the direct Anthropic ZERO-DATA-RETENTION endpoint. Sonnet first; escalate to
 * Opus when confidence is low or the result is a pound-gate near-miss. Only constructed on the
 * server import path where `hasZdrKey()` is true. This is the ONLY place the two ZDR tiers are wired.
 */
export function createZdrPoundReader(): PoundReader {
  return {
    async extract(page) {
      const first = await extractWith(SONNET_MODEL, page);
      if (!shouldEscalate(first)) return first;
      // Stronger second pass. Opus output still faces the same gate downstream — escalation buys a
      // better extraction, never a bypass of reconciliation.
      return extractWith(OPUS_MODEL, page);
    },
  };
}

/** Whether a Sonnet pass warrants the costlier Opus pass: low confidence OR a gate near-miss. */
export function shouldEscalate(extraction: PoundExtraction): boolean {
  if (extraction.confidence < ESCALATE_BELOW_CONFIDENCE) return true;
  return isNearMiss(extraction);
}

/** A near-miss: rows do not reconcile, but their sum is within NEAR_MISS_POUNDS of the stated total. */
function isNearMiss(extraction: PoundExtraction): boolean {
  const { controlTotalPounds } = extraction;
  if (controlTotalPounds === null) return false;
  const rows = toLineItems(extraction.rows);
  if (reconcileDocument(rows, controlTotalPounds) === "reconciled") return false;
  const sum = rows.reduce((acc, r) => acc + r.pounds, 0);
  return Math.abs(sum - controlTotalPounds) <= NEAR_MISS_POUNDS;
}

/** Map the Zod rows to the gate's PoundLineItem shape (the gate owns the pound arithmetic). */
function toLineItems(rows: readonly PoundExtraction["rows"][number][]): PoundLineItem[] {
  return rows.map((r) => ({ variety: r.variety, pounds: r.pounds }));
}

/** What one extraction yields: the captured rows, the SEPARATE stated total, and the gate's verdict. */
export type ExtractionResult = {
  rows: PoundLineItem[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
};

/**
 * The pure entry point: run the injected reader over one page, then hand the rows and the
 * independently-stated control total to the pound-gate. `coverage` is the gate's verdict, NOTHING
 * the model said — no model number becomes "real" except through `reconcileDocument`. On any reader
 * failure the document degrades to needs_review (never a thrown error or a fabricated figure), the
 * same fail-safe as the bill pipeline and the ZDR floor.
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
  const rows = toLineItems(extraction.rows);
  const controlTotalPounds = extraction.controlTotalPounds;
  return {
    rows,
    controlTotalPounds,
    coverage: reconcileDocument(rows, controlTotalPounds),
  };
}
