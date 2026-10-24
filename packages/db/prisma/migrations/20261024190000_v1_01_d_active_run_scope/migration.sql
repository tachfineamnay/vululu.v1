-- V1-01-D : un run en attente d approbation reste un run actif.
-- Remplace l index A.1 qui ne couvrait que queued/running. Aucune donnee detruite.
DROP INDEX IF EXISTS "JobRun_one_active_per_project";
CREATE UNIQUE INDEX "JobRun_one_active_per_project"
  ON "JobRun" ("projectId")
  WHERE "status" IN ('queued', 'running', 'waiting_approval', 'recovery_pending');
