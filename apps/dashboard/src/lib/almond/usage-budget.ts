/**
 * Almond's DURABLE per-user token budget (the un-bypassable cost ceiling).
 *
 * The in-memory limiters in `rate-limit.ts` are a per-instance burst guard that resets on every
 * restart/redeploy and does not span Vercel instances. This module is the COMPLEMENTARY durable
 * layer: a per-user token cap backed by Postgres rows (the `AlmondUsageEvent` table), keyed on the
 * immutable `User.id`. Because the count lives in the database — never the browser, never server
 * memory — a user cannot escape their own limit by reloading, restarting their machine, clearing
 * cookies, going incognito, switching devices, or landing on a different serverless instance: every
 * request re-reads the same ledger. (The one thing it does not stop is minting a brand-new account
 * with a different email — a Sybil concern bounded by verified-email sign-in + the access allowlist.)
 *
 * The flow is gate-before-spend, account-after:
 *   1. `checkUsageBudget` sums a user's tokens over the rolling window and is called at the top of
 *      the chat route BEFORE any model call — an over-budget user gets a 429 with zero Gateway spend.
 *   2. `recordUsage` writes one row per LLM turn AFTER it finishes (chat via the responder's
 *      `onFinish`, codegen after its `generateText`), so the next request sees the updated sum.
 *
 * Modeled on the repo's proven durable per-user throttle (src/lib/auth/join-request.ts), which counts
 * rows in a `createdAt > cutoff` window keyed on `userId` — here a SUM of tokens instead of a count.
 * The cap is a tunable env value with a placeholder default until pricing is set.
 */

import type { PrismaClient } from "@prisma/client";

/** The reset cadence. Rolling, not calendar: no timezone ambiguity and no midnight reset-cliff. */
export type UsageWindow = "daily" | "weekly";

/**
 * The per-user DAILY token cap (input + output, across chat and AI file exports).
 *
 * Default 2,000,000 tokens/day — deliberately generous so a heavy grower never hits it (a 200-meter
 * farm's context makes a substantive turn ~15-30k tokens, so 2M/day is ~70-130 turns plus exports,
 * well above any real day's use), while still bounding runaway/abuse. Worst case, a user who pinned
 * the full 2M every single day costs roughly $18/day blended at Opus-tier rates (~1.6M in x $5/M +
 * ~0.4M out x $25/M), about a farmer's annual plan price at full abuse — and real expected use (a few
 * dollars a day) leaves a wide margin. Tune `ALMOND_USAGE_TOKEN_CAP` in the Vercel env once pricing
 * is finalized; this is a sane default, not a final business decision.
 */
export const USAGE_TOKEN_CAP = Number(process.env.ALMOND_USAGE_TOKEN_CAP) || 2_000_000;

/** Reset cadence. Daily by default; set `ALMOND_USAGE_WINDOW=weekly` to switch with no migration. */
export const USAGE_WINDOW: UsageWindow = process.env.ALMOND_USAGE_WINDOW === "weekly" ? "weekly" : "daily";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The rolling window length in ms, derived from `USAGE_WINDOW`. */
export const USAGE_WINDOW_MS = USAGE_WINDOW === "weekly" ? 7 * DAY_MS : DAY_MS;

/**
 * Tokens charged when a live turn reports no usage at all (a provider that hides token counts).
 * Charging 0 in that case would be a silent bypass, so we charge a meaningful estimate and flag the
 * row `estimated`. Round toward over-charging — the safe direction for a cost ceiling.
 */
export const USAGE_ESTIMATE_FALLBACK_TOKENS = Number(process.env.ALMOND_USAGE_ESTIMATE_FALLBACK_TOKENS) || 2_000;

/**
 * Rough tokens for one substantive Almond turn over a large farm (a 200-meter farm's context plus a
 * few tool calls). Used ONLY to translate the token budget into a friendly "about N messages left"
 * count in the account usage meter — enforcement stays strictly token-based. Env-tunable.
 */
export const USAGE_TOKENS_PER_TURN = Number(process.env.ALMOND_USAGE_TOKENS_PER_TURN) || 20_000;

/**
 * Translate the token budget decision into the friendly, approximate message counts the usage meter
 * shows a grower. `fractionUsed` is clamped to [0,1]; `remaining` floors at 0 (and is 0 when denied).
 * Pure (no DB, no clock) for easy testing.
 */
export function usageMeterCounts(
  budget: UsageBudgetDecision,
  tokensPerTurn: number = USAGE_TOKENS_PER_TURN,
): { total: number; remaining: number; fractionUsed: number } {
  const perTurn = Math.max(1, tokensPerTurn);
  const total = Math.max(1, Math.round(budget.cap / perTurn));
  const fractionUsed = budget.cap > 0 ? Math.min(1, Math.max(0, budget.used / budget.cap)) : 0;
  const remaining = budget.allowed ? Math.max(0, Math.round(total * (1 - fractionUsed))) : 0;
  return { total, remaining, fractionUsed };
}

/** The outcome of one budget check. `retryAfterSeconds` is 0 when allowed; `resetAt` is an ISO string. */
export type UsageBudgetDecision = {
  allowed: boolean;
  used: number;
  cap: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: string;
  window: UsageWindow;
};

/** What `source` produced a usage row. String + union, matching the repo's union-as-String convention. */
export type AlmondUsageSource = "chat" | "codegen" | "bill_import";

