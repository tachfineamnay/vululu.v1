# V1-DEMO — Traçabilité et état courant

- Date : 2026-11-04 ; source : CDC V1.2 et plan V1-DEMO autorisé.
- Les lots ci-dessous sont ceux du plan démo, distincts des anciens lots P0-A/F.
- État initial : présent = inspecté dans le code, pas une certification ; chaque preuve de livraison sera ajoutée par le lot.

| PRD | Exigences CDC | Nature cible démo | Lot | État initial / preuve à produire |
|---|---|---|---|---|
| PRD-01 | F-001/002/003 | REAL | 2,10,12 | Auth/RBAC existants ; seed démo et recette distincte à ajouter |
| PRD-02 | F-010/011/012 | REAL + analyse MOCK | 5,6 | Contextes éditables, révisions et propositions MOCK à confirmer vérifiés ; aucune ingestion distante revendiquée |
| PRD-15/16 | F-013 | REAL | 5 | Campagnes et bibliothèque versionnée présentes ; preuves locales, qualification S3 et compositing restants |
| PRD-03/04 | F-020 | REAL | 6,7 | Profil versionné et compatibilités validés, Video au ratio du brief ; autres sorties à qualifier |
| PRD-05 | F-021/022/023 | REAL + voix échantillons MOCK | 7 | Audio/mix absent ; licences et QA à vérifier |
| PRD-03/06 | F-024 | REAL + propositions MOCK | 6 | Révisions et confirmation exacte, conversation à reprise explicite, storyboard issu du brief ; origine des durées explicite et reprise du défaut |
| PRD-06 | F-030 | Plan déterministe MOCK | 6 | Plan et dépendances exposés avant confirmation, storyboard adapté au brief ; durées personnalisées et historiques conservées dans la prévision, invalidations média à affiner |
| PRD-07/11 | F-031/032/033 | REAL + invocations MOCK | 6,10 | Registres/configs/catalogue et workflow figés au lancement ; promotion, droits, plafond, timeout/annulation, validation et fallback testés ; parcours admin démo complet restant |
| PRD-08 | F-040/041/042 | REAL | 3,7,8 | IDs/versions/correction présents ; nouveaux formats à tester |
| PRD-09/13 | F-043 | REAL | 4,11,12 | Chemin durable codé ; preuve Linux/crash incomplète |
| PRD-09 | F-044 | REAL | 8 | Preview/comparaison présents ; commentaires scène à livrer |
| PRD-14 | F-050 | REAL | 7,8 | QA technique présente ; droits/audio/complétude à étendre |
| PRD-09/10 | F-051 | REAL | 8 | Approbation exacte présente ; reprise/concurrence à revalider |
| PRD-10 | F-052 | MOCK | 8 | Pas de connexion Postiz ; acquittement démo récupérable requis |
| PRD-11 | F-060 | REAL | 10 | Admin présente ; parcours complet démo à rejouer |
| PRD-13 | F-061 | Règles REAL, montants MOCK | 6 | Estimation indicative et plafond dans le brief ; refus de dépassement avant job/outbox et garde worker ; aucun coût réel revendiqué |
| PRD-12 | F-070/071 | REAL | 9 | MCP absent ; IDE/cloud et sécurité à prouver |
| PRD-04 | F-080 (P1) | Différé explicitement | Après P0 | Templates supplémentaires non nécessaires à la clôture P0 |
| PRD-01/12 | N-001 | REAL | 2,5,9,12 | Tests IDOR/RBAC Web/MCP sur chaque ressource |
| PRD-11/13 | N-002 | REAL | Tous | Scan, redaction, frontend et logs sans secrets |
| PRD-01/02/12 | N-003 | REAL | 2,3,5,9,13 | Sessions/CSRF + HTTPS/SSRF/upload/auth MCP |
| PRD-13 | N-004 | REAL | 4,8,11 | Crash/reprise et absence de doublon métier |
| PRD-13 | N-005 | REAL | 4,6,8,9,11 | Audit corrélé, versions/coûts MOCK/horodatages |
| PRD-04/15 | N-006 | REAL | 3,5,11 | S3 privé, checksum, expiration et conservation |
| Recette PRD §7 | N-007 | REAL | 1,12,13 | Unitaires/contrats/intégration/E2E reproductibles |
| PRD-03/09 | N-008 | REAL | 10,12 | Clavier/labels/contrastes/focus/mobile |
| PRD-05/14 | N-009 | REAL | 5,7 | Provenance/licences et refus sponsorisé incompatible |
| PRD-11 | N-010 | REAL | 6,10 | Promotion super-admin, rollback, snapshot |
| PRD-13/15 | N-011 | REAL | 5,11 | Politique rétention/purge + restauration testée |
| PRD-13 | N-012 | REAL | 4,10,11 | Health/queue/worker/stockage, alertes autorisées |
| E00-01/03/04 | CDC G, décisions | REAL | 0,1 | Périmètre daté, architecture existante, release et contrôles |

## Preuves d’exécution

| Lot | État | Preuve |
|---|---|---|
| 0 | PÉRIMÈTRE RÉCONCILIÉ | Addendum, ADR-0016, présent document ; 9 empreintes conformes et contrôles documentaires PASS |
| 1 | EN COURS | Convention environnement corrigée, Compose valide ; Docker Desktop indisponible, builds conteneurisés NOT_RUN |
| 2 | PARTIEL VÉRIFIÉ | 15 tests bootstrap/auth PASS, CLI/replay PASS, E2E formulaire/bannière PASS ; jeu démo complet et recette d’images restants |
| 3/4 | NON CLOS | Stockage et durabilité conteneurisés non certifiés |
| 5 | PARTIEL VÉRIFIÉ | Campagnes, actifs, relecture/révisions et proposition de contexte MOCK : API/UI, IDOR/CSRF, stockage local, snapshots et E2E production PASS ; S3 et compositing à qualifier |
| 6 | PARTIEL VÉRIFIÉ | Tranches 6A–6F : profils/confirmation, plan/plafond, politique figée, conversation, storyboard/durées et erreurs MOCK ; 6E complet 364 PASS / 2 S3 SKIP, 6F ciblé 99 PASS / 2 S3 SKIP ; invalidations fines média et qualification moteur restantes |
| 7–13 | NON CLOS | Aucun jalon final déclaré |

Preuves détaillées : `docs/execution/V1_DEMO_00_02_PROGRESS.md`.
Preuves campagnes : `docs/execution/V1_DEMO_05_CAMPAIGNS.md`.
Preuves actifs : `docs/execution/V1_DEMO_05_ASSETS.md`.
Preuves contextes : `docs/execution/V1_DEMO_05_CONTEXT_REVIEW.md`.
Preuves brief/profils : `docs/execution/V1_DEMO_06A_BRIEF_PROFILES.md`.
Preuves politique figée : `docs/execution/V1_DEMO_06B_FROZEN_POLICY.md`.
Preuves plan/budget : `docs/execution/V1_DEMO_06C_PRODUCTION_PLAN.md`.
Preuves conversation/storyboard : `docs/execution/V1_DEMO_06D_CONVERSATION.md`.
Preuves durées : `docs/execution/V1_DEMO_06E_SCENE_DURATIONS.md`.
Preuves invocations et erreurs : `docs/execution/V1_DEMO_06F_INVOCATION_FAILURES.md`.

La qualification fournisseurs IA/Postiz live reste NOT_RUN hors recette démo ; V2 reste OUT_OF_SCOPE_V2. Les états run/step/transfer de la section D et la campagne de recette section E sont vérifiés par les lots 4/8/12, pas déduits d’un simple test domaine.
