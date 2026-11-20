ALTER TABLE "StudioRender" ADD COLUMN "managed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "leaseToken" TEXT, ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "StudioRender_active_revision" ON "StudioRender" ("projectId", revision)
  WHERE managed AND state IN ('queued', 'running');
CREATE INDEX "StudioRender_claim" ON "StudioRender" ("createdAt")
  WHERE managed AND state IN ('queued', 'running');
-- Old synchronous requests cannot be resumed. Keep their history and release stranded holds.
UPDATE "StudioRender" SET state = 'failed', reason = 'Ancien rendu interrompu. Relancez cette révision.'
WHERE NOT managed AND state = 'running';
