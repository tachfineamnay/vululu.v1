-- P02 : décision explicite de ressources avant le brainstorming (migration additive).
ALTER TABLE "Project"
  ADD COLUMN "assetsConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "assetsConfirmationDigest" TEXT,
  ADD COLUMN "assetsConfirmation" JSONB;
