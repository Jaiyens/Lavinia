-- Baseline migration: the full Terra schema as a single CREATE, generated with
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
--
-- This project shipped schema with `prisma db push` (no real migration history), so there was
-- no migration that creates the base tables - which meant `prisma migrate deploy` FAILED on a
-- fresh/empty database (the first incremental migration referenced Farm/User before any
-- migration created them). That is fine day to day but breaks any re-provision or disaster
-- recovery. This baseline makes `migrate deploy` reproduce the whole schema from empty.
--
-- Adopting it on the EXISTING (already-populated) prod DB is a one-time step, see
-- prisma/migrations/README.md: run `prisma migrate resolve --applied 0_init` so Prisma records
-- the baseline as already applied instead of trying to re-create existing tables.
-- ============================================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FarmRole" AS ENUM ('owner', 'manager', 'viewer');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'removed');

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billingName" TEXT,
    "actualOwner" TEXT,
    "farmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coverageState" TEXT NOT NULL DEFAULT 'no_bill',

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acreage" DOUBLE PRECISION,
    "farmId" TEXT NOT NULL,
    "cropId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pump" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceId" TEXT,
    "meterSerial" TEXT,
    "rateSchedule" TEXT,
    "billingSerial" TEXT,
    "serialCode" TEXT,
    "rotatingOutageBlock" TEXT,
    "location" TEXT,
    "horsepower" DOUBLE PRECISION,
    "fuel" TEXT NOT NULL DEFAULT 'electric',
    "accountId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'pump',
    "confidence" DOUBLE PRECISION,
    "powerSource" TEXT NOT NULL DEFAULT 'electric',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gpm" DOUBLE PRECISION,
    "nemType" TEXT,
    "trueUpMonth" INTEGER,
    "solarKw" DOUBLE PRECISION,
    "trueUpAmountCents" INTEGER,
    "trueUpDate" TIMESTAMP(3),
    "growerPumpId" TEXT,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT,
    "isSolar" BOOLEAN NOT NULL DEFAULT false,
    "cropId" TEXT,
    "ranchId" TEXT,
    "coverageState" TEXT NOT NULL DEFAULT 'no_bill',
    "farmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pump_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageInterval" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 900,
    "kWh" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPeriod" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "close" TIMESTAMP(3) NOT NULL,
    "cycleClose" TIMESTAMP(3),
    "printedTotalCents" INTEGER,
    "tariff" TEXT,
    "demandChargeUsd" DOUBLE PRECISION,
    "peakKw" DOUBLE PRECISION,
    "peakAt" TIMESTAMP(3),
    "totalBillUsd" DOUBLE PRECISION,
    "totalKwh" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'green_button',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLineItem" (
    "id" TEXT NOT NULL,
    "billingPeriodId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "amountCents" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "rate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cropCoefficient" DOUBLE PRECISION,

    CONSTRAINT "Crop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ranch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acreage" DOUBLE PRECISION,
    "farmId" TEXT NOT NULL,
    "cropId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolarArray" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "nameplateKw" DOUBLE PRECISION NOT NULL,
    "nemType" TEXT,
    "trueUpMonth" INTEGER,
    "saId" TEXT,
    "farmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolarArray_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NemPeriod" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "close" TIMESTAMP(3) NOT NULL,
    "netKwh" DOUBLE PRECISION NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'scanned_bill',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NemPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "farmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "externalRef" TEXT,
    "farmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorizedAt" TIMESTAMP(3),

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "impactUsd" DOUBLE PRECISION,
    "impactNote" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "result" JSONB,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "coverageAsOf" TEXT,
    "paramsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "_BlockToPump" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BlockToPump_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_NemAllocation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_NemAllocation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Farm_userId_idx" ON "Farm"("userId");

-- CreateIndex
CREATE INDEX "FarmMembership_userId_idx" ON "FarmMembership"("userId");

-- CreateIndex
CREATE INDEX "FarmMembership_farmId_idx" ON "FarmMembership"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmMembership_farmId_userId_key" ON "FarmMembership"("farmId", "userId");

-- CreateIndex
CREATE INDEX "FarmInvite_invitedEmail_idx" ON "FarmInvite"("invitedEmail");

-- CreateIndex
CREATE INDEX "FarmInvite_farmId_idx" ON "FarmInvite"("farmId");

-- CreateIndex
CREATE INDEX "Entity_farmId_idx" ON "Entity"("farmId");

-- CreateIndex
CREATE INDEX "Account_farmId_idx" ON "Account"("farmId");

-- CreateIndex
CREATE INDEX "Account_entityId_idx" ON "Account"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_farmId_number_key" ON "Account"("farmId", "number");

-- CreateIndex
CREATE INDEX "Block_farmId_idx" ON "Block"("farmId");

-- CreateIndex
CREATE INDEX "Pump_farmId_idx" ON "Pump"("farmId");

-- CreateIndex
CREATE INDEX "Pump_accountId_idx" ON "Pump"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Pump_farmId_serviceId_key" ON "Pump"("farmId", "serviceId");

