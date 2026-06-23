-- Additive: modeled monthly tariff-component cost (integer cents) computed from interval data
-- for meters with usage but no reconciled printed bill (costSource MODELED). Nullable; never
-- presented as actual billed cost. Backfilled at load time by scripts/load-batth-full.ts.
ALTER TABLE "Pump" ADD COLUMN "modeledMonthlyCents" INTEGER;
