// The cookie-forward-vs-headless-login decision for the crop scrape, factored out PURE so it can be
// unit-tested without a Sandbox, a browser, or any credential. Given what we hold for a grower
// (a still-valid forwarded session cookie vs. nothing but a username/password), pick the cheapest
// path that can reach the page:
//
//   - "cookie_forward" — we have a non-expired session cookie; replay it, no login, no browser
//     keystrokes. Strongly preferred: it never re-enters the password and avoids tripping MFA.
//   - "headless_login" — no usable cookie but we DO have decryptable username/password; the Sandbox
//     drives a headless login. The credential is decrypted at the moment of use inside the Sandbox.
//   - "unavailable"    — we have neither a usable cookie nor a credential; the scrape cannot run and
//     the caller fails closed (never guesses, never logs the absent secret).
//
// Pure: no clock is read here. `now` is injected so "expired" is deterministic in tests.

export type ScrapeBranch = "cookie_forward" | "headless_login" | "unavailable";

/**
 * What we hold for one grower at decision time. All optional: a real run may have a cookie, a
 * credential, both, or neither. Values are opaque here (we never inspect the secret) — only their
 * presence and the cookie's expiry matter to the branch.
 */
export type ScrapeAuthState = {
  /** A forwarded session cookie, if we captured one. Empty/whitespace counts as absent. */
  sessionCookie?: string | null;
  /** Epoch ms when the cookie expires. null/undefined => unknown expiry, treated as NOT usable. */
  sessionCookieExpiresAt?: number | null;
  /** Whether we hold a decryptable username/password for a headless login. */
  hasCredential: boolean;
};

/** A cookie is usable iff it is a non-empty string with a known expiry strictly in the future. */
export function isCookieUsable(state: ScrapeAuthState, now: number): boolean {
  const cookie = state.sessionCookie;
  if (typeof cookie !== "string" || cookie.trim() === "") return false;
  const expiry = state.sessionCookieExpiresAt;
  if (typeof expiry !== "number") return false;
  return expiry > now;
}

/**
 * Choose the scrape branch. Cookie-forward wins whenever the cookie is usable (cheapest, no MFA
 * risk); else fall back to a headless login if we hold a credential; else unavailable. Pure given
 * `now`.
 */
export function selectScrapeBranch(state: ScrapeAuthState, now: number): ScrapeBranch {
  if (isCookieUsable(state, now)) return "cookie_forward";
  if (state.hasCredential) return "headless_login";
  return "unavailable";
}
