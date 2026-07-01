-- Grower portal credential store (Phase 2 live scrape). ONE row per (farm, portal). Additive only —
-- no existing table is altered. Holds ONLY encrypted material: the AES-256-GCM { username, password }
-- blob (encryptedCredential, decrypted only inside the Sandbox at moment of use) and/or a reusable
-- session cookie. Plaintext is never stored.
--
-- Like the crop ledger / pgvector / field-block migrations, this ALSO enables Postgres Row Level
-- Security (the block at the bottom). `prisma db push` (the day-to-day path) CANNOT emit RLS, so on a
-- db-push'd prod DB the RLS block must be applied by hand once against DATABASE_URL_UNPOOLED. The
-- *.db.test.ts RLS harness applies the same block itself because it uses db push.

-- CreateTable
CREATE TABLE "GrowerPortalCredential" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "portal" TEXT NOT NULL DEFAULT 'ALMOND_LOGIC',
    "encryptedCredential" JSONB,
    "sessionCookie" TEXT,
    "sessionCookieExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowerPortalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowerPortalCredential_farmId_idx" ON "GrowerPortalCredential"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowerPortalCredential_farmId_portal_key" ON "GrowerPortalCredential"("farmId", "portal");

-- AddForeignKey
ALTER TABLE "GrowerPortalCredential" ADD CONSTRAINT "GrowerPortalCredential_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security for the new GrowerPortalCredential table (db push does NOT emit this; apply to
-- prod by hand against DATABASE_URL_UNPOOLED, same procedure as the crop ledger / pgvector / field-
-- block migrations). A grower's stored credential must never be readable across the farm boundary.
ALTER TABLE "GrowerPortalCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrowerPortalCredential" FORCE ROW LEVEL SECURITY;
CREATE POLICY "GrowerPortalCredential_farm_isolation" ON "GrowerPortalCredential"
  USING ("farmId" = current_setting('app.current_farm_id', true))
  WITH CHECK ("farmId" = current_setting('app.current_farm_id', true));
