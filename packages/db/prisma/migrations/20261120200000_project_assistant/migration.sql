CREATE TABLE "AssistantTurn" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "parentId" TEXT REFERENCES "AssistantTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "operationId" TEXT UNIQUE REFERENCES "ExecutionOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('marketing','creative')),
  "revision" INTEGER NOT NULL,
  "request" JSONB NOT NULL,
  "inputDigest" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "providerProfile" TEXT,
  "result" JSONB,
  "digest" TEXT,
  "origin" TEXT,
  "reason" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AssistantTurn_projectId_createdAt_idx" ON "AssistantTurn"("projectId", "createdAt");
CREATE INDEX "AssistantTurn_parentId_idx" ON "AssistantTurn"("parentId");
