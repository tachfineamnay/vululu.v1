# V1-00 ACCEPTANCE REPORT — RÉGRESSION VERTICALE

- **Date** : 2026-10-23
- **Branche** : v1-00-foundation
- **Base V1** : vululu_v1_00, copie de la V0
- **Services** : API 3101, Web 3100, PostgreSQL 55432
- **Code** : a7f4b8d + corrections V1-00
- **Périmètre** : verticale V0 rejouée sur la fondation V1
- **Verdict régression** : PASS, avec réserves documentées

## 1. Environnement

| Élément | V0 | V1-00 |
|---|---|---|
| Worktree | C:/Users/hp/Desktop/vululu Ai | C:/Users/hp/Desktop/vululu-ai-v1-00 |
| API | 3001 | 3101 |
| Web | 3000 | 3100 |
| Base | vululu_v0 | vululu_v1_00 |
| Auth | session stateless V0 | session serveur révocable |
| CSRF | absent | double-submit |
| RBAC | propriétaire seul | super_admin + user, propriétaire |

La V0 est restée active pendant les tests V1 et n'a pas été modifiée.

## 2. Matrice des 12 fonctions

| # | Fonction | Résultat V1 | Preuve |
|---|---|---|---|
| 1 | Authentification | PASS | login demo super_admin, session HttpOnly, CSRF, logout révoqué |
| 2 | Contexte persistant | PASS | création, liste, contexte V0 conservé, persistance PostgreSQL |
| 3 | Projet | PASS | création, liste, bundle, anciens projets V0 lisibles |
| 4 | Conversation | PASS | message user + réponse assistant persistés |
| 5 | Brief versionné | PASS | BriefRevision, version 1, checksum |
| 6 | Storyboard 5 scènes | PASS | SCENE-001 à SCENE-005, IDs et positions |
| 7 | PNG | PASS | 5 PNG 1080x1920, hashes SHA256 comparés |
| 8 | MP4 | PASS | H.264 1080x1920 + AAC, 9,97 s et 49,97 s |
| 9 | Correction SCENE-003 | PASS | SCENE-003 v2, autres scènes inchangées |
| 10 | Anciennes versions | PASS | scène v1/v2, master v1/v2, fichiers et hashes |
| 11 | QA et approbation exacte | PASS | QA 10 contrôles, approbation checksum, invalidation |
| 12 | Postiz mock | PASS | transfert acknowledged, provider postiz-mock |

## 3. Smoke 10 s final

Projet E2E : cmvl268zn0008hadc18ty27z1.

- 5 scènes, master v2, QA PASS, statut transferred.
- master checksum : cbbd4106efb76c083f0f939ef8e2c73fda56a13f2fdc0ec13ed12904587c091b
- SHA256 du fichier : identique au checksum DB.
- FFprobe : h264, 1080x1920, AAC, durée 9,966667 s, taille 272412 octets.
- SCENE-003 versions 2 et 1 ; master versions 2 et 1.
- approbation v1 invalidée le 2026-10-23 14:22:10 ; approbation v2 valide.
- transfert acknowledged, postiz-mock.

Commande : pnpm exec playwright test e2e/v0.spec.ts  
Résultat : 1/1 PASS, 55,7 s.

## 4. Cible 50 s

Projet : cmvl0uki70008hakoqonqmcke.

- 5 scènes x 10 s = 50 s.
- master v1, QA PASS, statut transferred.
- master checksum : 7604df5124d30ca63eb5d4c85bdbd9255702cff6e59d380dcac76f1328116537
- SHA256 fichier : identique.
- FFprobe : h264, 1080x1920, AAC, durée 49,966667 s, taille 751971 octets.
- QA master duration : PASS 49,97 s / attendu 50 s.
- transfert acknowledged, postiz-mock.

## 5. Invariants métier

| Invariant | Résultat | Preuve |
|---|---|---|
| scene_id stable | PASS | IDs conservés avant/après correction dans E2E V0 et V1 |
| character_id stable | PASS | CHAR-001 conservé |
| position distincte de l'identité | PASS | domaine + correction |
| versions immuables | PASS | SceneVersion/ArtifactVersion append-only |
| checksums des fichiers | PASS | hash SHA256 identique DB pour scenes et masters |
| correction ciblée SCENE-003 | PASS | SCENE-003 v2, autres scènes v1 et checksums inchangés |
| nouveau master après correction | PASS | master v2, master v1 disponible |
| ancienne approbation n'autorise pas le nouveau master | PASS | transfert 400 avant réapprobation, v1 invalidée |
| approbation exacte | PASS | artifactVersionId + checksum, mauvais checksum 400, version stale 409 |
| isolation inter-utilisateurs | PASS | tests IDOR 404 sur contexte/projet/image/master/approval/transfert |
| aucun effet externe réel | PASS | Postiz mock, aucun réseau, aucune publication |

## 6. Préservation V0

Projet V0 : cmvkrhp730007habgpols3mq5, toujours lisible dans la V1.

- master v2 checksum : 6931914274335a4080adaf16f0a2dfc0e08a605cb5667e71d5d905b7f95f2e94
- hash fichier identique.
- FFprobe : 9,966667 s, h264 1080x1920, AAC.
- approbation et transfert V0 conservés.
- 16 projets, 13 contextes, 15 briefs/revisions et artefacts copiés.

## 7. Tests

| Contrôle | Résultat |
|---|---|
| pnpm typecheck | PASS |
| pnpm build | PASS |
| pnpm lint | PASS, 0 erreur / 29 warnings |
| pnpm test | PASS, 125 tests |
| Playwright E2E | PASS, 1/1, 55,7 s |
| v1-acceptance | PASS, 19/19 |
| migration sur copie | PASS |
| scan secrets | PASS, 159 fichiers |
| GitHub Actions | NOT_RUN |

## 8. NOT_RUN et limites

- CI GitHub Actions : NOT_RUN, aucun push.
- E2E dans la CI GitHub : NOT_RUN.
- Providers IA réels : NOT_RUN.
- Hatchet/reprise crash : NOT_RUN.
- S3 : NOT_RUN.
- MCP : NOT_RUN.
- Postiz réel : NOT_RUN.
- Rate limiting : NOT_RUN.
- Purge des sessions : NOT_RUN.
- HTTPS : NOT_RUN local.
- Tests de charge, SSRF, uploads, accessibilité : NOT_RUN.
- Application layer : brief/storyboard/production/approval/transfer encore sur services legacy.

## 9. Conclusion

La verticale V0 est préservée sur la fondation V1 : sessions serveur, CSRF, RBAC, données, médias, correction, versions, approbation et transfert mock fonctionnent. Les preuves réelles incluent 125 tests, E2E 10 s, cible 50 s, FFprobe et checksums.

La V1-00 n'est toutefois pas une V1 complète : la migration des derniers services legacy, la CI GitHub exécutée, le durcissement complémentaire et les intégrations Hatchet/S3/providers/MCP/Postiz restent à faire. Verdict : GO CONDITIONNEL.
