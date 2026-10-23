# VULULU AI — V0 FULLSTACK SPRINT — PROGRESS

- **Phase courante** : V0.1 — verticale fonctionnelle certifiée avec durées configurables
- **Date** : 2026-10-23
- **Branche** : v0-fullstack-sprint
- **Base** : 0bb1bb610bf9b9b377ab70feca2450d10f890d70
- **Commit de code initial** : 0693b8f
- **Commit de correction V0.1** : 3a6d54f
- **Statut** : V0.1 COMPLETE sur les 12 critères P0 et la correction critique des durées, avec composants MOCK explicites
- **Recette indépendante** : Agent E (qa-verifier), PASS 9 contrôles, aucun FAIL produit ; réserve de sélection verify-v0 corrigée par le paramètre -ProjectId
- **Avertissement** : cette accélération V0.1 ne vaut pas validation des gates de production V1.

## 1. Fonctionnalités réalisées

- Authentification locale par session cookie chiffrée, utilisateur démo seedé.
- Base PostgreSQL 17.2 locale persistante, schéma Prisma et migrations.
- Contextes de marque persistants avec couleurs, audience, ton et description.
- Projets, brief versionné, conversation scriptée avec Vululu.
- Storyboard de cinq scènes SCENE-001 à SCENE-005, Character CHAR-001.
- Durée configurable par scène : Scene.durationSeconds, preset projet 2 s ou 10 s, ajustement par scène via PATCH.
- Génération réelle de cinq PNG 1080x1920.
- Assemblage MP4 H.264 yuv420p 1080x1920 avec durées réelles par scène, audio AAC silencieux.
- Deux scénarios produits et vérifiés : smoke 5 x 2 s = 10 s ; cible 5 x 10 s = 50 s.
- Contrôle QA média automatique : dimensions PNG, dimensions, durée attendue et codecs du MP4, checksums.
- Correction ciblée de SCENE-003 avec nouvelle version de scène, master reconstruit et anciennes versions conservées.
- Invalidation automatique des approbations antérieures dès qu'un nouveau master est créé (Approval.invalidatedAt).
- Approbation liée à la version exacte et au checksum ; checksum erroné refusé ; ancien master refusé.
- Transfert Postiz mock interdit sans approbation valide ; statut submitted puis acknowledged, aucun réseau.
- Studio de prévisualisation avec lecteur vidéo, sélecteur de version, historique des masters et approbations invalidées.
- Permissions par propriétaire, test d'isolation API entre utilisateurs.
- Interface Next.js responsive : login, dashboard, contexte, projet, conversation, brief, storyboard, studio, QA, approbation, transfert.

## 2. Agents ayant travaillé

- **Agent A — Technical Lead** : Lead unique, scaffold, contrats, schéma Prisma, auth, API, média, UI, tests, Git, intégration.
- **Agent E — qa-verifier** : activé pour la recette indépendante V0.1, en lecture seule. Il a exécuté typecheck, tests, E2E, verify-v0, scan de secrets, inspection code et bundle cible. Verdict PASS 9 contrôles, aucun FAIL produit, aucune modification de fichier, aucun commit.
- **Agents B, C, D** : responsabilités backend, frontend et média exécutées séquentiellement par le Lead pour cette itération accélérée. Aucun sous-agent B/C/D n'a été lancé ; il n'est pas prétendu qu'ils ont exécuté du travail.
- **Justification** : intégration séquentielle pour garantir la cohérence des contrats et du schéma partagé, puis recette indépendante par l'Agent E.
- **Réserve Agent E** : verify-v0 sélectionnait le dernier projet transféré, donc le smoke 10 s après l'E2E. Correction appliquée : paramètre -ProjectId ; la cible 50 s est maintenant vérifiable explicitement (PASS 23/23).

## 3. Fichiers créés ou modifiés

Socle :

- package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.base.json
- .env.example, .gitignore
- scripts/dev-db.ps1, scripts/check-secrets.ps1, scripts/verify-foundation-docs.ps1, scripts/verify-v0.ps1
- playwright.config.ts, vitest.config.ts

Applications et paquets :

- apps/api/src : server, env, auth, routes, services, types
- apps/web : layout, login, dashboard, contextes, projets, ProjectStudio, styles, client API
- packages/contracts, packages/db, packages/media
- packages/db/prisma/schema.prisma, migration initiale et migration 20261023082309_scene_durations_approval_invalidation

Tests et preuves :

- tests/api.test.ts, tests/media.test.ts
- e2e/v0.spec.ts
- docs/execution/V0_24H_PROGRESS.md, docs/execution/V0_RUNBOOK.md

