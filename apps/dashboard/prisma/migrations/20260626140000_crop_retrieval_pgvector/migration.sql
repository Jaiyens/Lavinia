-- Crop report retrieval (Tool 1, Phase 7 / Track E). Additive only — no existing table is altered.
-- One farmId-scoped table of embedded chunks of the grower's raw crop documents (packer statements /
-- pool true-ups uploaded to R2), for the Almond crop responder's `find-report` retrieval tool.
--
-- IMPORTANT, mirrors the RLS / functional-index note in migrations/README.md: `prisma db push` (the
-- day-to-day path) does NOT emit the `CREATE EXTENSION`, the `vector(1536)` column type cleanly, or
-- the hnsw index — push has no vocabulary for the pgvector extension. So on a db-push'd database the
-- extension + the vector column + the index must be applied by hand once against
-- DATABASE_URL_UNPOOLED. The `prisma migrate diff`-generated body below was produced with:
--   prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel \
--     prisma/schema.prisma --script
-- and the `CREATE EXTENSION` (top) + the hnsw index (bottom) were added by hand — diff cannot emit
-- either. This whole migration is also a no-op until pgvector is installed on the cluster; the
-- retrieval tool is capability-gated (no extension / no ZDR key -> an explicit "retrieval
-- unavailable" tool result), so until it is applied the crop responder simply never retrieves.

-- The pgvector extension. Idempotent; safe to re-run. Must exist before the vector column / index.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "RawReportChunk" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cropYear" INTEGER,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawReportChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawReportChunk_farmId_createdAt_idx" ON "RawReportChunk"("farmId", "createdAt");

-- AddForeignKey
ALTER TABLE "RawReportChunk" ADD CONSTRAINT "RawReportChunk_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================================
-- pgvector nearest-neighbour index (added by hand — `prisma migrate diff` cannot emit it). HNSW with
-- cosine distance (`vector_cosine_ops`) to match the cosine ranking the query path uses. The embed
-- pipeline normalizes vectors, so cosine and inner-product order identically; cosine is chosen for
-- clarity. Built only on rows whose embedding is non-null (a chunk may be inserted before its
-- embedding lands, or with no ZDR key at ingest). Like the table itself this is a no-op without the
-- extension and is NOT emitted by `db push`.
-- ============================================================================================
CREATE INDEX IF NOT EXISTS "RawReportChunk_embedding_hnsw_idx"
  ON "RawReportChunk" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;

-- ============================================================================================
-- Row Level Security (NEW table only — existing tables/queries untouched). Identical posture to the
-- three crop-ledger tables (see 20260626120000_crop_ledger_rls): the app sets app.current_farm_id
-- per transaction via withFarmTenant, so a connection that has not set it sees zero chunks and
-- cannot insert (fail closed). `db push` does NOT emit this block; apply by hand on prod against
-- DATABASE_URL_UNPOOLED. FORCE so the policy applies even to the table owner (Neon's app role).
-- ============================================================================================
ALTER TABLE "RawReportChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RawReportChunk" FORCE ROW LEVEL SECURITY;

CREATE POLICY "RawReportChunk_farm_isolation" ON "RawReportChunk"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
