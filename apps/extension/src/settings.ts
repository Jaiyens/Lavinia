// Settings persisted in chrome.storage.local. Centralized so the options page
// and the service worker agree on key names.
//
// SECURITY NOTE (Hard Rule 1): the Firecrawl key lives ONLY in
// chrome.storage.local under FIRECRAWL_KEY. It is read into a local const at
// call time, attached as an Authorization header, and dropped. It is never
// logged, never written to a file, never put in a URL.

export const FIRECRAWL_KEY = "firecrawlApiKey" as const;
export const ALMOND_HOST = "almondLogicHost" as const;

export interface ProbeSettings {
  firecrawlApiKey: string;
  /** Bare host, e.g. "app.almondlogic.example" (no scheme, no path). */
  almondLogicHost: string;
}

/**
 * Normalize whatever the user typed into a bare host (strip scheme / path /
 * trailing slash). Pure — exported mainly so it could be unit-tested later.
 */
export function normalizeHost(input: string): string {
  let h = input.trim();
  h = h.replace(/^https?:\/\//i, "");
  h = h.replace(/\/.*$/, "");
  return h.toLowerCase();
}
