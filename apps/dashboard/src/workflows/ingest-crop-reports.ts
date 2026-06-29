"use workflow";

// The durable REPORT-INGEST workflow: scrape the grower's Almond Logic REPORT PDFs, extract each
// (settlement vs commitment, by class) over the ZERO-DATA-RETENTION endpoint, gate the pounds, and
// write PACKER_SETTLED production rows (superseding the live estimate) + ALMOND_LOGIC commitment
// rows, then recompute positions. Sibling of ingest-crop-year.ts (which ingests the yield ESTIMATE);
// this one ingests the FINAL settlement + the sales commitments.
//
//   scrape(report PDFs) -> for each PDF: extract(by class) -> poundGate -> write(settlement|commitment)
//   -> recomputePositions
//
// On DEPLOY the WDK build adapter (the "use workflow" / "use step" directives) makes each step a
// durable, resumable unit. LOCALLY (dev/CI/tests) these are plain sequential async functions — same
// code path, no infrastructure — so build and tests pass with zero new infra and ZERO external calls
// (no readers injected => documents degrade to needs_review; no live scrape => the fixture stub).
//
// Trust invariants honored end to end:
//   - The pound-gate (inside extractReportDocument's runExtraction/runCommitmentExtraction) is the
//     ONLY thing that certifies a pound. A needs_review document writes NOTHING.
//   - A settlement supersedes the ONE live ALMOND_LOGIC estimate for its (cropYear, normalized
//     variety) so the estimate->settled gap falls out of recomputePositions automatically.
//   - Grower data only ever transits the ZDR endpoint (the readers import only @/lib/ai/zdr).
//   - Raw PDFs go to R2 inside the scrape lib, never Postgres.

import { scrapeStep, type ScrapeStepInput } from "./steps/scrape";
import type { ScrapeResult } from "@/lib/crops/scrape/types";
import { extractReportDocument, isPdf, type ReportExtraction } from "./steps/extract";
import {
  writeSettlementRecordsStep,
  type RunInSettlementTenant,
  type WriteSettlementRecordsOutput,
} from "./steps/write-settlement-records";
import {
  writeCommitmentRecordsStep,
  type RunInCommitmentTenant,
  type WriteCommitmentRecordsOutput,
} from "./steps/write-commitment-records";
import { recomputePositionsStep, type LoadLedger } from "./steps/recompute-positions";
import type { PoundReader } from "@/lib/crops/extract/reader";
import type { CommitmentReader } from "@/lib/crops/extract/commitment-reader";
import type { Positions } from "@/lib/crops/types";

/**
 * The injectable boundaries the report-ingest workflow needs. In production these are backed by
 * Prisma + R2 + the live ZDR readers; in tests they are fakes, so `ingestCropReports` runs end-to-end
 * with no DB, no network, and no model call.
 */
export type IngestReportsDeps = {
  /** Tenant-scoped write boundary for settlement (PACKER_SETTLED production) rows. */
  runInSettlementTenant: RunInSettlementTenant;
  /** Tenant-scoped write boundary for commitment rows. */
  runInCommitmentTenant: RunInCommitmentTenant;
  /** Ledger-load boundary for the recompute step. */
  loadLedger: LoadLedger;
  /** Scrape options (live auth / object store). Omit to force the committed-fixture stub. */
  scrape?: Pick<ScrapeStepInput, "auth" | "objectStore">;
  /**
   * Replace the scrape step entirely with already-captured report pages. The seam used by tests (PDF
   * fixtures) and by the back-catalog backfill path (PDFs already in R2). When set, the live/stub
   * scrapeStep is NOT called.
   */
  scrapeOverride?: (target: ScrapeStepInput["target"]) => Promise<ScrapeResult> | ScrapeResult;
  /** Live settlement reader (ZDR). Omit -> settlement docs degrade to needs_review (zero-call). */
  settlementReader?: PoundReader;
  /** Live commitment reader (ZDR). Omit -> commitment docs degrade to needs_review (zero-call). */
  commitmentReader?: CommitmentReader;
  /** PDF -> text. Injectable for tests; defaults to the pdf-parse reader inside the extract step. */
  pdfToText?: (bytes: Uint8Array) => Promise<string>;
  /** The farm that owns this entity's ledger. Supplied explicitly (the trigger passes it). */
  farmId: string;
};

