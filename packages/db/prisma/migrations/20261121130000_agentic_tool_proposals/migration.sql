-- P05 : propositions outillées structurées et résultats, sans nouveau moteur d'exécution (voir ADR-0036).
ALTER TABLE "ExecutionOperation"
  ADD COLUMN "params" JSONB,
  ADD COLUMN "result" JSONB,
  ADD COLUMN "agentTurnId" TEXT,
  ADD COLUMN "step" INTEGER;
