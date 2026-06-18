import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import {
  CHAT_RATE_LIMIT,
  GENERATION_THROTTLE,
  checkChatRateLimit,
  checkFixedWindow,
  checkGenerationThrottle,
  clientIp,
  resetRateLimits,
  type RateLimitStore,
} from "./rate-limit";
import { exportSpreadsheetSkill, generateReportSkill } from "./tools";

// Story 10.3 — the pure abuse/cost limiter. Every case drives an INJECTED clock (`nowMs`) so there is
// no wall-clock flakiness and zero external calls (NFR3). The singleton wrappers are reset between
// cases that share them.

describe("checkFixedWindow (pure)", () => {
  const opts = { limit: 3, windowMs: 1000 };

  it("allows up to the limit within one window, then denies", () => {
    const store: RateLimitStore = new Map();
    expect(checkFixedWindow(store, "k", 0, opts).allowed).toBe(true); // 1
    expect(checkFixedWindow(store, "k", 100, opts).allowed).toBe(true); // 2
    expect(checkFixedWindow(store, "k", 200, opts).allowed).toBe(true); // 3
    expect(checkFixedWindow(store, "k", 300, opts).allowed).toBe(false); // 4 -> over
  });

  it("resets and allows again once the window has elapsed", () => {
    const store: RateLimitStore = new Map();
    checkFixedWindow(store, "k", 0, opts);
    checkFixedWindow(store, "k", 0, opts);
    checkFixedWindow(store, "k", 0, opts);
    expect(checkFixedWindow(store, "k", 500, opts).allowed).toBe(false); // still in window
    // The window started at 0; at 1000ms it has elapsed (>= windowMs), so a fresh window begins.
    expect(checkFixedWindow(store, "k", 1000, opts).allowed).toBe(true);
  });

  it("keeps counting denied calls so a hammering caller stays blocked through the window", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < 3; i++) checkFixedWindow(store, "k", 0, opts); // fill the budget
    // Repeated calls inside the same window all stay denied (the count keeps climbing; the window
    // anchor does not move forward).
    expect(checkFixedWindow(store, "k", 100, opts).allowed).toBe(false);
    expect(checkFixedWindow(store, "k", 900, opts).allowed).toBe(false);
    // Only when the original window (anchored at 0) elapses does it reset.
    expect(checkFixedWindow(store, "k", 1000, opts).allowed).toBe(true);
  });

  it("reports remaining counting down to zero (clamped)", () => {
    const store: RateLimitStore = new Map();
    expect(checkFixedWindow(store, "k", 0, opts).remaining).toBe(2);
    expect(checkFixedWindow(store, "k", 0, opts).remaining).toBe(1);
    expect(checkFixedWindow(store, "k", 0, opts).remaining).toBe(0);
    expect(checkFixedWindow(store, "k", 0, opts).remaining).toBe(0); // clamped, never negative
  });

  it("reports retryAfterSeconds: 0 when allowed, a positive whole number that shrinks toward the reset", () => {
    const store: RateLimitStore = new Map();
    expect(checkFixedWindow(store, "k", 0, opts).retryAfterSeconds).toBe(0);
    checkFixedWindow(store, "k", 0, opts);
    checkFixedWindow(store, "k", 0, opts); // budget now full (3 used)
    // Denied at 200ms: window ends at 1000ms, so ~0.8s remain -> ceil = 1s.
    expect(checkFixedWindow(store, "k", 200, opts).retryAfterSeconds).toBe(1);
    // A longer window makes the gap obvious and integral.
    const wide: RateLimitStore = new Map();
    const wideOpts = { limit: 1, windowMs: 10_000 };
    checkFixedWindow(wide, "k", 0, wideOpts); // uses the only token
    expect(checkFixedWindow(wide, "k", 2500, wideOpts).retryAfterSeconds).toBe(8); // ceil(7.5) = 8
  });

  it("isolates keys: two keys never share a budget", () => {
    const store: RateLimitStore = new Map();
    checkFixedWindow(store, "a", 0, opts);
    checkFixedWindow(store, "a", 0, opts);
    checkFixedWindow(store, "a", 0, opts);
    expect(checkFixedWindow(store, "a", 0, opts).allowed).toBe(false); // a is spent
    expect(checkFixedWindow(store, "b", 0, opts).allowed).toBe(true); // b is untouched
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip (the platform-trusted client IP) over x-forwarded-for when both are present", () => {
    // x-forwarded-for's leftmost hop is client-spoofable; x-real-ip is Vercel-set. The trusted one wins.
    const h = new Headers({
      "x-real-ip": "198.51.100.9",
      "x-forwarded-for": "1.2.3.4, 70.41.3.18",
    });
    expect(clientIp(h)).toBe("198.51.100.9");
  });

  it("uses x-real-ip when present (no forwarded header)", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.9" });
    expect(clientIp(h)).toBe("198.51.100.9");
  });

  it("falls back to the first hop of x-forwarded-for when x-real-ip is absent", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("trims whitespace around the forwarded value", () => {
    const h = new Headers({ "x-forwarded-for": "  203.0.113.7  " });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("skips an empty leading hop in x-forwarded-for instead of collapsing into the unknown bucket", () => {
    // A leading comma must not dump the caller into the shared 'unknown' bucket; take the first NON-EMPTY hop.
    const h = new Headers({ "x-forwarded-for": ", 203.0.113.7" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("returns 'unknown' when neither header is present", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("returns 'unknown' when x-forwarded-for is only empty hops", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " , , " }))).toBe("unknown");
  });
});

describe("singleton wrappers", () => {
  beforeEach(() => resetRateLimits());

  it("checkChatRateLimit denies after CHAT_RATE_LIMIT.limit requests from one IP, then resets after the window", () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < CHAT_RATE_LIMIT.limit; i++) {
      expect(checkChatRateLimit(ip, 0).allowed).toBe(true);
    }
    const denied = checkChatRateLimit(ip, 0);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    // A different IP is unaffected by the first IP's spend.
    expect(checkChatRateLimit("198.51.100.9", 0).allowed).toBe(true);
    // After the window elapses the original IP is allowed again.
    expect(checkChatRateLimit(ip, CHAT_RATE_LIMIT.windowMs).allowed).toBe(true);
  });

  it("checkGenerationThrottle denies after GENERATION_THROTTLE.limit artifacts for one farm, per-farm", () => {
    const farm = "farm_a";
    for (let i = 0; i < GENERATION_THROTTLE.limit; i++) {
      expect(checkGenerationThrottle(farm, 0).allowed).toBe(true);
    }
    expect(checkGenerationThrottle(farm, 0).allowed).toBe(false);
    // Another farm has its own budget.
    expect(checkGenerationThrottle("farm_b", 0).allowed).toBe(true);
    // The throttled farm recovers after the window.
    expect(checkGenerationThrottle(farm, GENERATION_THROTTLE.windowMs).allowed).toBe(true);
  });

  it("resetRateLimits clears both budgets", () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < CHAT_RATE_LIMIT.limit; i++) checkChatRateLimit(ip, 0);
    expect(checkChatRateLimit(ip, 0).allowed).toBe(false);
    resetRateLimits();
    expect(checkChatRateLimit(ip, 0).allowed).toBe(true);
  });
});

