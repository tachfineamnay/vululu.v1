# Coolify — build et installation de Vululu V1 sans GitHub Actions

- Date : 2026-11-01
- Cible : préproduction/production interne sur VPS Coolify
- Sources : infra/coolify/Dockerfile.api, Dockerfile.web, docker-compose.yml, .env.example (nom corrigé le 2026-11-04 ; anciens rapports conservés)
- Preuves locales : docs/reports/VULULU_COOLIFY_BUILD_EVIDENCE.md
- Statut : configuration validée localement ; **build et démarrage des conteneurs BLOCKED** sur ce poste par le disque Docker Desktop read-only. Les commandes ci-dessous sont celles à rejouer sur le VPS ou après réparation Docker.

## 1. Architecture des processus

    Internet -> Coolify/Traefik (TLS) -> web (Next 16, port 3100)
                                          |-> /api/* proxy runtime -> api (Fastify, 3101)
    api -> db (PostgreSQL 17, réseau interne)
    api/web <- worker (processus séparé, profil worker)
    worker -> Hatchet (profil durable) -> db/artifacts
    api/worker -> S3-compatible externe ou profil s3

- API, Web et worker sont **trois processus distincts** ; un seul conteneur ne les mélange pas.
- L'API n'est pas exposée publiquement : seul le Web est derrière Coolify.
- Le proxy /api est un route handler runtime (apps/web/app/api/[...path]/route.ts) : API_INTERNAL_URL est lu à la requête, aucun localhost figé au build.
- En production, API_INTERNAL_URL absent provoque une erreur 500 explicite (pas de fallback silencieux).

## 2. Prérequis VPS / Coolify

- VPS Linux 4 vCPU / 8 Go recommandé (minimum 2 vCPU / 4 Go pour Web+API+DB, sans worker/Hatchet/S3 interne).
- Docker 29+ avec disque de données sain et espace libre (plusieurs Go pour les images).
- Coolify version récente avec support Docker Compose ; domaine DNS pointant vers le VPS.
- Aucun runner GitHub Actions requis.
- Secrets préparés dans un coffre/Coolify : SESSION_SECRET (>= 32), POSTGRES_PASSWORD, credentials S3, token Hatchet si durable.

## 3. Import du Compose dans Coolify

1. Créer un projet Coolify et un environnement (staging ou production).
2. Créer une ressource Docker Compose depuis le dépôt (ou copier infra/coolify/docker-compose.yml).
3. Base directory : racine du dépôt ; fichier : infra/coolify/docker-compose.yml.
4. Ne pas activer GitHub Actions ni un webhook CI : le déploiement est manuel/ Coolify.
5. Renseigner les variables d'environnement de la section 4 (valeurs injectées par Coolify, jamais dans Git).
6. Définir le domaine public sur le service web uniquement (port interne 3100). Ne pas publier db, api, s3.
7. Activer le HTTPS Coolify (Let's Encrypt ou certificat fourni), puis vérifier que APP_ORIGIN et WEB_ORIGIN sont exactement l'URL HTTPS publique.

## 4. Variables d'environnement

Utiliser infra/coolify/.env.example comme modèle et injecter les valeurs dans Coolify ; pour un test local, copier vers un fichier ignoré. Variables clés :

    APP_ENV=production
    APP_ORIGIN=https://votre-domaine
    WEB_ORIGIN=https://votre-domaine
    SESSION_SECRET=<32+ caractères aléatoires>
    SESSION_COOKIE_SECURE=1
    POSTGRES_USER=vululu
    POSTGRES_PASSWORD=<secret>
    POSTGRES_DB=vululu
    DATABASE_URL=postgresql://vululu:<secret>@db:5432/vululu?schema=public
    ALLOW_NON_LOCAL_DATABASE=1
    API_HOST=0.0.0.0
    API_PORT=3101
    API_INTERNAL_URL=http://api:3101
    TRUST_PROXY=true
    ARTIFACT_STORAGE_BACKEND=local|s3
    S3_ENDPOINT= / S3_REGION= / S3_BUCKET= / S3_ACCESS_KEY_ID= / S3_SECRET_ACCESS_KEY=
    ORCHESTRATOR_MODE=local|hatchet
    HATCHET_CLIENT_TOKEN= (si hatchet)
    V1_BOOTSTRAP_EMAIL= / V1_BOOTSTRAP_PASSWORD= (usage unique)
    VULULU_IMAGE_TAG=tag-ou-digest

Règles :
- dotenv ne surcharge plus les variables injectées : en APP_ENV=production, aucun fichier .env local n'est lu.
- En local/test, .env complète uniquement les variables absentes (override false).
- Ne jamais committer .env.coolify.local ni les secrets.

## 5. Build des images (Coolify ou manuel)

Coolify construit avec les Dockerfiles :
- infra/coolify/Dockerfile.api : builder pnpm figé + Prisma generate ; runner Debian slim + FFmpeg + utilisateur non root (uid 10001) + tini.
- infra/coolify/Dockerfile.web : builder pnpm figé + next build ; runner non root + next start.

Build manuel de vérification (à exécuter sur un Docker sain) :

    docker build -f infra/coolify/Dockerfile.api -t vululu-api:local .
    docker build -f infra/coolify/Dockerfile.web -t vululu-web:local .
    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.local config -q

## 6. Migrations explicites et protégées

- Le service migrate exécute uniquement prisma migrate deploy ; jamais db push, jamais reset, jamais drop.
- L'API dépend de la réussite du service migrate (service_completed_successfully) : aucune API ne démarre sur un schéma non migré.
- Pour appliquer une nouvelle version :

    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.local run --rm migrate
    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.local up -d api web worker

- En cas d'échec de migration : ne pas forcer. Restaurer la sauvegarde ou revenir à l'image précédente si le schéma est compatible.
- Politique de compatibilité : migrations additives (expand/contract), backfill séparé, suppression différée ; rollback code possible tant que le schéma reste rétro-compatible.

## 7. Premier démarrage et bootstrap super_admin

### Compte démo (ajout 2026-11-04)

Injecter `DEMO_MODE=1` sur API/Web et les variables `DEMO_EMAIL` / `DEMO_PASSWORD` dans Coolify (mot de passe de 12 caractères minimum et 72 octets UTF-8 maximum). Elles ne sont pas publiques et aucun identifiant n’est prérempli dans le formulaire. Le bootstrap démo est distinct du bootstrap super-admin :

    docker compose -f infra/coolify/docker-compose.yml run --rm demo-seed

Ce service lit les credentials par environnement ; ne pas les passer en arguments. Il crée un compte `user`, un contexte fictif avec révision et un projet de départ. Le replay conserve le mot de passe et les modifications existants ; une collision avec un autre compte, un rôle promu ou un actif détenu par un tiers fait échouer toute la transaction. Aucun reset automatique. Les campagnes/actifs supplémentaires seront ajoutés par leurs lots.

Le service Web ne publie plus de port hôte : Coolify route vers son port interne 3100. Un test Docker local exige l’override `-f infra/coolify/docker-compose.local.yml` en plus du fichier principal ; il lie le port uniquement sur 127.0.0.1. Les preuves historiques de build restent datées, les nouveaux profils ne sont pas déclarés exécutés par cette procédure.

### Compte super-admin séparé

    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.local up -d db migrate api web
    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.local ps
    # attendre healthy sur api et web

Créer le premier super_admin (une seule fois, puis retirer V1_BOOTSTRAP_PASSWORD) :

    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.local run --rm \
      -e V1_BOOTSTRAP_EMAIL=admin@exemple.fr -e V1_BOOTSTRAP_PASSWORD=<secret-fort> \
      api node_modules/.bin/tsx packages/db/prisma/seed.ts

## 8. Vérifications post-déploiement

    # API interne
    docker compose -f infra/coolify/docker-compose.yml --env-file infra/coolify/.env.coolify.local exec api \
      node -e "fetch('http://127.0.0.1:3101/api/health').then(r=>r.text()).then(console.log)"
    # Web
    curl -fsS https://votre-domaine/login >/dev/null && echo WEB_OK
    # Proxy API via le Web
    curl -fsS https://votre-domaine/api/health
    # Login + cookies/CSRF (remplacer les valeurs)
    curl -i -c cookies.txt -X POST https://votre-domaine/api/auth/login \
      -H 'content-type: application/json' \
      --data '{"email":"admin@exemple.fr","password":"<secret>"}'
    # Doit renvoyer 200, Set-Cookie session HttpOnly+Secure et vululu_csrf lisible
    curl -fsS -b cookies.txt https://votre-domaine/api/auth/me
    # Admin
    curl -fsS -b cookies.txt https://votre-domaine/admin | head -c 200

Vérifier aussi : aucun port 5432 publié, aucun port S3 publié, logs sans secret, healthchecks healthy, redémarrage des conteneurs sans perte de données PostgreSQL (volume pgdata).

## 9. Profils optionnels

- worker : docker compose ... --profile worker up -d worker ; exige ORCHESTRATOR_MODE=hatchet et HATCHET_CLIENT_TOKEN.
- durable : Hatchet embedded + PostgreSQL dédié ; démarrer hatchet, lire le token dans /data/handshake.json côté opérateur, l'injecter dans Coolify, puis démarrer worker/api en mode hatchet. Préproduction uniquement (pas de HA).
- s3 : MinIO interne optionnel (image à épingler par digest) ; en production, préférer un S3 managé/MinIO certifié et injecter S3_* ; ne jamais publier le port S3.
- Le worker ne doit jamais tourner dans le même processus que l'API ou le Web.

## 10. Logs, santé et exploitation

- Logs : docker compose logs -f api web migrate ; Coolify Logs par service.
- Santé : healthchecks api (/api/health via fetch), web (/login), db (pg_isready), migrate (one-shot).
- Admin : /admin (super_admin) expose DB, stockage, workers, outbox, erreurs, coûts MOCK.
- Restart policy : unless-stopped pour api/web/worker/db ; "no" pour migrate.
- Ne jamais lancer down -v sans sauvegarde vérifiée.

## 11. Sauvegardes

- PostgreSQL : pg_dump -Fc planifié (volume pgdata ou service db) + rétention ; tester une restauration isolée.
- Objets : si S3 externe, activer versioning/backup fournisseur ; si local, sauvegarder le volume artifacts.
- Manifeste : date, SHA-256 du dump, nombre d'objets, comptages ; conserver hors du VPS.
- RPO/RTO proposés : RPO 24 h / RTO 2 h staging ; production PITR/WAL <= 1 h (décision séparée).

## 12. Rollback

1. Identifier le tag/digest précédent des images (VULULU_IMAGE_TAG).
2. Vérifier la compatibilité du schéma (migrations additives) ; sinon restaurer la DB depuis le dump et un environnement isolé.
3. Redéployer migrate (si nouvelle migration déjà appliquée, ne pas rejouer) puis api/web/worker avec l'image précédente.
4. Ne jamais réécrire l'historique Prisma ni supprimer _prisma_migrations.
5. Après rollback : health, login, smoke tests minimaux.

## 13. Risques et limites connus

- Images non encore construites/testées ici : Docker Desktop read-only sur le poste (voir rapport de preuves).
- Images relativement lourdes (dépendances de développement incluses pour tsx/prisma) ; optimisation possible par next standalone et prune prod dans un lot ultérieur.
- tsx est utilisé au runtime pour l'API/worker (sources TypeScript du monorepo) ; documenté et assumé pour la V1.
- Profils Hatchet/S3 non testés dans Coolify à ce stade ; préproduction seulement.
- Aucun déploiement n'a été effectué ; toute action distante exige une autorisation explicite.
