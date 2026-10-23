# V1-00 ARCHITECTURE — FONDATION

- **Date** : 2026-10-23
- **Branche** : v1-00-foundation
- **Worktree** : C:/Users/hp/Desktop/vululu-ai-v1-00
- **Base** : ddda015 (V0 auditée)
- **Commit de fondation** : a7f4b8d, suivi des corrections de lint et de la CI V1-00
- **Statut** : fondation posée, application layer partiellement migrée ; verdict GO CONDITIONNEL

## 1. Environnement isolé

| Élément | V0 conservée | V1-00 |
|---|---|---|
| Branche | v0-fullstack-sprint | v1-00-foundation |
| Worktree | C:/Users/hp/Desktop/vululu Ai | C:/Users/hp/Desktop/vululu-ai-v1-00 |
| API | 3001 | 3101 |
| Web | 3000 | 3100 |
| PostgreSQL | vululu_v0 | vululu_v1_00 (copie de V0) |
| Base test | vululu_v0_test | vululu_v1_00_test |
| Artefacts | data/artifacts V0 | copie V0 dans le worktree V1 |

La V0 n'a pas été modifiée. La base V1 a été créée par dump/restore de vululu_v0, puis migrée de façon additive. Les 16 projets, 13 contextes et artefacts V0 ont été préservés.

## 2. Couches réelles

    apps/web (Next.js)
        -> proxy /api -> apps/api (Fastify) 3101
            -> security (sessions, CSRF, RBAC, invitations)
            -> application/container (use cases)
            -> application/legacy services (brief, storyboard, production)  [transition]
            -> infrastructure (Prisma, storage, media, provider, orchestration, Postiz, audit)
                -> packages/application (ports)
                -> packages/domain (règles pures)
                -> packages/media (Sharp/FFmpeg déterministe)

### Domain Core — packages/domain

Package TypeScript pur, dependencies vides, aucun import Node/Prisma/Fastify/Next/FFmpeg/Postiz.

Modules : errors, immutability, timestamp, checksum, identifiers, versions, identity, project, context, brief, scene, character, artifact, approval, production, transfer.

Invariants portés par le domaine :

- scene_id et character_id permanents, séparés des clés, positions et versions ;
- position mutable sans changer l'identité ;
- versions append-only et immuables ;
- checksums SHA-256 validés ;
- approbation exacte artifactVersionId + checksum ;
- invalidation d'approbation par un nouveau master ;
- correction ciblée qui préserve les autres scènes ;
- transfert refusé sans approbation valide ;
- snapshot de production (contexte, brief, versions exactes).
- 71 tests unitaires sans base ni infrastructure.

### Application Layer — packages/application

Contient les ports, les erreurs applicatives et des use cases réels :

- ContextUseCases : création + révision initiale immuable, liste filtrée propriétaire.
- ProjectUseCases : création validée par le domaine, vérification du contexte propriétaire, liste avec contexte public.
- ApplicationError et mapping HTTP.

Les routes /api/contexts et /api/projects utilisent ces use cases via apps/api/src/application/container.ts.

Limite assumée V1-00 : les routes brief, storyboard, messages, scène, production, approbation et transfert utilisent encore les services V0 (apps/api/src/services). Ces services sont des services applicatifs legacy couplés Prisma ; leur migration vers ports/use cases est le premier chantier V1-01. Aucune logique métier n'a été ajoutée dans les routes HTTP.

### Security / Identity

- apps/api/src/security/session.ts : sessions serveur, cookies, CSRF, révocation.
- apps/api/src/security/crypto.ts : tokens aléatoires, SHA-256, comparaisons constant-time.
- apps/api/src/security/audit.ts : AuditEvent.
- apps/api/src/auth.ts : authenticate, requireRole, requireSuperAdmin, hook CSRF.
- apps/api/src/routes/auth.ts : login, logout, me, activation.
- apps/api/src/routes/admin.ts : invitations super_admin.
- Le modèle session/invitation est imposé par le schéma Prisma.

### Infrastructure — apps/api/src/infrastructure

