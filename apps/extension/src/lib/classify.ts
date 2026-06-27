// PURE, browser-free helper. No chrome.*, no network, no globals.
//
// SECURITY NOTE (Hard Rule 2): this is the WHOLE job of the probe — decide
// "did our data travel, or did we hit a login wall?". It does a STRING
// heuristic only. It performs NO arithmetic, never parses a pound value, never
// touches a number. The pound-gate is server-side (Phase 4) and lives nowhere
// near this extension.

export type ScrapeClassification = "data" | "login_wall";

// Substrings that strongly indicate the cookie-forward session FAILED and
// Firecrawl landed on an authentication / login page instead of the grower's
// data. Lowercased before matching.
const LOGIN_WALL_SIGNALS: readonly string[] = [
  "sign in",
  "sign-in",
  "signin",
  "log in",
  "log-in",
  "login",
  "logon",
  "password",
  "forgot your password",
  "forgot password",
  "remember me",
  "session expired",
  "session has expired",
  "your session has timed out",
  "please authenticate",
  "you must be logged in",
  "access denied",
  "unauthorized",
  'type="password"',
  "name=\"password\"",
  "id=\"password\"",
];

/**
 * Classify a scraped page body as the grower's real data vs. a login wall.
 *
 * Heuristic, intentionally conservative:
 *  - Empty / whitespace-only bodies are treated as a login wall (nothing
 *    traveled, so the session almost certainly failed).
 *  - If the body contains a recognizable login/auth signal, it's a login_wall.
 *  - Otherwise we assume our data traveled.
 *
 * This deliberately errs toward "login_wall" on ambiguous input: a false
 * "login_wall" just prompts a human to re-check, whereas a false "data" would
 * wrongly declare the probe a success.
 */
export function classifyResponse(body: string): ScrapeClassification {
  if (typeof body !== "string" || body.trim().length === 0) {
    return "login_wall";
  }
  const haystack = body.toLowerCase();
  for (const signal of LOGIN_WALL_SIGNALS) {
    if (haystack.includes(signal)) {
      return "login_wall";
    }
  }
  return "data";
}
