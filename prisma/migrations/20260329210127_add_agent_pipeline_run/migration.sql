-- CreateTable
CREATE TABLE "AgentPipelineRun" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "leadsFound" INTEGER NOT NULL DEFAULT 0,
    "leadsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "emailsDrafted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentPipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentPipelineRun_status_idx" ON "AgentPipelineRun"("status");

-- CreateIndex
CREATE INDEX "AgentPipelineRun_createdAt_idx" ON "AgentPipelineRun"("createdAt");
