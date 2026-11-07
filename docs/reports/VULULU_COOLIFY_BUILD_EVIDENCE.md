# VULULU V1 — Preuves build/installabilité Coolify (Mission 02)

- Date : 2026-11-01
- Dépôt : tachfineamnay/vululu.v1, branche main
- Objectif : rendre Vululu buildable et installable en préproduction sur un VPS Coolify, sans GitHub Actions
- Statut global : **CONFIGURATION VALIDÉE LOCALEMENT — BUILD/START CONTENEURS BLOCKED**
- Docker : 29.8.1, moteur Linux ; le disque de données Docker Desktop est retombé en read-only pendant la mission
- Aucun déploiement, aucun push, aucun fournisseur payant, aucun accès distant

## 1. Vérifications PASS (exécutées localement)

| # | Vérification | Commande / condition | Résultat |
|---|---|---|---|
| 1 | Installation lockfile figé | pnpm install --frozen-lockfile | exit 0, lockfile inchangé |
| 2 | Client Prisma | pnpm db:generate | Prisma Client 6.19.3 généré |
| 3 | Typecheck monorepo | pnpm typecheck | 7/7 workspaces Done |
| 4 | Lint strict | LINT_STRICT=1 pnpm lint | 0 erreur |
| 5 | Build production | pnpm build | PASS ; Next 16.4.2 ; route dynamique /api/[...path] présente |
| 6 | Migrations sur DB vierge | CREATE DATABASE vululu_m02_migrate_20261101193801 puis prisma migrate deploy/status | 12/12 migrations PASS, schéma up to date |
| 7 | Env injectée en production | NODE_ENV=APP_ENV=production, DATABASE_URL=…@db:5432/vululu, ALLOW_NON_LOCAL_DATABASE=1 | host=0.0.0.0, port=3101, database=db/vululu, appEnv=production : dotenv ne surcharge pas |
| 8 | Précédence locale | V0_TEST_DB=1, DATABASE_URL_TEST injecté vers la DB vierge, .env local ignoré en priorité | database=127.0.0.1/vululu_m02_migrate_… (valeur injectée, pas celle de .env) |
| 9 | Compose Coolify | docker compose -f infra/coolify/docker-compose.yml --env-file .env.coolify.test config -q | exit 0 pour le cœur et pour --profile worker --profile durable --profile s3 |
| 10 | Proxy API runtime | API 3101 + Web 3100, GET http://127.0.0.1:3100/api/health | HTTP 200, body {"status":"ok","service":"vululu-api","version":"v1"} |
| 11 | E2E via proxy runtime | pnpm exec playwright test e2e/admin.spec.ts e2e/v0.spec.ts | **3/3 PASS** (admin 2, verticale V0 1), 2,8 min ; login, cookies, CSRF et parcours complets via le proxy Next |
| 12 | Pas de port DB/S3 publié | docker compose config | db et s3 sans ports publiés ; seul web expose 3100 |
| 13 | Pas de localhost interservices en Compose | relecture compose | db, api, hatchet, s3 utilisent les noms de services ; le fallback 127.0.0.1 du proxy est réservé au dev et interdit en production |

## 2. BLOCKED (non exécuté)

| # | Élément | Constat exact | Commande à rejouer après correction |
|---|---|---|---|
| 1 | Build image API | docker build -f infra/coolify/Dockerfile.api -t vululu-api:m02 . → échec : write /var/lib/desktop-containerd/daemon/io.containerd.metadata.v1.bolt/meta.db: read-only file system | docker build -f infra/coolify/Dockerfile.api -t vululu-api:local . |
| 2 | Build image Web | non lancé (même démon en écriture impossible) | docker build -f infra/coolify/Dockerfile.web -t vululu-web:local . |
| 3 | Démarrage conteneurs | non lancé | docker compose … up -d db migrate api web ; puis ps/health |
| 4 | DB éphémère conteneurisée + migrations | non lancé (migrations prouvées sur PostgreSQL local vierge, pas dans un conteneur) | docker compose … down -v (uniquement environnement de test dédié) puis up db migrate |
| 5 | Redémarrage conteneurs / persistance volume | non lancé | docker compose restart db api web ; re-login et vérifier les données |
| 6 | Coolify import/déploiement | non lancé : aucune autorisation distante, aucun VPS/DNS fourni | suivre docs/coolify/COOLIFY_RUNBOOK.md après autorisation |

