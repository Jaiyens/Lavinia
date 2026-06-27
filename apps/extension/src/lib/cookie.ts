// PURE, browser-free helpers. No chrome.*, no network, no globals.
// Kept here so they can be unit-tested in plain Node (see cookie.test.ts).
//
// SECURITY NOTE (Hard Rule 1): these functions only *shape* a cookie string.
// They never log it. Callers must keep the result in a local const, attach it
// as a header, and drop it. Nothing here writes to disk, a URL, or console.*.

export interface CookiePair {
  name: string;
  value: string;
}

/**
 * Assemble a single `Cookie` request-header value from a list of cookies.
 *
 * RFC 6265 cookie-string form: `name1=value1; name2=value2`.
 * - Skips entries with an empty name (a value-less cookie is not representable).
 * - De-duplicates by name, keeping the LAST occurrence (matches how a browser
 *   would resolve the most-specific cookie last in chrome.cookies.getAll order).
 * - Does NOT url-encode: chrome.cookies returns the raw stored value, which is
 *   what the origin server set and expects back verbatim.
 */
export function buildCookieHeader(cookies: CookiePair[]): string {
  const byName = new Map<string, string>();
  for (const c of cookies) {
    if (!c || typeof c.name !== "string" || c.name.length === 0) continue;
    byName.set(c.name, c.value ?? "");
  }
  return Array.from(byName.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
