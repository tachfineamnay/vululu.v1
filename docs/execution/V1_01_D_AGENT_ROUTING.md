# V1-01-D — AGENT ROUTING, BUDGET ET COUTS

- **Date** : 2026-10-24
- **Commit code D** : 1110240
- **Modules B reutilises** : AgentDefinition, AgentConfigVersion, Provider, Model, routeCapability, RoutingDecision, CostEvent

## 1. Gel de configuration

DurableRoutingService :

- lit l agent production-director et sa configuration active ;
- fige agentDefinitionId, agentConfigVersionId et agentConfigChecksum ;
- persiste ces references dans RunRoutingSnapshot avec la decision provider/model ;
- ne relit jamais la configuration pour modifier un run deja fige.

Une promotion/rollback de configuration agent apres le lancement ne reecrit donc pas le run existant.

## 2. Catalogue mock

Bootstrap local idempotent (apps/api/src/worker/bootstrap.ts) :

- provider mock-a : modele mock-a-primary, qualite 90, 5 cents ;
- provider mock-b : modele mock-b-fallback, qualite 70, 2 cents ;
- agent production-director, configuration version 1, checksum 64 caracteres.

Aucun provider payant, aucun appel reseau fournisseur reel.

## 3. Fallback

Experience : worker demarre avec DURABLE_MOCK_FAIL_MODEL=mock-a-primary.
Run cmvmpk5bg0010hayslts4bgme.
RunRoutingSnapshot observe :

    providerKey = mock-b
    modelKey = mock-b-fallback
    usedFallback = true
    actualCents = 2

Le fallback est trace, budgete et utilisable par le pipeline. Le media reste rendu par le renderer deterministe local ; le routage choisit et trace le provider mock, il ne declenche pas un modele IA reel.

## 4. Budget insuffisant

Worker configure avec DURABLE_BUDGET_CENTS=1.
Run cmvmpm3i5001whays0hmh3yaa.
Resultat :

- resolve-capabilities echoue avec No eligible model for capability ;
- JobRun failed ;
- aucun RunRoutingSnapshot ;
- aucun CostEvent ;
- aucune scene rendue, aucun master cree.

Le refus budget intervient avant tout effet media facturable.

## 5. Couts

- CostEvent porte une cle idempotencyKey unique.
- Le cout du routage est enregistre une fois par run : cost:routing:<jobRunId>.
- Le cout de transfert mock est enregistre une fois : cost:<jobRunId>:transfer.
- Les retries ne dupliquent pas le cout.
- Les couts sont MOCK et ne representent aucune depense reelle.
- Le total observe sur la campagne est de 10 evenements de cout, 26 cents mock, sans doublon.

## 6. Limites

- Les estimations de qualite/latence sont des fixtures locales.
- Le renderer media deterministe ne depend pas du provider choisi ; le routage est une decision de capability tracee, pas un appel fournisseur.
- Aucun tarif reel, aucune facturation, aucun budget reel.
- Le budget est injecte par DURABLE_BUDGET_CENTS dans le worker local ; il devra venir de la politique applicative en production.