-- CreateIndex
CREATE INDEX "UsageInterval_pumpId_start_idx" ON "UsageInterval"("pumpId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "UsageInterval_pumpId_start_key" ON "UsageInterval"("pumpId", "start");

-- CreateIndex
CREATE INDEX "BillingPeriod_pumpId_start_idx" ON "BillingPeriod"("pumpId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPeriod_pumpId_start_key" ON "BillingPeriod"("pumpId", "start");

-- CreateIndex
CREATE INDEX "BillingLineItem_billingPeriodId_idx" ON "BillingLineItem"("billingPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "Crop_name_key" ON "Crop"("name");

-- CreateIndex
CREATE INDEX "Ranch_farmId_idx" ON "Ranch"("farmId");

-- CreateIndex
CREATE INDEX "SolarArray_farmId_idx" ON "SolarArray"("farmId");

-- CreateIndex
CREATE INDEX "NemPeriod_pumpId_idx" ON "NemPeriod"("pumpId");

-- CreateIndex
CREATE UNIQUE INDEX "NemPeriod_pumpId_start_key" ON "NemPeriod"("pumpId", "start");

-- CreateIndex
CREATE INDEX "Person_farmId_idx" ON "Person"("farmId");

-- CreateIndex
CREATE INDEX "Connection_farmId_idx" ON "Connection"("farmId");

-- CreateIndex
CREATE INDEX "Recommendation_farmId_status_idx" ON "Recommendation"("farmId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_farmId_tool_idx" ON "Recommendation"("farmId", "tool");

-- CreateIndex
CREATE INDEX "GeneratedReport_farmId_createdAt_idx" ON "GeneratedReport"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedReport_createdById_idx" ON "GeneratedReport"("createdById");

-- CreateIndex
CREATE INDEX "AlmondConversation_userId_farmId_updatedAt_idx" ON "AlmondConversation"("userId", "farmId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "_BlockToPump_B_index" ON "_BlockToPump"("B");

-- CreateIndex
CREATE INDEX "_NemAllocation_B_index" ON "_NemAllocation"("B");

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmMembership" ADD CONSTRAINT "FarmMembership_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmMembership" ADD CONSTRAINT "FarmMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmMembership" ADD CONSTRAINT "FarmMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmInvite" ADD CONSTRAINT "FarmInvite_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmInvite" ADD CONSTRAINT "FarmInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pump" ADD CONSTRAINT "Pump_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pump" ADD CONSTRAINT "Pump_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pump" ADD CONSTRAINT "Pump_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pump" ADD CONSTRAINT "Pump_ranchId_fkey" FOREIGN KEY ("ranchId") REFERENCES "Ranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageInterval" ADD CONSTRAINT "UsageInterval_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPeriod" ADD CONSTRAINT "BillingPeriod_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLineItem" ADD CONSTRAINT "BillingLineItem_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "BillingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ranch" ADD CONSTRAINT "Ranch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ranch" ADD CONSTRAINT "Ranch_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarArray" ADD CONSTRAINT "SolarArray_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemPeriod" ADD CONSTRAINT "NemPeriod_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlmondConversation" ADD CONSTRAINT "AlmondConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlmondConversation" ADD CONSTRAINT "AlmondConversation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BlockToPump" ADD CONSTRAINT "_BlockToPump_A_fkey" FOREIGN KEY ("A") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BlockToPump" ADD CONSTRAINT "_BlockToPump_B_fkey" FOREIGN KEY ("B") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NemAllocation" ADD CONSTRAINT "_NemAllocation_A_fkey" FOREIGN KEY ("A") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NemAllocation" ADD CONSTRAINT "_NemAllocation_B_fkey" FOREIGN KEY ("B") REFERENCES "SolarArray"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Raw-SQL indexes that Prisma's schema DSL cannot express, so they are NOT in the
-- from-datamodel baseline above and `prisma migrate diff` is blind to them (it can neither
-- emit nor detect a functional or partial index). They were hand-authored in the original
-- farm_membership migration and are load-bearing, so they are restored here verbatim. The
-- check script asserts both exist after deploy, since migrate diff cannot.
--
--  - User_email_lower_key: case-insensitive uniqueness of User.email (defence in depth
--    alongside the plain User_email_key the schema's @unique already created).
--  - FarmInvite_farmId_invitedEmail_pending_key: the PARTIAL unique index team-ops.ts relies
--    on as a concurrency guard - two concurrent invite sends to the same (farm, email) both
--    pass the non-atomic findFirst, and only this index makes the second INSERT fail (P2002)
--    so the catch can treat it as "already pending" instead of sending a duplicate invite.
-- On a fresh/empty DB (the deploy target) there is no data, so no backfill/precheck is needed.
-- ============================================================================
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email));
CREATE UNIQUE INDEX "FarmInvite_farmId_invitedEmail_pending_key"
  ON "FarmInvite"("farmId", "invitedEmail") WHERE "status" = 'pending';