/** What one ingested report document yielded (for observability; never a pound figure). */
export type ReportOutcome = {
  /** Stable id for this document (its R2 sha) — the idempotency / provenance key. */
  documentId: string;
  url: string;
  docClass: ReportExtraction["docClass"];
  coverage: ReportExtraction["coverage"];
  settlement?: WriteSettlementRecordsOutput;
  commitment?: WriteCommitmentRecordsOutput;
};

export type IngestReportsResult = {
  entityId: string;
  cropYear: number;
  farmId: string;
  scrapeBranch: string;
  documents: ReportOutcome[];
  positions: Positions;
};

/**
 * Ingest the report PDFs for one crop year for one entity. Durable on deploy; sequential locally.
 * Scrapes the report PDFs, then for EACH one: extracts by class (gate applied inside), and on a
 * "reconciled" verdict writes to the settlement or commitment ledger. Non-PDF pages (the stub HTML
 * fixtures) are skipped here — this workflow is the report path; the crop-YEAR workflow owns HTML.
 * Positions are recomputed once at the end so the settlement->estimate gap is reflected.
 */
export async function ingestCropReports(
  entityId: string,
  cropYear: number,
  deps: IngestReportsDeps,
): Promise<IngestReportsResult> {
  const target = { farmId: deps.farmId, entityId, cropYear };

  // 1. scrape -> raw report pages. An override supplies already-captured PDFs (tests / back-catalog);
  //    otherwise the stub fixtures unless live scrape is gated on (PDFs go to R2 inside that lib).
  const scraped = deps.scrapeOverride
    ? await deps.scrapeOverride(target)
    : await scrapeStep({
        target,
        auth: deps.scrape?.auth,
        objectStore: deps.scrape?.objectStore,
      });

  const documents: ReportOutcome[] = [];

  // 2. per PDF: extract (by class, gate applied) -> write settlement|commitment when reconciled.
  for (const page of scraped.pages) {
    if (!isPdf(page)) continue; // report path is PDFs; HTML fixtures belong to the crop-year workflow
    const extraction = await extractReportDocument(page, {
      settlementReader: deps.settlementReader,
      commitmentReader: deps.commitmentReader,
      pdfToText: deps.pdfToText,
    });

    const outcome: ReportOutcome = {
      documentId: page.sha,
      url: page.url,
      docClass: extraction.docClass,
      coverage: extraction.coverage,
    };

    if (extraction.docClass === "settlement") {
      outcome.settlement = await writeSettlementRecordsStep(
        {
          farmId: deps.farmId,
          statementId: page.sha,
          cropYear,
          rows: extraction.rows,
          controlTotalPounds: extraction.controlTotalPounds,
          coverage: extraction.coverage,
        },
        deps.runInSettlementTenant,
      );
    } else {
      outcome.commitment = await writeCommitmentRecordsStep(
        {
          farmId: deps.farmId,
          reportId: page.sha,
          cropYear,
          rows: extraction.rows.map((r) => ({
            buyer: r.handler,
            variety: r.variety,
            committedPounds: r.committedPounds,
            priceCentsPerPound: r.priceCentsPerPound,
          })),
          controlTotalPounds: extraction.controlTotalPounds,
          coverage: extraction.coverage,
        },
        deps.runInCommitmentTenant,
      );
    }

    documents.push(outcome);
  }

  // 3. recomputePositions -> the pure deterministic position (settlement->estimate gap falls out).
  const recomputed = await recomputePositionsStep({ farmId: deps.farmId }, deps.loadLedger);

  return {
    entityId,
    cropYear,
    farmId: deps.farmId,
    scrapeBranch: scraped.branch,
    documents,
    positions: recomputed.positions,
  };
}
