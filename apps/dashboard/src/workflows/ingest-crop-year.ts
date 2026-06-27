"use workflow";

// The durable crop-year ingest WORKFLOW. On DEPLOY, the Vercel Workflow Development Kit (WDK) build
// adapter reads the "use workflow" directive above (and the "use step" directive in each steps/*
// file) and rewrites this into a durable, resumable workflow: each step becomes an independently
// retried, checkpointed unit, so a transient Sandbox/R2/DB failure resumes from the last completed
// step instead of re-scraping. LOCALLY (dev/CI/tests) there is no adapter and these are plain
// sequential async functions — same code path, just not durable — so build and tests pass with zero
// new infrastructure. See the commit body for the exact WDK package to pin for deploy.
//
// The workflow BODY performs NO I/O of its own: it only orders the steps and threads their outputs.
// Every side effect (Sandbox scrape, R2 write, DB write, ledger load) lives inside a step, behind an
// injectable boundary, so the whole pipeline is testable end-to-end with fakes.
//
//   scrape -> extract -> poundGate -> writeYieldRecords -> recomputePositions
//
// The deterministic pound-gate (poundGate) and recomputePositions own every number; no model ever
// produces a pound here.

import { scrapeStep, type ScrapeStepInput } from "./steps/scrape";
import { extractStep } from "./steps/extract";
import { poundGateStep } from "./steps/pound-gate";
import {
  writeYieldRecordsStep,
  type RunInTenant,
  type WriteYieldRecordsOutput,
} from "./steps/write-yield-records";
import { recomputePositionsStep, type LoadLedger } from "./steps/recompute-positions";
import type { Positions, ProductionSource } from "@/lib/crops/types";

/**
 * The injectable boundaries the I/O-touching steps need. In production these are backed by Prisma
 * (prismaRunInTenant / prismaLoadLedger) and the real R2 object store; in tests they are fakes, so
 * `ingestCropYear` runs end-to-end with no DB and no network.
 */
export type IngestDeps = {
  /** Tenant-scoped write boundary for the yield records step. */
  runInTenant: RunInTenant;
  /** Ledger-load boundary for the recompute step. */
  loadLedger: LoadLedger;
  /** Scrape options (live auth / object store). Omit to force the committed-fixture stub. */
  scrape?: Pick<ScrapeStepInput, "auth" | "objectStore">;
  /** Provenance for written rows. Defaults to ALMOND_LOGIC (the scrape is an estimate source). */
  source?: ProductionSource;
  /**
   * The farm that owns this entity's ledger. The entity->farm resolution is a future concern; for
   * now it is supplied explicitly (the stub and the trigger pass it).
   */
  farmId: string;
};

export type IngestResult = {
  entityId: string;
  cropYear: number;
  farmId: string;
  scrapeBranch: string;
  coverage: string;
  write: WriteYieldRecordsOutput;
  positions: Positions;
};

/**
 * Ingest one crop year for one entity. Durable on deploy; sequential locally. Orders the five steps
 * and returns an observable result. The poundGate verdict alone decides whether anything is written:
 * a corrupted document (needs_review) writes nothing, then positions are still recomputed (a no-op
 * change) so the workflow always terminates with the current position.
 */
export async function ingestCropYear(
  entityId: string,
  cropYear: number,
  deps: IngestDeps,
): Promise<IngestResult> {
  const target = { farmId: deps.farmId, entityId, cropYear };

  // 1. scrape -> raw pages (stub fixtures unless live scrape is gated on).
  const scraped = await scrapeStep({
    target,
    auth: deps.scrape?.auth,
    objectStore: deps.scrape?.objectStore,
  });

  // 2. extract -> line items + the document's OWN stated control total (never a re-sum).
  const extracted = await extractStep({ pages: scraped.pages });

  // 3. poundGate -> deterministic verdict (REAL pure function, no model).
  const gated = await poundGateStep({
    rows: extracted.rows,
    controlTotalPounds: extracted.controlTotalPounds,
  });

  // 4. writeYieldRecords -> persist ONLY when reconciled; idempotent re-run.
  const write = await writeYieldRecordsStep(
    {
      farmId: deps.farmId,
      entityId,
      cropYear,
      rows: gated.rows,
      controlTotalPounds: gated.controlTotalPounds,
      coverage: gated.coverage,
      source: deps.source,
    },
    deps.runInTenant,
  );

  // 5. recomputePositions -> the pure deterministic position from the ledger.
  const recomputed = await recomputePositionsStep({ farmId: deps.farmId }, deps.loadLedger);

  return {
    entityId,
    cropYear,
    farmId: deps.farmId,
    scrapeBranch: scraped.branch,
    coverage: gated.coverage,
    write,
    positions: recomputed.positions,
  };
}
