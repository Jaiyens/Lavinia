-- PG&E "Download My Data" usage ingestion: an interval can now be either an IMPORT
-- (delivered to the customer, Direction of Energy = D) or an EXPORT (received from the
-- customer's solar, Direction = R). A NEM meter carries BOTH at the same timestamp, so
-- `direction` joins the uniqueness key. `touCode` carries the raw PG&E TOU code per
-- interval. Existing rows default to 'import' (the only stream the prior ESPI/Bayou/
-- UtilityAPI paths produced), so the new unique key holds with no backfill.
--
-- All statements are safe under `prisma migrate deploy`: the new column has a NOT NULL
-- DEFAULT, and the replacement unique index is a plain composite btree (migrate diff is
-- NOT blind to it). Local dev applies the schema via `prisma db push`.

ALTER TABLE "UsageInterval" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'import';
ALTER TABLE "UsageInterval" ADD COLUMN "touCode" TEXT;

-- Replace the (pumpId, start) uniqueness with (pumpId, start, direction) so a meter's
-- import and export readings at the same instant no longer collide.
DROP INDEX "UsageInterval_pumpId_start_key";
CREATE UNIQUE INDEX "UsageInterval_pumpId_start_direction_key"
  ON "UsageInterval"("pumpId", "start", "direction");