Cause racine : disque de données WSL/Docker Desktop read-only (même classe d'incident qu'en Mission 05), partition WSL /dev/sde très pleine. Non réparé : risque pour les autres projets de la machine (conteneurs Lumira en cours).

## 3. Commandes de test à exécuter sur un Docker sain

    # 1) Build
    docker build -f infra/coolify/Dockerfile.api -t vululu-api:test .
    docker build -f infra/coolify/Dockerfile.web -t vululu-web:test .

    # 2) Environnement de test local (fichier ignoré par Git)
    cp infra/coolify/.env.coolify.example infra/coolify/.env.coolify.test
    # renseigner APP_ORIGIN/WEB_ORIGIN=http://127.0.0.1:3200, SESSION_SECRET, POSTGRES_PASSWORD, WEB_PORT=3200, VULULU_IMAGE_TAG=test

    # 3) Démarrage cœur (DB vierge + migrations explicites)
    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.test up -d db migrate api web
    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.test ps

    # 4) Santé et proxy
    docker compose … exec api node -e "fetch('http://127.0.0.1:3101/api/health').then(r=>r.text()).then(console.log)"
    curl -fsS http://127.0.0.1:3200/api/health
    curl -fsS http://127.0.0.1:3200/login >/dev/null

    # 5) Seed et login/cookies/CSRF
    docker compose … run --rm -e V1_BOOTSTRAP_EMAIL=demo@vululu.local -e V1_BOOTSTRAP_PASSWORD=… api node_modules/.bin/tsx packages/db/prisma/seed.ts
    curl -i -c cookies.txt -X POST http://127.0.0.1:3200/api/auth/login -H 'content-type: application/json' --data '{"email":"demo@vululu.local","password":"…"}'
    curl -fsS -b cookies.txt http://127.0.0.1:3200/api/auth/me

    # 6) Redémarrage et persistance
    docker compose … restart db api web
    # rejouer login + vérifier les données créées

    # 7) Profils optionnels (après cœur validé)
    docker compose … --profile worker up -d worker      # exige Hatchet + token
    docker compose … --profile durable up -d hatchet hatchet-pg
    docker compose … --profile s3 up -d s3              # exige une image MinIO disponible

    # 8) Nettoyage de l'environnement de test uniquement
    docker compose -p vululu -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.test down -v

## 4. Risques restants

| Risque | Gravité | Traitement |
|---|---|---|
| Images non construites/testées | élevée | rejouer les commandes section 3 sur Docker sain ou VPS |
| Taille des images (node_modules complet, tsx runtime) | moyenne | next standalone + prune prod dans un lot ultérieur ; documenté |
| Prisma CLI présent dans l'image runtime (migrations) | faible | assumé ; migration via service dédié |
| Proxy streaming (vidéos) sous charge | moyenne | test de charge à faire ; le Route Handler streame la réponse |
| Profils Hatchet/S3 non testés | moyenne | préproduction uniquement ; voir Mission 05 |
| Docker Desktop/WSL instable sur le poste | élevée | utiliser un hôte Linux ou réparer le disque Docker |
| Secrets mal configurés (APP_ORIGIN, SESSION_SECRET) | moyenne | le code échoue explicitement au démarrage ; runbook |
| Rollback schéma | moyenne | migrations additives, backup avant migration, jamais de reset |

## 5. Garanties

- Aucun secret dans les fichiers livrés ; .env.coolify.example ne contient que des placeholders.
- Aucune base existante modifiée ; la DB vierge de test est isolée (vululu_m02_migrate_…).
- Aucun push, aucun déploiement, aucun compte/fournisseur créé.
- Le proxy refuse de démarrer en production sans API_INTERNAL_URL (erreur 500 explicite).
