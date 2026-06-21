-- Phase 2 of farm team access: request-to-join. A logged-in, non-invited user asks to join a farm
-- via its shareable join code; an admin approves with a role or denies. Hand-authored (Prisma's DSL
-- cannot express the partial unique index that enforces one OPEN request per user per farm). Purely
-- ADDITIVE (a new enum, a new table, one new nullable column + its unique index) - no data backfill,
-- no drops - so it is safe to run with `prisma migrate deploy` on a live database.

-- ============================================================================
-- 1. Farm.joinCode (the shareable per-farm join token)
-- ============================================================================

-- Nullable: generated lazily by an admin ("show join code"); seed/demo farms carry none. Unique so
-- a code resolves to exactly one farm. NULLs are allowed many (a unique index treats NULL distinct).
ALTER TABLE "Farm" ADD COLUMN "joinCode" TEXT;
CREATE UNIQUE INDEX "Farm_joinCode_key" ON "Farm"("joinCode");

-- ============================================================================
-- 2. Enum
-- ============================================================================

CREATE TYPE "JoinRequestStatus" AS ENUM ('open', 'approved', 'denied', 'cancelled', 'expired');

-- ============================================================================
-- 3. FarmJoinRequest
-- ============================================================================

CREATE TABLE "FarmJoinRequest" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedEmail" TEXT NOT NULL,
    "proposedRole" "FarmRole" NOT NULL DEFAULT 'viewer',
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'open',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,

    CONSTRAINT "FarmJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FarmJoinRequest_userId_idx" ON "FarmJoinRequest"("userId");
CREATE INDEX "FarmJoinRequest_farmId_status_idx" ON "FarmJoinRequest"("farmId", "status");

-- At most ONE OPEN request per (farm, user): a re-request while one is still pending is a no-op, and
-- two concurrent submits cannot both insert (the loser hits this and is caught in the op). Prisma's
-- DSL cannot express a partial index, so it lives here. NOTE (drift): `prisma migrate diff` and
-- `db push` are blind to partial indexes, so the test harness (db push) does not create it - the op
-- also dedupes in application code, which is what the tests assert.
CREATE UNIQUE INDEX "FarmJoinRequest_farmId_userId_open_key"
  ON "FarmJoinRequest"("farmId", "userId") WHERE "status" = 'open';

ALTER TABLE "FarmJoinRequest" ADD CONSTRAINT "FarmJoinRequest_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Cascade on the requester: a deleted user's pending requests are noise, never an access grant.
ALTER TABLE "FarmJoinRequest" ADD CONSTRAINT "FarmJoinRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull on the decider: a deleted admin must never cascade the audit row away.
ALTER TABLE "FarmJoinRequest" ADD CONSTRAINT "FarmJoinRequest_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
