-- Phase 2 of the Almond hybrid export engine: the content-addressed report cache. An identical ask
-- on unchanged farm data resolves to the SAME cache key, so the previously generated (and, for the
-- codegen path, already number-verified) bytes are returned instantly; any real change in the data
-- or the request yields a new key and a fresh build. Hand-authored and purely ADDITIVE (two new
-- nullable columns + one index, no backfill, no drops), so it is safe to apply on a live database
-- with `prisma migrate deploy` and never resets or rewrites existing report rows.

-- ============================================================================
-- GeneratedReport: the cache key + the cached meter count
-- ============================================================================

-- The content-addressed cache key (sha256 of farm-data-fingerprint + normalized request + engine
-- version). Nullable: pre-cache rows and the non-persisted Tour carry none, and a NULL key is never
-- matched by a lookup (so old rows can never serve as a phantom cache hit).
ALTER TABLE "GeneratedReport" ADD COLUMN "cacheKey" TEXT;

-- The filtered meter count the file covers, so a cache HIT can label its download card without
-- re-loading the farm. Nullable (pre-cache rows carry none; only fresh rows written by the cache
-- path set it, and only those rows are ever returned as a hit).
ALTER TABLE "GeneratedReport" ADD COLUMN "meterCount" INTEGER;

-- The cache lookup: the freshest row for a (farm, cacheKey) pair. Farm-scoped so a key collision can
-- never cross the tenant boundary.
CREATE INDEX "GeneratedReport_farmId_cacheKey_idx" ON "GeneratedReport"("farmId", "cacheKey");
