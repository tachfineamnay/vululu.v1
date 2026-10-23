# V1-00 PROGRESS — HARDENING, DOMAIN CORE ET PORTS

- **Date** : 2026-10-23
- **Branche** : v1-00-foundation
- **Worktree** : C:/Users/hp/Desktop/vululu-ai-v1-00
- **Base** : ddda015 (V0 auditée)
- **Commit de fondation** : a7f4b8d
- **Statut** : livraison V1-00 avec réserves ; verdict GO CONDITIONNEL
- **Aucun push, merge, déploiement ou publication**

## 1. Résumé

La V0 a été conservée comme référence. La V1-00 a ajouté sur une branche et un environnement isolés :

- sessions serveur révocables, CSRF et cookies sécurisés ;
- invitations hashées one-shot, activation, rôles super_admin/user ;
- audit des actions sensibles ;
- package Domain Core pur avec 71 tests ;
- ports et adaptateurs infrastructure avec 20 tests ;
- use cases de contexte et projet branchés sur les routes ;
- migration additive des données V0, testée sur copie ;
- lint, CI GitHub préparée, runner CI local et script d'acceptation ;
- régression verticale 10 s et 50 s.

La V1-00 n'est pas une V1 complète : la couche application reste partielle et certains services V0 couplés Prisma sont encore utilisés. Voir V1_00_NEXT_STEPS.md.

## 2. Lots

| Lot | Objet | Statut | Preuve |
|---|---|---|---|
| A | Sessions persistantes, logout, CSRF | PASS | 23 tests sécurité, acceptance 19/19 |
| B | Invitations super_admin, RBAC, audit | PASS | tests invitation/RBAC/activation |
| C | Domain Core pur | PASS | 71 tests domaine, package sans dépendances |
| D | Application layer | PARTIAL | use cases contextes/projets branchés ; brief/storyboard/production encore legacy |
| E | Ports et adaptateurs | PASS | 20 tests infrastructure |
| F | Versions, migrations, compatibilité | PASS | migration testée sur copie, données V0 préservées |
| G | CI et qualité | PARTIAL | lint/typecheck/build/tests locaux PASS ; CI GitHub NOT_RUN |
| H | Régression verticale | PASS | E2E 10 s + cible 50 s + anciens artefacts |

## 3. Équipe

- **Agent A — Lead Architecture** : branche/worktree, base V1, schéma et migration, ports, use cases, intégration, web CSRF, validation, documentation.
- **Agent B — Backend/Security** : sessions serveur, CSRF, cookies, invitations, activation, RBAC, audit, tests sécurité.
- **Agent C — Domain Engineering** : packages/domain pur, invariants, 71 tests unitaires.
- **Agent D — Infrastructure** : 13 adaptateurs derrière les ports, 20 tests de contrat/intégration.
- **Agent E — QA/CI** : ESLint, workflow GitHub Actions, runner ci.ps1, script d'acceptation v1-acceptance.ps1, vérifications.

## 4. Modules réutilisés de la V0

- @vululu/media : Sharp PNG, FFmpeg master, QA média.
- Prisma/PostgreSQL, schéma V0 enrichi.
- Fastify, @fastify/cookie, Next.js, React.
- UI studio, login, dashboard, projets, preview, approbation, transfert mock.
- Tests et scripts V0 comme base de régression.
- Données, briefs, scènes, masters et artefacts V0 copiés et préservés.

## 5. Modules extraits ou corrigés

- packages/domain : nouveau domaine pur.
- packages/application : ports, erreurs, use cases contexte/projet.
- apps/api/src/security : sessions, crypto, CSRF, audit, types.
- apps/api/src/routes/auth.ts et admin.ts : login/logout/activate/invitations.
- apps/api/src/auth.ts : authenticate, requireRole, requireSuperAdmin, hook CSRF.
- apps/api/src/infrastructure : adaptateurs Prisma/storage/media/provider/orchestrator/Postiz/audit.
- apps/api/src/application/container.ts : composition root.
- Migration 20261023124017_v1_00_foundation.
- Web : header CSRF, ports 3100, proxy API 3101.
- Seed : bootstrap super_admin sans mot de passe par défaut.
- Lint, CI, scripts d'acceptation.

## 6. Tests et preuves

| Contrôle | Résultat |
|---|---|
| pnpm typecheck | PASS, 7 projets |
| pnpm build | PASS, API + Next |
| pnpm lint | PASS, 0 erreur / 29 warnings |
| pnpm test | PASS, 125 tests : 71 domaine + 20 infra + 23 sécurité + 10 API + 1 média |
| Playwright E2E | PASS, 1/1, 55,7 s |
| scripts/v1-acceptance.ps1 | PASS, 19 contrôles |
| Migration sur copie V0 | PASS, 16 projets, 13 ContextRevision, 12 CharacterVersion, 23 JobRun |
| Scan secrets | PASS, 159 fichiers |
| GitHub Actions | NOT_RUN (aucun push) |

## 7. Migrations et données

- Migration additive, aucune destruction.
- Backfill des contextes en ContextRevision v1.
- Backfill des personnages en CharacterVersion v1.
- Mapping des ProductionJob V0 en JobRun legacy.
- Tables ajoutées : Session, Invitation, ContextRevision, CharacterVersion, JobRun, StepRun, AuditEvent, CostEvent.
- La base V0 n'a pas été modifiée ; la base V1 est une copie.
- Ancien projet V0 cmvkrhp730007habgpols3mq5 toujours lisible en V1, master v2 checksum 6931914274335a4080adaf16f0a2dfc0e08a605cb5667e71d5d905b7f95f2e94, hash fichier identique.

## 8. Mocks et limites

- Provider déterministe local, pas d'IA réelle.
- Postiz mock : submitted uniquement, aucune publication, aucun réseau.
- Orchestrateur local en mémoire/Prisma, non durable, pas de reprise crash.
- Stockage local, pas de S3.
- MCP absent.
- Hatchet non activé (POC requis).
- Audio silencieux, rendu déterministe.
- Pas de rate limiting, pas de purge des sessions expirées.
- Pas de HTTPS local.
- Application layer partiel : brief, storyboard, production, approval, transfer encore sur les services V0 couplés Prisma.
- CI GitHub non exécutée ; E2E GitHub NOT_RUN.
- Lint en warnings (29), LINT_STRICT=1 échoue encore.

## 9. Risques

| ID | Risque | Sévérité |
|---|---|---|
| R-01 | Services production/brief/storyboard non migrés vers ports/use cases | Haute |
| R-02 | CI GitHub non exécutée, E2E CI NOT_RUN | Haute |
| R-03 | Orchestrateur local non durable | Haute |
| R-04 | Pas de S3, stockage local non partageable | Haute |
| R-05 | Pas de provider IA réel ni budget/coûts | Haute |
| R-06 | Pas de MCP, Postiz réel | Haute |
| R-07 | Rate limiting et purge sessions absents | Moyenne |
| R-08 | Lint strict non activé | Moyenne |
| R-09 | Pas de snapshots de brief/contexte dans le flux legacy | Moyenne |

## 10. Verdict

**GO CONDITIONNEL** pour poursuivre vers V1-01, aux conditions de V1_00_NEXT_STEPS.md :

- terminer la migration des services legacy vers les use cases/ports ;
- exécuter la CI sur GitHub et le job E2E avant de le déclarer vert ;
- traiter rate limiting, purge sessions, HTTPS et durcissement ;
- ne pas activer Hatchet/S3/provider réel/MCP/Postiz réel sans décision et tests.

La V1-00 est une fondation réelle et testée, pas une V1 complète. Aucun push ni merge dans main.
