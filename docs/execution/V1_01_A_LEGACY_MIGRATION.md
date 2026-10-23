# V1-01-A — RAPPORT DE MIGRATION DES SERVICES LEGACY

- **Date** : 2026-10-23
- **Branche** : v1-01-a-application-layer
- **Base** : v1-00-foundation, commit 83abb8e
- **Périmètre** : brief, storyboard, messages, scènes, production, approbation, transfert
- **Objectif** : routes minces, use cases injectés, ports/adapters, snapshots reproductibles

## 1. Résultat

Les routes Fastify ne dépendent plus directement des services legacy. Elles valident les entrées, authentifient, appellent un use case injecté et laissent le gestionnaire d erreurs traduire les exceptions.

Les services legacy sont encapsulés dans un seul adaptateur d infrastructure, LegacyWorkflowAdapter, derrière les ports ProjectWorkflowPort et ProductionWorkflowPort. Les use cases et le Domain Core n importent ni Prisma, ni Fastify, ni Next, ni FFmpeg.

Preuves de découplage :

    grep services/ apps/api/src
    -> uniquement apps/api/src/infrastructure/legacy/legacyWorkflowAdapter.ts

    grep @vululu/db|@prisma/client packages/application/src
    -> 0

    grep @vululu/db|@prisma/client packages/domain/src
    -> 0

    grep services apps/api/src/routes
    -> 0

## 2. Matrice route -> use case -> port -> adaptateur

| Route | Use case | Port | Adaptateur | Statut |
|---|---|---|---|---|
| GET /api/contexts | ContextUseCases.list | ContextRepository | PrismaContextRepository | Migré |
| POST /api/contexts | ContextUseCases.create | ContextRepository | PrismaContextRepository | Migré, transaction contexte+révision |
| GET /api/projects | ProjectUseCases.list | ProjectRepository, ContextRepository | Prisma | Migré |
| POST /api/projects | ProjectUseCases.create | ProjectRepository, ContextRepository | Prisma | Migré |
| GET /api/projects/:id | ProjectWorkflowUseCases.getBundle | ProjectWorkflowPort | LegacyWorkflowAdapter | Route migrée ; lecture legacy encapsulée |
| PATCH /api/projects/:id/brief | ProjectWorkflowUseCases.updateBrief | ProjectWorkflowPort | LegacyWorkflowAdapter | Route migrée ; écriture legacy encapsulée |
| POST /api/projects/:id/messages | ProjectWorkflowUseCases.addMessage | ProjectWorkflowPort | LegacyWorkflowAdapter | Route migrée |
| POST /api/projects/:id/storyboard | ProjectWorkflowUseCases.generateStoryboard | ProjectWorkflowPort | LegacyWorkflowAdapter | Route migrée |
| PATCH /api/projects/:id/scenes/:sceneKey | ProjectWorkflowUseCases.updateSceneDuration | ProjectWorkflowPort | LegacyWorkflowAdapter | Route migrée |
| POST /api/projects/:id/produce | ProductionUseCases.startProduction | ReproducibilityPort, JobRunRepository, ProductionWorkflowPort, AuditPort | Prisma + LegacyWorkflowAdapter | Migré, snapshot transactionnel |
| GET /api/projects/:id/status | ProjectWorkflowUseCases.getBundle | ProjectWorkflowPort | LegacyWorkflowAdapter | Route migrée |
| POST /api/projects/:id/scenes/:sceneKey/correct | ProductionUseCases.startCorrection | ReproducibilityPort, JobRunRepository, ProductionWorkflowPort, AuditPort | Prisma + LegacyWorkflowAdapter | Migré, snapshot transactionnel |
| GET /api/projects/:id/scenes/:sceneKey/image | ProjectWorkflowUseCases.getBundle + filesystem | ProjectWorkflowPort | LegacyWorkflowAdapter + storage local | Route migrée |
| GET /api/projects/:id/master | ProjectWorkflowUseCases.getBundle + filesystem | ProjectWorkflowPort | LegacyWorkflowAdapter + storage local | Route migrée |
| POST /api/projects/:id/approve | ProductionUseCases.approve | ProductionWorkflowPort, AuditPort | LegacyWorkflowAdapter, PrismaAuditAdapter | Route migrée |
| POST /api/projects/:id/transfer | ProductionUseCases.transfer | ProductionWorkflowPort, AuditPort | LegacyWorkflowAdapter, PrismaAuditAdapter | Route migrée |
| GET /api/projects/:id/qa | ProductionUseCases.getQa | ProductionWorkflowPort | LegacyWorkflowAdapter | Route migrée |

Les routes /api/auth/* et /api/admin/invitations restent dans le module security, hors périmètre de ce lot.

## 3. Ce qui est réellement migré

- Toutes les routes ciblées passent par un use case.
- Aucune logique métier dans les routes.
- Contextes et projets utilisent des repositories/use cases réels.
- Production utilise des ports de snapshot, JobRun et audit, plus un port d exécution.
- Les erreurs applicatives et de domaine sont traduites par le gestionnaire Fastify.
- Les actions de brief, storyboard, message, durée de scène, production, correction, approbation et transfert sont auditées via AuditPort.
- Les snapshots et JobRun sont créés avant l exécution média.

## 4. Ce qui reste legacy derrière l adaptateur

LegacyWorkflowAdapter encapsule encore :

- services/projects.ts : lecture bundle, brief, storyboard, messages, durée de scène ;
- services/production.ts : exécution média, approbation, transfert mock, QA.

Ces fonctions utilisent Prisma et FFmpeg. Elles ne sont plus appelées par les routes ni par les use cases directement : elles sont derrière un port d infrastructure.

Conséquence honnête : l architecture applicative est en place, mais l implémentation interne de certaines opérations reste legacy. Le remplacement complet de l adaptateur par des repositories/use cases métier est le sujet V1-01-B, pas une réussite fictive de ce lot.

## 5. Tests ajoutés

- tests/v1/v1-01-application.test.ts : 7 tests.
  - snapshot et jobRunId transmis à l exécutant ;
  - JobRun failed si l exécutant échoue ;
  - refus d un projet non propriétaire ;
  - délégation brief + audit ;
  - capture contexte/brief/scènes/personnages/provider/render ;
  - JobRun + StepRun transactionnels ;
  - rollback si la création échoue.
- Tests existants conservés : 132 tests au total.
- E2E V0/V1 et cible 50 s rejoués.

## 6. Limites

- L adaptateur legacy reste une dette de migration.
- L exécution média est in-process, non durable, sans reprise crash.
- Les fichiers média ne participent pas aux transactions PostgreSQL ; la transaction couvre les métadonnées/artefacts, pas les écritures filesystem.
- Le snapshot est capturé avant la transaction JobRun : il pointe vers des révisions immuables existantes, mais la capture et la création ne sont pas une seule transaction.
- Le provider reste déterministe et local.

## 7. Conclusion

Les routes et use cases sont découplés des services legacy. La migration est fonctionnelle, testée et compatible avec la V0. Le lot V1-01-A est **GO CONDITIONNEL** : architecture applicative en place, mais remplacement interne de l adaptateur legacy à poursuivre en V1-01-B.