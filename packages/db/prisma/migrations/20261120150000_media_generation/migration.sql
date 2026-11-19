CREATE TABLE "MediaGeneration" (
 id TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, revision INTEGER NOT NULL, "sceneKey" TEXT NOT NULL,
 tool TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, "modelVersion" TEXT, parameters JSONB NOT NULL,
 "referenceSha" TEXT, "remoteId" TEXT, state TEXT NOT NULL, "cancelRequested" BOOLEAN NOT NULL DEFAULT FALSE, "cancelSent" BOOLEAN NOT NULL DEFAULT FALSE,
 "submittedAt" TIMESTAMP(3), "outputVersion" TEXT UNIQUE REFERENCES "BrandAssetVersion"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "reportedCents" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("projectId",revision) REFERENCES "CreativeRevision"("projectId",version) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MediaGeneration_projectId_createdAt_idx" ON "MediaGeneration"("projectId","createdAt");
ALTER TABLE "ExecutionOperation" DROP CONSTRAINT "ExecutionOperation_state_check";
ALTER TABLE "ExecutionOperation" ADD CONSTRAINT "ExecutionOperation_state_check" CHECK (state IN ('PROPOSED','QUEUED','CLAIMED','POLLING','UNKNOWN','SUCCEEDED','CANCELLED','RESOLVED'));
