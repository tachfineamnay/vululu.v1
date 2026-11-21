-- P09A : etat de rendu observable et annulation cooperative.
-- Migration strictement additive : colonnes nullables par defaut, aucune donnee modifiee.
ALTER TABLE "StudioRender" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StudioRender" ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
