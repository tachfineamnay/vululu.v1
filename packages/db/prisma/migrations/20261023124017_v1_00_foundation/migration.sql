-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextRevision" (
    "id" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterVersion" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepRun" (
    "id" TEXT NOT NULL,
    "jobRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "jobRunId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "units" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "ContextRevision_contextId_idx" ON "ContextRevision"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ContextRevision_contextId_version_key" ON "ContextRevision"("contextId", "version");

-- CreateIndex
CREATE INDEX "CharacterVersion_characterId_idx" ON "CharacterVersion"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVersion_characterId_version_key" ON "CharacterVersion"("characterId", "version");

-- CreateIndex
CREATE INDEX "JobRun_projectId_idx" ON "JobRun"("projectId");

-- CreateIndex
CREATE INDEX "StepRun_jobRunId_idx" ON "StepRun"("jobRunId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "CostEvent_projectId_idx" ON "CostEvent"("projectId");

-- CreateIndex
CREATE INDEX "CostEvent_createdAt_idx" ON "CostEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextRevision" ADD CONSTRAINT "ContextRevision_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "BrandContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVersion" ADD CONSTRAINT "CharacterVersion_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepRun" ADD CONSTRAINT "StepRun_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- V1-00 backfill: preserve existing contexts as revision 1
INSERT INTO "ContextRevision" ("id", "contextId", "version", "checksum", "data", "createdAt")
SELECT
  'ctxrev_' || substr(md5(c."id"), 1, 24),
  c."id",
  1,
  encode(sha256(convert_to(jsonb_build_object(
    'id', c."id",
    'name', c."name",
    'website', c."website",
    'description', c."description",
    'audience', c."audience",
    'tone', c."tone",
    'colorPrimary', c."colorPrimary",
    'colorSecondary', c."colorSecondary"
  )::text, 'UTF8')), 'hex'),
  jsonb_build_object(
    'id', c."id",
    'name', c."name",
    'website', c."website",
    'description', c."description",
    'audience', c."audience",
    'tone', c."tone",
    'colorPrimary', c."colorPrimary",
    'colorSecondary', c."colorSecondary"
  ),
  CURRENT_TIMESTAMP
FROM "BrandContext" c
ON CONFLICT ("contextId", "version") DO NOTHING;

-- V1-00 backfill: preserve existing characters as version 1
INSERT INTO "CharacterVersion" ("id", "characterId", "version", "name", "description", "checksum", "createdAt")
SELECT
  'charver_' || substr(md5(ch."id"), 1, 24),
  ch."id",
  1,
  ch."name",
  ch."description",
  encode(sha256(convert_to(jsonb_build_object(
    'id', ch."id",
    'name', ch."name",
    'description', ch."description"
  )::text, 'UTF8')), 'hex'),
  CURRENT_TIMESTAMP
FROM "Character" ch
ON CONFLICT ("characterId", "version") DO NOTHING;

-- V1-00 backfill: map existing V0 production jobs to JobRun for history
INSERT INTO "JobRun" ("id", "projectId", "type", "status", "snapshot", "createdAt", "updatedAt")
SELECT
  'legacy_' || substr(md5(j."id"), 1, 24),
  j."projectId",
  j."type",
  j."status",
  jsonb_build_object('legacyProductionJobId', j."id", 'legacy', true),
  j."createdAt",
  j."updatedAt"
FROM "ProductionJob" j
ON CONFLICT ("id") DO NOTHING;
