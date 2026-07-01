import { describe, expect, it } from "vitest";
import { isCookieUsable, selectScrapeBranch, type ScrapeAuthState } from "./branch";

const NOW = 1_700_000_000_000;

describe("isCookieUsable", () => {
  it("is true for a non-empty cookie that expires in the future", () => {
    const state: ScrapeAuthState = {
      sessionCookie: "sid=abc",
      sessionCookieExpiresAt: NOW + 1_000,
      hasCredential: false,
    };
    expect(isCookieUsable(state, NOW)).toBe(true);
  });

  it("is false for an expired cookie", () => {
    const state: ScrapeAuthState = {
      sessionCookie: "sid=abc",
      sessionCookieExpiresAt: NOW - 1,
      hasCredential: false,
    };
    expect(isCookieUsable(state, NOW)).toBe(false);
  });

  it("is false for an empty/whitespace cookie", () => {
    expect(isCookieUsable({ sessionCookie: "   ", sessionCookieExpiresAt: NOW + 1_000, hasCredential: false }, NOW)).toBe(false);
    expect(isCookieUsable({ sessionCookie: "", sessionCookieExpiresAt: NOW + 1_000, hasCredential: false }, NOW)).toBe(false);
    expect(isCookieUsable({ sessionCookie: null, sessionCookieExpiresAt: NOW + 1_000, hasCredential: false }, NOW)).toBe(false);
  });

  it("is false when the expiry is unknown", () => {
    expect(isCookieUsable({ sessionCookie: "sid=abc", sessionCookieExpiresAt: null, hasCredential: false }, NOW)).toBe(false);
    expect(isCookieUsable({ sessionCookie: "sid=abc", hasCredential: false }, NOW)).toBe(false);
  });
});

describe("selectScrapeBranch", () => {
  it("prefers cookie_forward when a usable cookie exists (even if a credential is also held)", () => {
    const state: ScrapeAuthState = {
      sessionCookie: "sid=abc",
      sessionCookieExpiresAt: NOW + 60_000,
      hasCredential: true,
    };
    expect(selectScrapeBranch(state, NOW)).toBe("cookie_forward");
  });

  it("falls back to headless_login when the cookie is unusable but a credential is held", () => {
    const expired: ScrapeAuthState = {
      sessionCookie: "sid=abc",
      sessionCookieExpiresAt: NOW - 1,
      hasCredential: true,
    };
    expect(selectScrapeBranch(expired, NOW)).toBe("headless_login");

    const noCookie: ScrapeAuthState = { hasCredential: true };
    expect(selectScrapeBranch(noCookie, NOW)).toBe("headless_login");
  });

  it("is unavailable with neither a usable cookie nor a credential", () => {
    expect(selectScrapeBranch({ hasCredential: false }, NOW)).toBe("unavailable");
    expect(
      selectScrapeBranch(
        { sessionCookie: "sid=abc", sessionCookieExpiresAt: NOW - 1, hasCredential: false },
        NOW,
      ),
    ).toBe("unavailable");
  });
});
