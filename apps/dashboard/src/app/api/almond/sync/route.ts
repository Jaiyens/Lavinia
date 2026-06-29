// PRODUCTION "Sync from Almond Logic" route (SCAFFOLD - fail-closed, inert without credentials).
//
// This is the prod sibling of ../dev/route.ts. Where the dev route spawns a HEADED browser on the
// developer's machine, production has no developer browser and no local disk, so the live scrape must
// run inside a hosted, headless browser driven from a Vercel Sandbox, and the status is read back from
// the `crop_scrape` AgentRun ledger (readProdSyncStatus). Today the live scrape body is still stubbed
// (see THE PRODUCTION LIFT below), so this route fails closed: with the required credentials absent it
// returns 503 and runs nothing. The plumbing around the gap - auth re-check, farm resolution, per-farm
// cooldown, agent dispatch, status read - is real, so the route lights up the moment the lift lands.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE PRODUCTION LIFT (what this scaffold is waiting on, documented for whoever implements it):
//
//   1. HOSTED BROWSER. Implement `fetchPagesInSandbox` (src/lib/crops/scrape/sandbox-scrape.ts) for
//      real: from INSIDE the Vercel Sandbox, connect to a hosted Chromium (e.g. Browserbase) via
//      `chromium.connectOverCDP(BROWSERBASE_CDP_URL)`, then port the LOCAL crawler's logic verbatim -
//      the same direct portal-API walk (getUserInfo/getHullers/getHandlers, then getDeliveries +
//      getRuns per huller/cropYear, getWebAssignments per handler/cropYear) issued from inside the
//      authenticated page with the X-Requested-With header, paced with the same humanDelay jitter so
//      the cadence reads as a person, not a burst. Capture each response and return the bytes (which
//      sandbox-scrape then writes to R2). Keep tiny volume (~40 calls) and sequential, one at a time.
//
//   2. SESSION / CREDENTIAL STORE. The local crawler reuses the developer's persistent browser
//      profile; production cannot. Add a `GrowerPortalCredential` Prisma model (TODO - NOT in the
//      schema in this worktree) to hold, PER farm/entity:
//          - farmId / entityId, portal: "ALMOND_LOGIC"
//          - encryptedCredential: the AES-256-GCM blob (ciphertext/iv/authTag) of { username, password }
//            encrypted with CROP_CRED_ENC_KEY (decrypted ONLY inside the Sandbox at moment of use,
//            via decryptCredential - never here, never logged), AND/OR
//          - sessionCookie + sessionCookieExpiresAt: a reusable portal session cookie captured on a
//            prior login, preferred over a fresh login when still valid (cookie_forward branch).
//      Then implement `resolveScrapeAuth` (src/lib/agents/agents/crop-scrape/run.ts, returns null
//      today) to load this row and return a ScrapeAuth, and persist/refresh the session cookie after a
//      successful login so most syncs replay a cookie instead of re-authenticating.
//
//   3. CAPTURE UI. A small in-portal form for the grower to enter their Almond Logic login once; the
//      server encrypts it (CROP_CRED_ENC_KEY) and writes the GrowerPortalCredential row. The plaintext
//      is never stored or logged; only the encrypted blob is persisted.
//
// Until 1-3 land, canRunLiveScrape() (Sandbox + CROP_CRED_ENC_KEY + R2) and resolveScrapeAuth gate the
// path: this route returns 503 in dev/CI/any env without the full credential set, so it is safe to ship.
// ───────────────────────────────────────────────────────────────────────────────────────────────

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { canRunLiveScrape } from "@/lib/crops/scrape/sandbox-scrape";
import { checkFixedWindow, type RateLimitStore } from "@/lib/almond/rate-limit";
import { readProdSyncStatus } from "@/lib/almond/sync-store";

// THE DISPATCH (commented until the lift lands, see header step 6). When step 5's 503 guard is
// removed, uncomment these and the block at the end of POST:
//   import { getAgent } from "@/lib/agents/registry";
//   // Importing the agents barrel registers crop_scrape (side-effect imports) before getAgent runs.
//   import "@/lib/agents/agents";