describe("the per-farm generation throttle wired into the skill wrappers", () => {
  beforeEach(() => resetRateLimits());
  // The throttle short-circuits BEFORE the loader touches prisma, so a never-used prisma is safe here:
  // if the wrapper failed to short-circuit it would deref undefined and throw, failing the test loudly.
  const deps = {
    prisma: undefined as unknown as PrismaClient,
    farmId: "farm_throttle",
    farmName: "Throttle Test Farm",
  };

  it("both file-skill wrappers return the calm busy line once the farm's shared budget is full, building nothing", async () => {
    // Spend the farm's generation budget on the same (default) clock the wrappers read.
    for (let i = 0; i < GENERATION_THROTTLE.limit; i++) checkGenerationThrottle(deps.farmId);

    const exported = await exportSpreadsheetSkill(deps, {});
    const reported = await generateReportSkill(deps, {});

    // Both share the one generationStore budget, so both are throttled — and both return the busy copy,
    // not a half-built file (the undefined prisma was never reached).
    expect(exported.kind).toBe("error");
    expect(reported.kind).toBe("error");
    if (exported.kind === "error") expect(exported.message).toBe(en.shell.almond.busy);
    if (reported.kind === "error") expect(reported.message).toBe(en.shell.almond.busy);
  });
});

describe("checkFixedWindow memory bound", () => {
  it("hard-clears the store when a flood of distinct live keys blows past the cap (no unbounded growth)", () => {
    // The cap is 10_000; a sweep cannot free live windows, so the safety valve must clear to bound memory.
    const store: RateLimitStore = new Map();
    const opts = { limit: 1, windowMs: 60_000 };
    // All within one window (nowMs constant), so none are sweepable — only the hard clear can bound it.
    for (let i = 0; i < 10_050; i++) checkFixedWindow(store, `ip-${i}`, 0, opts);
    expect(store.size).toBeLessThanOrEqual(10_000);
    // The decision for the triggering request is still computed correctly despite the clear.
    const decision = checkFixedWindow(store, "ip-after-clear", 0, opts);
    expect(decision.allowed).toBe(true);
  });
});
