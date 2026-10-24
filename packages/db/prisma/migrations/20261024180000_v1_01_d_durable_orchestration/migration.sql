-- V1-01-D : orchestration durable additive. Aucun DROP, aucun changement destructif.
ALTER TABLE "JobRun"
  ADD COLUMN IF NOT EXISTS "workflowRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "orchestrator" TEXT,
  ADD COLUMN IF NOT EXISTS "lastTransitionAt" TIMESTAMP(3);

ALTER TABLE "StepRun"
  ADD COLUMN IF NOT EXISTS "output" JSONB;

ALTER TABLE "CostEvent"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CostEvent_idempotencyKey_key"
  ON "CostEvent"("idempotencyKey");

CREATE TABLE IF NOT EXISTS "OrchestrationOutbox" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "jobRunId" TEXT,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "workflowRunId" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrchestrationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrchestrationOutbox_idempotencyKey_key"
  ON "OrchestrationOutbox"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "OrchestrationOutbox_status_nextAttemptAt_idx"
  ON "OrchestrationOutbox"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "OrchestrationOutbox_jobRunId_idx"
  ON "OrchestrationOutbox"("jobRunId");

CREATE TABLE IF NOT EXISTS "RunStateEvent" (
  "id" TEXT NOT NULL,
  "jobRunId" TEXT NOT NULL,
  "stepRunId" TEXT,
  "scope" TEXT NOT NULL,
  "fromState" TEXT,
  "toState" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunStateEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RunStateEvent_jobRunId_createdAt_idx"
  ON "RunStateEvent"("jobRunId", "createdAt");
CREATE INDEX IF NOT EXISTS "RunStateEvent_jobRunId_scope_idx"
  ON "RunStateEvent"("jobRunId", "scope");

CREATE TABLE IF NOT EXISTS "RunRoutingSnapshot" (
  "id" TEXT NOT NULL,
  "jobRunId" TEXT NOT NULL,
  "agentDefinitionId" TEXT,
  "agentConfigVersionId" TEXT,
  "agentConfigChecksum" TEXT,
  "capabilityKey" TEXT NOT NULL,
  "providerId" TEXT,
  "modelId" TEXT,
  "providerKey" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "fallbackModelId" TEXT,
  "policy" JSONB NOT NULL,
  "decisionId" TEXT,
  "estimatedCents" INTEGER NOT NULL DEFAULT 0,
  "actualCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunRoutingSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RunRoutingSnapshot_jobRunId_key"
  ON "RunRoutingSnapshot"("jobRunId");

CREATE TABLE IF NOT EXISTS "RunArtifact" (
  "id" TEXT NOT NULL,
  "jobRunId" TEXT NOT NULL,
  "artifactVersionId" TEXT NOT NULL,
  "masterVersion" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "scenes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunArtifact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RunArtifact_jobRunId_key"
  ON "RunArtifact"("jobRunId");
CREATE INDEX IF NOT EXISTS "RunArtifact_artifactVersionId_idx"
  ON "RunArtifact"("artifactVersionId");
