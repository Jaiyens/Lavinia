"use step";

// Workflow STEP: scrape. On deploy the WDK build adapter turns this into a durable, retryable step
// (the "use step" directive above is the build-time marker); locally it is a plain async function.
//
// This step is the seam between the durable workflow and the Sandbox scrape lib. By default it runs
// the STUB (committed fixture pages, zero external calls) so the workflow is runnable in dev/CI. The
// REAL Sandbox scrape (src/lib/crops/scrape/sandbox-scrape.ts) is wired here behind a capability
// gate: it only runs when live scrape is possible AND a scrape `auth` is supplied. Raw pages it
// captures go to R2 inside that lib — never here, never Postgres.

import { MemoryObjectStore, type ObjectStore } from "@/lib/storage/object-store";
import { canRunLiveScrape, scrape as runScrape, type ScrapeAuth } from "@/lib/crops/scrape/sandbox-scrape";
import { reconcilingFixturePages } from "@/lib/crops/scrape/fixtures";
import type { ScrapeResult, ScrapeTarget } from "@/lib/crops/scrape/types";

export type ScrapeStepInput = {
  target: ScrapeTarget;
  /** Grower auth for the live path. Omit (the default) to force the stub. */
  auth?: ScrapeAuth;
  /** Object store for raw pages; injected for tests. Defaults to R2-less in-memory in the stub. */
  objectStore?: ObjectStore;
};

/**
 * Run the scrape step. Capability gate: only takes the live Sandbox path when `canRunLiveScrape()`
 * is true AND `auth` was supplied; otherwise returns the committed fixture pages with no I/O.
 */
export async function scrapeStep(input: ScrapeStepInput): Promise<ScrapeResult> {
  if (!input.auth || !canRunLiveScrape()) {
    // STUB: committed fixture pages, no Sandbox, no R2.
    return { branch: "stub", pages: reconcilingFixturePages(), storedKeys: [] };
  }
  // LIVE: hand the scrape lib a real object store (R2 inside the lib) + the grower auth.
  const objectStore = input.objectStore ?? new MemoryObjectStore();
  return runScrape(input.target, { objectStore, auth: input.auth });
}
