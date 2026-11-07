---
name: vululu-ops-readiness
description: Préparer, documenter et valider la préproduction/staging Vululu AI sans jamais déployer — verdicts, topologie et ports, runbooks, sauvegarde/restauration, rollback, variables de production, garde-fous secrets et conditions de GO staging.
whenToUse: Avant toute préparation, planification ou validation de préproduction/staging/Coolify, pour interpréter DEPLOYMENT_NOT_READY et les NO-GO staging, ou pour préparer une décision GO/NO-GO sur preuves réelles.
---

# Vululu AI — préparation et validation préproduction/staging

**But** : préparer et prouver une préproduction/staging **sans jamais déployer**, ni publier, ni activer publiquement. Ce skill sert à cadrer la cible, réutiliser les procédures déjà écrites, distinguer ce qui est prouvé de ce qui ne l'est pas, et refuser un GO sans preuve d'exécution réelle.

Sources d'autorité : `AGENTS.md` (règles et conditions d'arrêt) ; `docs/certification/` ; `docs/reports/VULULU_STAGING_ACCEPTANCE.md` ; `docs/coolify/COOLIFY_RUNBOOK.md` ; `docs/preprod/RUNBOOK.md`. En cas de contradiction, s'arrêter et signaler.

## Quand l'utiliser

- Planifier ou auditer un chantier préproduction/staging/Coolify, un runbook, un backup/restore ou un rollback.
- Répondre à « peut-on ouvrir un accès privé ? », « où en est le staging ? », « peut-on annoncer un GO ? ».
- Préparer les preuves exigées par la recette avant toute décision humaine.

**Ne pas l'utiliser pour** : exécuter la pile locale (voir `vululu-local-stack`), lancer les tests/gates (voir `vululu-quality-gates`), livrer un lot de code (voir `vululu-lot-delivery`), modifier l'architecture (voir `vululu-architecture-change`).

## État vérifié (2026-11-04, HEAD `bb0bc3a`)

| Élément | Verdict / état |
|---|---|
| Socle V1 local | **GO technique local** pour développer (certification 2026-10-25 : `ARCHITECTURE_GO_CONDITIONNEL` ; recette 2026-11-01) |
| Déploiement | **`DEPLOYMENT_NOT_READY`** (`V1_DEPLOYMENT_READINESS.md`, 2026-10-25) |
| Accès privé STAGING | **NO-GO** (`VULULU_STAGING_ACCEPTANCE.md`, 2026-11-01) |
| Activation publique | **NO-GO** par défaut |
| Staging réel | **aucune preuve d'exécution** : aucun VPS, aucune URL, aucun projet Coolify, aucun service déployé |
| Actions distantes | aucun déploiement, aucun push, aucune publication pendant les missions documentées ni pendant la mission du 2026-11-04 |
| Coolify | `BLOCKED_PENDING_AUTHORIZATION` (`COOLIFY_STAGING_REPORT.md`) ; autorisation humaine distincte requise |

Rappel : ces verdicts sont datés. Ne jamais les améliorer sans preuve nouvelle, rejouée et datée. Les chiffres ci-dessous sont **HISTORIQUES** et ne valent pas preuve du jour.

### Preuves historiques (HISTORIQUE — non rejouées)

- **2026-10-25, certification G** : 173 PASS + 2 S3 SKIP (21 fichiers), lint strict/build/typecheck PASS ; Docker/Linux, redémarrage Hatchet, S3 production TLS/IAM/SSE, CI distante et charge multi-workers : NOT_RUN.
- **2026-11-01, recette locale** : 188 PASS / 2 SKIP / 3 E2E PASS ; base vierge 12/12 migrations ; redémarrage PostgreSQL local + persistance PASS ; backup/restore local PostgreSQL PASS. Redémarrage conteneurs, rollback, runtime Hatchet complet : NON TESTÉS.
- **2026-11-01, préproduction (Mission 05)** : S3 TLS local 8/8 tests PASS, `BACKUP_PASS` + `RESTORE_PASS`, moteur Hatchet démarré avec handshake valide. Topologie Compose complète BLOCKED (disque Docker read-only) ; crash/reprise NOT_RUN.
- **2026-11-01, build Coolify (Mission 02)** : config Compose validée, proxy Web→API et E2E 3/3 via proxy PASS. Build d'images et démarrage des conteneurs **BLOCKED** (Docker Desktop data disk read-only) ; aucun déploiement.
- **2026-11-04** : Docker non sondé (Docker Desktop non démarré) ; aucun build, aucune topologie, aucun staging rejoué. Tout ce qui dépend de Docker reste NOT_RUN.

