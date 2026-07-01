// The grower portal credential store: the DB edge for GrowerPortalCredential (the Phase 2 live-scrape
// credential/session store). ONE row per (farm, portal) — Batth's single Almond Logic login covers
// the whole grower account. This is the seam the prod sync route's "SESSION / CREDENTIAL STORE" lift
// asked for: it lets resolveScrapeAuth() return real auth instead of null.
//
// Secret discipline: this module handles the ENCRYPTED blob and the session cookie only. The plaintext
// { username, password } is encrypted (encryptCredential) BEFORE it reaches here and is decrypted ONLY
// later, inside the Sandbox, at the moment of a headless login (decryptCredential). Nothing here is
// logged. Every read/write goes through withFarmTenant so Postgres RLS is in force (a farm can never
// read another farm's stored credential even if application scoping were bypassed).
//
// The pure functions (parseEncryptedCredential, rowToScrapeAuth) carry the trust logic — validating
// the stored blob shape and dropping an expired cookie — and are unit-tested with no DB. The three
// thin wrappers touch Prisma and are covered by the *.db.test.ts (which needs local Postgres).

import type { PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import {
  encryptCredential,
  type EncryptedCredential,
  type GrowerCredential,
  type ScrapeAuth,
} from "./sandbox-scrape";

/** The only portal today. String (not an enum) so a second grower portal slots in without a migration. */
export const PORTAL_ALMOND_LOGIC = "ALMOND_LOGIC";

/** The stored-row shape the pure mappers consume (a subset of the Prisma row; no Prisma import needed). */
export type CredentialRow = {
  encryptedCredential: unknown;
  sessionCookie: string | null;
  sessionCookieExpiresAt: Date | null;
};

/**
 * Validate an untrusted JSON value (the DB `encryptedCredential` column) into an EncryptedCredential,
 * or null when it is absent / the wrong shape. Never trusts the column blindly: all three base64
 * fields must be strings, else the blob cannot decrypt and is treated as no credential.
 */
export function parseEncryptedCredential(json: unknown): EncryptedCredential | null {
  if (json === null || typeof json !== "object") return null;
  const blob = json as Record<string, unknown>;
  if (
    typeof blob.ciphertext !== "string" ||
    typeof blob.iv !== "string" ||
    typeof blob.authTag !== "string"
  ) {
    return null;
  }
  return { ciphertext: blob.ciphertext, iv: blob.iv, authTag: blob.authTag };
}

/**
 * Map a stored credential row to the ScrapeAuth the branch selector consumes, or null when the row
 * offers nothing usable (no valid encrypted blob AND no live cookie). An EXPIRED session cookie is
 * dropped here (not forwarded) so the branch selector falls back to a fresh headless login instead of
 * replaying a dead cookie. `nowMs` is injected so this is a pure function of its inputs.
 */
export function rowToScrapeAuth(row: CredentialRow, nowMs: number): ScrapeAuth | null {
  const encryptedCredential = parseEncryptedCredential(row.encryptedCredential);

  const expiresAtMs = row.sessionCookieExpiresAt ? row.sessionCookieExpiresAt.getTime() : null;
  const cookieLive =
    row.sessionCookie !== null &&
    row.sessionCookie.length > 0 &&
    (expiresAtMs === null || expiresAtMs > nowMs);
  const sessionCookie = cookieLive ? row.sessionCookie : null;
  const sessionCookieExpiresAt = cookieLive ? expiresAtMs : null;

  if (!encryptedCredential && !sessionCookie) return null;
  return { encryptedCredential, sessionCookie, sessionCookieExpiresAt };
}

/**
 * Encrypt + persist a grower's portal login for a farm (the capture path). Upserts the single
 * (farmId, portal) row and CLEARS any stored session cookie — re-entering credentials means the old
 * session most likely failed, so the next sync should do a fresh login rather than replay a dead
 * cookie. The plaintext credential is encrypted before the write and never logged.
 */
export async function saveGrowerPortalCredential(
  prisma: PrismaClient,
  farmId: string,
  credential: GrowerCredential,
): Promise<void> {
  const encrypted = encryptCredential(credential);
  await withFarmTenant(prisma, farmId, (tx) =>
    tx.growerPortalCredential.upsert({
      where: { farmId_portal: { farmId, portal: PORTAL_ALMOND_LOGIC } },
      create: {
        farmId,
        portal: PORTAL_ALMOND_LOGIC,
        encryptedCredential: encrypted,
        sessionCookie: null,
        sessionCookieExpiresAt: null,
      },
      update: {
        encryptedCredential: encrypted,
        sessionCookie: null,
        sessionCookieExpiresAt: null,
      },
    }),
  );
}

/**
 * Resolve the ScrapeAuth for a farm's portal, or null when no usable credential/cookie is stored.
 * The single seam the crop-scrape agent + prod sync route call to decide whether a live scrape is
 * even possible for a farm. Decryption does NOT happen here — only inside the Sandbox at moment of use.
 */
export async function resolveScrapeAuth(
  prisma: PrismaClient,
  farmId: string,
  nowMs: number = Date.now(),
): Promise<ScrapeAuth | null> {
  const row = await withFarmTenant(prisma, farmId, (tx) =>
    tx.growerPortalCredential.findUnique({
      where: { farmId_portal: { farmId, portal: PORTAL_ALMOND_LOGIC } },
      select: { encryptedCredential: true, sessionCookie: true, sessionCookieExpiresAt: true },
    }),
  );
  if (!row) return null;
  return rowToScrapeAuth(row, nowMs);
}

/**
 * Persist/refresh the reusable session cookie after a successful login, so most subsequent syncs
 * replay the cookie (cookie_forward branch) instead of re-authenticating. Only updates an existing
 * row (a cookie without a captured credential is meaningless), leaving the encrypted credential
 * untouched. The cookie value is never logged.
 */
export async function persistSessionCookie(
  prisma: PrismaClient,
  farmId: string,
  sessionCookie: string,
  sessionCookieExpiresAt: Date | null,
): Promise<void> {
  await withFarmTenant(prisma, farmId, (tx) =>
    tx.growerPortalCredential.update({
      where: { farmId_portal: { farmId, portal: PORTAL_ALMOND_LOGIC } },
      data: { sessionCookie, sessionCookieExpiresAt },
    }),
  );
}
