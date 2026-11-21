-- P11-A : administration complete des comptes utilisateurs.
-- Migration strictement additive : colonnes avec defaut/nulles, aucune donnee modifiee.
-- "status" vaut "active" pour tous les comptes existants (defaut PostgreSQL).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