/** One LLM turn's usage, handed to `recordUsage`. `userId` is the TRUE session user (never persist-gated). */
export type RecordUsageInput = {
  userId: string;
  farmId: string | null;
  source: AlmondUsageSource;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimated?: boolean;
};

/**
 * Normalize an AI SDK usage object into billable input/output token counts, applying the
 * hidden-usage estimate fallback in ONE place (shared by the chat responder and the codegen skills).
 * A turn that reports no tokens at all is charged `USAGE_ESTIMATE_FALLBACK_TOKENS` and flagged
 * `estimated`, so a provider that hides token counts cannot zero-charge its way around the cap.
 * Typed structurally (no `ai` import) so this module stays free of the SDK.
 */
export function billableTokens(usage: { inputTokens?: number; outputTokens?: number } | undefined): {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
} {
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  if (inputTokens + outputTokens === 0) {
    return { inputTokens: USAGE_ESTIMATE_FALLBACK_TOKENS, outputTokens: 0, estimated: true };
  }
  return { inputTokens, outputTokens, estimated: false };
}

/**
 * The pure budget verdict: all the allow/deny + reset math given the summed usage. Kept free of the
 * clock and the DB (callers inject `nowMs` and the already-queried `used`/`oldestInWindowMs`) so it is
 * fully unit-testable like `checkFixedWindow`. Deny semantics: `used >= cap` denies — at or over the
 * cap, the user gets nothing.
 */
export function decideUsageBudget(args: {
  used: number;
  cap: number;
  windowMs: number;
  nowMs: number;
  window: UsageWindow;
  /** createdAt (ms) of the oldest event still inside the window, when known; drives a tighter resetAt. */
  oldestInWindowMs: number | null;
}): UsageBudgetDecision {
  const { used, cap, windowMs, nowMs, window, oldestInWindowMs } = args;
  const allowed = used < cap;
  const remaining = Math.max(0, cap - used);
  // When denied, the budget frees up as old usage ages out of the rolling window; the earliest that
  // begins is when the oldest counted event rolls off (oldest + windowMs). Falling back to a full
  // window from now is the safe upper bound. Retrying early is harmless: the gate denies again with no
  // spend, so a slightly-early Retry-After only costs a cheap 429, never money.
  const resetMs = allowed ? nowMs + windowMs : (oldestInWindowMs ?? nowMs) + windowMs;
  const retryAfterSeconds = allowed ? 0 : Math.max(60, Math.ceil((resetMs - nowMs) / 1000));
  return {
    allowed,
    used,
    cap,
    remaining,
    retryAfterSeconds,
    resetAt: new Date(resetMs).toISOString(),
    window,
  };
}

/** Sum a user's counted tokens inside the rolling window. Served entirely by `@@index([userId, createdAt])`. */
async function sumTokensInWindow(prisma: PrismaClient, userId: string, sinceMs: number): Promise<number> {
  const agg = await prisma.almondUsageEvent.aggregate({
    _sum: { totalTokens: true },
    where: { userId, createdAt: { gt: new Date(sinceMs) } },
  });
  return agg._sum.totalTokens ?? 0;
}

/**
 * Check a signed-in user's token budget for the current rolling window. Call at the top of the chat
 * route BEFORE constructing the model, so a denied user costs no Gateway spend. One aggregate read on
 * the hot (allowed) path; a denial does one extra tiny read for a tighter reset estimate.
 *
 * `nowMs` is injectable for tests; production passes the real clock.
 */
export async function checkUsageBudget(
  prisma: PrismaClient,
  userId: string,
  nowMs: number = Date.now(),
  cap: number = USAGE_TOKEN_CAP,
  windowMs: number = USAGE_WINDOW_MS,
): Promise<UsageBudgetDecision> {
  const sinceMs = nowMs - windowMs;
  const used = await sumTokensInWindow(prisma, userId, sinceMs);
  let oldestInWindowMs: number | null = null;
  if (used >= cap) {
    const oldest = await prisma.almondUsageEvent.findFirst({
      where: { userId, createdAt: { gt: new Date(sinceMs) } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    oldestInWindowMs = oldest ? oldest.createdAt.getTime() : null;
  }
  return decideUsageBudget({ used, cap, windowMs, nowMs, window: USAGE_WINDOW, oldestInWindowMs });
}

/**
 * Record one LLM turn's token usage (the accounting half of the budget). Best-effort: a write failure
 * is logged and swallowed so it never breaks a turn the user already received — a persistent failure
 * under-counts (the user keeps working), never over-charges. A zero-token turn (the offline stub, or a
 * no-op) writes nothing. Negative/NaN inputs are clamped to 0.
 */
export async function recordUsage(prisma: PrismaClient, input: RecordUsageInput): Promise<void> {
  const inputTokens = Math.max(0, Math.round(input.inputTokens || 0));
  const outputTokens = Math.max(0, Math.round(input.outputTokens || 0));
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens === 0) return;
  try {
    await prisma.almondUsageEvent.create({
      data: {
        userId: input.userId,
        farmId: input.farmId,
        source: input.source,
        model: input.model,
        inputTokens,
        outputTokens,
        totalTokens,
        estimated: input.estimated ?? false,
      },
    });
  } catch (err) {
    console.error("[almond-usage] record failed:", err instanceof Error ? err.message : err);
  }
}
