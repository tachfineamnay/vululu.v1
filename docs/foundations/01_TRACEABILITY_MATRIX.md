# 01 — Matrice de traçabilité

- **Version** : 1.0
- **Date** : 2026-10-21
- **Mission** : Mission 01 — consolidation des fondations
- **Statut** : matrice documentaire, aucun code
- **Base** : main 69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50
- **Sources** : [PRD V1.2](../01_PRD_V1.md), [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md), [Architecture V1](../03_ARCHITECTURE_V1.md), [Backlog](../11_BACKLOG.md), [Tests d'acceptation](../10_ACCEPTANCE_TESTS.md)

## 1. Objet

Établir la chaîne complète :

    Exigence PRD -> Exigence CDC -> Épic -> Lot -> Contrat -> Test d'acceptation -> Source et statut

Distinguer les exigences acceptées, proposées, contradictoires et manquantes. Signaler les exigences orphelines.

## 2. Légende

### 2.1 Statut de l'exigence

- **ACCEPTED** : présente dans le PRD et le CDC, cohérente avec l'architecture.
- **PROPOSED** : proposition de mission, non validée par le corpus.
- **CONTRADICTORY** : sources en désaccord, décision requise.
- **MISSING** : référencée mais absente du corpus.
- **OPEN** : exigence acceptée, mais une décision de mise en œuvre reste ouverte.

### 2.2 Statut du test

- **SPECIFIED** : test défini, non exécuté.
- **NOT_RUN** : aucune exécution, aucun code.
- **PASS / FAIL / MOCK** : réservés aux exécutions futures.

### 2.3 Contrats

Les contrats sont identifiés mais pas encore produits. Ils seront détaillés en M05, M06, M08 et M09.

| Contrat | Objet | Statut |
|---|---|---|
| C-IDENTITY | Invitation, activation, rôle, session | À produire |
| C-CONTEXT | BrandContext, ContextRevision, assets | À produire |
| C-BRIEF | BriefRevision, hash, confirmation | À produire |
| C-RUN | ProductionRun, StepRun, checkpoints | À produire |
| C-SCENE | Scene, SceneVersion, Character, CharacterVersion | À produire |
| C-ARTIFACT | Artifact, ArtifactVersion, checksum, provenance | À produire |
| C-APPROVAL | Approbation d'une version exacte | À produire |
| C-TRANSFER | Transfert Postiz, états, idempotence | À produire |
| C-AGENT | AgentDefinition, AgentConfigVersion, prompts | À produire |
| C-PROVIDER | Capability, Provider, Model, routage, fallback | À produire |
| C-COST | Estimation, coût réel, plafond | À produire |
| C-AUDIT | AuditEvent, traces, corrélation | À produire |
| C-MCP | Outils MCP, scopes, erreurs | À produire |
| C-MEDIA | Profils média, pipeline, audio, licences | À produire |
| C-POSTIZ | Adaptateur Postiz détaillé | À produire |

## 2.4 Sources et versions

| Source | Version | Rôle | Empreinte |
|---|---|---|---|
| docs/01_PRD_V1.md | 1.2 | Exigences produit | 2e94370887298f08eb695017c9260b7395e82adf073dae3c7e1eb2c22ecd725a |
| docs/02_CAHIER_DES_CHARGES_V1.md | 1.2 | Exigences testables et recette | 6b220a4c597bb878512f803a78175bf472aee5fdbc0814f70db17adbf70bc95b |
| docs/03_ARCHITECTURE_V1.md | 1.0 | Architecture de référence | 194644c0a573837551eb17b519c042c79b0504362c629644377004eafca1a12f |
| docs/11_BACKLOG.md | 1.0 | Épics et Definition of Done | 4fa387ef8e36d33c4ebaefa9615af060aed000ac469bdb7423375dc7145f6000 |
| docs/10_ACCEPTANCE_TESTS.md | 1.1 | Tests d'acceptation M01 | Versionnée dans la branche M01 |

Les versions 1.0/1.2 sont celles des documents reçus. Les hashes sont ceux de la Mission 00 et sont contrôlés par scripts/verify-foundation-docs.ps1.

## 3. Matrice des exigences PRD

| PRD | Intitulé | CDC principal | Épics | Lots | Contrats | Tests | Statut | Source |
|---|---|---|---|---|---|---|---|---|
| PRD-01 | Accès privé et invitations | F-001, F-002, F-003, N-001 | E01 | P0-A | C-IDENTITY | T-001, T-002, T-003, T-004 | ACCEPTED | PRD 2, CDC B |
| PRD-02 | Contextualisation réutilisable | F-010, F-011, F-012, F-013 | E02 | P0-A | C-CONTEXT | T-005, T-006, T-007 | ACCEPTED | PRD 2, CDC B |
| PRD-03 | Workflow guidé | F-020, F-021, F-022, F-023, F-024 | E03 | P0-B | C-BRIEF | T-008 à T-013 | ACCEPTED | PRD 4, CDC B |
| PRD-04 | Sorties créatives | F-020, F-040, F-041, F-050 | E03, E06 | P0-B, P0-D | C-BRIEF, C-SCENE, C-ARTIFACT | T-019, T-020, T-036, T-037 | ACCEPTED | PRD 4, CDC B |
| PRD-05 | Audio professionnel | F-021, F-022, F-023, N-009 | E03, E06 | P0-B, P0-D | C-BRIEF, C-MEDIA | T-009, T-010, T-011, T-023, T-037 | ACCEPTED | PRD 4, CDC B |
| PRD-06 | Creative director | F-024, F-030, F-031 | E03, E04 | P0-B, P0-C | C-BRIEF, C-AGENT | T-012, T-013, T-018 | ACCEPTED | PRD 5, CDC B |
| PRD-07 | Multimodèle et routage | F-031, F-032, F-033 | E04 | P0-C | C-PROVIDER | T-014, T-015, T-016, T-038 | CONTRADICTORY | PRD 5, CDC F-033 |
| PRD-08 | Édition ciblée | F-040, F-041, F-042, F-044 | E06, E07 | P0-D | C-SCENE, C-ARTIFACT | T-020, T-021, T-022 | ACCEPTED | PRD 5, CDC B |
| PRD-09 | Boucle humaine | F-043, F-044, F-051 | E07 | P0-D | C-APPROVAL | T-021, T-024, T-025 | ACCEPTED | PRD 5, CDC B |
| PRD-10 | Diffusion Postiz | F-051, F-052 | E08 | P0-E | C-TRANSFER, C-POSTIZ | T-025, T-026 | OPEN | PRD 6, CDC F-052 |
| PRD-11 | Administration minimale | F-003, F-031, F-060, N-010 | E01, E04, E10 | P0-A, P0-C, P0-F | C-IDENTITY, C-AGENT, C-AUDIT | T-004, T-014, T-033 | OPEN | PRD 5, CDC F-060 |
| PRD-12 | MCP V1 | F-070, F-071 | E09 | P0-E | C-MCP | T-027, T-028, T-029, T-039 | OPEN | PRD 6, CDC F-070 |
| PRD-13 | Coûts, résilience, traçabilité | F-043, F-061, N-004, N-005, N-012 | E04, E05, E10 | P0-C, P0-F | C-RUN, C-COST, C-AUDIT | T-017, T-030, T-031, T-033, T-040 | OPEN | PRD 6, CDC F-061 |
| PRD-14 | Qualité et droits | F-050, N-006, N-009 | E07, E10 | P0-D, P0-F | C-ARTIFACT, C-MEDIA | T-019, T-024, T-034 | ACCEPTED | PRD 6, CDC F-050 |
| PRD-15 | Bibliothèque créative | F-013, F-041 | E02, E06 | P0-A, P0-D | C-CONTEXT, C-ARTIFACT | T-007, T-022 | ACCEPTED | PRD 6, CDC F-013 |
| PRD-16 | Campagne et opération | F-013 | E02 | P0-A | C-CONTEXT | T-007 | OPEN | PRD 7, CDC F-013 |
| PRD section 7 | Objectifs du pilote | CDC section E | Tous | P0-F | Tous | T-036 à T-040 | ACCEPTED | PRD 7 |

## 4. Couverture CDC

| CDC | Intitulé court | PRD parent | Épic | Lot | Contrat | Tests | Statut | Note |
|---|---|---|---|---|---|---|---|---|
| CDC-F-001 | Invitation à durée limitée | PRD-01 | E01 | P0-A | C-IDENTITY | T-001, T-002 | ACCEPTED | — |
| CDC-F-002 | Isolation et IDOR | PRD-01 | E01 | P0-A | C-IDENTITY | T-003 | ACCEPTED | — |
| CDC-F-003 | Page super-utilisateur | PRD-11 | E01 | P0-A | C-IDENTITY | T-004 | ACCEPTED | Spec de page ouverte |
| CDC-F-010 | BrandContext | PRD-02 | E02 | P0-A | C-CONTEXT | T-005 | ACCEPTED | — |
| CDC-F-011 | Agent de contextualisation | PRD-02 | E02 | P0-A | C-CONTEXT | T-005 | ACCEPTED | — |
| CDC-F-012 | Snapshot de contexte | PRD-02 | E02 | P0-A | C-CONTEXT | T-006 | ACCEPTED | — |
| CDC-F-013 | Assets et campagnes | PRD-15, PRD-16 | E02 | P0-A | C-CONTEXT | T-007 | OPEN | Métriques de campagne absentes |
| CDC-F-020 | Réseau, format, objectif | PRD-03 | E03 | P0-B | C-BRIEF | T-008 | ACCEPTED | — |
| CDC-F-021 | Voix off | PRD-05 | E03 | P0-B | C-BRIEF | T-009 | ACCEPTED | — |
| CDC-F-022 | Musique et licences | PRD-05 | E03 | P0-B | C-BRIEF | T-010 | ACCEPTED | — |
| CDC-F-023 | Mix voix/musique | PRD-05 | E03, E06 | P0-B, P0-D | C-BRIEF, C-MEDIA | T-011, T-023 | ACCEPTED | — |
| CDC-F-024 | BriefRevision | PRD-03, PRD-06 | E03 | P0-B | C-BRIEF | T-012, T-013 | ACCEPTED | — |
| CDC-F-030 | DAG et étapes | PRD-06 | E04 | P0-C | C-AGENT, C-RUN | T-018 | ACCEPTED | — |
| CDC-F-031 | AgentDefinition et config | PRD-06, PRD-11 | E04 | P0-C | C-AGENT | T-014 | ACCEPTED | — |
| CDC-F-032 | Registre providers/modèles | PRD-07 | E04 | P0-C | C-PROVIDER | T-015, T-038 | ACCEPTED | — |
| CDC-F-033 | Routeur et fallback | PRD-07 | E04 | P0-C | C-PROVIDER | T-016, T-038 | CONTRADICTORY | PRD-07 contre CDC-F-033 |
| CDC-F-040 | Scene ID et Character ID | PRD-08 | E06 | P0-D | C-SCENE | T-019, T-020 | ACCEPTED | — |
| CDC-F-041 | Artefacts et checksums | PRD-08, PRD-15 | E06 | P0-D | C-ARTIFACT | T-022 | ACCEPTED | — |
| CDC-F-042 | Correction ciblée | PRD-08 | E06, E07 | P0-D | C-SCENE | T-021 | ACCEPTED | — |
| CDC-F-043 | Exécution durable | PRD-13 | E05 | P0-C | C-RUN | T-030 | ACCEPTED | POC requis |
| CDC-F-044 | Preview et commentaires | PRD-08, PRD-09 | E07 | P0-D | C-ARTIFACT | T-021, T-024 | ACCEPTED | — |
| CDC-F-050 | QA machine | PRD-14 | E07 | P0-D | C-ARTIFACT, C-MEDIA | T-019, T-023, T-024, T-037 | ACCEPTED | — |
| CDC-F-051 | Approbation exacte | PRD-09, PRD-10 | E07 | P0-D | C-APPROVAL | T-025 | ACCEPTED | Niveaux à préciser |
| CDC-F-052 | Handoff Postiz idempotent | PRD-10 | E08 | P0-E | C-TRANSFER, C-POSTIZ | T-026 | OPEN | API à qualifier |
| CDC-F-060 | Administration minimale | PRD-11 | E01, E04, E10 | P0-A, P0-C, P0-F | C-IDENTITY, C-AGENT, C-AUDIT | T-004, T-033 | OPEN | Spec à détailler |
| CDC-F-061 | Estimation et plafond de coût | PRD-13 | E04 | P0-C | C-COST | T-013, T-017, T-040 | OPEN | Devise et seuils |
| CDC-F-070 | MCP authentifié | PRD-12 | E09 | P0-E | C-MCP | T-027, T-028, T-029, T-039 | OPEN | Auth à trancher |
| CDC-F-071 | MCP sans outil dangereux | PRD-12 | E09 | P0-E | C-MCP | T-027, T-029 | ACCEPTED | Dépend de M08 |
| CDC-F-080 | Templates et recherche P1 | PRD-04 | E11 | P1 | C-MEDIA | T-041 | ACCEPTED | P1 différé |
| CDC-N-001 | RBAC serveur et isolation | PRD-01, PRD-11 | E01 | P0-A | C-IDENTITY | T-003 | ACCEPTED | — |
| CDC-N-002 | Secrets côté serveur | Tous | E10 | P0-F | C-AUDIT | T-034 | ACCEPTED | — |
| CDC-N-003 | HTTPS, CSRF, SSRF, uploads | Tous | E10 | P0-F | C-AUDIT | T-034 | ACCEPTED | — |
| CDC-N-004 | Reprise et idempotence | PRD-13 | E05 | P0-C | C-RUN | T-030 | ACCEPTED | POC requis |
| CDC-N-005 | Audit corrélé | PRD-13 | E10 | P0-F | C-AUDIT | T-033 | ACCEPTED | — |
| CDC-N-006 | Stockage S3 et checksums | PRD-14 | E06, E10 | P0-D, P0-F | C-ARTIFACT | T-022 | ACCEPTED | — |
| CDC-N-007 | Tests reproductibles | Tous | E00, E10 | P0-0, P0-F | C-AUDIT | T-042 | ACCEPTED | CI à créer |
| CDC-N-008 | Accessibilité de base | PRD-11, UX | E10, UX-0 | P0-F, UX-0 | UX | T-035 | PROPOSED | UX-0 à valider |
| CDC-N-009 | Licences et provenance | PRD-05, PRD-14 | E07 | P0-D | C-MEDIA | T-010, T-024 | ACCEPTED | — |
| CDC-N-010 | Prompts publiés avec rollback | PRD-11 | E04 | P0-C | C-AGENT | T-014 | ACCEPTED | — |
| CDC-N-011 | Backup et rétention | PRD-13 | E10 | P0-F | C-AUDIT | T-031, T-032 | OPEN | Durées à fixer |
| CDC-N-012 | Monitoring et alertes | PRD-13 | E10 | P0-F | C-AUDIT | T-033 | OPEN | Seuils à fixer |

## 5. Exigences orphelines et incohérences

| ID | Constat | Sources | Statut | Recommandation |
|---|---|---|---|---|
| X-01 | Critères de routage divergents : qualité/latence/santé contre compatibilité/licence/budget | PRD-07, CDC-F-033 | CONTRADICTORY | ADR M06, décision P0-C |
| X-02 | Rôles nommés super-utilisateur et super-admin | PRD-01, CDC-F-003 | PROPOSED | Glossaire M05 |
| X-03 | Campagnes sans métriques de succès du pilote | PRD-16, CDC-F-013, PRD section 7 | OPEN | Clarifier en M10 |
| X-04 | Niveaux d'approbation non explicités | PRD-09, CDC-F-051 | OPEN | Un seul niveau humain V1, décision à valider |
| X-05 | Scene/Character ID applicatifs et bindings providers | PRD-08, architecture | ACCEPTED | Documenter external_character_ref en M05 |
| X-06 | Spec de page super-utilisateur absente | CDC-F-003, F-060 | MISSING | M01 addendum UX ou M04 |
| X-07 | Mécanisme d'auth MCP non tranché | CDC-F-070, architecture | OPEN | M08 |
| X-08 | API Postiz non qualifiée | PRD-10, CDC-F-052 | OPEN | M09, mock si UNVERIFIED |
| X-09 | Fournisseur S3 et résidence non décidés | CDC-N-006 | OPEN | M04/M09 |
| X-10 | Devise, seuils et budget non définis | PRD-13, CDC-F-061 | OPEN | M04/M10 |
| X-11 | Durées de rétention/purge non définies | CDC-N-011 | OPEN | M08/M09 |
| X-12 | UX-0 absent du corpus initial | Mission 02 | PROPOSED | Addendum UX-0, M02/M03 |
| X-13 | Contrats absents | Prompt maître, CDC G | MISSING | M05, M06, M08, M09 |
| X-14 | Pack 45 incomplet | Mission 00 | OPEN | Constat, pas de reconstitution |
| X-15 | Dépôt public | Mission 00 | OPEN | D-01, aucune donnée sensible |
| X-16 | Nommage et versions V1/V1.2 | Docs | ACCEPTED | Glossaire M05 |
| X-17 | Réutilisation QeyNox non tranchée | Prompt maître | OPEN | M04, audit sans copie |
| X-18 | Stack non décidée | PRD 8, CDC F | PROPOSED | M04, direction TS full-stack |
| X-19 | Tests d'acceptation absents de main avant M01 | Mission 00 | RESOLVED M01 | docs/10 livré |
| X-20 | Administration et interlocuteur unique | PRD-11, UX | PROPOSED | Séparation, M02 |

## 6. Couverture et synthèse

| Indicateur | Valeur |
|---|---|
| Exigences PRD | 16, plus les objectifs du pilote |
| Exigences CDC | 29 fonctionnelles + 12 non fonctionnelles = 41 |
| Exigences CDC couvertes par un test | 41 |
| Tests d'acceptation | 42, SPECIFIED/NOT_RUN |
| Contrats identifiés | 15, tous à produire |
| Exigences orphelines | F-080 en P1 ; N-007 à N-012 transverses |
| Contradictions réelles | 1 (routage PRD-07/CDC-F-033) |
| Décisions ouvertes | D-01 à D-17 |

## 7. Règle de maintenance

- Toute évolution d'exigence, de contrat, d'ADR ou de test met à jour cette matrice avant merge.
- Un test sans exigence doit être supprimé ou justifié.
- Une exigence sans test doit être marquée MISSING.
- Une contradiction ne se résout pas par une hypothèse : elle exige une décision tracée.
- La matrice ne remplace pas le CDC ; elle en est l'index de couverture.

## 8. Références

- [Audit du corpus](01_CORPUS_AUDIT.md)
- [Registre des décisions](01_DECISION_REGISTER.md)
- [Tests d'acceptation](../10_ACCEPTANCE_TESTS.md)
- [PRD V1.2](../01_PRD_V1.md)
- [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md)
