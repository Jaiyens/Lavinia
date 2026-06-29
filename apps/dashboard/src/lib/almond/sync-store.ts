// The status STORE behind the "Sync from Almond Logic" button. It is the single read/write seam for
// the AlmondSyncStatus contract (src/lib/almond/sync-status.ts), with two backends:
//
//   Dev (local):   a JSON status file on disk. The tracked sync runner (a detached tsx process) owns
//                  the writes; the dev API route reads them back for the polling UI. The path is
//                  ALMOND_SYNC_STATUS (the route + runner agree on it via the spawned child's env),
//                  falling back to a scratchpad file so a bare `npm run almond:sync:tracked` still works.
//   Prod (mapped): the latest `crop_scrape` AgentRun for the farm, projected onto AlmondSyncStatus.
//                  This is the production read path; there is no status FILE in prod (a serverless
//                  function has no durable local disk), so the AgentRun ledger IS the status.
//
// SERVER-ONLY. This module imports node:fs and prisma; it must never be pulled into a client bundle.
// The client UI talks to the API routes, which call in here. `message` carries curated operator copy
// only and NEVER a secret, cookie, or credential.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  initialStatus,
  isRunning,
  type AlmondSyncErrorKind,
  type AlmondSyncPhase,
  type AlmondSyncStatus,
} from "./sync-status";

/** A scratchpad fallback so a plain `npm run almond:sync:tracked` (no ALMOND_SYNC_STATUS set) still
 *  has somewhere to write. The dev route always passes an explicit path, so this is the rare path. */
const FALLBACK_STATUS_PATH =
  "/private/tmp/claude-501/-Users-kamransalahuddin-Lavinia/b3fbda0a-56a1-4e8d-8041-b4d70fb9de5a/scratchpad/sync-status.json";

/** The resolved status-file path for THIS process. The dev route spawns the runner with this env var
 *  set to a known path and reads the same path back; the runner reads it to know where to write. */
export function syncStatusPath(): string {
  return process.env.ALMOND_SYNC_STATUS ?? FALLBACK_STATUS_PATH;
}

/** Narrow an arbitrary parsed JSON value to AlmondSyncStatus, returning null when the shape is off so
 *  a corrupt/partial file never crashes the poll loop (the caller falls back to an idle status). */
function asStatus(value: unknown): AlmondSyncStatus | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.phase !== "string") return null;
  if (typeof v.startedAt !== "number" || typeof v.updatedAt !== "number") return null;
  if (typeof v.apiCallsDone !== "number") return null;
  if (!(v.apiCallsTotal === null || typeof v.apiCallsTotal === "number")) return null;
  return value as AlmondSyncStatus;
}

/** An idle placeholder for "no sync has run". Phase "idle" is not running and not terminal, so the
 *  button renders its default resting label. */
function idleStatus(now: number): AlmondSyncStatus {
  return {
    phase: "idle",
    startedAt: 0,
    updatedAt: now,
    apiCallsDone: 0,
    apiCallsTotal: null,
    snapshots: 0,
    deliveries: 0,
    errorKind: null,
    message: null,
    source: "dev_local",
  };
}

/**
 * Read the dev (file-backed) sync status. Returns an idle status when the file is missing or
 * unreadable (first run, or it was never written) and when the contents do not match the contract.
 * Never throws: the poll loop must keep working even if the file is mid-write or absent.
 */
export function readSyncStatus(): AlmondSyncStatus {
  const now = Date.now();
  try {
    const raw = readFileSync(syncStatusPath(), "utf8");
    return asStatus(JSON.parse(raw)) ?? idleStatus(now);
  } catch {
    return idleStatus(now);
  }
}

/**
 * Write the dev (file-backed) sync status, stamping updatedAt. Creates the parent directory on first
 * write. The runner calls this on every phase change (starting -> scraping -> loading -> done|error);
 * the dev route calls it once to seed initialStatus before spawning the child. The scraper script
 * writes the login_required error status directly through this path too.
 */
export function writeSyncStatus(status: AlmondSyncStatus): void {
  const path = syncStatusPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // Directory already exists or cannot be created; the write below will surface a real failure.
  }
  const stamped: AlmondSyncStatus = { ...status, updatedAt: Date.now() };
  writeFileSync(path, JSON.stringify(stamped, null, 2));
}

