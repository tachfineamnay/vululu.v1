# V1-01-A.1 — CONSOLIDATION ARCHITECTURALE

- **Date** : 2026-10-23
- **Branche** : v1-01-a1-consolidation
- **Base** : v1-01-a-application-layer, commit 165aa2d
- **Code** : commit local b1824c1
- **Objectif** : supprimer la dépendance métier au moteur V0, rendre les écritures atomiques et les snapshots cohérents
- **Verdict** : GO pour A.1

## 1. Résultat

LegacyWorkflowAdapter et apps/api/src/services/ ont été supprimés. Les routes, use cases et ports ne dépendent plus d un service legacy. Les opérations brief, storyboard, messages, scène, bundle, production, correction, approbation, transfert, QA, image et master passent par des use cases injectés et des ports spécialisés.

Preuves de découplage :

    grep services/ apps/api/src
    -> aucun résultat

    grep @vululu/db packages/application/src
    -> aucun résultat

    grep @vululu/db packages/domain/src
    -> aucun résultat

    grep LegacyWorkflowAdapter apps/api/src
    -> aucun résultat

    grep projectWorkflow apps/api/src
    -> aucun résultat

## 2. Matrice route -> use case -> port -> adaptateur

| Route | Use case | Port | Adaptateur |
|---|---|---|---|
| GET /api/contexts | ContextUseCases.list | ContextRepository | PrismaContextRepository |
| POST /api/contexts | ContextUseCases.create | ContextRepository | PrismaContextRepository, transaction contexte+revision |
| GET /api/projects | ProjectUseCases.list | ProjectRepository, ContextRepository | Prisma |
| POST /api/projects | ProjectUseCases.create | ProjectRepository, ContextRepository | Prisma |
| GET /api/projects/:id | ProjectBundleUseCases.get | ProjectBundleQueryPort | PrismaProjectBundleQuery |
| PATCH /api/projects/:id/brief | BriefUseCases.update | BriefStore | PrismaBriefStore, transaction brief+revision+statut |
| POST /api/projects/:id/messages | MessageUseCases.add | MessageStore | PrismaMessageStore, paire atomique |
| POST /api/projects/:id/storyboard | StoryboardUseCases.generate | BriefStore, SceneRepository, StoryboardStore | PrismaBriefStore, PrismaSceneRepository, PrismaStoryboardStore, transaction unique |
| PATCH /api/projects/:id/scenes/:sceneKey | SceneUseCases.updateDuration | SceneRepository | PrismaSceneRepository |
| POST /api/projects/:id/produce | ProductionUseCases.startProduction | ProductionRunRepository, ProductionExecutorPort | PrismaProductionRunRepository, LocalProductionExecutor |
| POST /api/projects/:id/scenes/:sceneKey/correct | ProductionUseCases.startCorrection | ProductionRunRepository, ProductionExecutorPort | Prisma + LocalProductionExecutor |
| GET /api/projects/:id/status | ProjectBundleUseCases.get | ProjectBundleQueryPort | PrismaProjectBundleQuery |
| GET /api/projects/:id/scenes/:sceneKey/image | ArtifactAccessUseCases.getSceneImage | ArtifactAccessPort | PrismaArtifactAccess + LocalStoragePort |
| GET /api/projects/:id/master | ArtifactAccessUseCases.getMaster | ArtifactAccessPort | PrismaArtifactAccess + LocalStoragePort |
| POST /api/projects/:id/approve | ProductionUseCases.approve | MasterRepository | PrismaProductionRepository |
| POST /api/projects/:id/transfer | ProductionUseCases.transfer | MasterRepository, PostizPort | PrismaProductionRepository, PostizMockAdapter |
| GET /api/projects/:id/qa | ProductionUseCases.getQa | MasterRepository | PrismaProductionRepository |

## 3. Use cases et responsabilités

- ContextUseCases / ProjectUseCases : identité, propriété et validation Domain.
- BriefUseCases : validation du contenu, checksum du Domain, révision append-only.
- StoryboardUseCases : templates, identifiants stables, CharacterVersion append-only, écriture atomique.
- MessageUseCases : réponse déterministe et paire user/assistant transactionnelle.
- SceneUseCases : durée validée par le Domain, identité de scène préservée.
- ProjectBundleUseCases : modèle de lecture dédié, sans Prisma dans les routes.
- ProductionUseCases : start/correction, approbation exacte, transfert, QA.
- ArtifactAccessUseCases : sélection d un binaire, la route ne connaît plus la DB.

## 4. Ports et frontières

Ports actifs :

- ContextRepository, ProjectRepository, BriefStore, SceneRepository, StoryboardStore, MessageStore, ProjectBundleQueryPort.
- ProductionRunRepository, ProductionExecutorPort, ProductionExecutionStore.
- MasterRepository, PostizPort, ArtifactAccessPort, AuditPort, StoragePort, MediaRendererPort.
- Clock, IdGenerator.

Le Domain Core ne dépend toujours que de TypeScript pur. L Application ne dépend que des types de ports. La composition root est le seul endroit qui assemble Prisma, média, Postiz mock et HTTP.

## 5. Contrats HTTP

Les contrats V0/V1-01-A sont préservés, y compris :

- bundle GET projet et status ;
- brief avec revisions ;
- storyboard en bundle ;
- messages user/assistant ;
- scène retournée avec ses horodatages ;
- job et jobRun pour produce/correct ;
- image PNG et master MP4 avec cache/range ;
- approbation, transfert, QA.

Les champs createdAt/updatedAt des contextes et projets, perdus en V1-00, ont été restaurés. Un test manuel sur l instance V1 confirme ces clés.

Seul ajout fonctionnel : l approbation exige désormais un master QA PASS. C est une règle de qualité, pas un changement de contrat de succès.

## 6. Dette résiduelle

- PrismaBriefRepository reste comme fixture de tests d infrastructure ; il n est plus utilisé par l application.
- LocalOrchestratorAdapter/ProviderPort restent des points d extension testés, non branchés au composition root.
- Le transfert mock utilise un timer local pour passer de submitted à acknowledged. Ce n est ni durable ni représentatif d un vrai Postiz.
- L exécution média reste in-process, sans queue durable ni reprise crash.
- Les statuts de projet restent des chaînes et plusieurs writers existent ; une machine à états centralisée reste à faire.
- Les checksums des snapshots legacy peuvent différer de la canonicalisation Domain des nouveaux runs.

## 7. Conclusion

A.1 atteint les critères de sortie : aucune dépendance métier aux services legacy, adaptateur supprimé, storyboard et versions atomiques, snapshot/run transactionnel, stratégie artefacts documentée, régression critique verte. Verdict GO pour A.1.