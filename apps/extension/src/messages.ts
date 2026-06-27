// Shared message contract between the popup and the service worker.
// Pure types only — safe to import anywhere (no chrome.*, no side effects).

export const SCRAPE_REQUEST = "terra-probe/scrape-request" as const;

/** Popup -> service worker: "probe the current tab". */
export interface ScrapeRequestMessage {
  type: typeof SCRAPE_REQUEST;
}

/**
 * Service worker -> popup: the probe outcome.
 * NOTE: this NEVER carries the scraped body, cookies, or the key — only a
 * human-readable verdict. Keeping the payload free of secrets is part of the
 * "never logs cookies/keys" guarantee.
 */
export type ScrapeResultMessage =
  | { ok: true; verdict: "data" | "login_wall" }
  | { ok: false; error: string };

export function isScrapeRequest(msg: unknown): msg is ScrapeRequestMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === SCRAPE_REQUEST
  );
}