export const runtime = "nodejs";
export const maxDuration = 300;

// Per-farm cooldown so a grower cannot trigger back-to-back live scrapes (each opens a Sandbox + a
// hosted browser session + portal API volume). One sync per farm per 10 minutes is far above any real
// need (the data refreshes at most daily) and well below an abusive cadence. In-memory, like the chat
// limiter (src/lib/almond/rate-limit.ts) - a real first layer per instance; a KV-backed store is the
// documented durable upgrade. A dedicated store (not the chat/generation budgets) so syncs are bounded
// independently of the chat route.
const SYNC_COOLDOWN = { limit: 1, windowMs: 10 * 60_000 } as const;
const syncCooldownStore: RateLimitStore = new Map();

/**
 * Trigger a production sync for the signed-in operator's own farm.
 *
 * Fail-closed order:
 *   1. session required (401) - no anonymous trigger of a credentialed scrape,
 *   2. live scrape must be possible: Sandbox + encryption key + R2, else 503 (inert without creds),
 *   3. resolve the operator's OWN farm server-side (404 if none) - never trust a client-sent farmId,
 *   4. per-farm cooldown (429),
 *   5. resolvable grower auth, else 503 (no credential store / login captured yet - the lift above),
 *   6. dispatch the crop_scrape agent for the farm; it opens/records/closes its own AgentRun.
 */
export async function POST(): Promise<Response> {
  // 1) Session. A live scrape spends money and touches a grower's portal; never anonymous.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Inert without the full live-scrape credential set (Sandbox + CROP_CRED_ENC_KEY + R2).
  if (!canRunLiveScrape()) {
    return Response.json({ error: "sync_unavailable" }, { status: 503 });
  }

  // 3) Resolve the operator's OWN farm server-side. dashboardFarm is membership-gated, so this can
  //    never resolve another grower's farm; a client never names the farm.
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (!resolved) {
    return Response.json({ error: "farm_not_found" }, { status: 404 });
  }
  const farmId = resolved.farm.id;

  // 4) Per-farm cooldown.
  const cooldown = checkFixedWindow(syncCooldownStore, farmId, Date.now(), SYNC_COOLDOWN);
  if (!cooldown.allowed) {
    return Response.json(
      { error: "cooldown" },
      { status: 429, headers: { "Retry-After": String(cooldown.retryAfterSeconds) } },
    );
  }

  // 5) Resolvable grower auth. The crop_scrape agent skips entities with no auth (resolveScrapeAuth
  //    returns null until the credential store lands), so without it a "run" would be a clean no-op
  //    that never scrapes. Surface that as 503 here so the button shows "not configured" rather than
  //    a misleading success, and so step 6 below never runs a no-op scrape on a real farm. Once
  //    resolveScrapeAuth returns real auth, DELETE this guard and uncomment step 6 (+ its imports).
  //    NOTE: there is intentionally no per-entity decrypt here - decryption happens ONLY inside the
  //    Sandbox at the moment of use; this route never holds a plaintext credential.
  //
  // 6) Dispatch (commented until the lift lands). The registry's run signature is frozen at
  //    (prisma, farmId); the manual-trigger attribution (triggeredBy: userId) is recorded by the
  //    agent's own startAgentRun once the agent accepts a trigger arg. The agent opens/records/closes
  //    its own AgentRun and never throws past here, so the catch is the dispatcher's job, not ours.
  //
  //   const agent = getAgent("crop_scrape");
  //   if (!agent) return Response.json({ error: "sync_unavailable" }, { status: 503 });
  //   await agent.run(prisma, farmId);
  //   const status = await readProdSyncStatus(prisma, farmId);
  //   return Response.json({ status }, { status: 202 });
  return Response.json({ error: "sync_unavailable" }, { status: 503 });
}

/** Poll the production sync status: the latest crop_scrape AgentRun projected onto AlmondSyncStatus. */
export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (!resolved) {
    return Response.json({ error: "farm_not_found" }, { status: 404 });
  }
  const status = await readProdSyncStatus(prisma, resolved.farm.id);
  return Response.json({ status });
}
