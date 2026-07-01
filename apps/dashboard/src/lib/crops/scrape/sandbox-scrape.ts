// The REAL `scrape` step body. Hard rules this file enforces:
//   1. Chromium / any headless browser runs ONLY inside a Vercel Sandbox — never a normal function.
//      The live branch creates a Sandbox (via the shared client) and would drive the browser there.
//   2. Grower credentials are decrypted at the MOMENT OF USE, inside the Sandbox, and NEVER logged
//      (mirrors src/lib/ai/gateway.ts's never-log-the-value discipline).
//   3. Raw scraped pages go to R2 (object storage), NEVER Postgres.
//
// Callability without creds: `scrape()` is safe to call in dev/CI. With no Sandbox creds OR no
// CROP_CRED_ENC_KEY it returns the committed fixture pages (the STUB) and writes nothing. The live
// path is gated behind hasSandboxCredentials() + key presence + an injected ObjectStore. The actual
// browser/network fetch is the one piece left STUBBED here (a clearly-marked TODO) so this file is
// importable and runnable everywhere; everything around it (gating, branch selection, decrypt
// shape, R2 write) is real.

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Sandbox } from "@vercel/sandbox";
import { createSandbox, hasSandboxCredentials, withSandboxCleanupAsync } from "@/lib/sandbox/client";
import type { ObjectStore } from "@/lib/storage/object-store";
import { r2Configured, rawPageKey } from "@/lib/storage/r2";
import { selectScrapeBranch, type ScrapeAuthState, type ScrapeBranch } from "./branch";
import { reconcilingFixturePages } from "./fixtures";
import { pageTransport, walkPortal, type PortalPage } from "./portal-walk";
import type { RawPage, ScrapeResult, ScrapeTarget } from "./types";

/** An encrypted credential blob as stored for a grower. The plaintext is NEVER held outside use. */
export type EncryptedCredential = {
  /** AES-256-GCM ciphertext (base64). */
  ciphertext: string;
  /** 12-byte IV (base64). */
  iv: string;
  /** 16-byte GCM auth tag (base64). */
  authTag: string;
};

/** The decrypted grower login, used for at most one headless login then dropped. Never logged. */
export type GrowerCredential = { username: string; password: string };

/**
 * What the live scrape needs about a grower at run time. The encrypted credential and/or a forwarded
 * cookie; both optional (the branch selector decides what is reachable). Nothing here is a plaintext
 * secret until `decryptCredential` runs inside the Sandbox.
 */
export type ScrapeAuth = {
  sessionCookie?: string | null;
  sessionCookieExpiresAt?: number | null;
  encryptedCredential?: EncryptedCredential | null;
};

export type ScrapeDeps = {
  /** Where raw pages are written. Injected so tests use MemoryObjectStore (no network). */
  objectStore: ObjectStore;
  /** What we hold for the grower. Optional — absent => stub. */
  auth?: ScrapeAuth;
  /** Injected clock for deterministic branch selection. Defaults to Date.now. */
  now?: () => number;
};

/** sha-256 hex of bytes. The R2 key is content-addressed on this. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Read + validate the 32-byte AES key from env CROP_CRED_ENC_KEY (base64). Shared by encrypt and
 * decrypt so they can never disagree on key handling. Throws (never returns a partial key) if the
 * env var is absent or the wrong length. The key value itself is never logged or returned to a log.
 */
function credentialKey(): Buffer {
  const keyB64 = process.env.CROP_CRED_ENC_KEY;
  if (!keyB64) {
    throw new Error("CROP_CRED_ENC_KEY not set: cannot use a grower credential");
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.byteLength !== 32) {
    throw new Error("CROP_CRED_ENC_KEY must be 32 bytes (base64)");
  }
  return key;
}

/**
 * Encrypt a grower credential for at-rest storage. AES-256-GCM with the key from CROP_CRED_ENC_KEY
 * and a fresh random 12-byte IV per call (so the same login encrypts to a different blob each time).
 * Returns the { ciphertext, iv, authTag } blob to persist in GrowerPortalCredential. The PLAINTEXT
 * credential passed in is never logged; it exists only long enough to encrypt. Inverse of
 * decryptCredential — a round-trip returns the original { username, password }.
 */
export function encryptCredential(credential: GrowerCredential): EncryptedCredential {
  const key = credentialKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(credential), "utf8")),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypt a grower credential at the MOMENT OF USE. AES-256-GCM with the key from env
 * CROP_CRED_ENC_KEY (32 bytes, base64). Throws if the key is absent or the blob is tampered (GCM
 * auth fails). The plaintext is returned to the immediate caller and must never be logged or stored;
 * callers use it for one login then let it go out of scope. The key value is never logged.
 */
export function decryptCredential(blob: EncryptedCredential): GrowerCredential {
  const key = credentialKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof (parsed as { username?: unknown }).username !== "string" ||
    typeof (parsed as { password?: unknown }).password !== "string"
  ) {
    throw new Error("decrypted credential has the wrong shape");
  }
  return {
    username: (parsed as { username: string }).username,
    password: (parsed as { password: string }).password,
  };
}