## Topologie de préproduction documentée (cible, non rejouée)

```text
Navigateur -> Web Next (3100) -> proxy /api -> API Fastify (3101)
API/worker -> PostgreSQL (réseau Compose), S3-compatible TLS, Hatchet (gRPC 17077 / API 18243)
```

| Élément | Port / définition |
|---|---|
| API Fastify | **3101** (`API_PORT`) ; interne Compose, `API_HOST=0.0.0.0` en conteneur |
| Web Next | **3100** ; seul service publié derrière Coolify (`WEB_PORT`) |
| PostgreSQL | **55432** en local portable ; **5432** interne au réseau Compose (`db`) |
| Hatchet | gRPC **17077** + API **18243** exposés par socat ; sidecar embedded en loopback 7077/28243 |
| S3-compatible TLS | **9443** en local hôte (rclone) ; **9000** interne au conteneur |
| Migrations | service one-shot `migrate` ; 12 migrations additives, jamais `db push`/reset/drop |

- **Compose préprod** (`infra/preprod/docker-compose.yml`) : `postgres`, `cert-init`, `s3` (rclone), `hatchet-pg`, `hatchet` (sidecar + socat). API/worker tournent hors compose sur l'hôte.
- **Compose Coolify** (`infra/coolify/docker-compose.yml`) : `db`, `migrate`, `artifacts-init`, `api`, `web` + profils `worker`, `durable` (`hatchet-pg`, `hatchet`), `s3` (MinIO optionnel). Un conteneur ne mélange jamais API, Web et worker.
- **Dockerfiles** : `infra/coolify/Dockerfile.api` (builder pnpm figé + Prisma, runner non-root uid 10001, FFmpeg, tini), `infra/coolify/Dockerfile.web` (next start 3100), `infra/preprod/Dockerfile.s3` (rclone 1.75.2), `infra/preprod/Dockerfile.hatchet` (sidecar + socat).
- Seuls les scripts, Dockerfiles et Compose existent et sont relus ; **aucune de ces topologies n'a été exécutée de bout en bout**.

## Variables de production obligatoires et politiques

