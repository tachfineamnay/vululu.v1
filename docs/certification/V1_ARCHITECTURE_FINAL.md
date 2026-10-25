# V1 — ARCHITECTURE FINALE

- **Date** : 2026-10-25
- **Branche** : v1-01-g-architecture-certification
- **Base F** : 11e11e5
- **Commit code G** : 0e79c08
- **Portee** : certification locale de l architecture, pas de production

## 1. Resume

Vululu AI est un monorepo TypeScript organise autour d un Domain Core pur, de use cases applicatifs injectes, de ports specialises et d adaptateurs d infrastructure. Le pipeline media est orchestre par Hatchet Embedded avec un worker separe ; PostgreSQL reste la source de verite et les binaires sont externalises derriere ArtifactStoragePort.

    Next.js Studio
        -> Fastify API (auth, RBAC, routes, rate limit)
        -> Application use cases
        -> Ports
             <- Prisma/PostgreSQL
             <- Outbox
             <- Hatchet
             <- ArtifactStorage local/S3
             <- MediaRenderer Sharp/FFmpeg
             <- Postiz mock

    Worker Hatchet
        -> Application use cases durables
        -> Ports
             <- MediaRenderer
             <- ArtifactPublisher / ArtifactStorage
             <- Prisma/PostgreSQL
             <- Postiz mock

## 2. Technologies

| Composant | Version / choix |
|---|---|
| Runtime | Node.js 24 |
| Gestionnaire | pnpm 10.6.1 |
| Langage | TypeScript 5.9 strict |
| API | Fastify 5.12.7 |
| Web | Next.js 16.4.2, React 19 |
| Base | PostgreSQL 17, Prisma 6.19.3 |
| Durable | Hatchet Embedded 0.110.5, SDK 1.43.0 |
| Media | Sharp et FFmpeg locaux |
| Tests | Vitest 3.2.7, Playwright |
| Stockage | filesystem local ou S3-compatible (AWS SDK v3) |
| Site public futur | Astro + TypeScript, non implemente |

## 3. Frontieres architecturales

Matrice :

| Couche | Dependances autorisees | Interdits verifies |
|---|---|---|
| packages/domain | aucune dependance runtime | Fastify, Prisma, Hatchet, React, Next, Sharp, FFmpeg, S3, AWS, SDK providers |
| packages/application | @vululu/domain | HTTP, Prisma, Hatchet, S3, media, process.env |
| apps/api | application, contracts, db, domain, media, Fastify, Prisma, Hatchet, AWS | aucune logique metier dans les routes |
| apps/web | Next, React | Prisma, API workers, Hatchet, S3, imports serveur |
| packages/db | Prisma uniquement | Domain/Application |
| packages/media | Sharp/FFmpeg derriere ports | Domain |

Verifications executees :

- git grep des imports interdits dans Domain et Application : aucun.
- packages/domain/package.json : dependencies vide.
- packages/application/package.json : dependance unique @vululu/domain.
- tests/domain/purity.test.ts : 4 PASS.
- apps/web : aucun import Prisma/Hatchet/S3/worker.
- composition root unique : apps/api/src/application/container.ts.

## 4. Modules et responsabilites

### Domain Core

Identites stables, positions, scenes, personnages, versions append-only, snapshots, approbation exacte, invalidation, machine a etats de production, budget et politique de routing, conditions de transfert.

### Application Layer

Contexts, projects, briefs, storyboards, scenes, messages, bundles, production, durable production, artifacts access, agents, provider catalog, routing. Les use cases portent autorisation applicative, idempotence, transitions et decisions.

### Infrastructure

Fastify, auth, sessions, CSRF, origine, rate limiting PostgreSQL, Prisma, outbox, Hatchet, media, stockage local/S3, Postiz mock, logs JSON, metriques, heartbeat et reconciliation.

### Worker

Processus separe, enregistre les workflows Hatchet et appelle les use cases durables. Il ne connait ni Fastify ni les routes. Il ecrit dans un workspace local et publie via ArtifactPublisherPort.

## 5. Donnees et artefacts

- PostgreSQL : identites, revisions, versions, approvals, JobRun/StepRun, outbox, routing, couts, audit.
- Storage : PNG/MP4 immuables, cle opaque, SHA-256, MIME, taille, provider.
- ArtifactObject : pending/uploading/staged/ready/failed, reconciliation read-only.
- RunArtifact : version exacte, checksum, scenes, manifest.
- Les anciens chemins imagePath/masterPath restent lisibles via fallback local ; aucune migration destructive.
- Le storageProvider persiste permet de choisir l adaptateur de lecture (local/S3) via un registre, si la configuration du provider est disponible.

## 6. Topologie locale observee

- PostgreSQL local 127.0.0.1:55432.
- API V1 127.0.0.1:3101, V0 127.0.0.1:3001.
- Web 127.0.0.1:3100.
- Hatchet Embedded lance sous WSL, sidecar local, worker separe.
- Stockage local data/artifacts ; backend S3-compatible rclone de test pour E.
- Aucun Docker applicatif certifie, aucun deploiement.

## 7. Limites

- Pas de site Astro.
- Pas de MCP, Postiz reel, TTS, musique, compositing.
- Pas de planificateur DAG agentique autonome : le systeme est un pipeline configure avec routing/fallback, pas une autonomie agentique complete.
- Pas de multi-region, TLS/IAM/SSE de production, supervision systemd, CI distante executee.
- Le montage Windows/WSL n est pas le runtime cible de production.
