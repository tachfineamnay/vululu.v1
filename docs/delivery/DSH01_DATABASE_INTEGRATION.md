# DSH-01 — Intégration de la chaîne de migrations (2026-11-21)

Preuve d'exécution de la validation de la base de données sur la branche
`integration/vululu-release-20261121`, HEAD `56f0c3c`.

## Environnement

| Élément | Valeur |
|---|---|
| Hôte | Windows, Docker Desktop (moteur Linux) |
| Image | `postgres:17-alpine` — PostgreSQL **17.12** |
| Conteneurs QA | `vululu-dsh01-qa-fresh` (127.0.0.1:**55435**), `vululu-dsh01-qa-upgrade` (127.0.0.1:**55436**) |
| Instance préservée | conteneur Lumira `lumira-cert-guards-…` sur 55432–55434 : **non touché** (ni conteneur, ni volume, ni base) |
| Base repository `.env` | pointe vers 55432 (Lumira) : tout `DATABASE_URL` a donc été **surchargé explicitement** à chaque commande |

Bases jetables créées dans le conteneur `fresh` : `vululu_qa_fresh`, `vululu_dsh01_chain_test`, `vululu_dsh01_shadow`, `vululu_qa_baseline`.
Aucun `prisma db reset`, aucun `prisma db push`, aucun nettoyage hors de ces ressources.

## Résultats

### 1. Chaîne complète sur base vierge (55435 / `vululu_qa_fresh`)

| Commande | Résultat |
|---|---|
| `prisma validate` | `The schema … is valid` — exit 0 |
| `prisma generate` | client 6.19.3 généré — exit 0 |
| `prisma migrate deploy` | **41/41 migrations appliquées** — exit 0 |
| `prisma migrate status` | `Database schema is up to date!` — exit 0 |
| `migrate deploy` rejoué | `No pending migrations to apply.` (idempotent) — exit 0 |
| `scripts/check-migrations.ps1` | `MIGRATION_CHECK_PASS`, `MIGRATIONS=41` — exit 0 |
| `tsx packages/db/prisma/seed.ts` | bootstrap `super_admin` créé — exit 0 |

### 2. Mise à niveau depuis l'état de campagne précédent (55436 / `vululu_qa_upgrade`)

État de départ reconstruit à partir du **vrai** arbre de `origin/main`
(`git archive origin/main packages/db/prisma`, **35 migrations**), puis **données
représentatives insérées** (User, BrandContext, Project, CreativeRevision, StudioRender,
ExecutionAccount, ExecutionOperation, ServiceTicket `BETA_FEEDBACK`, TicketEntry, CostEvent).

`prisma migrate deploy` sur cet état applique **exactement les 6 migrations** de la branche :

1. `20261121100000_project_assets_confirmation`
2. `20261121110000_creative_direction_metadata`
3. `20261121130000_agentic_tool_proposals`
4. `20261122100000_studio_render_progress`
5. `20261122140000_user_administration`
6. `20261122160000_creative_direction_selection`

Après montée : `Database schema is up to date!` (41), **toutes les lignes préservées**
(9/9 relations à 1 ligne), défauts corrects (`User.status='active'`, `StudioRender.progress=0 /
cancelRequested=false`, colonnes ajoutées `NULL`), `BETA_FEEDBACK` toujours accepté.
Écritures post-montée validées : sélection de direction (`selectedCreativeVersion=1`),
confirmation d'assets, métadonnées de direction, `params/result/agentTurnId/step`,
progression de rendu, suspension de compte, événement de coût.

### 3. État de dérive (drift) — pré-existant, non régressif

`prisma migrate diff` (base→datamodel **et** historique→datamodel avec base shadow) ne signale
**aucune** table, colonne, index ou contrainte manquante. Les seules différences sont :

- `ON UPDATE CASCADE` absent sur 9 clés étrangères (Prisma l'attend ; les clés primaires sont des
  cuid/uuid immuables, donc sans effet observable) ;
- `NO ACTION` vs `RESTRICT` sur 2 FK de facturation (équivalent hors contrainte différée) ;
- `ResultEvent.at` : défaut PostgreSQL `now() AT TIME ZONE 'UTC'` (plus strict que le `now()` du
  schéma) ; 4 colonnes `updatedAt` portent en base un `DEFAULT CURRENT_TIMESTAMP` inoffensif.

La même dérive est reproduite sur l'état `origin/main` (base `vululu_qa_baseline`, 35 migrations) :
elle est **antérieure à la branche**, pas introduite par elle. Décision : **aucune migration de
correction** — réécrire 9 contraintes appliquées n'apporterait aucun comportement et violerait la
règle « migrations additives / pas de `DROP` sans ADR » (AGENTS.md §14.4).

### 4. Tests de régression ajoutés

`tests/db/migration-chain.test.ts` — 9 assertions sur base jetable locale `*_test` :
historique appliqué = dossiers sur disque, aucune migration échouée, colonnes/défauts des lots P02,
P04, P05, P09A, P11-A, index `User_status_idx`, écritures complètes, et contrainte
`ServiceTicket_kind_check` (accepte `BETA_FEEDBACK`, rejette un type inconnu en SQLSTATE 23514).

```
pnpm exec vitest run tests/db/migration-chain.test.ts   → 9 passed (1 file)
pnpm exec eslint tests/db/migration-chain.test.ts        → exit 0
pnpm typecheck                                           → 7 projets, exit 0
```

## Limites et statuts

- **Sandbox DSH** : en mode `workspace-write`, `prisma migrate deploy` échoue
  (`spawn EPERM` sur `schema-engine-windows.exe`, stdio par pipe bloqué) et le CLI `docker`
  ne peut pas ouvrir le named pipe du moteur. Les commandes ont été exécutées en accès complet
  (`danger-full-access`), Docker via le serveur MCP Docker. **PASS réels**, pas des déductions.
- **CI GitHub** : `NOT_RUN` (jamais exécutée, cf. `vululu-quality-gates`).
- **Suite complète `pnpm test`, E2E Playwright** : `NOT_RUN` — hors périmètre de cette mission.
- Aucun secret : le mot de passe QA local n'est pas consigné ici.
- `scripts/check-secrets.ps1` : **exit 1**, 1 détection **pré-existante et hors périmètre** —
  `services/python-tools/.env.example` ligne 2 (`PYTHON_TOOLS_TOKEN`, valeur de type placeholder,
  présente à HEAD `56f0c3c`, non modifiée par cette mission). Classe « convention/placeholder »
  décrite dans `vululu-quality-gates` §3 ; ne pas contourner par suppression.

## Reproduction

```powershell
docker run -d --name qa-fresh -e POSTGRES_USER=vululu -e POSTGRES_PASSWORD=<local> `
  -e POSTGRES_DB=vululu_qa_fresh -p 127.0.0.1:55435:5432 postgres:17-alpine
$env:DATABASE_URL='postgresql://vululu:<local>@127.0.0.1:55435/vululu_qa_fresh?schema=public'
pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
pnpm exec prisma migrate status --schema packages/db/prisma/schema.prisma
$env:DATABASE_URL_TEST='postgresql://vululu:<local>@127.0.0.1:55435/vululu_dsh01_chain_test?schema=public'
pnpm exec vitest run tests/db/migration-chain.test.ts
```

## Rollback

Suppression des seuls conteneurs jetables `vululu-dsh01-qa-*` (`docker rm -f`), qui emporte
leurs volumes anonymes. Aucune migration du dépôt n'est modifiée par cette mission.