| Variable | Politique |
|---|---|
| `APP_ENV=production` | Ouvre la validation production ; en production, **aucun `.env` local n'est lu** |
| `APP_ORIGIN` / `WEB_ORIGIN` | Obligatoires en production (même URL HTTPS publique) ; absentes ⇒ démarrage refusé |
| `SESSION_SECRET` | **>= 32 caractères** ; injecté par le coffre, jamais affiché |
| `SESSION_COOKIE_SECURE=1` | Cookie Secure derrière TLS ; `SESSION_SAMESITE=lax` |
| `DATABASE_URL` + `ALLOW_NON_LOCAL_DATABASE=1` | Exception **opt-in uniquement avec `APP_ENV=production`** ; base non locale refusée sinon (code `envPolicy`) |
| `API_HOST=0.0.0.0` / `API_PORT=3101` | Valeur code par défaut 3001/127.0.0.1 : le conteneur doit surcharger explicitement |
| `API_INTERNAL_URL=http://api:3101` | Lu à la requête par le proxy Web ; absent en production ⇒ 500 explicite (pas de fallback localhost) |
| `TRUST_PROXY=true` | Selon reverse proxy TLS ; `RATE_LIMIT_ENABLED=1`, `RATE_LIMIT_FAIL_MODE=closed` pour un défaut fail-closed |
| `ARTIFACT_STORAGE_BACKEND=s3` | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REQUIRE_TLS=1`, `S3_FORCE_PATH_STYLE` selon le fournisseur |
| `ORCHESTRATOR_MODE=hatchet` | `HATCHET_CLIENT_TOKEN` fourni par coffre/handshake, **jamais loggé** ; `HATCHET_CLIENT_HOST_PORT`, `HATCHET_CLIENT_API_URL`, `HATCHET_CLIENT_TLS_STRATEGY=none` (interne) |
| `DURABLE_WORKER_ID` | Identifiant worker stable (défaut `worker-<pid>`) |
| `V1_BOOTSTRAP_EMAIL`/`V1_BOOTSTRAP_PASSWORD` | Bootstrap super_admin **usage unique**, à retirer après usage |
| `VULULU_IMAGE_TAG` | Tag/digest figé pour identifier l'image précédente et permettre le rollback |

Règles : secrets uniquement dans Coolify/coffre, jamais dans Git, logs, rapports ou chat. `infra/coolify/.env.coolify.example` et `infra/preprod/env.preprod.example` ne contiennent que des placeholders. Le `.env.example` racine est **provisoire** (`APP_URL`, pas `APP_ORIGIN/WEB_ORIGIN`) : ne pas s'en servir comme référence de production.

## Procédures exactes des runbooks à réutiliser

Statut : **DOCUMENTÉ / NON REJOUÉ** sauf mention historique contraire. À exécuter uniquement sur autorisation et sur un environnement de test dédié.

1. **Certificats internes** : `pwsh -NoProfile -File scripts/preprod/gen-certs.ps1` → `CERT_READY`, SAN s3/localhost/127.0.0.1/::1, fichiers sous `infra/preprod/runtime/certs` (ignorés par Git). `NODE_EXTRA_CA_CERTS` pointe `ca.crt`. Aucun certificat commité.
2. **S3 TLS local** : `pwsh -NoProfile -File scripts/preprod/start-s3.ps1` → écoute 127.0.0.1:9443, auth par clé, bucket `vululu-artifacts`. Contrat : `E_S3_TEST=1` + `S3_*` + `NODE_EXTRA_CA_CERTS` puis `pnpm exec vitest run tests/v1/v1-01-e-storage.test.ts` (attendu 8/8) et `pnpm exec tsx scripts/preprod/verify-s3-presign.ts` (PRESIGN/VERIFY/RANGE).
3. **Compose préprod** : `pwsh -NoProfile -File scripts/preprod/fetch-hatchet.ps1` (vérifie le SHA-256 du binaire) puis `docker compose -f infra/preprod/docker-compose.yml --env-file infra/preprod/.env.preprod up -d postgres cert-init s3 hatchet-pg hatchet`. Handshake écrit dans `/data/handshake.json` ; token jamais affiché.
4. **Migrations** : `pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma` (hôte) ou service `migrate` Compose ; contrôle `prisma migrate status`. Jamais `db push`, `migrate reset`, `drop`. L'API ne démarre pas si `migrate` échoue.
5. **API et worker** : `pnpm --filter @vululu/api start` et `pnpm --filter @vululu/api worker` (processus séparés), avec `ORCHESTRATOR_MODE=hatchet`, token et endpoints Hatchet. Coolify : `--profile worker up -d worker` après le cœur `db migrate api web`.
6. **Smoke tests** (runbook §7, §8) : `GET /api/health` 200 ; login super_admin + `GET /api/admin/overview` (`storage.backend`, `storage.ok`, `orchestrator.mode`) ; contexte/projet/brief/storyboard ; production 10 s avec JobRun succeeded et QA PASS ; approbation exacte + transfert **postiz-mock** sans doublon ; correction SCENE-003 avec nouvelle version. Vérifier aussi absence de ports 5432/S3 publiés, logs sans secret, healthchecks, persistance après redémarrage.
7. **Crash/reprise worker** : tuer le worker à 4 checkpoints (render, upload avant finalisation, finalisation avant approbation, approbation avant transfert), redémarrer, puis assertions SQL : un seul `JobRun` par `start:<jobRunId>`, un seul `RunArtifact` par version, un seul `Transfer` par approbation, aucun orphelin inexpliqué. **NON EXÉCUTÉ** (bloqué historiquement par la topologie).
8. **Sauvegarde / restauration** : `pwsh -NoProfile -File scripts/preprod/backup.ps1` → attendu `BACKUP_PASS` + `DUMP_SHA256` + `OBJECTS` ; puis `pwsh -NoProfile -File scripts/preprod/restore-test.ps1` → attendu `RESTORE_PASS` (nouvelle base `vululu_restore_<timestamp>`, nouveau bucket, comptages/SHA/manifeste vérifiés) sinon `RESTORE_FAIL`. Source par défaut `vululu_v1_00_test`, jamais la démo ; **ne jamais restaurer par-dessus la source**.
9. **Rollback** : arrêter Web/Admin puis API puis worker ; revenir aux images/tag ou digest précédents (`VULULU_IMAGE_TAG`) ; migrations additives compatibles (ne pas réécrire l'historique Prisma) ; restaurer depuis le dernier backup dans base/bucket **neufs** puis basculer la configuration ; healthchecks et smoke tests avant réouverture. **Ne jamais supprimer un volume avant vérification du backup. Jamais `down -v`.** Rollback staging : NON TESTÉ.

## Conditions de GO staging (VULULU_STAGING_ACCEPTANCE §8)

1. Déployer réellement Coolify STAGING (images construites, DB, API, Web, worker, stockage choisi) selon le runbook.
2. Rejouer le protocole complet **sur staging** : parcours USER et SUPER_ADMIN, IDOR/sessions/CSRF/audit, états d'erreur, logs sans secret, DB privée, HTTPS.
3. Tester redémarrage contrôlé API/Web/worker, persistance DB/S3, sauvegarde/restauration sur ressources de test.
4. Valider le rollback (image précédente + schéma compatible + restauration testée).
5. Faire signer une **décision humaine explicite** d'accès privé ; aucune activation publique automatique.
6. Maintenir les badges MOCK et ne présenter aucun contenu généré comme IA.

Conditions d'arrêt `AGENTS.md` (arrêter et demander une décision) : spécification contradictoire ou manquante ; dépôt distant non vide au premier push ; action destructive ; secret détecté ; fonctionnalité V2 demandée ; coût fournisseur sans budget ; test obligatoire inexécutable.

## Ce qui reste NOT_RUN ou non implémenté

- Supervision automatique du worker : **NON IMPLÉMENTÉE** (heartbeat + détection seulement, pas de redémarrage).
- Redémarrage contrôlé des conteneurs API/Web/worker, persistance volume DB conteneurisé, remplacement de conteneur S3 : **NON TESTÉ**.
- S3 de production (TLS managé, IAM minimal, SSE, policies, restauration binaire) : **NOT_RUN** ; rclone local = repli expérimental.
- CI GitHub Actions distante : **NOT_RUN** (4 jobs définis dans `.github/workflows/ci.yml`, jamais exécutés).
- Charge multi-workers / multi-instances : **NOT_RUN**.
- MFA : **NON IMPLÉMENTÉ** ; rotation de secrets : **manuelle**.
- Crash/reprise Hatchet, rollback staging, build et démarrage d'images : **NON EXÉCUTÉS / BLOCKED** à ce jour.

## Garde-fous absolus

- **Jamais** de déploiement, publication, push/merge ou activation publique sans **approbation humaine explicite et séparée** ; l'approbation d'un plan ≠ autorisation d'agir.
- **Ne jamais demander d'identifiants** (mot de passe, token, clé) dans le chat ; l'utilisateur fournit l'accès par le canal prévu, les secrets sont injectés par Coolify/coffre, seuls les **noms** figurent dans les rapports.
- **Ne pas réparer** le disque Docker/WSL ni toucher aux services existants sans accord explicite : risque pour les autres projets de la machine.
- **Ne jamais exécuter `down -v`** ni supprimer un volume sans backup vérifié ; ne jamais restaurer par-dessus la source.
- **Ne jamais afficher un secret** ni le commiter ; un fichier `.env` local n'est jamais versionné.
- **Ne pas confondre** « transféré vers Postiz MOCK » et « publié » ; maintenir les badges MOCK.

## Pièges connus

- **Docker Desktop data disk read-only (HISTORIQUE)** : builds et démarrage conteneurs bloqués le 2026-11-01 (WSL /dev/sde très rempli) ; non réparé, non re-sondé. Ne pas conclure que Docker est sain, ni le réparer sans accord.
- **Hatchet sidecar** : le sidecar écoute en loopback dans son conteneur ; sans socat, 17077/18243 ne sont pas joignables depuis l'hôte. Le correctif socat est écrit mais l'image n'a pas été reconstruite. Le token de handshake (`/data/handshake.json`) ne doit jamais être affiché.
- **Gate documentaire en échec connu** : `verify-foundation-docs.ps1` et `check-tracked-files.ps1` refusent `infra/coolify/.env.coolify.example` (`FORBIDDEN_TRACKED_SECRET`, problème de **nommage**) alors que `check-secrets.ps1` passe. Ce n'est pas une fuite ; ne pas renommer/supprimer/contourner silencieusement — lot/décision dédié.
- **Images lourdes** : dépendances de dev + `tsx` + Prisma CLI dans l'image runtime ; build long et image non durcie (optimisation next standalone/prune : lot ultérieur).
- **Base non locale refusée** par défaut : n'accepter que l'exception `ALLOW_NON_LOCAL_DATABASE=1` + `APP_ENV=production`, jamais affaiblir le mode local.
- **Écarts de ports** : défauts code 3001/127.0.0.1 vs production 3101/0.0.0.0 ; `V1_API_PORT` n'est pas lu par le code ; 3100/3101 peuvent avoir des listeners WSL résiduels qui ne prouvent aucun service.
- **MinIO indisponible** historiquement (pull refusé) : profil `s3` à épingler par digest ou remplacer par un S3 managé (décision séparée).
- **RPO/RTO** : 24 h / 2 h proposés pour le staging, rétention 14 quotidiennes + 4 hebdomadaires à valider ; PITR/WAL <= 1 h en production = **décision séparée**, pas un acquis.
- **Ne pas mélanger** les environnements (`vululu` Coolify vs `vululu-preprod`) ni les fichiers env (`.env.coolify.example`, `.env.coolify.test` local ignoré, `.env.preprod`).

## Checklist « puis-je annoncer un GO ? »

Chaque case exige une **preuve liée à un run réel, daté, sur l'environnement concerné**. Sans preuve : réponse **NON**, pas d'optimisme.

- [ ] Autorisation humaine explicite, périmètre (staging privé vs public) et date.
- [ ] Images API/Web construites avec tag/digest et conteneurs démarrés (build + `ps` + health).
- [ ] Staging réel accessible (VPS/Coolify/URL) avec inventaire read-only préalable.
- [ ] Protocole USER + SUPER_ADMIN + sécurité rejoué sur staging, logs sans secret, HTTPS, DB privée.
- [ ] Redémarrage contrôlé + persistance DB/S3 + backup/restore sur ressources de test (`BACKUP_PASS`/`RESTORE_PASS`).
- [ ] Rollback validé (image précédente + schéma compatible + restauration testée).
- [ ] Crash/reprise Hatchet rejoué avec assertions d'unicité (`JobRun`, `RunArtifact`, `Transfer`).
- [ ] Décision humaine signée, badges MOCK maintenus, aucune activation publique automatique.

## Références

- `AGENTS.md` §3 (règles absolues), §11 (conditions d'arrêt).
- `docs/certification/V1_DEPLOYMENT_READINESS.md`, `V1_FINAL_CERTIFICATION.md`, `V1_SECURITY_AND_RESILIENCE.md`.
- `docs/reports/VULULU_STAGING_ACCEPTANCE.md` §0, §3, §6, §8, §9 ; `COOLIFY_STAGING_REPORT.md` ; `VULULU_COOLIFY_BASELINE.md` ; `VULULU_COOLIFY_BUILD_EVIDENCE.md` ; `VULULU_PREPROD_EVIDENCE.md`.
- `docs/coolify/COOLIFY_RUNBOOK.md` (§4 variables, §6 migrations, §8 vérifications, §11 backup, §12 rollback) ; `docs/preprod/RUNBOOK.md` (§3 à §11).
- Fichiers : `infra/coolify/` (compose, Dockerfiles, `.env.coolify.example`), `infra/preprod/` (compose, Dockerfiles, `env.preprod.example`), `scripts/preprod/` (certs, S3, backup, restore, fetch Hatchet).
- Skills liés : `vululu-project-orientation`, `vululu-local-stack`, `vululu-quality-gates`, `vululu-lot-delivery`.
