-- Almond chat history: per-user, per-farm saved conversations. A brand-new table with no
-- backfill or data pre-checks, so this is a plain CREATE (the prod source of truth; local dev
-- applies the schema via `prisma db push`). Safe under `prisma migrate deploy`.

-- ============================================================================
-- AlmondConversation
-- ============================================================================

CREATE TABLE "AlmondConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlmondConversation_pkey" PRIMARY KEY ("id")
);

-- The history list: a user's own threads for one farm, newest-first.
CREATE INDEX "AlmondConversation_userId_farmId_updatedAt_idx"
  ON "AlmondConversation"("userId", "farmId", "updatedAt");

-- Private history goes with the user; threads go with the farm. Both Cascade.
ALTER TABLE "AlmondConversation" ADD CONSTRAINT "AlmondConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmondConversation" ADD CONSTRAINT "AlmondConversation_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
