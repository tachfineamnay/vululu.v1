-- V1-01-E : infrastructure d artefacts immuables. Additive uniquement.
ALTER TABLE "SceneVersion"
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "sizeBytes" BIGINT,
  ADD COLUMN IF NOT EXISTS "sha256" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizationState" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS "manifest" JSONB;

ALTER TABLE "ArtifactVersion"
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "sizeBytes" BIGINT,
  ADD COLUMN IF NOT EXISTS "sha256" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizationState" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS "manifest" JSONB;

ALTER TABLE "RunArtifact"
  ADD COLUMN IF NOT EXISTS "manifest" JSONB,
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT;

CREATE INDEX IF NOT EXISTS "SceneVersion_storageProvider_storageKey_idx"
  ON "SceneVersion"("storageProvider", "storageKey");
CREATE INDEX IF NOT EXISTS "ArtifactVersion_storageProvider_storageKey_idx"
  ON "ArtifactVersion"("storageProvider", "storageKey");

CREATE TABLE IF NOT EXISTS "ArtifactObject" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "sha256" TEXT NOT NULL,
  "etag" TEXT,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "jobRunId" TEXT,
  "sceneId" TEXT,
  "sceneVersionId" TEXT,
  "artifactVersionId" TEXT,
  "manifest" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),
  CONSTRAINT "ArtifactObject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ArtifactObject_provider_key_key"
  ON "ArtifactObject"("provider", "key");
CREATE INDEX IF NOT EXISTS "ArtifactObject_state_idx" ON "ArtifactObject"("state");
CREATE INDEX IF NOT EXISTS "ArtifactObject_jobRunId_idx" ON "ArtifactObject"("jobRunId");
CREATE INDEX IF NOT EXISTS "ArtifactObject_sha256_idx" ON "ArtifactObject"("sha256");
