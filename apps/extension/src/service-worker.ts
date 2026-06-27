// MV3 background service worker. Orchestrates the one-time portability probe.
//
// THE THREE HARD RULES, enforced here:
//  1. NEVER logs the Firecrawl key or cookies. They are read into local consts
//     at call time, attached as headers, and dropped. There is no console.log
//     of `key`, `cookieHeader`, or any cookie object anywhere in this file.
//  2. NEVER does arithmetic on a pound value. This worker POSTs {url, headers}
//     to Firecrawl and classifies the response as data-vs-login_wall via a
//     string heuristic. It does nothing numeric with the returned markup.
//  3. NEVER becomes the production scraper. It imports nothing from
//     apps/dashboard, writes to no DB, and its only output is a status string.
//
// `@types/chrome` is the real type source (declared in package.json). In this
// worktree we cannot `npm install`, so chrome.* is typed by src/chrome-shim.d.ts.

import { buildCookieHeader } from "./lib/cookie";
import { buildScrapeRequest } from "./lib/scrape-request";
import { classifyResponse } from "./lib/classify";
import {
  SCRAPE_REQUEST,
  isScrapeRequest,
  type ScrapeResultMessage,
} from "./messages";
import { FIRECRAWL_KEY, ALMOND_HOST } from "./settings";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";

// UA that matches a modern desktop Chrome. Must align with the browser that
// produced the cookies, or the origin may reject the forwarded session.
const PROBE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isScrapeRequest(message)) return;
  // Returning true keeps the message channel open for the async sendResponse.
  void runProbe()
    .then((result) => sendResponse(result))
    .catch((err: unknown) => {
      // Surface only a generic error string — never the key, cookies, or body.
      const error = err instanceof Error ? err.message : "probe failed";
      sendResponse({ ok: false, error } satisfies ScrapeResultMessage);
    });
  return true;
});

async function runProbe(): Promise<ScrapeResultMessage> {
  // --- 1. Figure out the current tab URL --------------------------------
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tab?.url;
  if (!currentUrl) {
    return { ok: false, error: "No active tab URL to probe." };
  }

  // --- 2. Load settings (host + key) ------------------------------------
  const stored = await chrome.storage.local.get([FIRECRAWL_KEY, ALMOND_HOST]);
  const host: string = stored[ALMOND_HOST] ?? "";
  if (!host) {
    return {
      ok: false,
      error: "Set the Almond Logic host on the options page first.",
    };
  }

  // --- 3. Collect the logged-in session cookies for that host -----------
  // Held in a local const, forwarded as a header, never logged.
  const cookies = await chrome.cookies.getAll({ domain: host });
  const cookieHeader = buildCookieHeader(
    cookies.map((c: chrome.cookies.Cookie) => ({ name: c.name, value: c.value })),
  );
  if (!cookieHeader) {
    return {
      ok: false,
      error: `No cookies for ${host}. Log in to Almond Logic in this browser, then retry.`,
    };
  }

  // --- 4. Build the Firecrawl request body ------------------------------
  // Cookie + UA live ONLY in body.headers — never in body.url (see lib test).
  const body = buildScrapeRequest(currentUrl, cookieHeader, PROBE_USER_AGENT);

  // --- 5. POST to Firecrawl ---------------------------------------------
  // The key is read here, used as an Authorization header, and dropped when
  // this function returns. It is NEVER logged or placed in the URL.
  const key: string = stored[FIRECRAWL_KEY] ?? "";
  if (!key) {
    return {
      ok: false,
      error: "Set the Firecrawl API key on the options page first.",
    };
  }

  const res = await fetch(FIRECRAWL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Report status only — not the response body (could echo headers).
    return { ok: false, error: `Firecrawl returned HTTP ${res.status}.` };
  }

  // --- 6. Classify the returned markup ----------------------------------
  // Pure string heuristic. ZERO arithmetic. We pull markdown/html text out of
  // the Firecrawl envelope and ask: did our data travel, or a login wall?
  const json: unknown = await res.json();
  const markup = extractMarkup(json);
  const verdict = classifyResponse(markup);

  return { ok: true, verdict };
}

/**
 * Pull the human-readable markup out of a Firecrawl /scrape envelope, tolerating
 * both `{ data: { markdown, html } }` and a flatter shape. Returns "" if neither
 * is present (classifyResponse treats "" as a login wall).
 */
function extractMarkup(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const root = json as Record<string, unknown>;
  const data =
    typeof root.data === "object" && root.data !== null
      ? (root.data as Record<string, unknown>)
      : root;
  const md = typeof data.markdown === "string" ? data.markdown : "";
  const html = typeof data.html === "string" ? data.html : "";
  return `${md}\n${html}`;
}

// Keep the constant referenced so an unused-import lint never tempts a refactor
// that breaks the popup<->worker contract.
export const PROBE_MESSAGE_TYPE = SCRAPE_REQUEST;