/** The auth state the branch selector consumes (presence-only view of ScrapeAuth). */
function authState(auth: ScrapeAuth | undefined): ScrapeAuthState {
  return {
    sessionCookie: auth?.sessionCookie ?? null,
    sessionCookieExpiresAt: auth?.sessionCookieExpiresAt ?? null,
    hasCredential: Boolean(auth?.encryptedCredential),
  };
}

/** Whether the LIVE scrape path is even possible: Sandbox creds + cred key + R2 all present. */
export function canRunLiveScrape(): boolean {
  return hasSandboxCredentials() && Boolean(process.env.CROP_CRED_ENC_KEY) && r2Configured();
}

/**
 * Persist captured pages to R2 (the only place raw bytes land). Content-addressed by sha so a
 * re-scrape of identical bytes is idempotent (same key, overwrite is a no-op write of the same
 * bytes). Returns the keys written.
 */
async function storePages(
  store: ObjectStore,
  target: ScrapeTarget,
  pages: readonly RawPage[],
): Promise<string[]> {
  const keys: string[] = [];
  for (const page of pages) {
    const ext = page.contentType.includes("pdf") ? "pdf" : "html";
    const key = rawPageKey(target.farmId, target.entityId, target.cropYear, page.sha, ext);
    await store.put(key, page.bytes, page.contentType);
    keys.push(key);
  }
  return keys;
}

/** Parse the growerId from the portal page URL (?growerId=NN), mirroring the local crawler. Defaults
 *  to "23" (the known grower) when absent, exactly as the local crawler does. */
export function growerIdFromUrl(url: string): string {
  return /growerId=(\d+)/.exec(url)?.[1] ?? "23";
}

/**
 * Acquire an AUTHENTICATED portal page inside the hosted browser — the ONE piece that needs the live
 * environment (a hosted Chromium reached over CDP, e.g. Browserbase, driven from the Sandbox) and so
 * cannot be exercised offline. For headless_login it decrypts the credential at the MOMENT OF USE
 * (never logged, never returned) to drive the login; for cookie_forward it replays the session cookie.
 * Everything DOWNSTREAM of the returned page (the portal-API walk, SVH filter, health guard, capture)
 * is implemented and unit-tested in portal-walk.ts. Throws until the hosted-browser transport is wired.
 */
async function openAuthenticatedPortalPage(
  _sandbox: Sandbox,
  branch: Exclude<ScrapeBranch, "unavailable">,
  auth: ScrapeAuth,
): Promise<PortalPage> {
  if (branch === "headless_login") {
    const blob = auth.encryptedCredential;
    if (!blob) throw new Error("headless_login branch without an encrypted credential");
    // Decrypt at the moment of use; `credential` stays local and is never logged or returned.
    const credential = decryptCredential(blob);
    void credential; // used by the (not-yet-wired) headless login below
  }
  // TODO(live): from inside `_sandbox`, connect to the hosted Chromium over CDP, replay the cookie
  // (cookie_forward) or perform the login (headless_login) with `credential`, navigate to the portal,
  // and return the authenticated Page (which satisfies PortalPage). walkPortal drives it from there.
  throw new Error(`hosted browser transport not yet wired for branch ${branch}`);
}

/**
 * Inside the Sandbox: open an authenticated portal page (the live-only seam above), then run the
 * deterministic, unit-tested portal-API walk over it — account enumeration, Sierra-Valley-Holding
 * filter + source-changed health guard, deliveries/runs for SVH at the target year, per-handler
 * assignments — and return the captured raw JSON pages (which sandbox-scrape then writes to R2).
 */
async function fetchPagesInSandbox(
  sandbox: Sandbox,
  branch: Exclude<ScrapeBranch, "unavailable">,
  auth: ScrapeAuth,
  target: ScrapeTarget,
): Promise<RawPage[]> {
  const page = await openAuthenticatedPortalPage(sandbox, branch, auth);
  const growerId = growerIdFromUrl(page.url());
  const transport = pageTransport(page);
  const result = await walkPortal(transport, { growerId, cropYear: target.cropYear });
  return result.pages;
}

/**
 * Scrape a grower's login-gated yield pages.
 *
 * Offline/stub (default in dev/CI, or whenever live is not possible): returns the committed
 * reconciling fixture pages and writes NOTHING. Zero external calls, zero credentials.
 *
 * Live (only when canRunLiveScrape() AND we hold reachable auth): selects cookie_forward vs
 * headless_login, opens a Sandbox, fetches the pages there (credential decrypted at moment of use),
 * writes the raw bytes to R2, and returns the pages + their R2 keys. Always stops the Sandbox.
 */
export async function scrape(target: ScrapeTarget, deps: ScrapeDeps): Promise<ScrapeResult> {
  const now = (deps.now ?? Date.now)();
  const branch = selectScrapeBranch(authState(deps.auth), now);

  // Fail closed to the stub unless the full live path is available and a branch is reachable.
  if (!canRunLiveScrape() || branch === "unavailable" || !deps.auth) {
    return { branch: "stub", pages: reconcilingFixturePages(), storedKeys: [] };
  }

  const auth = deps.auth;
  const pages = await withSandboxCleanupAsync(
    await createSandbox(),
    (sandbox) => fetchPagesInSandbox(sandbox, branch, auth, target),
  );
  const storedKeys = await storePages(deps.objectStore, target, pages);
  return { branch, pages, storedKeys };
}
