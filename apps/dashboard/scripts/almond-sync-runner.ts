/*
 * Tracked Almond Logic sync (scrape -> load) in ONE tsx process, owning every status write.
 *
 * This is the orchestrator the in-app dev button spawns (detached) via `npm run almond:sync:tracked`.
 * The plain `npm run almond:sync` is left untouched for the terminal; this variant adds the status
 * file so the UI can poll progress. It:
 *   1. writes phase "starting", then runs the scraper (which writes "scraping" + increments
 *      apiCallsDone/Total itself, guarded on ALMOND_SYNC_STATUS),
 *   2. writes phase "loading" and runs the loader,
 *   3. writes phase "done" with the final snapshot/delivery counts,
 *   4. and on any throw classifies the failure (login_required vs network vs unknown) and writes
 *      phase "error" with curated operator copy.
 *
 * The status file path comes from ALMOND_SYNC_STATUS (the dev route sets it; a bare run falls back to
 * the scratchpad). NEVER logs a credential or cookie. Run by the route, or by hand:
 *   ALMOND_SYNC_STATUS=/tmp/almond-sync.json npx tsx scripts/almond-sync-runner.ts
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  readSyncStatus,
  seedInitialStatus,
  syncStatusPath,
  writeSyncStatus,
} from "../src/lib/almond/sync-store";
import type { AlmondSyncErrorKind, AlmondSyncStatus } from "../src/lib/almond/sync-status";

/** Run one npm script to completion in a child, inheriting stdio so the operator sees crawl progress
 *  in the spawning terminal, and forwarding ALMOND_SYNC_STATUS so the scraper writes to the same file.
 *  Returns the child exit code (0 on success). */
function runStep(script: string): number {
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: { ...process.env, ALMOND_SYNC_STATUS: syncStatusPath() },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/** Read the OUT_DIR capture to count snapshots + deliveries for the final "done" status. Best-effort:
 *  a missing/short file just yields zeroes (the load already wrote the DB; counts are cosmetic). The
 *  capture path mirrors load-almond.ts (ALMOND_CAPTURE or the scratchpad default). */
function captureCounts(): { snapshots: number; deliveries: number } {
  const path =
    process.env.ALMOND_CAPTURE ??
    "/private/tmp/claude-501/-Users-kamransalahuddin-Lavinia/b3fbda0a-56a1-4e8d-8041-b4d70fb9de5a/scratchpad/almond-capture/api-results.json";
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      results?: Array<{ endpoint: string; json: unknown }>;
    };
    const results = parsed.results ?? [];
    const snapshots = results.length;
    let deliveries = 0;
    for (const r of results) {
      if (r.endpoint === "getDeliveries.php" && Array.isArray(r.json)) deliveries += r.json.length;
    }
    return { snapshots, deliveries };
  } catch {
    return { snapshots: 0, deliveries: 0 };
  }
}

/** Classify a failed step into an error kind for the UI. The scraper, on a login timeout, writes its
 *  OWN login_required status before exiting non-zero; if that already happened we keep it. Otherwise a
 *  non-zero exit is an unknown/network failure (we never have a secret to leak here). */
function classifyFailure(existing: AlmondSyncStatus): {
  errorKind: AlmondSyncErrorKind;
  message: string;
} {
  if (existing.phase === "error" && existing.errorKind === "login_required") {
    return {
      errorKind: "login_required",
      message:
        existing.message ?? "Log in to Almond Logic in the open window, then sync again.",
    };
  }
  return {
    errorKind: "unknown",
    message: "The sync did not finish. Check the open window and try again.",
  };
}

function main(): void {
  // 1) Seed "starting". The dev route also seeds initialStatus, but a bare run needs it too.
  writeSyncStatus(seedInitialStatus());

  // 2) Scrape. The scraper writes "scraping" + apiCallsDone/Total itself (guarded on the env var),
  //    and on a login timeout writes login_required and exits non-zero.
  const scrapeCode = runStep("almond:scrape");
  if (scrapeCode !== 0) {
    const { errorKind, message } = classifyFailure(readSyncStatus());
    writeSyncStatus({ ...readSyncStatus(), phase: "error", errorKind, message });
    process.exit(scrapeCode);
  }

  // 3) Load. Flip to "loading"; the loader writes the DB and we count the capture for the UI.
  writeSyncStatus({ ...readSyncStatus(), phase: "loading", message: null });
  const loadCode = runStep("almond:load");
  if (loadCode !== 0) {
    writeSyncStatus({
      ...readSyncStatus(),
      phase: "error",
      errorKind: "unknown",
      message: "We saved the scrape but could not load it into Terra. Try again.",
    });
    process.exit(loadCode);
  }

  // 4) Done. Stamp the final counts so the UI can show what landed.
  const { snapshots, deliveries } = captureCounts();
  writeSyncStatus({
    ...readSyncStatus(),
    phase: "done",
    snapshots,
    deliveries,
    errorKind: null,
    message: null,
  });
}

try {
  main();
} catch (err) {
  // A throw OUTSIDE a step (e.g. spawn failed to start). Record a generic, secret-free error.
  writeSyncStatus({
    ...readSyncStatus(),
    phase: "error",
    errorKind: "unknown",
    message: "The sync could not start. Try again.",
  });
  console.error("[almond-sync] runner failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
