import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { checkUsageBudget, recordUsage } from "./usage-budget";

/**
 * Integration test for the durable per-user token budget over a throwaway Postgres database on the
 * local test cluster (src/test/pg-harness.ts), never dev/prod Neon. Authored for CI/e2e; not run in
 * the offline pass (local Postgres is unavailable). It proves the gate behaves as the cost ceiling:
 *  - recorded usage SUMS over the rolling window and allows under / denies at-or-over the cap;
 *  - events older than the window roll off;
 *  - one user's spend never counts against another (the budget is keyed on the immutable User.id);
 *  - a zero-token turn writes nothing; the estimate flag persists.
 * The "survives reload/restart" guarantee is structural: the count lives in these rows, so re-reading
 * the same table from any process/instance returns the same answer — that is what this exercises.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CAP = 100_000;
const USER_A = "usage_user_a";
const USER_B = "usage_user_b";

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  await prisma.user.create({ data: { id: USER_A, name: "Usage A" } });
  await prisma.user.create({ data: { id: USER_B, name: "Usage B" } });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

beforeEach(async () => {
  await prisma.almondUsageEvent.deleteMany({});
});

describe("recordUsage + checkUsageBudget", () => {
  it("sums a user's recorded tokens and allows under the cap", async () => {
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "chat",
      model: "anthropic/claude-opus-4.8",
      inputTokens: 20_000,
      outputTokens: 10_000,
    });
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "codegen",
      model: "anthropic/claude-sonnet-4.6",
      inputTokens: 15_000,
      outputTokens: 10_000,
    });

    const d = await checkUsageBudget(prisma, USER_A, Date.now(), CAP, DAY_MS);
    expect(d.used).toBe(55_000);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(45_000);
  });

  it("denies once the rolling sum reaches the cap and returns a Retry-After", async () => {
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "chat",
      model: "m",
      inputTokens: 60_000,
      outputTokens: 0,
    });
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "chat",
      model: "m",
      inputTokens: 60_000,
      outputTokens: 0,
    });

    const d = await checkUsageBudget(prisma, USER_A, Date.now(), CAP, DAY_MS);
    expect(d.used).toBe(120_000);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThanOrEqual(60);
    expect(Number.isNaN(new Date(d.resetAt).getTime())).toBe(false);
  });

  it("excludes events older than the window", async () => {
    // An event from two days ago, written directly so its createdAt predates the 1-day window.
    await prisma.almondUsageEvent.create({
      data: {
        userId: USER_A,
        source: "chat",
        model: "m",
        inputTokens: 999_999,
        outputTokens: 0,
        totalTokens: 999_999,
        createdAt: new Date(Date.now() - 2 * DAY_MS),
      },
    });
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "chat",
      model: "m",
      inputTokens: 5_000,
      outputTokens: 0,
    });

    const d = await checkUsageBudget(prisma, USER_A, Date.now(), CAP, DAY_MS);
    expect(d.used).toBe(5_000); // the ancient 999,999 row rolled off
    expect(d.allowed).toBe(true);
  });

  it("isolates one user's budget from another's", async () => {
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "chat",
      model: "m",
      inputTokens: CAP + 50_000,
      outputTokens: 0,
    });

    const a = await checkUsageBudget(prisma, USER_A, Date.now(), CAP, DAY_MS);
    const b = await checkUsageBudget(prisma, USER_B, Date.now(), CAP, DAY_MS);
    expect(a.allowed).toBe(false);
    expect(b.used).toBe(0);
    expect(b.allowed).toBe(true);
  });

  it("writes nothing for a zero-token turn (the offline stub / no-op)", async () => {
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "chat",
      model: "m",
      inputTokens: 0,
      outputTokens: 0,
    });
    const count = await prisma.almondUsageEvent.count({ where: { userId: USER_A } });
    expect(count).toBe(0);
  });

  it("persists the estimated flag for a hidden-usage turn", async () => {
    await recordUsage(prisma, {
      userId: USER_A,
      farmId: null,
      source: "chat",
      model: "m",
      inputTokens: 2_000,
      outputTokens: 0,
      estimated: true,
    });
    const row = await prisma.almondUsageEvent.findFirstOrThrow({ where: { userId: USER_A } });
    expect(row.estimated).toBe(true);
    expect(row.totalTokens).toBe(2_000);
  });
});
