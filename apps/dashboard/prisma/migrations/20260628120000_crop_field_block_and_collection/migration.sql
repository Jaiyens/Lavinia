-- AlterTable
ALTER TABLE "CommitmentRecord" ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "collectedCents" INTEGER,
ADD COLUMN     "settledPriceCentsPerPound" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'committed';

-- CreateTable
CREATE TABLE "CropFieldBlock" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CropFieldBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CropFieldBlock_farmId_idx" ON "CropFieldBlock"("farmId");

-- CreateIndex
CREATE INDEX "CropFieldBlock_blockId_idx" ON "CropFieldBlock"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "CropFieldBlock_farmId_field_key" ON "CropFieldBlock"("farmId", "field");

-- AddForeignKey
ALTER TABLE "CropFieldBlock" ADD CONSTRAINT "CropFieldBlock_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropFieldBlock" ADD CONSTRAINT "CropFieldBlock_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security for the new CropFieldBlock table (db push does NOT emit this; apply to prod by
-- hand against DATABASE_URL_UNPOOLED, same procedure as the crop ledger / pgvector migrations).
ALTER TABLE "CropFieldBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CropFieldBlock" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CropFieldBlock_farm_isolation" ON "CropFieldBlock"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
