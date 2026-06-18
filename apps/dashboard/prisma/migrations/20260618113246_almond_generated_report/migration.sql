-- Story 8.6: Almond reports persistence. Additive only — no existing table is altered.
-- A GeneratedReport records WHAT a generated spreadsheet was, WHEN it was made, and the
-- request that produced it; the bytes themselves live in PRIVATE Vercel Blob under the
-- non-guessable cuid key stored in "blobPathname" (never in this table, never a public URL).
-- Farm-scoped on "farmId" (the multi-tenant isolation gate), with an owner-scoped download
-- route re-checking ownership before streaming. Immutable: a refresh is a NEW row, never an
-- in-place rewrite.

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "coverageAsOf" TEXT,
    "paramsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedReport_farmId_createdAt_idx" ON "GeneratedReport"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedReport_createdById_idx" ON "GeneratedReport"("createdById");

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
