// Shared shapes for the crop scrape step. Kept in their own file so the workflow step
// (src/workflows/steps/scrape.ts) and the live Sandbox body (sandbox-scrape.ts) agree on the
// contract without a circular import.

/** One raw page captured from a grower's login-gated yield tool, before any extraction. */
export type RawPage = {
  /** The source URL the bytes came from (provenance; never a secret). */
  url: string;
  /** Stable hash of the bytes (sha-256 hex). The R2 key is derived from this. */
  sha: string;
  /** MIME type of the captured bytes. */
  contentType: string;
  /** The raw page bytes, exactly as fetched. These go to R2, never to Postgres. */
  bytes: Uint8Array;
};

/**
 * What the scrape step returns: the captured pages plus, when they were persisted, the R2 keys they
 * landed under. `storedKeys` is empty in the offline/stub path (no R2). The downstream extract step
 * reads `pages`; the keys are provenance the workflow can record.
 */
export type ScrapeResult = {
  branch: "cookie_forward" | "headless_login" | "unavailable" | "stub";
  pages: RawPage[];
  storedKeys: string[];
};

/** The grower + year + farm a scrape targets. farmId scopes the R2 key prefix and the tenant. */
export type ScrapeTarget = {
  farmId: string;
  entityId: string;
  cropYear: number;
};
