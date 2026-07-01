-- Crop production commitment ledger (Tool 2). Additive only — no existing table is altered. Three
-- append-only, farmId-scoped tables of POUNDS, mirroring the AgentRun/GeneratedReport immutability
-- pattern (a settlement is a NEW row that supersedes an estimate via supersedesId, never a rewrite).
-- The supersede FK is ON DELETE RESTRICT so a settled row can never be orphaned from its estimate.
--
-- This migration ALSO enables Postgres Row Level Security on the three tables (the RLS block at the
-- bottom). `prisma db push` (the day-to-day path) CANNOT emit RLS — exactly like the two functional
-- indexes documented in migrations/README.md — so on the existing db-push'd prod DB the RLS block
-- must be applied by hand once against DATABASE_URL_UNPOOLED. The *.db.test.ts RLS test applies the
-- same block itself because the test harness uses db push.

-- CreateTable
CREATE TABLE "ProductionRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "cropYear" INTEGER NOT NULL,
    "variety" TEXT NOT NULL,
    "cropId" TEXT,
    "blockId" TEXT,
    "pounds" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "supersedesId" TEXT,
    "supersededReason" TEXT,
    "controlTotalPounds" INTEGER,
    "coverageState" TEXT NOT NULL DEFAULT 'no_doc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitmentRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "cropYear" INTEGER NOT NULL,
    "variety" TEXT NOT NULL,
    "cropId" TEXT,
    "blockId" TEXT,
    "pounds" INTEGER NOT NULL,
    "buyer" TEXT NOT NULL,
    "priceCentsPerPound" INTEGER,
    "source" TEXT NOT NULL,
    "supersedesId" TEXT,
    "supersededReason" TEXT,
    "controlTotalPounds" INTEGER,
    "coverageState" TEXT NOT NULL DEFAULT 'no_doc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommitmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "cropYear" INTEGER NOT NULL,
    "variety" TEXT NOT NULL,
    "cropId" TEXT,
    "blockId" TEXT,
    "pounds" INTEGER NOT NULL,
    "pool" TEXT NOT NULL,
    "trueUpCentsPerPound" INTEGER,
    "trueUpAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "supersedesId" TEXT,
    "supersededReason" TEXT,
    "controlTotalPounds" INTEGER,
    "coverageState" TEXT NOT NULL DEFAULT 'no_doc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionRecord_farmId_createdAt_idx" ON "ProductionRecord"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionRecord_farmId_cropYear_variety_idx" ON "ProductionRecord"("farmId", "cropYear", "variety");

-- CreateIndex
CREATE INDEX "ProductionRecord_supersedesId_idx" ON "ProductionRecord"("supersedesId");

-- CreateIndex
CREATE INDEX "CommitmentRecord_farmId_createdAt_idx" ON "CommitmentRecord"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "CommitmentRecord_farmId_cropYear_variety_idx" ON "CommitmentRecord"("farmId", "cropYear", "variety");

-- CreateIndex
CREATE INDEX "CommitmentRecord_supersedesId_idx" ON "CommitmentRecord"("supersedesId");

-- CreateIndex
CREATE INDEX "PoolRecord_farmId_createdAt_idx" ON "PoolRecord"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "PoolRecord_farmId_cropYear_variety_idx" ON "PoolRecord"("farmId", "cropYear", "variety");

-- CreateIndex
CREATE INDEX "PoolRecord_supersedesId_idx" ON "PoolRecord"("supersedesId");

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ProductionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentRecord" ADD CONSTRAINT "CommitmentRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentRecord" ADD CONSTRAINT "CommitmentRecord_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentRecord" ADD CONSTRAINT "CommitmentRecord_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentRecord" ADD CONSTRAINT "CommitmentRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CommitmentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolRecord" ADD CONSTRAINT "PoolRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolRecord" ADD CONSTRAINT "PoolRecord_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolRecord" ADD CONSTRAINT "PoolRecord_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolRecord" ADD CONSTRAINT "PoolRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PoolRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================================
-- Row Level Security (NEW tables only — existing tables/queries are untouched). The app sets the
-- per-transaction GUC app.current_farm_id via withFarmTenant (src/lib/crops/tenant-db.ts); a
-- connection that has not set it sees zero rows and cannot insert (fail closed). NOTE: `prisma db
-- push` does NOT emit this block, so it is applied to prod by hand against DATABASE_URL_UNPOOLED
-- and by the RLS db-test in beforeAll. FORCE makes the policy apply even to the table owner (Neon's
-- app role owns the tables; a plain ENABLE would be silently bypassed by the owner).
-- ============================================================================================

ALTER TABLE "ProductionRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionRecord" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CommitmentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommitmentRecord" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PoolRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PoolRecord" FORCE ROW LEVEL SECURITY;

-- current_setting(..., true) returns NULL when unset (missing_ok); NULL = "farmId" is false, so an
-- un-set connection matches no rows and inserts nothing. WITH CHECK gates writes so a row can never
-- be inserted/updated under a farmId other than the session's.
CREATE POLICY "ProductionRecord_farm_isolation" ON "ProductionRecord"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
CREATE POLICY "CommitmentRecord_farm_isolation" ON "CommitmentRecord"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
CREATE POLICY "PoolRecord_farm_isolation" ON "PoolRecord"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
