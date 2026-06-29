// The grower COMMITMENT reader: the AI boundary for handler-commitment report pounds. Sibling of
// reader.ts (settlement statements); it reuses the SAME shared Sonnet -> Opus cascade (./cascade) so
// there is ONE escalation policy. Injected exactly like the settlement reader so the pipeline runs
// with ZERO external calls in dev/CI (no key -> `stubCommitmentReader`).
//
// The LIVE reader is built ONLY on `createZdrModel` (the direct Anthropic zero-data-retention
// endpoint, via the cascade) — this file MUST NOT import `@/lib/ai/gateway`. The import-guard test
// (extract/zdr-boundary.test.ts) fails the build if rule 6 is ever broken here. Grower commitment
// figures are a commercial secret and never transit a retaining intermediary.
//
// The gate certifies POUNDS only: committed-pound rows must sum to the report's SEPARATELY-printed
// control total. The per-row price RIDES ALONG with the gated pounds and is never the gate surface.

import {
  runCascade,
  shouldEscalate as cascadeShouldEscalate,
  type GateableExtraction,
} from "./cascade";
import { reconcileDocument, type PoundLineItem } from "@/lib/crops/pound-gate";
import type { PoundCoverage } from "@/lib/crops/types";
import { CommitmentExtraction, CommitmentExtractionSchema } from "./commitment-schema";

/** A single commitment-report page as raw text/markdown (the OCR/text layer fed to the reader). */
export type RawPage = string;

/** The injected extraction boundary. `extract` returns the raw object; callers validate via Zod. */
export interface CommitmentReader {
  extract(page: RawPage): Promise<CommitmentExtraction>;
}

const EXTRACT_PROMPT =
  "You are reading ONE almond grower COMMITMENT / handler assignment report. Extract two things " +
  "SEPARATELY:\n" +
  "1) `rows`: every printed commitment line, each as { handler, variety, committedPounds, " +
  "priceCentsPerPound } where committedPounds is a WHOLE integer pound figure (e.g. 120,000 lb -> " +
  "120000) and priceCentsPerPound is the committed price in WHOLE cents per pound (e.g. $2.15/lb -> " +
  "215) or null if the line is pounds-only / no price is printed. Capture the handler (buyer) name " +
  "and the variety name exactly as printed.\n" +
  "2) `controlTotalPounds`: the report's PRINTED grand total of committed pounds. Read this from the " +
  "document's own total line. DO NOT add up the rows yourself — report the printed total verbatim. " +
  "If the page prints no grand total, return null.\n" +
  "Also return `confidence`: your own 0..1 rating of how cleanly the page scanned. " +
  "Never invent a total to make the rows add up.";

/**
 * The un-wired reader: throws if used without injection. Tests inject a fake fed a committed fixture;
 * the live reader is `createZdrCommitmentReader`. Mirrors the settlement `stubPoundReader`.
 */
export const stubCommitmentReader: CommitmentReader = {
  extract() {
    return Promise.reject(
      new Error(
        "CommitmentReader not wired: inject a reader (createZdrCommitmentReader is the live one)",
      ),
    );
  },
};

/**
 * The LIVE reader over the direct Anthropic ZERO-DATA-RETENTION endpoint (via the shared cascade).
 * Sonnet first; escalate to Opus when confidence is low or the result is a pound-gate near-miss. Only
 * constructed on the server import path where `hasZdrKey()` is true.
 */
export function createZdrCommitmentReader(): CommitmentReader {
  return {
    extract(page) {
      return runCascade<CommitmentExtraction>({
        schema: CommitmentExtractionSchema,
        schemaName: "CommitmentExtraction",
        prompt: EXTRACT_PROMPT,
        page,
        gate: toGateable,
      });
    },
  };
}

/** Project a commitment extraction onto the cascade's escalation surface (committed pounds only). */
function toGateable(extraction: CommitmentExtraction): GateableExtraction {
  return {
    rows: toLineItems(extraction.rows),
    controlTotalPounds: extraction.controlTotalPounds,
    confidence: extraction.confidence,
  };
}

/** Whether a Sonnet pass warrants the costlier Opus pass for a commitment document. */
export function shouldEscalate(extraction: CommitmentExtraction): boolean {
  return cascadeShouldEscalate(toGateable(extraction));
}

/** Map the Zod rows to the gate's PoundLineItem shape (committed pounds keyed by variety). */
function toLineItems(rows: readonly CommitmentExtraction["rows"][number][]): PoundLineItem[] {
  return rows.map((r) => ({ variety: r.variety, pounds: r.committedPounds }));
}

/** One gated commitment row: handler/buyer, variety, committed pounds, and the price that rides along. */
export type CommitmentResultRow = {
  handler: string;
  variety: string;
  committedPounds: number;
  priceCentsPerPound: number | null;
};

/** What one commitment extraction yields: the captured rows (with prices), the total, the verdict. */
export type CommitmentExtractionResult = {
  rows: CommitmentResultRow[];
  controlTotalPounds: number | null;
  coverage: PoundCoverage;
};

/**
 * The pure entry point: run the injected reader over one page, then hand the committed-pound rows and
 * the independently-stated control total to the pound-gate. `coverage` is the gate's verdict, NOTHING
 * the model said. On any reader failure the document degrades to needs_review (never a thrown error or
 * a fabricated figure). The per-row price RIDES ALONG with the gated pounds; the gate certifies
 * pounds only.
 */
export async function runCommitmentExtraction(
  reader: CommitmentReader,
  rawPage: RawPage,
): Promise<CommitmentExtractionResult> {
  let extraction: CommitmentExtraction;
  try {
    extraction = await reader.extract(rawPage);
  } catch {
    return { rows: [], controlTotalPounds: null, coverage: "needs_review" };
  }
  const rows: CommitmentResultRow[] = extraction.rows.map((r) => ({
    handler: r.handler,
    variety: r.variety,
    committedPounds: r.committedPounds,
    priceCentsPerPound: r.priceCentsPerPound ?? null,
  }));
  const controlTotalPounds = extraction.controlTotalPounds;
  return {
    rows,
    controlTotalPounds,
    coverage: reconcileDocument(toLineItems(extraction.rows), controlTotalPounds),
  };
}
