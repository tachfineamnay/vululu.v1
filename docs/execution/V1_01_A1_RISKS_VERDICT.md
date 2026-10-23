# V1-01-A.1 — DETTE RÉSIDUELLE ET VERDICT

- **Date** : 2026-10-23
- **Branche** : v1-01-a1-consolidation
- **Commit** : b1824c1
- **Verdict** : GO pour V1-01-A.1
- **Interdictions respectées** : aucun push, merge main, déploiement, provider payant, Postiz réel, Hatchet/S3 activé, destruction de données

## 1. Critères de sortie

| Critère | Statut |
|---|---|
| Aucune dépendance métier des routes/use cases aux services legacy | PASS : services supprimés, grep vide |
| Adaptateur legacy supprimé ou résidu justifié | PASS : LegacyWorkflowAdapter et services supprimés |
| Storyboard et versions atomiques | PASS : transaction unique + test rollback |
| Snapshots cohérents face aux écritures concurrentes | PASS : transaction Serializable + verrou projet + index unique actif + test concurrence |
| Stratégie DB/artefacts documentée | PASS : doc dédiée + script audit |
| Aucune régression critique | PASS : 135 tests, E2E 10 s, cible 50 s |
| Rapport de dette résiduelle | PASS : ce document |

## 2. Dette résiduelle

| ID | Dette | Impact | Traitement |
|---|---|---|---|
| D-01 | Aucun heartbeat/timeout pour JobRun running | Un crash peut bloquer les nouveaux runs | Heartbeat + policy de péremption/réconciliation en V1-01-B |
| D-02 | Exécution média in-process | Pas de reprise crash, pas de retry durable | POC Hatchet et port Orchestrator |
| D-03 | Transfert mock acquitté par timer local | Non durable, non représentatif d un Postiz réel | Adaptateur Postiz réel ou worker d ack |
| D-04 | Statuts projet en chaînes, plusieurs writers | Transitions non centralisées | Machine à états Domain/Application |
| D-05 | Checksums legacy non recalculés | Les anciens snapshots ne sont pas vérifiables par le helper Domain | Marquer legacy ou migration de recalcul contrôlée |
| D-06 | PrismaBriefRepository reste une fixture de tests | Code non utilisé par l application | Supprimer ou déplacer dans les fixtures |
| D-07 | ProviderPort/LocalOrchestratorAdapter non branchés | Abstractions d extension non actives | Garder documentées ou retirer au prochain lot |
| D-08 | Pas de StoryboardRevision persistée | Storyboard atomique mais pas de document de révision dédié | Décision Domain/DB en V1-01-B |
| D-09 | Lint 35 warnings | Dette de qualité | Corriger sans exclure de fichiers |
| D-10 | CI GitHub NOT_RUN | Validation distante absente | Après autorisation de push |
| D-11 | Pas de S3, pas de GC artefacts | Orphelins locaux, pas de rétention | S3/GC en lot infrastructure |
| D-12 | Pas de provider IA réel | Agentique non branchée | Lot B Agentic Capabilities |

## 3. Risques

- Un run bloqué reste bloqué jusqu à intervention : à documenter dans le runbook.
- Un crash entre écriture fichier et finalisation DB laisse des orphelins : audit seulement, pas de suppression.
- Les opérations média ne sont pas rejouables automatiquement.
- La QA est désormais obligatoire avant approbation ; un master FAIL ne peut plus être approuvé, ce qui est volontaire.
- Les tests d infrastructure utilisent encore des fixtures Prisma directes ; ils ne prouvent pas un déploiement Linux.

## 4. Décisions prises

1. Supprimer l adaptateur legacy plutôt que le conserver.
2. Un seul ledger actif par projet au niveau PostgreSQL.
3. Snapshot d entrée immuable + outputs séparés.
4. QA PASS obligatoire avant approbation.
5. Accepter les orphelins locaux en A.1, avec audit read-only et nettoyage manuel.
6. Ne pas activer Hatchet/S3/Postiz réel dans A.1.

## 5. Verdict

GO pour V1-01-A.1.

Les invariants architecturaux demandés sont respectés : le noyau métier ne dépend plus du moteur V0, les use cases sont injectés, les écritures critiques sont atomiques, les snapshots sont transactionnels et la régression critique est verte. Les dettes restantes sont documentées et isolées ; elles concernent la durabilité d exécution, l observabilité, la CI distante et les intégrations externes, pas les frontières Domain/Application/Infrastructure.

Le lot B — Agentic Capabilities peut être engagé conformément à la demande, sans réutiliser les services legacy.
