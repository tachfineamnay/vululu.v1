# ADR-0003 — Hatchet derrière un port d'orchestration durable

- **Statut** : Acceptée sous condition de validation P0-0
- **Date** : 2026-10-21
- **Décideurs** : architecture Vululu AI
- **Sources** : [Architecture V1](../03_ARCHITECTURE_V1.md), section Orchestration durable ; [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md), section F ; [P0-0](../backlog/P0_0_AUDIT_FONDATIONS.md)

## Contexte

Les runs de production peuvent durer, échouer partiellement, être mis en pause pour approbation ou reprendre après un redémarrage. Les effets de bord payants (génération tierce, transfert Postiz) ne doivent pas être dupliqués. Le CDC retient Hatchet comme orchestrateur de Vululu AI, sous réserve d'un test d'intégration en préproduction.

## Décision

- L'orchestration est utilisée derrière un **port applicatif** (OrchestratorPort) ; le Domain Core n'en dépend pas.
- **Hatchet** est la cible d'implémentation, avec un namespace et une base propres à Vululu AI.
- Le Temporal de Postiz ne doit jamais être réutilisé comme orchestrateur métier.
- Les pauses d'approbation durables résident côté application et base, pas dans une session web.
- Un **POC P0-0 est bloquant** : reprise après crash, non-duplication d'une étape externe, persistance d'une approbation humaine.
- Si le POC échoue, un autre moteur peut être substitué derrière le même port, sur décision explicite.

## Conséquences

- Positives : durabilité et reprise, découplage, possibilité de changer de moteur sans toucher au domaine.
- Négatives : dépendance opérationnelle à Hatchet, complexité de déploiement local, nécessité d'idempotence applicative.
- Impacts : StepRun avec retries et checkpoints ; ledger et réconciliation pour les effets non idempotents ; tests de crash/restart obligatoires.

## Alternatives envisagées

- **Temporal** : mature, mais surdimensionné et déjà utilisé par Postiz ; risque de confusion des périmètres ; différé.
- **BullMQ ou file maison** : insuffisant pour la durabilité, les pauses et la granularité d'étapes demandées ; rejeté pour V1.
- **Appels synchrones** : incompatible avec les runs longs et la reprise ; rejeté.

## Références

- Architecture V1, section Orchestration durable.
- CDC section F (limitations et arbitrages).
- P0-0, livrable D5 (POC Hatchet).
