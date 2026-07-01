// PURE, browser-free helper. No chrome.*, no network, no globals.
//
// SECURITY NOTE (Hard Rule 1 & 2):
//  - The Firecrawl API key is NEVER an argument here and NEVER lands in this
//    body. The key is an *Authorization* header the service worker attaches at
//    fetch time and immediately drops. This function only deals with the
//    cookie-forward payload.
//  - The cookie header is placed ONLY in `body.headers.Cookie`, never in
//    `body.url`. The included test asserts this invariant.
//  - This function does ZERO arithmetic and never inspects pounds/numbers. It
//    just shapes the request Firecrawl will execute on our behalf.

export interface FirecrawlScrapeBody {
  /** The page Firecrawl should fetch — the grower's current Almond Logic URL. */
  url: string;
  /** Headers Firecrawl forwards to the origin (carries the logged-in session). */
  headers: Record<string, string>;
  /** Return markdown + raw html so the (server-side) gate can classify later. */
  formats: string[];
  /** Route through Firecrawl's residential/stealth proxy to look like a browser. */
  proxy: "stealth";
  /** Don't follow links; this is a single-page portability probe. */
  onlyMainContent: boolean;
  /** Privacy: tell Firecrawl to retain nothing after the response. */
  zeroDataRetention: boolean;
}

/**
 * Build the JSON body for a Firecrawl `POST /v1/scrape` request that forwards
 * the grower's logged-in session via a `Cookie` header.
 *
 * @param url          The current tab's URL (the page to probe).
 * @param cookieHeader Pre-assembled `Cookie` header value (see buildCookieHeader).
 * @param userAgent    UA string that MUST match the browser that produced the
 *                     cookies, or the origin may reject the session.
 */
export function buildScrapeRequest(
  url: string,
  cookieHeader: string,
  userAgent: string,
): FirecrawlScrapeBody {
  return {
    url,
    headers: {
      Cookie: cookieHeader,
      "User-Agent": userAgent,
    },
    formats: ["markdown", "html"],
    proxy: "stealth",
    onlyMainContent: true,
    zeroDataRetention: true,
  };
}
