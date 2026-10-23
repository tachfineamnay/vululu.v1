-- V1-01-A.1 : un seul JobRun actif par projet.
-- Rend la course startRun / startRun impossible au niveau PostgreSQL, en
-- complement du verrou projet et de l isolation Serializable.
CREATE UNIQUE INDEX "JobRun_one_active_per_project"
  ON "JobRun" ("projectId")
  WHERE "status" IN ('queued', 'running');
