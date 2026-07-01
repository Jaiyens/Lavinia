-- Worksheet spine (Gagan's production worksheet): Block owning-entity + per-block-variety acreage
-- (BlockPlanting) + durable huller runs (CropRun) + Total Good Meats (TgmRecord). Additive only.
-- RLS + the TGM customer-sourced CHECK are included (db push cannot emit them; apply this block to
-- prod by hand against DATABASE_URL_UNPOOLED, same procedure as the other crop migrations).

-- Block.entityId (owning legal entity, SetNull)
ALTER TABLE "Block" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
CREATE INDEX IF NOT EXISTS "Block_entityId_idx" ON "Block"("entityId");
ALTER TABLE "Block" DROP CONSTRAINT IF EXISTS "Block_entityId_fkey";
ALTER TABLE "Block" ADD CONSTRAINT "Block_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BlockPlanting: per-block-variety acreage (Terra-side, never scraped)
CREATE TABLE IF NOT EXISTS "BlockPlanting" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "variety" TEXT NOT NULL,
    "acres" DOUBLE PRECISION NOT NULL,
    "cropYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlockPlanting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BlockPlanting_farmId_blockId_variety_cropYear_key" ON "BlockPlanting"("farmId", "blockId", "variety", "cropYear");
CREATE INDEX IF NOT EXISTS "BlockPlanting_farmId_idx" ON "BlockPlanting"("farmId");
CREATE INDEX IF NOT EXISTS "BlockPlanting_blockId_idx" ON "BlockPlanting"("blockId");
ALTER TABLE "BlockPlanting" DROP CONSTRAINT IF EXISTS "BlockPlanting_farmId_fkey";
ALTER TABLE "BlockPlanting" ADD CONSTRAINT "BlockPlanting_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlockPlanting" DROP CONSTRAINT IF EXISTS "BlockPlanting_blockId_fkey";
ALTER TABLE "BlockPlanting" ADD CONSTRAINT "BlockPlanting_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CropRun: durable huller runs (huller weight source), deduped by runId
CREATE TABLE IF NOT EXISTS "CropRun" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "hullerId" INTEGER NOT NULL,
    "cropYear" INTEGER NOT NULL,
    "runId" TEXT NOT NULL,
    "field" TEXT,
    "variety" TEXT NOT NULL,
    "binWeight" INTEGER,
    "loadWeight" INTEGER,
    "totalBins" INTEGER,
    "turnout" DOUBLE PRECISION,
    "validatedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'ALMOND_LOGIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CropRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CropRun_farmId_hullerId_cropYear_runId_key" ON "CropRun"("farmId", "hullerId", "cropYear", "runId");
CREATE INDEX IF NOT EXISTS "CropRun_farmId_cropYear_idx" ON "CropRun"("farmId", "cropYear");
CREATE INDEX IF NOT EXISTS "CropRun_farmId_field_cropYear_idx" ON "CropRun"("farmId", "field", "cropYear");
ALTER TABLE "CropRun" DROP CONSTRAINT IF EXISTS "CropRun_farmId_fkey";
ALTER TABLE "CropRun" ADD CONSTRAINT "CropRun_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TgmRecord: Total Good Meats (customer-sourced only; CHECK forbids ALMOND_LOGIC)
CREATE TABLE IF NOT EXISTS "TgmRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "cropYear" INTEGER NOT NULL,
    "blockId" TEXT,
    "variety" TEXT NOT NULL,
    "tgmLbs" INTEGER NOT NULL,
    "gradeDeductionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "source" TEXT NOT NULL,
    "controlTotalPounds" INTEGER,
    "coverageState" TEXT NOT NULL DEFAULT 'no_doc',
    "r2Key" TEXT,
    "supersedesId" TEXT,
    "supersededReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TgmRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TgmRecord_source_customer_sourced" CHECK ("source" IN ('BLUE_DIAMOND_STATEMENT', 'MANUAL_ENTRY'))
);
CREATE INDEX IF NOT EXISTS "TgmRecord_farmId_cropYear_idx" ON "TgmRecord"("farmId", "cropYear");
CREATE INDEX IF NOT EXISTS "TgmRecord_farmId_cropYear_variety_idx" ON "TgmRecord"("farmId", "cropYear", "variety");
CREATE INDEX IF NOT EXISTS "TgmRecord_blockId_idx" ON "TgmRecord"("blockId");
CREATE INDEX IF NOT EXISTS "TgmRecord_supersedesId_idx" ON "TgmRecord"("supersedesId");
ALTER TABLE "TgmRecord" DROP CONSTRAINT IF EXISTS "TgmRecord_farmId_fkey";
ALTER TABLE "TgmRecord" ADD CONSTRAINT "TgmRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TgmRecord" DROP CONSTRAINT IF EXISTS "TgmRecord_blockId_fkey";
ALTER TABLE "TgmRecord" ADD CONSTRAINT "TgmRecord_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TgmRecord" DROP CONSTRAINT IF EXISTS "TgmRecord_supersedesId_fkey";
ALTER TABLE "TgmRecord" ADD CONSTRAINT "TgmRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "TgmRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security on the three new farmId-scoped tables (same GUC as the other crop tables).
ALTER TABLE "BlockPlanting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockPlanting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BlockPlanting_farm_isolation" ON "BlockPlanting";
CREATE POLICY "BlockPlanting_farm_isolation" ON "BlockPlanting"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));

ALTER TABLE "CropRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CropRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CropRun_farm_isolation" ON "CropRun";
CREATE POLICY "CropRun_farm_isolation" ON "CropRun"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));

ALTER TABLE "TgmRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TgmRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TgmRecord_farm_isolation" ON "TgmRecord";
CREATE POLICY "TgmRecord_farm_isolation" ON "TgmRecord"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
