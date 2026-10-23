# V0 TEST EVIDENCE — VULULU AI

- **Date** : 2026-10-23
- **Branche** : v0-fullstack-sprint
- **Code audité** : de92e24 + 5d2042a
- **Environnement** : Node 24.21.0, pnpm 10.6.1, PostgreSQL 17.2 port 55432, FFmpeg/FFprobe 9.0.2, Playwright 1.64.1
- **Portée** : preuves des 12 fonctions V0, invariants métier, sécurité de base, médias réels
- **Règle** : REAL, MOCK, PASS, FAIL et NOT_RUN sont distingués. Aucun test non exécuté n'est marqué PASS.

## 1. Résultats globaux

| Commande | Résultat | Durée / détail |
|---|---|---|
| pnpm typecheck | PASS | 5 projets TypeScript, exit 0 |
| pnpm test | PASS | 11 tests : 10 API + 1 média, 41,64 s |
| pnpm build | PASS | API TypeScript + Next.js production, exit 0 |
| pnpm exec playwright test e2e/v0.spec.ts | PASS | 1/1, 47,4 s, projet cmvkrhp730007habgpols3mq5 |
| scripts/verify-v0.ps1 cible smoke | PASS | 24 contrôles, 9,97 s / 10 s |
| scripts/verify-v0.ps1 cible 50 s | PASS | 24 contrôles, 49,97 s / 50 s |
| scripts/check-secrets.ps1 | PASS | 93 fichiers versionnables, 0 secret |
| scripts/verify-foundation-docs.ps1 | PASS | 9 hashes sources, documents requis |

## 2. Matrice des 12 fonctions

| # | Fonction | Verdict | Nature | Preuve |
|---|---|---|---|---|
| 1 | Authentification | PASS | REAL | Login 200, mauvais mot de passe 401, /me sans session 401, cookie HttpOnly/SameSite=Lax |
| 2 | Contexte persistant | PASS | REAL | Création API, 12 contextes après redémarrage API |
| 3 | Projet | PASS | REAL | Création, lecture, 16 projets après redémarrage |
| 4 | Conversation | PASS | MOCK | Message user + réponse assistant persistés, 2 messages |
| 5 | Brief versionné | PASS | REAL | v1 Objectif A conservé, v2 Objectif B, 2 BriefRevision, checksums distincts |
| 6 | Storyboard | PASS | REAL | 5 scènes SCENE-001 à SCENE-005, IDs stables |
| 7 | PNG | PASS | REAL | 5 PNG 1080x1920, SHA256 comparés aux checksums DB |
| 8 | MP4 | PASS | REAL | FFprobe h264 1080x1920 yuv420p + aac, 9,966667 s et 49,97 s |
| 9 | Correction SCENE-003 | PASS | REAL | SCENE-003 v2, autres scènes v1 inchangées |
| 10 | Versions conservées | PASS | REAL | scène v1/v2, master v1/v2, fichiers et hashes conservés |
| 11 | QA et approbation | PASS | REAL | 10 contrôles QA, mauvais checksum 400, master stale 409 |
| 12 | Postiz mock | PASS | MOCK | Transfert acknowledged, provider postiz-mock, refus sans approbation |

## 3. Invariants métier

| Invariant | Verdict | Preuve |
|---|---|---|
| scene_id permanent, distinct de la version | PASS | E2E compare IDs avant/après correction ; IDs identiques |
| character_id permanent | PASS | CHAR-001 ID cmvkrhrj9000dhabg3ywficar avant/après |
| Anciennes versions conservées | PASS | SCENE-003 v1/v2, master v1/v2, fichiers et checksums |
| Correction SCENE-003 sans régénérer les autres | PASS | checksums SCENE-001/002/004/005 identiques |
| Nouveau master après correction | PASS | master v2, v1 conservé |
| Approbation liée version + checksum | PASS | mauvais checksum 400 ; version stale 409 |
| Approbation invalidée si master change | PASS | approbation v1 invalidatedAt non nul après master v2 |
| Transfert sans approbation valide | PASS | E2E POST transfer 400 avant approbation v2 |
| Isolation utilisateurs | PASS | second utilisateur : projet/image/master/QA 404 ; contexte étranger 400/404 |

## 4. Preuves médias réelles

### Smoke certifié, projet cmvkrhp730007habgpols3mq5

- master v2 : data/artifacts/cmvkrhp730007habgpols3mq5/master/v2.mp4
- checksum DB et SHA256 : 6931914274335a4080adaf16f0a2dfc0e08a605cb5667e71d5d905b7f95f2e94
- ancien master v1 : 80ef7897b028b3136601a651832c246dc3868e8636a1c91bbdf307113ffe6330
- FFprobe : h264, 1080x1920, yuv420p, AAC stéréo 44100 Hz, durée 9,966667 s, taille 272086 octets
- QA : PASS, 10 contrôles
- approbation v2 valide : cmvkria2w001fhabgzfw8epi7
- transfert : acknowledged, postiz-mock
- IDs scènes : SCENE-001 cmvkrhrjj000fhabg0totjegq, SCENE-002 cmvkrhrjr000hhabg1wbpq3hw, SCENE-003 cmvkrhrju000jhabgo0se4ulo, SCENE-004 cmvkrhrkg000lhabgs753w3pz, SCENE-005 cmvkrhrkn000nhabgjy1kabas
- character : CHAR-001 cmvkrhrj9000dhabg3ywficar

