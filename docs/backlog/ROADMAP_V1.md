# Feuille de route V1 — Vululu AI

- **Statut** : proposition issue de la Mission 00, non encore approuvée lot par lot
- **Date** : 2026-10-21
- **Sources** : [PRD V1.2](../01_PRD_V1.md), [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md), [Architecture V1](../03_ARCHITECTURE_V1.md), [Backlog](../11_BACKLOG.md), [Rapport d'inauguration](../INAUGURATION_REPORT.md)

## 1. État de départ

Le dépôt ne contient encore aucune application. La Mission 00 a livré le corpus documentaire, les ADR et la structure. Le premier lot technique proposé est P0-0 (audit et fondations), avant tout développement métier.

## 2. Principes de séquencement

1. **Lever les inconnues avant de coder** : stack, orchestration, environnement, stratégie de tests.
2. **Tranche verticale d'abord** : invitation → contexte → brief → run mock → artefact → QA → approbation → Postiz mock, avant les fournisseurs réels.
3. **Un lot = un périmètre testable et réversible**, avec preuves et limitations.
4. **Aucune fonctionnalité V2** pendant les lots V1 ; seuls les points d'extension documentés sont admis.
5. **Chaque lot laisse la verticale existante fonctionnelle** et n'introduit pas de dette silencieuse.
6. **Les providers réels arrivent après les contrats et les mocks**, pas avant.

## 3. Lots proposés

| Lot | Objectif | Contenu principal | Dépendances | Critères de sortie | Preuves |
|---|---|---|---|---|---|
| **P0-0** | Audit et fondations | Audit QeyNox/SocioPulse, ADR stack et structure, environnement local, POC Hatchet, stratégie de tests, matrice de traçabilité | Mission 00 | ADR acceptés ; POC exécuté ou NOT_RUN motivé ; doc 10 produite ; aucun code métier | ADR, rapport POC, doc 10, matrice, commandes |
| **P0-A** | Identité et contextes | Invitations, activation, RBAC, isolation, page super-utilisateur, BrandContext et révisions, assets et campagnes, MCP de lecture sur les contextes | P0-0 | Tests invitation/IDOR/isolation ; contexte versionné et validé ; admin minimale | Tests unitaires/intégration/E2E, captures, journal |
| **P0-B** | Wizard et brief | Profils plateforme, formats/ratios, organique/sponsorisé, DA, voix/musique/mix, BriefRevision, validation, estimation | P0-A | Brief structuré, haché, confirmé ; toutes les options P0 testées | Tests contrat brief, comparaison de révisions, UI |
| **P0-C** | Cœur agentique et durabilité | AgentDefinition/ConfigVersion, capacités/modèles/fournisseurs, routeur et fallback, coûts, JobSpec/JobRun/StepRun, Hatchet, retries, checkpoints, invalidation de dépendances | P0-B | Run durable repris après crash sans duplication ; coût plafonné ; routage traçable | Tests crash/restart, fallback, coûts, traces |
| **P0-D** | Rendu et contrôle | Image, carrousel, motion, vidéo, audio/mix, Scene/SceneVersion, Character/CharacterVersion, masters/proxys, QA technique et droits, previews, approbation exacte, correction ciblée | P0-C | Verticale image complète ; correction SCENE-ID sans renumérotation ; QA bloquante | Tests média, UAT, preuves de version |
| **P0-E** | Diffusion et MCP | Adaptateur Postiz, credentials, handoff idempotent, états et erreurs, MCP OAuth/scopes, outils lecture et mutation, tests IDE/cloud, admin restreinte | P0-D | Transfert Postiz mock puis réel ou limitation acceptée ; parité MCP/web | Tests idempotence, matrice MCP, reçus |
| **P0-F** | Observabilité et recette | Traces/audit/coûts consolidés, backups/restauration, performance, sécurité, E2E, GO/NO-GO | Tout | Tests P0 verts ; décision explicite ; runbook | Rapport de recette, logs, scans |
| **P1** | Ergonomie secondaire | Templates supplémentaires, recherche avancée, comparaison de modèles | P0 | Après stabilisation P0 uniquement | Tests dédiés |

## 4. Matrice de traçabilité

| Exigence PRD | Exigences CDC principales | Épics | Lot |
|---|---|---|---|
| PRD-01 Accès privé | CDC-F-001, 002, 003, CDC-N-001 | E01 | P0-A |
| PRD-02 Contextes | CDC-F-010, 011, 012, 013 | E02 | P0-A |
| PRD-16 Campagnes | CDC-F-013 | E02 | P0-A |
| PRD-03 Workflow | CDC-F-020 à 024 | E03 | P0-B |
| PRD-04 Sorties créatives | CDC-F-020, 040, 041 | E03, E06 | P0-B, P0-D |
| PRD-05 Audio | CDC-F-021, 022, 023 | E03, E06 | P0-B, P0-D |
| PRD-06 Creative director | CDC-F-024, 030, 031 | E03, E04 | P0-B, P0-C |
| PRD-07 Multimodèle | CDC-F-031, 032, 033 | E04 | P0-C |
| PRD-08 Édition ciblée | CDC-F-040, 042, 044 | E06, E07 | P0-D |
| PRD-09 Boucle humaine | CDC-F-043, 044, 051 | E07 | P0-D |
| PRD-10 Diffusion | CDC-F-051, 052 | E08 | P0-E |
| PRD-11 Administration | CDC-F-003, 031, 060 | E01, E04, E10 | P0-A, P0-C, P0-F |
| PRD-12 MCP | CDC-F-070, 071 | E09 | P0-A (lecture), P0-E (parité) |
| PRD-13 Coûts et résilience | CDC-F-043, 061, CDC-N-004, 005, 012 | E04, E05, E10 | P0-C, P0-F |
| PRD-14 Qualité et droits | CDC-F-050, CDC-N-009 | E07, E10 | P0-D, P0-F |
| PRD-15 Bibliothèque | CDC-F-013 | E02, E06 | P0-A, P0-D |
| Objectifs pilote PRD section 7 | CDC section E | Tous | P0-F |

## 5. Jalons et décisions

- **G0 — fin P0-0** : ADR stack et structure acceptés, POC Hatchet documenté, doc 10 disponible. Décision GO P0-A.
- **G1 — fin P0-A** : invitations et isolation prouvées, contextes versionnés. Décision GO P0-B.
- **G2 — fin P0-B** : brief structuré et confirmé. Décision GO P0-C.
- **G3 — fin P0-C** : durabilité et routage prouvés. Décision GO P0-D.
- **G4 — fin P0-D** : verticale image et correction ciblée prouvées. Décision GO P0-E.
- **G5 — fin P0-E** : transfert et MCP qualifiés. Décision GO P0-F.
- **G6 — fin P0-F** : recette et décision GO/NO-GO production interne.

Chaque décision est explicite, écrite et horodatée ; aucun GO implicite.

## 6. Risques de séquencement

- Le POC Hatchet peut échouer ou être insuffisant : le port permet un moteur alternatif, mais le choix doit être anticipé.
- L'API Postiz peut ne pas couvrir le transfert attendu : prévoir un mode mock explicite et une limitation acceptée.
- Les fournisseurs média réels peuvent être indisponibles ou trop coûteux : contrats et mocks d'abord, budget ensuite.
- Le périmètre V1 est large : la verticale mock doit rester le fil conducteur pour éviter les lots horizontaux interminables.
- Le dépôt public expose les spécifications : la visibilité doit être tranchée avant tout contenu sensible.

## 7. Prochaine action

Proposer et obtenir un **GO P0-0**, exécuter l'audit et les fondations, puis décider GO P0-A. Aucun développement métier n'est autorisé avant la clôture de P0-0.
