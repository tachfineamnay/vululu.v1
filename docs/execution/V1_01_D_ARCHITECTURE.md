# V1-01-D — ARCHITECTURE DE L ORCHESTRATION DURABLE

- **Date** : 2026-10-24
- **Branche** : v1-01-d-durable-orchestration
- **Base C** : 87eb18d
- **Commit code D** : 1110240
- **Verdict** : GO CONDITIONNEL
- **Perimetre** : architecture locale, pas de deploiement

## 1. Decision d environnement

Le sidecar Hatchet Embedded officiel v0.110.5 sous WSL2 est explicitement autorise pour le developpement local D. Docker Desktop reste indisponible sur cet hote et n est PAS valide. Le compose Docker de C reste une condition de certification d infrastructure.

## 2. Chaine cible

    API Fastify
      -> ProductionUseCases / DurableProductionUseCases
      -> OrchestrationOutbox (PostgreSQL)
      -> OutboxDispatcher
      -> HatchetOrchestratorAdapter
      -> Hatchet engine v0.110.5 (embedded sidecar, WSL2)
      -> Worker durable separe
      -> DurableProductionUseCases
      -> DurableRoutingService (B)
      -> MediaRendererPort / Sharp / FFmpeg
      -> PostgreSQL + artefacts
      -> Approval exacte -> Postiz mock

Le worker ne passe pas par HTTP. Le serveur API ne rend aucun media.

## 3. Responsabilites

| Couche | Responsabilites |
|---|---|
| Domain | etats metier, transitions, invariants, versions, identite, approbation exacte |
| Application | pipeline durable, orchestration des etapes, routage, budget, finalisation, preuves |
| Infrastructure | Prisma, outbox, Hatchet adapter, media, filesystem, providers mock |
| Worker | execution technique des taches Hatchet, sans regle metier dupliquee |

Le Domain et l Application n importent jamais le SDK Hatchet.

## 4. Composants D

- packages/domain/src/productionState.ts : machine a etats JobRun/StepRun.
- packages/application/src/use-cases/durableProduction.ts : pipeline media durable.
- packages/application/src/ports.ts : DurableProductionStore, DurableRoutingPort, DurableOrchestratorPort, Outbox.
- apps/api/src/infrastructure/durable/durableProductionStore.ts : transitions, outputs, RunArtifact, preuves.
- apps/api/src/infrastructure/durable/durableRoutingService.ts : config agent, catalogue, fallback, budget.
- apps/api/src/infrastructure/durable/hatchetOrchestratorAdapter.ts : seul import SDK cote API.
- apps/api/src/infrastructure/durable/outboxDispatcher.ts : dispatch, retry, reconciliation.
- apps/api/src/worker/pipeline.ts, main.ts : workflow et worker separes.
- migration 20261024180000_v1_01_d_durable_orchestration : tables additives.
- migration 20261024190000_v1_01_d_active_run_scope : index actif incluant waiting_approval.

## 5. Modes

- ORCHESTRATOR_MODE=local : chemin historique LocalProductionExecutor, non durable, conserve pour fallback et tests existants.
- ORCHESTRATOR_MODE=hatchet : DurableProductionExecutor. C est le mode utilise pour les preuves D.

Le mode est selectionne explicitement. Les deux modes partagent les memes use cases metier, les memes versions et la meme base ; il n y a pas deux architectures metier.

## 6. Versions

- Hatchet v0.110.5, SDK TypeScript 1.43.0.
- Node 24.21.0, PostgreSQL 17.2 local.
- Les versions du POC C sont reutilisees, sans changement non justifie.

## 7. Limites assumees

- Docker non execute ; certificateur futur.
- Sidecar embedded non supervise par un service systeme.
- Redemarrage complet du moteur Hatchet non teste dans ce lot ; reste NOT_RUN pour la certification d infrastructure.
- Aucun provider payant, aucun Postiz reel, aucun S3 externe.
- D n est pas pret pour la production ; c est une architecture locale validee.