/** Whether a CURRENT dev sync is still in flight. A "running" status whose updatedAt is older than
 *  STALE_AFTER_MS is treated as dead (a crashed/killed child that never wrote a terminal status), so
 *  the double-click lock in the dev route does not wedge forever. */
export function isSyncInFlight(status: AlmondSyncStatus, now: number = Date.now()): boolean {
  if (!isRunning(status.phase)) return false;
  return now - status.updatedAt < STALE_AFTER_MS;
}

/** After this long with no status write, a "running" sync is assumed dead (the child crashed before
 *  writing a terminal phase). Generous: a real sync paces ~40 API calls at ~1.8-4.4s each plus the
 *  load, well under this, but a headed login wait can stall, so this is comfortably above that. */
export const STALE_AFTER_MS = 5 * 60 * 1000;

// --- Production read path -----------------------------------------------------------------------

/** Map an AgentRun.status to an AlmondSyncPhase. A "running" run is mid-scrape; a terminal run is
 *  done or error. We cannot tell scraping from loading from the ledger alone, so an in-flight run
 *  reports the coarse "scraping" phase (the UI shows a live spinner regardless). */
function phaseForRunStatus(status: string): AlmondSyncPhase {
  if (status === "running") return "scraping";
  if (status === "succeeded") return "done";
  return "error";
}

/** Best-effort classification of a failed run's redacted note into an error kind for the UI. The note
 *  is curated operator copy (never a secret); we only pattern-match on the safe words the agent writes. */
function errorKindForNote(note: string | null): AlmondSyncErrorKind {
  const text = (note ?? "").toLowerCase();
  if (text.includes("login")) return "login_required";
  if (text.includes("network") || text.includes("timeout")) return "network";
  return "unknown";
}

/**
 * Production status: project the latest `crop_scrape` AgentRun for this farm onto AlmondSyncStatus.
 *
 * STUB (acceptable per the build spec): the prod sync is not fully runnable yet (the hosted-browser
 * scrape + grower-credential store are the documented production lift, see api/almond/sync/route.ts).
 * This mapping is the READ side and is real: it reads the AgentRun ledger the crop_scrape agent
 * already writes, so once the live scrape lands the button's prod polling works with no UI change.
 * Returns an idle status when no crop_scrape run exists for the farm. NEVER surfaces a secret: only
 * the run's own redacted note and counts, projected to curated copy. source is "cron" because the
 * crop_scrape AgentRun is what backs it (a manual prod trigger still records a crop_scrape run).
 */
export async function readProdSyncStatus(
  prisma: PrismaClient,
  farmId: string,
): Promise<AlmondSyncStatus> {
  const now = Date.now();
  const run = await prisma.agentRun.findFirst({
    where: { farmId, kind: "crop_scrape" },
    orderBy: { createdAt: "desc" },
    select: { status: true, note: true, createdAt: true, completedAt: true },
  });
  if (!run) {
    const base = idleStatus(now);
    return { ...base, source: "cron" };
  }
  const phase = phaseForRunStatus(run.status);
  const startedAt = run.createdAt.getTime();
  const updatedAt = (run.completedAt ?? run.createdAt).getTime();
  return {
    phase,
    startedAt,
    updatedAt,
    // The ledger does not record per-call progress; the prod UI shows an indeterminate spinner.
    apiCallsDone: 0,
    apiCallsTotal: null,
    snapshots: 0,
    deliveries: 0,
    errorKind: phase === "error" ? errorKindForNote(run.note) : null,
    // Curated copy only. The run's note is the agent's own redacted reason (never a secret).
    message: phase === "error" ? "The last sync did not complete. You can try again." : null,
    source: "cron",
  };
}

/** Re-export the seed helper so callers can `import { seedInitialStatus } from "./sync-store"` and
 *  keep the contract import in one place. The dev route uses this to stamp the starting status before
 *  spawning the runner. */
export function seedInitialStatus(now: number = Date.now()): AlmondSyncStatus {
  return initialStatus("dev_local", now);
}
