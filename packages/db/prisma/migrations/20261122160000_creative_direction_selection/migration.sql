-- P12-05 — pointeur propriétaire vers la direction artistique retenue du projet.
-- Migration additive uniquement : deux colonnes nullables, aucune donnée réécrite, aucun DROP.
ALTER TABLE "Project" ADD COLUMN "selectedCreativeVersion" INTEGER;
ALTER TABLE "Project" ADD COLUMN "selectedCreativeAt" TIMESTAMP(3);
