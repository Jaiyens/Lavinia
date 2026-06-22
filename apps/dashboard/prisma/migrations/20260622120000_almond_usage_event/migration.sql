-- Almond usage accounting: an append-only per-turn token event log backing the durable
-- per-user token budget (src/lib/almond/usage-budget.ts). A brand-new table with no backfill
-- or data pre-checks, so this is a plain CREATE (the prod source of truth; local dev applies
-- the schema via `prisma db push`). Safe under `prisma migrate deploy`. Both indexes are plain
-- composite btrees (not partial/functional), so `migrate diff` is NOT blind to them.

-- ============================================================================
-- AlmondUsageEvent
-- ============================================================================

CREATE TABLE "AlmondUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "farmId" TEXT,
    "source" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlmondUsageEvent_pkey" PRIMARY KEY ("id")
);

-- The budget query: sum a user's tokens within the rolling window.
CREATE INDEX "AlmondUsageEvent_userId_createdAt_idx"
  ON "AlmondUsageEvent"("userId", "createdAt");
-- Per-farm consumption analytics.
CREATE INDEX "AlmondUsageEvent_farmId_createdAt_idx"
  ON "AlmondUsageEvent"("farmId", "createdAt");

-- The ledger goes with the user (the budget key); the farm pointer is attribution-only, so a
-- removed farm nulls out rather than erasing the user's spend history.
ALTER TABLE "AlmondUsageEvent" ADD CONSTRAINT "AlmondUsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmondUsageEvent" ADD CONSTRAINT "AlmondUsageEvent_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
