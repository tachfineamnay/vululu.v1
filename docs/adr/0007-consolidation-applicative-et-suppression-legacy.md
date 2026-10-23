# ADR-0007 — Consolidation applicative et suppression du workflow legacy

- **Statut** : Acceptée
- **Date** : 2026-10-23
- **Décideurs** : Lead Architecture, Backend, Domain, QA
- **Sources** : ADR-0001, ADR-0002, ADR-0005, ADR-0006, mission V1-01-A.1

## Contexte

V1-01-A avait laissé un LegacyWorkflowAdapter reliant dix opérations aux services V0 Prisma/FFmpeg. Les routes étaient minces, mais l atomicité du storyboard, la capture transactionnelle du snapshot, la concurrence de démarrage et la cohérence DB/artefacts restaient insuffisantes. L objectif final est un noyau métier indépendant, une couche applicative cohérente et des adaptateurs interchangeables.

## Décision

1. Supprimer apps/api/src/services et LegacyWorkflowAdapter.
2. Découper les opérations en use cases spécialisés : brief, storyboard, messages, scène, bundle, production, approbation, transfert, QA, accès artefacts.
3. Découper les ports : BriefStore, StoryboardStore, MessageStore, ProjectBundleQueryPort, ProductionRunRepository, ProductionExecutionStore, ProductionExecutorPort, MasterRepository, ArtifactAccessPort, en plus des repositories existants.
4. Rendre le storyboard atomique : personnage, CharacterVersion, scenes, statut projet dans une transaction avec verrou projet et contrôle optimiste de version.
5. Rendre le démarrage de run atomique : snapshot + JobRun + StepRun + ProductionJob + lien jobRunId dans une transaction Serializable, avec index unique partiel d un run actif par projet.
6. Séparer snapshot d entrée immuable et outputs checksummés ; inclure les métadonnées de correction.
7. Finaliser versions/master/QA/invalidation des approbations/outputs/statuts dans une transaction unique.
8. Exiger un master QA PASS avant approbation.
9. Servir les binaires via ArtifactAccessPort, la route ne sélectionne plus la DB.
10. Accepter les orphelins de fichiers, les auditer en lecture seule via scripts/audit-artifacts.ps1, sans suppression automatique.

## Conséquences

- Positives : aucune dépendance métier aux services V0 ; routes et use cases sans Prisma ; storyboard et run atomiques ; concurrence refusée/sérialisée ; snapshots reliés aux révisions ; contrats HTTP préservés ; 135 tests et régressions 10 s/50 s vertes.
- Négatives : dette de durabilité (pas de heartbeat/reprise), timer local pour l ack mock, anciennes fixtures et abstractions d extension non actives, pas de StoryboardRevision persistée, lint warnings.
- Impacts : migrations additives active-run index et run-integrity, nouveaux stores/use cases, tests A.1, docs A.1.

## Alternatives envisagées

- Conserver LegacyWorkflowAdapter : rejeté, contraire au critère de sortie.
- Capturer le snapshot hors transaction : rejeté, course possible avec brief/storyboard.
- Fusionner JobRun et ProductionJob : rejeté en A.1 pour préserver le contrat HTTP et les données V0 ; lien 1-1 ajouté.
- Autoriser plusieurs runs actifs : rejeté, fichiers/versions en conflit.
- Supprimer automatiquement les artefacts orphelins : rejeté, risque destructif sans décision humaine.

## Références

- docs/execution/V1_01_A1_ARCHITECTURE.md
- docs/execution/V1_01_A1_TRANSACTIONS_CONCURRENCY.md
- docs/execution/V1_01_A1_ARTIFACT_COHERENCE.md
- docs/execution/V1_01_A1_TEST_EVIDENCE.md
- docs/execution/V1_01_A1_RISKS_VERDICT.md
- packages/application/src/ports.ts
- apps/api/src/infrastructure/prisma/productionRunRepository.ts
- apps/api/src/infrastructure/prisma/storyboardStore.ts
- apps/api/src/infrastructure/production/localProductionExecutor.ts