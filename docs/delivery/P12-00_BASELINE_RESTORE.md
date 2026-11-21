# P12-00 — Restauration d'une base compilable (typecheck)

**Lot :** P12-00 · **Branche :** `campaign/vululu-completion` · **Base auditée :** `bcb050c` (HEAD inchangé avant ce commit).
**Date :** 2026-11-21. **Statut :** typecheck 7/7 projets vert ; build Web, suites Vitest, E2E et contrôles base **NOT_RUN environnemental** (causes ci-dessous). Aucun push, merge, déploiement ni appel fournisseur.

Ce document est la preuve de rejeu du lot. Il ne vaut pas certification globale.

---

## 1. Constat de départ (vérifié avant toute modification)

| Élément | Constat | Statut |
|---|---|---|
| HEAD | `bcb050c49ffd6e7c60039c14503938cf15a2f766` | PASS |
| Branche | `campaign/vululu-completion` (aucune bascule) | PASS |
| Arbre de travail | propre (`git status --porcelain=v1 --branch` sans entrée) | PASS |
| Client Prisma | **absent** : `node_modules/.prisma` inexistant → `pnpm db:generate` requis | PASS (constat) |
| `pnpm db:generate` | `Generated Prisma Client (v6.19.3)`, exit 0 | PASS |
| PostgreSQL 127.0.0.1:55432 | non joignable (`Test-NetConnection` faux) | NOT_RUN |
| Node / pnpm | `v24.21.0` / `10.6.1` | PASS |

## 2. Reproduction des erreurs (avant correction)

Commande, par projet : `cd <projet>; pnpm exec tsc --noEmit`.

| Projet | Exit | Erreurs TS |
|---|---|---|
| packages/domain | 0 | 0 |
| packages/contracts | 0 | 0 |
| packages/application | 0 | 0 |
| packages/media | 0 | 0 |
| packages/db | 0 | 0 |
| **apps/api** | **2** | **15** |
| **apps/web** | **1** | **2** |

Les chiffres rapportés (15 API + 2 Web) sont donc exacts au HEAD audité.

## 3. Causes racines et corrections

### 3.1 API — 8 erreurs : catalogue d'outils `as const`

`apps/api/src/infrastructure/execution/registry.ts` déclarait `tools` en `as const satisfies Record<string, ToolDefinition>`.
Les entrées littérales ne portent que les propriétés **effectivement écrites** : `params` et `agentProposable` (optionnels dans
`ToolDefinition`, renseignés seulement par P05–P09B) n'existent pas sur les entrées P01–P04. `Object.entries(tools)` produisait
donc l'union des littéraux, et tout accès à `definition.params` / `definition.agentProposable` échouait (TS2339) :
`registry.ts:49` (×2), `routes/adminAgents.ts:129` (×2), `routes/adminAgents.ts:130`, `routes/execution.ts:58`, `:116`, `:118`.

**Correction :** le catalogue littéral devient `toolCatalog` (`as const satisfies` conservé, donc clés littérales et gel de type
préservés) ; `tools` est exporté comme `Record<Tool, ToolDefinition>`, ce qui rend les champs optionnels lisibles **sans cast**.
Le `as unknown as Record<string, ToolDefinition>` de `agentTools` (masquage de type interdit) est remplacé par une annotation
honnête `Record<string, ToolDefinition>`. Aucun changement de comportement : mêmes 20 outils, même filtre.

### 3.2 API — 3 erreurs : disponibilité élargie à `string`

`inventory` de capacités : `imageProviderCapabilities()` et `audioCapabilities()` n'avaient **aucun type de retour** ; le
tableau hétérogène (entrée Gemini + entrée Replicate) et l'objet littéral subissaient le *widening* des littéraux, si bien que
`availability` était inféré `string` et n'était plus assignable à `CapabilityAvailability`
(`infrastructure/execution/availability.ts:25, :29, :33`).

**Correction :** types de retour explicites dans les modules fournisseurs (`ImageProviderCapability`,
`SceneImageProviderCapability`, `AudioCapability`, et `describe(): AudioCapability`). Les valeurs de disponibilité restent
littérales, la forme JSON renvoyée par les routes est identique.

### 3.3 API — 2 erreurs : jeton Google non typé

`google-auth-library` déclare `getAccessToken(): Promise<string | null | undefined>`. Les deux adaptateurs locaux
(`audio/vertex.ts:77`, `imageEditing/providers.ts:126`) déclaraient `let token: string | null`, ce qui rejetait `undefined`
alors que le code traite déjà l'absence de jeton par `if (!token)`.

**Correction :** déclaration alignée sur le fournisseur (`string | null | undefined`, sans initialisation morte) : `undefined`
vaut absence de jeton, même branche d'erreur qu'avant.

### 3.4 API — 1 erreur : port média en retard sur le rendu réel

`packages/media` (P09B) ajoute `audioDuration` à `MasterOutput` et le sonde réellement ; l'adaptateur le renvoie à
l'exécution. Le port d'application `MasterRenderResult` (et `RenderedMaster`) ne le déclarait pas, donc
`infrastructure/media/mediaRendererAdapter.ts:28` ne pouvait pas passer le master à `runQa`.

