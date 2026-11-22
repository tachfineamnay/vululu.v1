-- P04 : métadonnées additives des directions artistiques portées par CreativeRevision (voir ADR-0035).
ALTER TABLE "CreativeRevision"
  ADD COLUMN "label" TEXT,
  ADD COLUMN "origin" TEXT,
  ADD COLUMN "provenance" JSONB;
