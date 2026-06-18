/**
 * Almond abuse / cost protection (Story 10.3 — AR16, NFR1, ADR-A08).
 *
 * Epics 8/9 turned the chat route (`/api/almond/chat`) from a read-only assistant into a route that,
 * with a live Gateway key, costs model spend on every request AND (for an authed owner) writes a
 * private Blob object + a `GeneratedReport` row. This module is the build-time gate that makes that
 * endpoint safe to expose to a wide public Tour:
 *   - a PER-IP fixed-window limit guards the route itself (scripted request volume → a cheap 429), and
 *   - a PER-FARM generation throttle bounds how many heavy artifacts one farm can build in a window
 *     (protecting Blob/DB write volume and Gateway cost).
 *
 * HONEST LIMITATION: this is an IN-MEMORY limiter. On Vercel Fluid Compute, function instances are
 * reused across concurrent requests, so it genuinely throttles an abusive BURST within an instance —
 * a real first layer — but the counters are NOT shared across instances. Vercel BotID at the platform
 * edge is the complementary durable layer (enabled in the Vercel dashboard at deploy, no request-path
 * code change); a KV/Upstash-backed store is the documented upgrade path if cross-instance limits are
 * ever needed. Implemented in-app and dependency-free on purpose: the effort's hard law is ZERO
 * external calls in dev/CI (NFR3) and no new product dependency (NFR2). Pure and fully unit-testable.
 */

/** A fixed-window budget: at most `limit` calls per `windowMs` milliseconds, per key. */
export type RateLimitOptions = { limit: number; windowMs: number };

/** The outcome of one limit check. `retryAfterSeconds` is 0 when allowed, else a whole number of
 *  seconds (≥1) until the current window resets — surfaced as the route's `Retry-After` header. */
export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** One key's current window: when it started (ms) and how many calls have landed in it. */
type WindowState = { windowStart: number; count: number };

/** The per-config counter store. One store is dedicated to one `RateLimitOptions`, so every entry in
 *  a given store shares the same `windowMs`. */
export type RateLimitStore = Map<string, WindowState>;

/** Per-IP request budget for the chat route. A generous human ceiling: a grower asking questions and
 *  making the occasional file stays far below 30/min, while a scripted caller is cut off quickly.
 *  Env-tunable later; a sensible hardcoded default for v1. */
export const CHAT_RATE_LIMIT: RateLimitOptions = { limit: 30, windowMs: 60_000 };

/** Per-farm heavy-artifact (spreadsheet / PDF) budget. Bounds Blob/DB write volume and build/Gateway
 *  cost. 10/min is well above any real grower's pace of asking for files; a script generating in a
 *  loop is throttled. Env-tunable later; a sensible hardcoded default for v1. */
export const GENERATION_THROTTLE: RateLimitOptions = { limit: 10, windowMs: 60_000 };

/** Cap on distinct keys held in a store before an opportunistic sweep of expired windows runs, so a
 *  long-lived instance does not retain one entry per distinct IP forever. */
const MAX_STORE_KEYS = 10_000;

/** Drop every key whose window has fully expired. Called only when a store grows past the cap, so the
 *  common path stays O(1). */
function sweepExpired(store: RateLimitStore, nowMs: number, windowMs: number): void {
  for (const [key, state] of store) {
    if (nowMs - state.windowStart >= windowMs) store.delete(key);
  }
}

/**
 * The pure limit decision. Anchors each window at its first request; a call after the window has
 * elapsed starts a fresh one. The count is incremented on EVERY call — a denied call still counts, so
 * a caller hammering during a window stays blocked until it truly resets (the stricter, safer choice
 * for abuse protection). Pure given (`store`, `key`, `nowMs`, `opts`): no wall-clock read, so tests
 * drive it with an injected `nowMs`.
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
    // If the sweep freed nothing (a flood of distinct LIVE keys within one window), evict the OLDEST
    // entries (a Map preserves insertion order) down to the cap — NOT a full `clear()`. A full clear
    // would zero EVERY client's counter at once, re-arming offenders and innocents alike and making the
    // limiter flushable on demand; evicting only the stalest keys bounds memory while leaving the
    // most-recently-seen counters (the live traffic) intact. This request's decision is already computed
    // from the local `state` below, so eviction never changes the answer we return.
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

/** The first NON-EMPTY comma-hop of a header value, trimmed, or null. A leading comma / whitespace must
 *  not be read as a real hop (it would otherwise collapse callers into the wrong bucket). */
function firstHop(headerValue: string | null): string | null {
  if (headerValue === null) return null;
  const hop = headerValue
    .split(",")
    .map((h) => h.trim())
    .find((h) => h.length > 0);
  return hop ?? null;
}

/**
 * The caller's IP for per-IP rate-limiting. Prefers the headers the PLATFORM sets and a client cannot
 * spoof: `x-vercel-forwarded-for` (set by Vercel's edge) first, then `x-real-ip` (also platform-set to
 * the true client IP). Only when both are absent (e.g. local dev, or a non-Vercel front) does it fall
 * back to the first non-empty `x-forwarded-for` hop — the least trusted source, since its leftmost hop
 * is client-supplied (keying on it would let a caller rotate a fake IP per request to mint a fresh
 * budget). Last resort is the literal `"unknown"` (a missing IP is rare on Vercel; all unknowns share
 * one bucket rather than each sailing past the limit). Never used for scope or auth — only a limit key.
 */
export function clientIp(headers: Headers): string {
  return (
    firstHop(headers.get("x-vercel-forwarded-for")) ??
    firstHop(headers.get("x-real-ip")) ??
    firstHop(headers.get("x-forwarded-for")) ??
    "unknown"
  );
}

// --- Process-singleton wrappers ----------------------------------------------------------------
//
// One store per budget, held for the life of the instance. The wrappers default `nowMs` to the real
// clock; tests pass an explicit `nowMs` (and call `resetRateLimits()`) for determinism.

const chatStore: RateLimitStore = new Map();
const generationStore: RateLimitStore = new Map();

/** Per-IP check for the chat route. Call once at the top of the handler with the resolved client IP. */
export function checkChatRateLimit(ip: string, nowMs: number = Date.now()): RateLimitDecision {
  return checkFixedWindow(chatStore, ip, nowMs, CHAT_RATE_LIMIT);
}

/** Per-farm check for the heavy generation skills. Call once at each skill call-site before building. */
export function checkGenerationThrottle(farmId: string, nowMs: number = Date.now()): RateLimitDecision {
  return checkFixedWindow(generationStore, farmId, nowMs, GENERATION_THROTTLE);
}

/** Clear both singleton stores. A test hook so suites that drive the throttled skills stay isolated. */
export function resetRateLimits(): void {
  chatStore.clear();
  generationStore.clear();
}
