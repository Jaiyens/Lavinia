/**
 * Login-code abuse protection. A 6-digit code is low entropy (1,000,000 combinations), so the
 * sign-in flow needs two per-email budgets on top of the short 10-min expiry:
 *   - a VERIFY budget caps how many codes one email may try (brute-force guard on
 *     /api/auth/callback/email), and
 *   - a REQUEST budget caps how many codes one email may be sent (mailbomb guard, and it closes
 *     the loop where "send a new code" would otherwise reset the verify budget without limit).
 *
 * This mirrors the in-memory fixed-window limiter pattern (checkFixedWindow + a per-budget
 * singleton store) used elsewhere in the app. HONEST LIMITATION: the counters live in process
 * memory, so on Vercel Fluid Compute they throttle a burst WITHIN a reused instance but are not
 * shared across instances. That is a real first layer; Vercel BotID at the platform edge is the
 * complementary durable layer (enabled in the dashboard at deploy, no request-path code change).
 * Pure and dependency-free on purpose so the core decision is fully unit-testable.
 */

/** A fixed-window budget: at most `limit` calls per `windowMs` milliseconds, per key. */
export type RateLimitOptions = { limit: number; windowMs: number };

/** The outcome of one limit check. `retryAfterSeconds` is 0 when allowed, else a whole number of
 *  seconds (>=1) until the current window resets. */
export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** One key's current window: when it started (ms) and how many calls have landed in it. */
type WindowState = { windowStart: number; count: number };

/** The per-budget counter store. Every entry in a given store shares the same `windowMs`. */
export type RateLimitStore = Map<string, WindowState>;

/** Verify budget: at most 5 code guesses per email per 10 minutes. Five real tries is plenty for
 *  a human fat-fingering a code; the 6th is refused and the code invalidated (see the route at
 *  app/(auth)/api/auth/[...nextauth]/route.ts). Window matches the code's 10-min life. */
export const CODE_VERIFY_LIMIT: RateLimitOptions = { limit: 5, windowMs: 10 * 60_000 };

/** Request (send) budget: at most 5 emailed codes per email per 10 minutes. Bounds mailbombing
 *  and the resend-reset loop. A real grower needs one or two; a script is cut off quickly. */
export const CODE_REQUEST_LIMIT: RateLimitOptions = { limit: 5, windowMs: 10 * 60_000 };

/** Cap on distinct keys held in a store before an opportunistic sweep of expired windows runs,
 *  so a long-lived instance does not retain one entry per distinct email forever. */
const MAX_STORE_KEYS = 10_000;

/** Drop every key whose window has fully expired. Called only when a store grows past the cap. */
function sweepExpired(store: RateLimitStore, nowMs: number, windowMs: number): void {
  for (const [key, state] of store) {
    if (nowMs - state.windowStart >= windowMs) store.delete(key);
  }
}

/**
 * The pure limit decision. Anchors each window at its first request; a call after the window has
 * elapsed starts a fresh one. The count is incremented on EVERY call - a denied call still counts,
 * so a caller hammering during a window stays blocked until it truly resets. Pure given
 * (`store`, `key`, `nowMs`, `opts`): no wall-clock read, so tests drive it with an injected `nowMs`.
 */
export function checkFixedWindow(
  store: RateLimitStore,
  key: string,
  nowMs: number,
  opts: RateLimitOptions,
): RateLimitDecision {
  const existing = store.get(key);
  const state: WindowState =
    existing === undefined || nowMs - existing.windowStart >= opts.windowMs
      ? { windowStart: nowMs, count: 0 }
      : existing;
  state.count += 1;
  store.set(key, state);

  if (store.size > MAX_STORE_KEYS) {
    sweepExpired(store, nowMs, opts.windowMs);
    // If the sweep freed nothing (a flood of distinct LIVE keys), evict the OLDEST entries (a Map
    // preserves insertion order) down to the cap - never a full clear() (that would re-arm every
    // offender at once). This request's decision is already computed from `state`, so eviction
    // never changes the answer we return.
    for (const k of store.keys()) {
      if (store.size <= MAX_STORE_KEYS) break;
      store.delete(k);
    }
  }

  const allowed = state.count <= opts.limit;
  const remaining = Math.max(0, opts.limit - state.count);
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((state.windowStart + opts.windowMs - nowMs) / 1000));
  return { allowed, remaining, retryAfterSeconds };
}

/** Canonical key for an email: lowercase + trim, matching Auth.js's identifier normalization so
 *  the budget for an address is the same no matter how the caller cased or spaced it. */
function emailKey(email: string): string {
  return email.toLowerCase().trim();
}

// --- Process-singleton wrappers -----------------------------------------------------------------
//
// One store per budget, held for the life of the instance. The wrappers default `nowMs` to the
// real clock; tests pass an explicit `nowMs` (and call `resetLoginRateLimits()`) for determinism.

const verifyStore: RateLimitStore = new Map();
const requestStore: RateLimitStore = new Map();

/** Count + check one code-verification attempt for `email`. Call once per attempt at the email
 *  callback; a non-allowed decision means the verify budget is spent (invalidate the code). */
export function checkVerifyAttempt(email: string, nowMs: number = Date.now()): RateLimitDecision {
  return checkFixedWindow(verifyStore, emailKey(email), nowMs, CODE_VERIFY_LIMIT);
}

/** Count + check one code-request (send) for `email`. Call once per "Send code" / "Send a new
 *  code". A non-allowed decision means too many codes were requested for this email recently. */
export function checkCodeRequest(email: string, nowMs: number = Date.now()): RateLimitDecision {
  return checkFixedWindow(requestStore, emailKey(email), nowMs, CODE_REQUEST_LIMIT);
}

/** Reset the VERIFY budget for one email. Called when a fresh code is minted (adapter
 *  createVerificationToken) so "Send a new code" gives a clean set of tries against the new code -
 *  guesses never carry over from a now-invalidated code. Does NOT touch the request budget. */
export function resetVerifyAttempts(email: string): void {
  verifyStore.delete(emailKey(email));
}

/** Clear both singleton stores. A test hook so suites stay isolated. */
export function resetLoginRateLimits(): void {
  verifyStore.clear();
  requestStore.clear();
}