**Correction (fidélité, pas de stub) :** `audioDuration: number` ajouté à `MasterRenderResult` et `RenderedMaster`, propagé dans
`DurableProductionUseCases.assembleMaster` (l'étape `assemble-master` persistée ne perd plus la donnée). Les deux
`FakeMedia` de tests implémentant `MediaRendererPort` déclarent la valeur (`audioDuration: 0`).

### 3.5 API — 1 erreur : type importé du mauvais paquet

`infrastructure/prisma/assetDecisionRepository.ts:4` importait `PublicationUsage` depuis `@vululu/application`, qui ne
l'exporte pas ; le type vit dans `@vululu/domain` (comme dans `assetRepository.ts`, `creativeRepository.ts`, etc.).

**Correction :** import depuis `@vululu/domain`. Aucun ré-export ajouté.

### 3.6 Web — 2 erreurs : `follow()` supposait un tour marketing/créatif

`AssistantRequest` est une union discriminée à quatre variantes (`marketing`, `creative`, `brainstorm`, `agent`).
`apps/web/components/ProjectAssistant.tsx` faisait `setKind(request.kind)` (état limité à `marketing`/`creative`) puis
`request.scope.target.sceneKey` hors de la branche `marketing` : les variantes `brainstorm`/`agent` n'ont pas de `scope`.

**Correction :** garde explicite en tête de `follow()` (les kinds non composables ne modifient plus le formulaire) et bouton
« Poursuivre cette demande » rendu uniquement pour les kinds composables. Corrige aussi un `TypeError` réel à l'exécution
(`request.scope` indéfini) sans introduction de cast.

## 4. Preuves (commandes exactes, exit codes)

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `pnpm db:generate` | 0 | Prisma Client 6.19.3 généré | PASS |
| `cd packages/domain; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/contracts; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/application; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/media; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/db; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd apps/api; pnpm exec tsc --noEmit` | 0 | 15 → 0 erreur | PASS |
| `cd apps/web; pnpm exec tsc --noEmit` | 0 | 2 → 0 erreur | PASS |
| `pnpm lint` | 0 | 0 erreur, 5 avertissements préexistants (fichiers non touchés) | PASS |
| `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` | 0 | « The schema … is valid » | PASS |
| `pwsh -NoProfile -File scripts/check-migrations.ps1` | 0 | `MIGRATIONS=39`, `MIGRATION_CHECK_PASS` | PASS |
| `pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1` | 0 | `DOMAIN_FILES=23`, `APPLICATION_FILES=31`, `BOUNDARY_CHECK_PASS` | PASS |
| `git diff --check` | 0 | aucun défaut d'espace | PASS |
| `pnpm build` | 1 | API `tsc --noEmit` PASS, puis `next build` → `spawn EPERM` | NOT_RUN (env.) |
| `pnpm typecheck` (`pnpm -r`) | 1 | orchestrateur pnpm → `spawn EPERM` après 3 projets | NOT_RUN (env.) |
| `pnpm exec vitest run tests/domain` | 1 | démarrage Vite/esbuild → `spawn EPERM` | NOT_RUN (env.) |
| `pwsh -NoProfile -File scripts/check-secrets.ps1` | 1 | `git.exe` lancé depuis un pwsh enfant → pipe refusé | NOT_RUN (env.) |
| `$env:LINT_STRICT='1'; pnpm lint` | 1 | 5 erreurs, **toutes** dans des fichiers hors diff (`python/client.ts:49`, `routes/ops.ts:169`, `StudioAudioPanel.tsx:305/522/552`) | FAIL préexistant |
| `pnpm exec prisma migrate status` | — | PostgreSQL 55432 non joignable | NOT_RUN |
| Suites Vitest, E2E Playwright | — | PostgreSQL absent **et** spawn bloqué | NOT_RUN |

### 4.1 Cause environnementale vérifiée

Le sandbox Windows de la session refuse la création de sous-processus pour certains lanceurs (`spawn EPERM`, `errno -4048`),
ce qui bloque : l'orchestrateur `pnpm -r`, `next build` (`Running TypeScript …`), Vite/esbuild (donc Vitest et `tsx`), et les
appels `git` depuis un `pwsh` enfant. Une escalation `danger-full-access` a été tentée deux fois pour `next build` : aucune
réponse d'approbation n'étant disponible, la demande a expiré — l'accès élargi n'est donc pas utilisable ici. Les commandes
équivalentes exécutables directement (tsc par projet, eslint, prisma validate, scripts PowerShell sans `git`) ont été rejouées
et sont consignées ci-dessus ; rien n'est déclaré PASS sans exécution.

## 5. Portée et invariants respectés

- Aucun `@ts-ignore`, `@ts-expect-error`, `any` ajouté, diagnostic désactivé ni stub factice ; les `as` restants dans les
  fichiers modifiés (`[Tool, ...Tool[]]`, `usage as PublicationUsage`) sont préexistants et hors périmètre.
- Aucune modification de schéma Prisma ni de migration (39 migrations inchangées) ; `packages/media` et les contrats Zod non modifiés.
- `VULULU_BETA_MODE=1` et le gel des paiements inchangés (`apps/api/src/betaMode.ts`, `.env.example` non touchés).
- Aucun appel fournisseur, aucun déploiement, aucun push, aucun merge.

## 6. Limites restantes

- Comportements corrigés **non exercés** à l'exécution : garde `follow()` (aucun harnais de test de composant React dans le
  dépôt ; ajouter jsdom/@testing-library serait une dépendance nouvelle, refusée) et propagation `audioDuration` (la suite
  `tests/v1/v1-01-d-durable.test.ts` exige PostgreSQL). Les deux corrections sont prouvées par le typecheck, pas par un test.
- `pnpm lint` strict reste rouge sur 5 avertissements préexistants hors diff : ce lot ne les corrige pas (hors périmètre).
- Le build de production Web et l'ensemble des suites restent à rejouer dans un environnement autorisant les sous-processus et
  PostgreSQL local (`scripts/arena/pg16-local.sh`).

## 7. Rollback

`git revert <sha>` du commit unique : les 10 fichiers reviennent à l'état `bcb050c` ; aucune migration, aucune donnée touchée.
