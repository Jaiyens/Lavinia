-- Almond v2 Phase 2: the GenerationJob ledger for survive-leaving generation. A model-authored
-- spreadsheet/PDF is enqueued here (status "pending") and built in the chat route's after(), so it
-- survives the grower leaving the page; the frontend polls /api/almond/generations to swap a building
-- card to a download card and to light a red unread badge. Additive: a new table only, no change to
-- any existing row or column.
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestText" TEXT NOT NULL,
    "paramsJson" JSONB NOT NULL,
    "resultReportId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- Farm-scoped status reads (poll the farm's pending/running jobs).
CREATE INDEX "GenerationJob_farmId_status_idx" ON "GenerationJob"("farmId", "status");

-- Farm-scoped, newest-first reads (the recent-generations list).
CREATE INDEX "GenerationJob_farmId_createdAt_idx" ON "GenerationJob"("farmId", "createdAt");

-- Per-grower status reads (a grower's own in-flight jobs).
CREATE INDEX "GenerationJob_createdById_status_idx" ON "GenerationJob"("createdById", "status");

ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
