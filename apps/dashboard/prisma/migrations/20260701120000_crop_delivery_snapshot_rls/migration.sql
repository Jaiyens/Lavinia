-- Row Level Security for CropDelivery + AlmondSnapshot. These were created without RLS (their portal-
-- replica readers used the bare client); their reads now go through withFarmTenant (almond-portal/
-- data.ts snapshot()/growerId(), almondlogic/_data.ts) and their writes through the tenant-scoped
-- writePortalData (src/lib/crops/scrape/portal-load.ts), so RLS is now safe. Same pattern + GUC as the
-- crop ledger / field-block tables. `prisma db push` does NOT emit RLS, so on prod this block is applied
-- by hand once against DATABASE_URL_UNPOOLED (the *.db.test.ts RLS harness applies it itself).

ALTER TABLE "CropDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CropDelivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CropDelivery_farm_isolation" ON "CropDelivery"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));

ALTER TABLE "AlmondSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlmondSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AlmondSnapshot_farm_isolation" ON "AlmondSnapshot"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
