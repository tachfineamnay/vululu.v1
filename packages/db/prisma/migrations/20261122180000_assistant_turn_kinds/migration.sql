-- Les tours "brainstorm" (P12-05) et "agent" (P12-06) sont réellement persistés par le
-- service assistant, mais la contrainte d'origine n'autorisait que les deux kinds de P11.
-- Sur une base construite par migrate deploy, tout brainstorming échouait en 500
-- (Postgres 23514 AssistantTurn_kind_check). Élargissement sans perte : aucune ligne
-- existante n'est modifiée, aucune colonne n'est retirée.
ALTER TABLE "AssistantTurn" DROP CONSTRAINT "AssistantTurn_kind_check";
ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_kind_check"
  CHECK ("kind" IN ('marketing', 'creative', 'brainstorm', 'agent'));
