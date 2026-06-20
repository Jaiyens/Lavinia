-- Phase 1 of farm team access: the many-users <-> one-farm membership model + the email
-- one-form guarantee. Hand-authored (Prisma's DSL cannot express the pre-checks, the data
-- backfill, the partial unique index, or the functional lower(email) index). Safe to run with
-- `prisma migrate deploy`. It ABORTS rather than silently corrupting if a pre-condition is
-- unmet (email case-collisions, or an owner-less real farm) so a human resolves it first.

-- ============================================================================
-- 1. Email one-form guarantee (lowercase legacy rows + case-insensitive uniqueness)
-- ============================================================================

-- Pre-check: lowercasing must not merge two distinct accounts. If two User rows differ only by
-- case, abort so a human decides which is canonical (NEVER auto-merge identities).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'email case-collision: two User rows share a lowercased email; merge them before migrating';
  END IF;
END $$;

-- Normalize existing emails to the one canonical (lowercased) form the app now writes.
UPDATE "User" SET email = lower(email) WHERE email IS NOT NULL AND email <> lower(email);

-- Defense-in-depth: case-insensitive uniqueness even for a future write that skips the
-- normalizeEmail adapter wrapper (e.g. a raw seed). NULL emails are allowed many (lower(NULL)
-- is NULL, which a unique index treats as distinct).
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email));

-- ============================================================================
-- 2. Backfill safety pre-check (no owner-less real farm)
-- ============================================================================

-- A non-demo farm with NULL userId would backfill to ZERO members and become unreachable.
-- These come from the real-<account> import path and a crashed (pre-atomic) identify step.
-- Abort and have a human attach an owner first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Farm" WHERE "isDemo" = false AND "userId" IS NULL) THEN
    RAISE EXCEPTION 'orphan real farms with null userId exist; attach an owner before backfill';
  END IF;
END $$;

-- ============================================================================
-- 3. Enums
-- ============================================================================

CREATE TYPE "FarmRole" AS ENUM ('owner', 'manager', 'viewer');
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'removed');

-- ============================================================================
-- 4. FarmMembership
-- ============================================================================

CREATE TABLE "FarmMembership" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FarmRole" NOT NULL DEFAULT 'manager',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "FarmMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FarmMembership_farmId_userId_key" ON "FarmMembership"("farmId", "userId");
CREATE INDEX "FarmMembership_userId_idx" ON "FarmMembership"("userId");
CREATE INDEX "FarmMembership_farmId_idx" ON "FarmMembership"("farmId");

ALTER TABLE "FarmMembership" ADD CONSTRAINT "FarmMembership_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Restrict (not Cascade): deleting a user must never silently orphan a farm to zero owners.
ALTER TABLE "FarmMembership" ADD CONSTRAINT "FarmMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmMembership" ADD CONSTRAINT "FarmMembership_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 5. FarmInvite
-- ============================================================================

CREATE TABLE "FarmInvite" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "role" "FarmRole" NOT NULL DEFAULT 'manager',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,

    CONSTRAINT "FarmInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FarmInvite_invitedEmail_idx" ON "FarmInvite"("invitedEmail");
CREATE INDEX "FarmInvite_farmId_idx" ON "FarmInvite"("farmId");

-- At most ONE live (pending) invite per email per farm, so a revoke is genuinely final and
-- re-invites do not pile up. Prisma's DSL cannot express a partial index, so it lives here.
CREATE UNIQUE INDEX "FarmInvite_farmId_invitedEmail_pending_key"
  ON "FarmInvite"("farmId", "invitedEmail") WHERE "status" = 'pending';

ALTER TABLE "FarmInvite" ADD CONSTRAINT "FarmInvite_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FarmInvite" ADD CONSTRAINT "FarmInvite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 6. Backfill: every owned non-demo farm gets exactly one owner/active membership
-- ============================================================================

-- Idempotent under the @@unique([farmId, userId]) constraint (re-running is a no-op via the
-- ON CONFLICT). Demo/seed farms (userId NULL) get NO membership, exactly as today.
INSERT INTO "FarmMembership" ("id", "farmId", "userId", "role", "status", "createdAt")
SELECT gen_random_uuid()::text, f."id", f."userId", 'owner', 'active', now()
FROM "Farm" f
WHERE f."userId" IS NOT NULL AND f."isDemo" = false
ON CONFLICT ("farmId", "userId") DO NOTHING;