Aucun secret, aucun .env, aucun artefact média, aucun node_modules et aucun fichier .v0 n'est versionné.

## 4. Tests exécutés et résultats

| Test ou contrôle | Statut | Preuve |
|---|---|---|
| pnpm typecheck | PASS | 5 projets TypeScript, aucune erreur |
| pnpm test | PASS | 8 tests Vitest : 7 API + 1 média, 41,5 s (recette Agent E) |
| Tests API | PASS | santé, auth, contexte, projet, brief, storyboard, durées configurables, refus approbation/transfert, isolation |
| Test média | PASS | 5 PNG 1080x1920, masters 10 s et 50 s, H.264/AAC, QA PASS |
| pnpm build | PASS | API TypeScript + Next.js production build |
| Playwright E2E | PASS | 1/1, 45,8 à 46,8 s, approbation v1, correction, invalidation, refus transfert, approbation v2, transfert |
| verify-v0.ps1 cible 50 s | PASS | V0_VERIFY_PASS, 23 contrôles, 49,97 s / attendu 50 s |
| verify-v0.ps1 auto | PASS | V0_VERIFY_PASS, 23 contrôles, smoke 9,97 s / attendu 10 s |
| check-secrets.ps1 | PASS | 88 fichiers versionnables, 0 secret (recette Agent E) |
| verify-foundation-docs.ps1 | PASS | 9 hashes sources, documents requis, aucun secret suivi |

MOCK explicites :

- Vululu est scripté et déterministe ; aucun LLM réel.
- Postiz est un mock local ; aucun réseau, aucune publication.
- L'audio du master est une piste AAC silencieuse ; pas de voix ou musique réelle.
- Le rendu vidéo est déterministe et local ; ce n'est pas une génération vidéo IA.
- Aucun provider IA payant n'est appelé.

NOT_RUN explicites :

- Providers IA réels (image, vidéo, voix, musique).
- Postiz réel et publication sociale.
- MCP local minimal.
- Invitations et envoi d'emails.
- Déploiement, VPS, Coolify, S3 réel, Hatchet.
- Tests de charge et de sécurité avancée.

## 5. Artefacts de la verticale certifiée

### Smoke 10 s

| Élément | Valeur |
|---|---|
| Projet | cmvkpoo6j0003hay8hgudliji |
| Preset | 2 s par scène, total 10 s |
| Statut | transferred |
| Scènes | SCENE-001 à SCENE-005, durationSeconds = 2 |
| Scene 3 versions | v2, v1 (correction ciblée) |
| Master versions | v2, v1 |
| Master v2 | checksum c450de3dc56c89134b4da1b0c5f1a85c3b7fec45d07aa64d261106182c5f5af5 |
| QA | PASS, durée 9,97 s / attendu 10 s |
| Transfert | acknowledged, provider postiz-mock |

### Cible 50 s

| Élément | Valeur |
|---|---|
| Projet | cmvkpptgv001fhay80yurse1h |
| Preset | 10 s par scène, total 50 s |
| Statut | transferred |
| Scènes | SCENE-001 à SCENE-005, durationSeconds = 10 |
| Scene 3 versions | v2, v1 (correction ciblée) |
| Autres scènes | v1 (inchangées après correction) |
| Master versions | v2, v1 |
| Master v2 | checksum b436c3e322a59ae8859ff9f5765c30f2b7d573aa40fc0637839374dbc0732072 |
| QA | PASS, durée 49,97 s / attendu 50 s |
| Approbation v2 | valide, invalidatedAt = null |
| Approbation v1 | invalidée à la création du master v2 (invalidatedAt = 2026-10-23 08:34:24) |
| Transfert | acknowledged, provider postiz-mock |
| Fichiers | data/artifacts/cmvkpptgv001fhay80yurse1h (ignoré par Git) |

Le fichier master cible v2.mp4 fait 767 828 octets ; ffprobe indépendant confirme 49,97 s, 1080x1920, h264, aac. Le contenu est fictif et généré localement.

## 6. Erreurs rencontrées et corrections

