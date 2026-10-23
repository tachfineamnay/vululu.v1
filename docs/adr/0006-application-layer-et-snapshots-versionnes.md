# ADR-0006 — Application Layer par use cases et snapshots de production versionnés

- **Statut** : Acceptée
- **Date** : 2026-10-23
- **Décideurs** : Lead Architecture, Backend, Domain, QA
- **Sources** : PRD V1, CDC V1, ADR-0001, ADR-0002, ADR-0005, rapport V1-01-A

## Contexte

La V1-00 avait posé des sessions, un Domain Core et des ports, mais les routes Fastify appelaient encore des services legacy couplés Prisma pour le brief, le storyboard, les messages, les scènes, la production, l approbation et le transfert. Les productions n étaient pas rattachées à un document reproductible versionné.

Le lot V1-01-A doit rendre les routes minces, appeler des use cases injectés, ne pas laisser Prisma/Fastify dans le Domain Core ou les use cases, rattacher contexte, brief, scènes et personnages à un JobRun, figer un snapshot et des outputs checksummés, et garantir les créations transactionnelles.

## Décision

1. Les routes HTTP valident, authentifient, appellent un use case et traduisent les erreurs. Elles ne contiennent pas de logique métier.
2. Les use cases dépendent uniquement de ports. ProjectWorkflowPort et ProductionWorkflowPort isolent les opérations encore legacy.
3. Les services legacy sont encapsulés dans LegacyWorkflowAdapter, un adaptateur d infrastructure derrière les ports. Cet adaptateur est une dette de migration explicite, pas une couche applicative.
4. Chaque production crée un JobRun et ses StepRun dans une transaction Prisma, avec un snapshot d entrée immuable, schemaVersion 1 et snapshotChecksum.
5. Les outputs (scènes, master, QA) sont stockés séparément dans JobRun.outputs, avec outputsChecksum. La QA de l artefact et les outputs sont finalisés dans une transaction Prisma.
6. Le snapshot référence les IDs de révision de contexte, de brief, les versions de scènes et de personnages, la politique provider, les paramètres de rendu et les checksums.
7. La création contexte + ContextRevision et la mise à jour brief + BriefRevision sont transactionnelles.

## Conséquences

- Positives : routes et use cases découplés de Prisma/FFmpeg ; snapshots auditables, checksummés et reliés aux révisions ; rollback testé pour JobRun/StepRun ; compatibilité V0 et données existantes préservée.
- Négatives ou coûts : LegacyWorkflowAdapter reste une dette ; l exécution média est in-process, non durable ; la capture du snapshot et l insertion du JobRun ne sont pas une transaction unique ; les fichiers média ne sont pas transactionnels avec PostgreSQL.
- Impacts : migration 20261023160509_v1_01_a_snapshot_versioning, 132 tests, E2E 10 s et 50 s, docs V1-01-A.

## Alternatives envisagées

- Laisser les routes appeler les services legacy : rejeté, contraire à l objectif de couche applicative.
- Réécrire tous les services legacy dans le même lot : rejeté, risque trop élevé et lot trop large ; l adaptateur est une transition contrôlée.
- Stocker outputs dans le même JSON que le snapshot : rejeté, le snapshot d entrée doit rester immuable ; outputs séparés et checksummés.
- Considérer l exécution locale comme durable : rejeté ; Hatchet reste un POC séparé.

## Références

- packages/application/src/ports.ts
- packages/application/src/use-cases/project-workflow.ts
- packages/application/src/use-cases/production.ts
- apps/api/src/infrastructure/legacy/legacyWorkflowAdapter.ts
- apps/api/src/infrastructure/prisma/reproducibilityAdapter.ts
- apps/api/src/infrastructure/prisma/jobRunRepository.ts
- docs/execution/V1_01_A_SNAPSHOTS.md
- docs/execution/V1_01_A_TEST_EVIDENCE.md
