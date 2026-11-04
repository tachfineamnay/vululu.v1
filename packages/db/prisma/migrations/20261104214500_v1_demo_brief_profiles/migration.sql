-- Paramètres et confirmation ajoutés sans réécrire les briefs/révisions existants.
ALTER TABLE "Brief"
  ADD COLUMN "settings" JSONB,
  ADD COLUMN "confirmedVersion" INTEGER,
  ADD COLUMN "confirmedChecksum" TEXT,
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3);

ALTER TABLE "BriefRevision" ADD COLUMN "settings" JSONB;