1. DATABASE_URL hérité pointant vers une base Neon externe : l'environnement hôte exposait une variable DATABASE_URL d'un autre projet. La première commande Prisma a tenté d'analyser cette base et s'est arrêtée au prompt de reset (exit 130) ; le seed a échoué avant écriture. Correction : scripts Prisma avec URL locale explicite via cross-env et garde dans apps/api/src/env.ts qui refuse toute base non locale.
2. Clé secure-session : la clé était interprétée comme base64 et faisait 24 octets. Correction : dérivation SHA-256 en Buffer de 32 octets.
3. FFmpeg Playwright minimal : le binaire Playwright ne décode pas les PNG et n'encode pas H.264. Correction : FFmpeg complet gyan.dev installé localement dans .v0/ffmpeg, chemin dans .env.
4. QA dimensions 0x1 : le parseur capturait l'identifiant de flux 0x1. Correction : dimensions 3-4 chiffres.
5. E2E projet id new : la regex acceptait /projects/new. Correction : attente d'une URL dont le dernier segment n'est pas new.
6. HMR Next bloqué depuis 127.0.0.1 : allowedDevOrigins ajouté et serveur web redémarré.
7. Test API cookie : le test envoyait le header Set-Cookie complet. Correction : paire nom=valeur uniquement.
8. Durée fixe de 2 s par scène : remplacée par durationSeconds configurable (1-15 s), preset projet 2/10, PATCH par scène, concat FFmpeg avec durée réelle et QA sur la durée attendue.
9. Approbation non invalidée sur nouveau master : ajout de Approval.invalidatedAt, invalidation après création d'un nouveau master, refus de transfert si approbation invalidée.
10. verify-v0 non épinglé : ajout du paramètre -ProjectId pour certifier explicitement le projet 50 s ; réserve Agent E corrigée.
11. Sous-agents B/C/D non lancés : exécution séquentielle par le Lead, documentée sans prétendre le contraire ; Agent E activé pour la recette indépendante.

## 7. Branche et SHA

- Branche : v0-fullstack-sprint.
- Commit de code initial : 0693b8f.
- Commit de correction V0.1 : 3a6d54f.
- Ce document et le runbook sont ajoutés dans le commit de certification V0.1 suivant.
- main et origin/main restent inchangés à 69c6549.
- Aucun push, aucun merge dans main, aucun déploiement.

## 8. Les 12 critères P0

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 1 | Authentification locale | PASS | E2E login + tests API |
| 2 | Contexte persistant | PASS | DB + dashboard + E2E |
| 3 | Brief enregistré | PASS | version 1, E2E |
| 4 | Storyboard de cinq scènes | PASS | SCENE-001 à SCENE-005 |
| 5 | PNG réellement produit | PASS | 5 fichiers 1080x1920, QA |
| 6 | MP4 réellement lisible | PASS | H.264, AAC, 10 s et 50 s, ffmpeg + player |
| 7 | Correction ciblée SCENE-003 | PASS | v2, checksum modifié |
| 8 | Versions précédentes préservées | PASS | scènes v1, master v1 conservés |
| 9 | Prévisualisation fonctionnelle | PASS | lecteur vidéo E2E |
| 10 | Approbation du master exact | PASS | checksum + API + E2E |
| 11 | Postiz mock fonctionnel | PASS | transfer acknowledged |
| 12 | Parcours E2E validé | PASS | Playwright 1/1 |

## 8 bis. Correction critique V0.1

| Contrôle | Statut | Preuve |
|---|---|---|
| duration_seconds par scène | PASS | schéma, contrat, API, UI, média |
| Smoke 5 x 2 s = 10 s | PASS | master 9,97 s, QA PASS |
| Cible 5 x 10 s = 50 s | PASS | master 49,97 s, QA PASS |
| Preset projet et ajustement par scène | PASS | création 10 s, PATCH SCENE-003 à 2 s, test API |
| Correction SCENE-003 sans régénérer les autres | PASS | SCENE-003 v2, autres scènes v1 |
| Nouveau master après correction | PASS | master v2, v1 conservé |
| Approbation liée version + checksum | PASS | approve API + E2E |
| Approbation invalidée si master change | PASS | v1 invalidatedAt non nul après v2 |
| Transfert interdit sans approbation valide | PASS | E2E POST transfer 400, code 409 si invalidée |
| Isolation entre utilisateurs | PASS | test API second user 404 |

## 9. Verdict V0.1

V0.1 COMPLETE pour le périmètre expérimental des 12 critères P0 et de la correction critique des durées, avec les limitations MOCK et NOT_RUN ci-dessus. Cette V0.1 n'est pas une validation V1 de production : Hatchet, MCP, sécurité complète, providers réels, S3, Postiz réel et déploiement restent hors périmètre.

## 10. Prochaine action

1. Revue humaine de la branche v0-fullstack-sprint et du diff.
2. Décision de conserver, corriger ou promouvoir cette V0.1.
3. Ne pas fusionner dans main ni pousser sans autorisation.
4. Reprendre le plan de fondations V1 pour les gates restants.
