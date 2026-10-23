-- V1-01-B : registre agents/configs, providers/modeles, decisions de routage.
CREATE TABLE "AgentDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "capabilityRequirements" JSONB NOT NULL,
  "activeConfigVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentDefinition_key_key" ON "AgentDefinition"("key");

CREATE TABLE "AgentConfigVersion" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "soul" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "guardrails" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentConfigVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentConfigVersion_agentId_version_key" ON "AgentConfigVersion"("agentId", "version");
CREATE INDEX "AgentConfigVersion_agentId_idx" ON "AgentConfigVersion"("agentId");
ALTER TABLE "AgentConfigVersion" ADD CONSTRAINT "AgentConfigVersion_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Provider" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Provider_key_key" ON "Provider"("key");

CREATE TABLE "Model" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "capabilityKeys" TEXT[],
  "quality" INTEGER NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "costCentsPerUnit" INTEGER NOT NULL,
  "license" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "qualified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Model_providerId_modelKey_key" ON "Model"("providerId", "modelKey");
CREATE INDEX "Model_providerId_idx" ON "Model"("providerId");
ALTER TABLE "Model" ADD CONSTRAINT "Model_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RoutingDecision" (
  "id" TEXT NOT NULL,
  "capabilityKey" TEXT NOT NULL,
  "candidateModelIds" TEXT[],
  "selectedModelId" TEXT NOT NULL,
  "fallbackModelId" TEXT,
  "criteria" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoutingDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoutingDecision_capabilityKey_idx" ON "RoutingDecision"("capabilityKey");
CREATE INDEX "RoutingDecision_createdAt_idx" ON "RoutingDecision"("createdAt");
