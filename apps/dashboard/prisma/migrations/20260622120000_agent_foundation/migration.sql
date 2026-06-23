-- Agentic foundation: the shared agent ledger. Additive only — no existing table is altered.
-- Two append-only, farm-scoped tables record WHAT an agent did, mirroring the GeneratedReport
-- immutability pattern (a re-run is a NEW row, never an in-place rewrite). There is deliberately
-- NO separate Approval table: approval is folded into "AgentAction"."status" (proposed -> approved
-- | rejected -> executed | failed) plus the approvedById/approvedAt stamps, so the entire
-- human-in-the-loop is one row that survives every state.
--
-- Isolation: both tables carry "farmId" (the multi-tenant gate, FK to "Farm" ON DELETE CASCADE,
-- exactly like every other farm-owned row). "AgentAction"."recommendationId" is ON DELETE SET NULL
-- so clearing a finding never cascades away the audit row — what the agent did is preserved.

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggeredBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposedCommand" JSONB,
    "draftSubject" TEXT,
    "draftBody" TEXT,
    "reportId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_farmId_createdAt_idx" ON "AgentRun"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_farmId_kind_status_idx" ON "AgentRun"("farmId", "kind", "status");

-- CreateIndex
CREATE INDEX "AgentAction_agentRunId_idx" ON "AgentAction"("agentRunId");

-- CreateIndex
CREATE INDEX "AgentAction_recommendationId_idx" ON "AgentAction"("recommendationId");

-- CreateIndex
CREATE INDEX "AgentAction_farmId_status_idx" ON "AgentAction"("farmId", "status");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