| Adaptateur | Port |
|---|---|
| PrismaContextRepository | ContextRepository |
| PrismaProjectRepository | ProjectRepository |
| PrismaBriefRepository | BriefRepository |
| PrismaSceneRepository | SceneRepository |
| PrismaProductionRepository | ProductionRepository |
| LocalStoragePort | StoragePort |
| MediaRendererAdapter | MediaRendererPort |
| DeterministicProviderAdapter | ProviderPort |
| LocalOrchestratorAdapter | OrchestratorPort |
| PostizMockAdapter | PostizPort |
| PrismaAuditAdapter | AuditPort |

Les adaptateurs sont testés : contrat storage/provider/media, repositories PostgreSQL, isolation propriétaire, JobRun/StepRun, idempotence Postiz, audit (20 tests).

## 3. Ports

- UserRepository, ContextRepository, ProjectRepository, BriefRepository, SceneRepository, ProductionRepository.
- StoragePort, MediaRendererPort, ProviderPort, OrchestratorPort, PostizPort, AuditPort.
- Clock et IdGenerator injectés dans les use cases.
- Aucun port ne dépend de Fastify, Prisma ou Next.

## 4. Sessions et RBAC

- Token aléatoire 32 octets base64url, SHA-256 en base uniquement.
- Session PostgreSQL : expiresAt 24 h, revokedAt, lastUsedAt, csrfHash.
- Cookie session HttpOnly, SameSite=Lax, Secure si APP_ENV=production.
- CSRF double-submit : cookie vululu_csrf lisible + header x-csrf-token + SHA-256 comparé au csrfHash de session.
- Logout révoque la ligne Session ; l'ancien cookie est rejeté (401).
- Invitations : token aléatoire haché, TTL 72 h, usage unique atomique, rôle user ou super_admin, createdBy super_admin.
- Rôles : super_admin et user. Les routes admin utilisent requireSuperAdmin ; les ressources métier restent filtrées par propriétaire.
- AuditEvent pour login, échec login, logout, activation, invitation, refus RBAC.

## 5. Modèle de données ajouté

| Table | Usage |
|---|---|
| Session | sessions serveur révocables, hash token + CSRF |
| Invitation | invitations one-shot, hash token, TTL, rôle |
| ContextRevision | snapshot contexte + checksum, backfill V0 |
| CharacterVersion | version personnage + checksum, backfill V0 |
| JobRun | run de production et snapshot |
| StepRun | étapes du run, statut, timestamps |
| AuditEvent | journal des actions sensibles |
| CostEvent | structure de coût, non alimentée en V1-00 |

Migration 20261023124017_v1_00_foundation. Testée sur une copie isolée de la V0 : 16 projets, 13 ContextRevision, 12 CharacterVersion, 23 JobRun backfillés.

## 6. Limites / écarts

- Application Layer partiel : brief/storyboard/messages/production/approval/transfer encore sur les services V0 couplés Prisma.
- LocalOrchestratorAdapter in-process : aucune durabilité, reprise crash ou retry. Ce n'est pas Hatchet.
- PostizMockAdapter : submitted uniquement, aucun réseau, aucune publication ; l'acceptation métier actuelle utilise encore le mock du service legacy.
- Aucun provider IA réel : DeterministicProviderAdapter est un mock contractuel.
- Stockage local : pas de S3, pas d'URL signée, pas de rétention.
- Pas de MCP, pas de Hatchet, pas de S3, pas de Postiz réel.
- Auth : pas de rate limiting, pas de purge périodique des sessions expirées, HTTPS local absent.
- E2E de la CI GitHub : non exécuté.
- Lint : 0 erreur, dette historique en warnings ; LINT_STRICT=1 échoue encore.
- La V0 reste le prototype de référence ; la V1 a sa propre base et ses ports.

## 7. Décisions d'architecture V1-00

1. Ne pas réécrire la V0 ; copier les données et migrer additivement.
2. Domain Core pur sans dépendance d'infrastructure.
3. Ports explicites et adaptateurs remplaçables, sans activateurs Hatchet/S3/Postiz réel.
4. Sessions serveur révocables plutôt que cookies stateless.
5. Double-submit CSRF plutôt qu'aucune protection.
6. Invitations hashées one-shot, pas d'inscription publique.
7. Conserver les anciens artefacts et identifiants V0.
8. Ne pas déclarer l'orchestrateur local comme durable.
9. Ne pas déclarer la CI GitHub verte sans exécution réelle.
