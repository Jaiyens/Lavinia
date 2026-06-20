import { afterEach, describe, expect, it } from "vitest";
import {
  CODE_REQUEST_LIMIT,
  CODE_VERIFY_LIMIT,
  checkCodeRequest,
  checkFixedWindow,
  checkVerifyAttempt,
  resetLoginRateLimits,
  resetVerifyAttempts,
  type RateLimitStore,
} from "./login-rate-limit";

// Singleton stores are process-wide; reset between tests so order never matters.
afterEach(() => resetLoginRateLimits());

describe("checkFixedWindow", () => {
  const opts = { limit: 3, windowMs: 1000 };

  it("allows up to `limit` calls then blocks within the window", () => {
    const store: RateLimitStore = new Map();
    expect(checkFixedWindow(store, "k", 0, opts).allowed).toBe(true); // 1
    expect(checkFixedWindow(store, "k", 10, opts).allowed).toBe(true); // 2
    const third = checkFixedWindow(store, "k", 20, opts);
    expect(third.allowed).toBe(true); // 3 (budget exactly spent)
    expect(third.remaining).toBe(0);
    const fourth = checkFixedWindow(store, "k", 30, opts);
    expect(fourth.allowed).toBe(false); // 4 blocked
    expect(fourth.retryAfterSeconds).toBe(1);
  });

  it("starts a fresh window once windowMs elapses", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < 3; i++) checkFixedWindow(store, "k", 0, opts);
    expect(checkFixedWindow(store, "k", 500, opts).allowed).toBe(false); // still in window
    expect(checkFixedWindow(store, "k", 1000, opts).allowed).toBe(true); // window reset
  });

  it("a denied call still counts, so a caller stays blocked until a true reset", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < 5; i++) checkFixedWindow(store, "k", 0, opts); // 3 allowed + 2 denied
    expect(checkFixedWindow(store, "k", 999, opts).allowed).toBe(false); // window not yet elapsed
  });

  it("keys are independent buckets", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < 3; i++) checkFixedWindow(store, "a", 0, opts);
    expect(checkFixedWindow(store, "a", 0, opts).allowed).toBe(false);
    expect(checkFixedWindow(store, "b", 0, opts).allowed).toBe(true);
  });
});

describe("checkVerifyAttempt (per-email brute-force budget)", () => {
  it("gives exactly 5 tries per email, then blocks", () => {
    expect(CODE_VERIFY_LIMIT.limit).toBe(5);
    const email = "grower@example.com";
    for (let i = 0; i < 5; i++) expect(checkVerifyAttempt(email, 0).allowed).toBe(true);
    expect(checkVerifyAttempt(email, 0).allowed).toBe(false);
  });

  it("normalizes the email key (case + surrounding whitespace share one budget)", () => {
    for (let i = 0; i < 5; i++) checkVerifyAttempt("Grower@Example.com", 0);
    expect(checkVerifyAttempt("  grower@example.com ", 0).allowed).toBe(false);
  });

  it("resetVerifyAttempts hands a fresh set of tries (a new code = fresh budget)", () => {
    const email = "a@b.com";
    for (let i = 0; i < 5; i++) checkVerifyAttempt(email, 0);
    expect(checkVerifyAttempt(email, 0).allowed).toBe(false);
    resetVerifyAttempts(email);
    for (let i = 0; i < 5; i++) expect(checkVerifyAttempt(email, 0).allowed).toBe(true);
    expect(checkVerifyAttempt(email, 0).allowed).toBe(false);
  });
});

describe("checkCodeRequest (per-email send budget)", () => {
  it("bounds sends per email, then blocks", () => {
    expect(CODE_REQUEST_LIMIT.limit).toBe(5);
    const email = "e@f.com";
    for (let i = 0; i < 5; i++) expect(checkCodeRequest(email, 0).allowed).toBe(true);
    expect(checkCodeRequest(email, 0).allowed).toBe(false);
  });

  it("is a separate store from the verify budget", () => {
    const email = "c@d.com";
    for (let i = 0; i < 5; i++) checkVerifyAttempt(email, 0); // spend verify budget
    expect(checkVerifyAttempt(email, 0).allowed).toBe(false);
    expect(checkCodeRequest(email, 0).allowed).toBe(true); // send budget untouched
  });

  it("resetVerifyAttempts does NOT reset the send budget (resend-reset loop stays bounded)", () => {
    const email = "g@h.com";
    for (let i = 0; i < 5; i++) checkCodeRequest(email, 0);
    resetVerifyAttempts(email);
    expect(checkCodeRequest(email, 0).allowed).toBe(false);
  });
});
