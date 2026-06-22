import { describe, expect, it } from "vitest";
import { billableTokens, decideUsageBudget, USAGE_ESTIMATE_FALLBACK_TOKENS } from "./usage-budget";

/**
 * Pure (no DB, no clock) tests of the per-user budget MATH and the usage normalization, mirroring the
 * `checkFixedWindow` pure-fn style (inject `nowMs`). The DB round-trip that proves durability lives in
 * usage-budget.db.test.ts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // a fixed instant; the math never reads the real clock

describe("decideUsageBudget", () => {
  it("allows when usage is under the cap and reports remaining", () => {
    const d = decideUsageBudget({
      used: 40_000,
      cap: 100_000,
      windowMs: DAY_MS,
      nowMs: NOW,
      window: "daily",
      oldestInWindowMs: null,
    });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(60_000);
    expect(d.retryAfterSeconds).toBe(0);
    expect(d.window).toBe("daily");
  });

  it("DENIES at exactly the cap (used >= cap means nothing)", () => {
    const d = decideUsageBudget({
      used: 100_000,
      cap: 100_000,
      windowMs: DAY_MS,
      nowMs: NOW,
      window: "daily",
      oldestInWindowMs: NOW - 3 * 60 * 60 * 1000, // 3h ago
    });
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
  });

  it("denies when over the cap and sets retryAfter from the oldest in-window event aging out", () => {
    const oldest = NOW - 6 * 60 * 60 * 1000; // 6h ago
    const d = decideUsageBudget({
      used: 150_000,
      cap: 100_000,
      windowMs: DAY_MS,
      nowMs: NOW,
      window: "daily",
      oldestInWindowMs: oldest,
    });
    expect(d.allowed).toBe(false);
    // resetAt = oldest + windowMs => 18h from now => 64800s, well above the 60s floor.
    expect(new Date(d.resetAt).getTime()).toBe(oldest + DAY_MS);
    expect(d.retryAfterSeconds).toBe(Math.ceil((oldest + DAY_MS - NOW) / 1000));
  });

  it("falls back to a full window from now when no oldest event is known", () => {
    const d = decideUsageBudget({
      used: 200_000,
      cap: 100_000,
      windowMs: DAY_MS,
      nowMs: NOW,
      window: "weekly",
      oldestInWindowMs: null,
    });
    expect(d.allowed).toBe(false);
    expect(new Date(d.resetAt).getTime()).toBe(NOW + DAY_MS);
    expect(d.window).toBe("weekly");
  });

  it("never reports a retryAfter below the 60s floor", () => {
    // An oldest event that already aged out would compute a negative wait; the floor keeps it sane.
    const d = decideUsageBudget({
      used: 100_000,
      cap: 100_000,
      windowMs: DAY_MS,
      nowMs: NOW,
      window: "daily",
      oldestInWindowMs: NOW - DAY_MS + 1_000, // resets in ~1s
    });
    expect(d.retryAfterSeconds).toBe(60);
  });
});

describe("billableTokens", () => {
  it("passes real input/output through and is not flagged estimated", () => {
    expect(billableTokens({ inputTokens: 1_200, outputTokens: 800 })).toEqual({
      inputTokens: 1_200,
      outputTokens: 800,
      estimated: false,
    });
  });

  it("charges the fallback estimate when a turn reports no tokens at all", () => {
    expect(billableTokens({ inputTokens: 0, outputTokens: 0 })).toEqual({
      inputTokens: USAGE_ESTIMATE_FALLBACK_TOKENS,
      outputTokens: 0,
      estimated: true,
    });
  });

  it("charges the fallback estimate when usage is undefined", () => {
    expect(billableTokens(undefined)).toEqual({
      inputTokens: USAGE_ESTIMATE_FALLBACK_TOKENS,
      outputTokens: 0,
      estimated: true,
    });
  });

  it("treats a partial (input-only) usage as real, not estimated", () => {
    expect(billableTokens({ inputTokens: 500 })).toEqual({
      inputTokens: 500,
      outputTokens: 0,
      estimated: false,
    });
  });
});
