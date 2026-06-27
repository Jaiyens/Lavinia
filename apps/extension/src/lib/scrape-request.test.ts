import { describe, it, expect } from "vitest";
import { buildScrapeRequest } from "./scrape-request";

const URL = "https://app.almondlogic.example/grower/12345/loads";
const COOKIE = "session=abc123; csrf=tok-xyz";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const KEY = "fc-SUPER-SECRET-KEY";

describe("buildScrapeRequest", () => {
  it("puts the target url in body.url", () => {
    const body = buildScrapeRequest(URL, COOKIE, UA);
    expect(body.url).toBe(URL);
  });

  it("carries the cookie + UA in headers, not anywhere else", () => {
    const body = buildScrapeRequest(URL, COOKIE, UA);
    expect(body.headers.Cookie).toBe(COOKIE);
    expect(body.headers["User-Agent"]).toBe(UA);
  });

  it("requests markdown + html and stealth proxy with zero data retention", () => {
    const body = buildScrapeRequest(URL, COOKIE, UA);
    expect(body.formats).toEqual(["markdown", "html"]);
    expect(body.proxy).toBe("stealth");
    expect(body.onlyMainContent).toBe(true);
    expect(body.zeroDataRetention).toBe(true);
  });

  // HARD RULE 1: the secret key must never travel in the URL.
  it("never places the Firecrawl key in the url", () => {
    // The key is not even an argument to this function, but assert defensively
    // that nothing key-shaped leaks into the url under any code path.
    const body = buildScrapeRequest(URL, COOKIE, UA);
    expect(body.url).not.toContain(KEY);
    expect(body.url).not.toContain("fc-");
    expect(body.url.toLowerCase()).not.toContain("authorization");
    expect(body.url.toLowerCase()).not.toContain("api_key");
    expect(body.url.toLowerCase()).not.toContain("apikey");
  });

  // HARD RULE 1: the cookie (a credential) must never travel in the URL either.
  it("never places the cookie header in the url", () => {
    const body = buildScrapeRequest(URL, COOKIE, UA);
    expect(body.url).not.toContain(COOKIE);
    expect(body.url).not.toContain("session=");
    expect(body.url.toLowerCase()).not.toContain("cookie=");
  });
});
