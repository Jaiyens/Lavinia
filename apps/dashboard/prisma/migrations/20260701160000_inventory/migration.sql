-- Inventory (good-meats on-hand): append-only signed adjustments bucketed by stage. Additive only.
-- RLS + the source/stage CHECKs are included (db push cannot emit them; apply this block to prod by
-- hand against DATABASE_URL_UNPOOLED, same procedure as the other crop migrations).

CREATE TABLE IF NOT EXISTS "InventoryItem" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "cropYear" INTEGER NOT NULL,
    "blockId" TEXT,
    "variety" TEXT NOT NULL,
    "packer" TEXT,
    "stage" TEXT NOT NULL,
    "netGoodMeatsLbs" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryItem_stage_check" CHECK ("stage" IN ('RAW', 'STOCKPILE', 'MEATS')),
    CONSTRAINT "InventoryItem_source_customer_sourced" CHECK ("source" IN ('MANUAL_ENTRY', 'TGM_DERIVED'))
);
CREATE INDEX IF NOT EXISTS "InventoryItem_farmId_cropYear_idx" ON "InventoryItem"("farmId", "cropYear");
CREATE INDEX IF NOT EXISTS "InventoryItem_farmId_stage_idx" ON "InventoryItem"("farmId", "stage");
CREATE INDEX IF NOT EXISTS "InventoryItem_blockId_idx" ON "InventoryItem"("blockId");
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_farmId_fkey";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_blockId_fkey";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (same GUC as the other crop tables).
ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "InventoryItem_farm_isolation" ON "InventoryItem";
CREATE POLICY "InventoryItem_farm_isolation" ON "InventoryItem"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
