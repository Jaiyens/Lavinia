// DEV-ONLY in-app trigger for the "Sync from Almond Logic" button.
//
// This route exists so a developer running the dashboard locally can click a button in the Almond
// portal header instead of dropping to a terminal to run `npm run almond:sync`. It spawns the TRACKED
// runner as a DETACHED child (the headed Playwright crawler that reuses the developer's own logged-in
// browser profile must run on the developer's MACHINE, never inside a serverless function), and the
// runner writes a status file the button polls back through GET.
//
// HARD GUARD: this is a localhost developer convenience. The FIRST thing the handler does is 404 when
// NODE_ENV is not "development" - so even though the file exists in the production bundle, the route is
// dead in prod (the production sibling at ../route.ts is the real, fail-closed prod path). Never logs a
// credential; the status it returns carries curated copy only.

import { spawn } from "node:child_process";
import {
  isSyncInFlight,
  readSyncStatus,
  seedInitialStatus,
  syncStatusPath,
  writeSyncStatus,
} from "@/lib/almond/sync-store";

export const runtime = "nodejs";
// The headed crawler can take minutes; the route only KICKS OFF a detached child and returns 202
// immediately, so the request itself is short, but keep the budget generous for the spawn.
export const maxDuration = 60;

/** A 404 Response, used to make this route invisible outside development. */
function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

/**
 * Kick off a tracked sync. Returns 202 with the seeded "starting" status, or 409 when a sync is
 * already in flight (the double-click lock - a stale "running" status older than the staleness
 * window is treated as dead and a fresh run is allowed). The child is detached + unref'd so it
 * outlives this request and keeps crawling while the button polls GET.
 */
export async function POST(): Promise<Response> {
  if (process.env.NODE_ENV !== "development") return notFound();

  // Double-click / concurrent-run lock: a fresh in-flight sync blocks a second start.
  const current = readSyncStatus();
  if (isSyncInFlight(current)) {
    return Response.json({ error: "already_running", status: current }, { status: 409 });
  }

  // Seed the starting status BEFORE spawning so the very first GET poll already sees "starting"
  // (the child takes a moment to boot tsx + Playwright).
  const status = seedInitialStatus();
  const statusPath = syncStatusPath();
  writeSyncStatus(status);

  // Spawn the tracked runner detached so it survives this request. cwd is the dashboard root
  // (where package.json + the npm script live); process.cwd() is that root when `next dev` runs.
  // Pass ALMOND_SYNC_STATUS so the child + the scraper + GET all agree on one status file.
  const child = spawn("npm", ["run", "almond:sync:tracked"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ALMOND_SYNC_STATUS: statusPath },
  });
  child.unref();

  return Response.json({ status }, { status: 202 });
}

/** Poll the current sync status. The button GETs this on its poll loop. */
export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV !== "development") return notFound();
  return Response.json({ status: readSyncStatus() });
}