### Cible 50 s, projet cmvkpptgv001fhay80yurse1h

- 5 scènes x 10 s = 50 s
- master v2 QA PASS, durée 49,97 s / attendu 50 s
- checksum DB : b436c3e322a59ae8859ff9f5765c30f2b7d573aa40fc0637839374dbc0732072
- approbation v1 invalidée le 2026-10-23 08:34:24, approbation v2 valide
- transfert acknowledged, postiz-mock
- verify-v0 : 24/24 PASS

### Fichiers vérifiés

- 5 PNG 1080x1920 par projet, SHA256 identique aux SceneVersion.checksum.
- master v1 et v2, SHA256 identiques aux ArtifactVersion.checksum.
- Aucun fichier média n'est versionné dans Git.

## 5. Brief versionné

Projet de test : cmvkr201y0001has8t4vuu0q8

- PATCH brief v1 : Objectif A, version 1, revision 1, checksum e48d5967438b...
- PATCH brief v2 : Objectif B, version 2, revision 2, checksum 8c9d20f850e8...
- GET projet : brief.version 2, revisions 2, Objectif A toujours présent en v1.
- Test API automatisé : 2 révisions, objectifs A puis B, checksums différents.
- Backfill : 10 briefs existants migrés en une révision initiale.

## 6. Sécurité et permissions

| Contrôle | Résultat |
|---|---|
| Cookie de session | HttpOnly, SameSite=Lax, Path=/ |
| Sans cookie sur /api/projects | 401 |
| Mauvais identifiants | 401 |
| Logout | 200, cookie session= vidé, /me avec cookie vidé 401 |
| JSON malformé | 400, pas 500 |
| Corps JSON vide sur logout | 200 |
| IDOR projet | 404 |
| IDOR image scène | 404 |
| IDOR master | 404 |
| IDOR QA | 404 |
| IDOR transfert | 404 |
| Projet avec contexte d'un autre utilisateur | 404 |
| Mauvais checksum d'approbation | 400 |
| Approbation d'une ancienne version | 409 |
| Rejeu d'un ancien cookie après logout | 200 — risque ouvert G-01 |

## 7. Persistance

- Redémarrage API après création : projet cmvkr4lv1001phas8ci74s9ie toujours transferred, 5 scènes, master v2.
- 12 contextes et 15 projets présents après redémarrage.
- PostgreSQL conserve les données ; les jobs in-process ne survivent pas, limitation connue.

## 8. Tests automatisés

### API — 10 tests PASS

1. health
2. rejet des identifiants invalides
3. authentification + contexte
4. projet + brief v1/v2 + storyboard 5 scènes + révisions
5. durées configurables + PATCH scène
6. refus approbation/transfert sans master
7. logout et invalidation du cookie
8. logout avec corps JSON vide
9. JSON malformé -> 400
10. isolation entre utilisateurs

### Média — 1 test PASS

- 5 PNG 1080x1920.
- master 5 x 2 s = 10 s.
- master 5 x 10 s = 50 s.
- H.264/AAC.
- QA PASS 10 contrôles.
- Falsification de checksum -> QA FAIL.

### E2E — 1 test PASS, 47,4 s

Couvre : login, contexte, projet, brief, storyboard, production, preview, approbation v1, correction SCENE-003, invalidation d'approbation, refus transfert, approbation v2, transfert, checksums, IDs stables, logout.

## 9. NOT_RUN explicites

- Tests d'acceptation docs/10 : tous SPECIFIED/NOT_RUN.
- Providers IA réels (image, vidéo, voix, musique).
- Postiz réel, réseau social, publication.
- MCP IDE/cloud.
- Invitations, emails, RBAC admin.
- Hatchet, reprise worker, crash/restart de job.
- S3, URLs temporaires, rétention.
- HTTPS, CSRF, rate limiting, révocation de session.
- Tests de charge, SSRF, uploads, accessibilité.
- Déploiement, sauvegarde/restauration, monitoring.

## 10. Commandes de reproduction

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm exec playwright test e2e/v0.spec.ts
    pwsh -NoProfile -File scripts/verify-v0.ps1 -ProjectId cmvkrhp730007habgpols3mq5
    pwsh -NoProfile -File scripts/verify-v0.ps1 -ProjectId cmvkpptgv001fhay80yurse1h
    pwsh -NoProfile -File scripts/check-secrets.ps1
    pwsh -NoProfile -File scripts/verify-foundation-docs.ps1
