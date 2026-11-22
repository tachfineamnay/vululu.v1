# P12-08 — Exactitude des données d'administration, support et RBAC

**Lot :** P12-08 · **Branche :** `campaign/vululu-completion` · **Base :** `fb9b71e`.
**Date :** 2026-11-21. **Statut :** corrections livrées, types et lint verts, sonde de projection **exécutée** (7 cas).
Tests d'API base de données, tests navigateur et vérifications RBAC dynamiques **NOT_RUN** (§5).
Aucune migration, aucun paiement, aucun refonte d'écran.

---

## 1. Défauts confirmés et corrigés

### 1.1 File d'assistance : historiques illimités pour 100 dossiers (issue 1)

`support.ts` chargeait `include: { entries: … }` — **tout l'historique** de chaque dossier — pour
`take: 100`. Un dossier de 400 messages × 100 dossiers chargeait 40 000 lignes par lecture de file.

**Correction :** projection bornée unique (`threadSelect`) — métadonnées, `_count.entries` et **les 20
messages les plus récents** ; `threadsPage` pagine par curseur (25 par défaut, 50 maximum) avec
`take: pageSize + 1` pour un `nextCursor` exact. `threads()` reste disponible (console commerce, page
bornée à 20) et les messages sont remis en ordre chronologique par `threadView` (module pur).

### 1.2 Filtres, compteurs et totaux incohérents (issue 2)

L'écran support filtrait **côté navigateur** (type, état dérivé, recherche) les lignes d'une réponse serveur
non filtrée, et les compteurs étaient calculés sur la page chargée. Les totaux affichés ne correspondaient
donc ni au filtre serveur ni à la réalité.

**Correction :** type, état serveur (`OPEN`/`IN_PROGRESS`/`CLOSED`) et recherche sont envoyés au serveur ;
le serveur renvoie `total` (`count` avec le **même** `where`), `counts` par état (`groupBy status`, même
`where`), `nextCursor` et `entryLimit`. L'écran affiche « dossiers correspondants / affichés » et précise
que seuls les 20 derniers messages de chaque dossier sont rendus.

### 1.3 Tableau de bord des coûts : totaux partiels non étiquetés (issues 3 et 4)

Les agrégats étaient calculés **en mémoire sur 500 opérations** (et 200 comptes) sans aucune indication :
`estimatedCents`, `confirmedCents`, `byTool`, `byProvider`, `uncertain` étaient donc faux au-delà des
fenêtres, et `budgetTotals` ne couvrait que les 200 comptes chargés.

**Correction :** tous les totaux viennent d'agrégats SQL sur **toutes** les lignes —
`groupBy(['costState'])` (`_count`, `_sum maxCents / reportedCents`), `groupBy(['tool','costState'])` pour
les colonnes par outil/fournisseur, `aggregate` sur les comptes pour `budgetTotals`, `count` pour les
incidents. Les natures restent **séparées** : estimation (rapporté, sinon plafond engagé), réservé,
confirmé (`REPORTED` + `RECONCILED`), incertain (`UNKNOWN`), libéré (`RELEASED`), exposition = réservé +
incertain. Chaque partie bornée est étiquetée par un bloc `scope` : page de budgets (100, total, troncature),
fenêtre d'opérations récentes (500 par défaut, total, troncature), incidents incertains (50, total).

## 2. Invariants vérifiés

| Invariant | Vérification |
|---|---|
| Un dossier n'expose que 20 messages récents, avec total réel et drapeau `truncated` | sonde exécutée `THREAD_VIEW_PROBE_PASS cases=7` |
| Messages rendus dans l'ordre chronologique, dernier message = le plus récent | sonde |
| Contexte client minimal : `{ id, email, status }` seulement | sonde (`email,id,status`) |
| Pagination stable (curseur = identifiant, 25 par défaut, 50 max) | code + test DB écrit |
| Total et compteurs calculés avec le même filtre que les lignes | code (`count`/`groupBy` sur `where`) |
| Totaux de coûts sur toutes les lignes, sans ambiguïté de nature | code (agrégats SQL, 5 catégories distinctes) |
| Aucune écriture financière ajoutée | diff de `adminCosts.ts`: lecture seule |
| Commerce toujours gelé, bandeau MOCK conservé | écran `/admin/couts` inchangé sur ce point |

## 3. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `tsc --noEmit -p apps/api/tsconfig.json` | 0 | 0 erreur | PASS |
| `tsc --noEmit -p apps/web/tsconfig.json` | 0 | 0 erreur | PASS |
| `eslint apps/api/src/routes/adminCosts.ts apps/api/src/routes/billing.ts apps/api/src/infrastructure/billing apps/web/app/support/page.tsx` | 0 | 0 erreur, 0 avertissement | PASS |
| Sonde compilée `threadView.ts` + Node | 0 | `THREAD_VIEW_PROBE_PASS cases=7` | PASS |

## 4. Ce qui n'a pas été modifié

- Aucune migration, aucun schéma Prisma touché.
- Aucune activation de paiement, aucun appel Stripe, commerce toujours gelé (`VULULU_BETA_MODE`).
- Pas de refonte d'écran : l'écran support garde sa structure, l'écran coûts garde ses sections.
- RBAC inchangé : `/api/support/cases` reste `app.support`, `/api/admin/costs/*` reste `app.requireSuperAdmin`,
  `/api/billing/tickets` reste `auth` avec filtre `userId`.

## 5. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| `vitest run tests/v1/admin-support-queue.test.ts` (4 cas) | PostgreSQL `127.0.0.1:55432` absent **et** `esbuild`/`spawn EPERM` | NOT_RUN |
| Exercice HTTP réel des routes (RBAC, audit, rate limit, suspension, révocation, dernier super-admin) | base et serveur indisponibles | NOT_RUN |
| Tests navigateur (support, coûts) | Playwright indisponible | NOT_RUN |
| Vérification dynamique des agrégats de coûts | dépend de la base | NOT_RUN |

**Limites assumées :** la suspension de compte, la révocation de session, la protection du dernier
super-admin et les limites de débit **n'ont pas été rejouées** ici ; elles sont lues dans le code existant
(`admin.ts`, `security/rateLimiter.ts`, `billing/service.ts`) et restent à couvrir par la recette PostgreSQL.
Le filtre d'état de l'écran support porte désormais sur l'état serveur exact : les états dérivés
(« en attente d'assistance », « répondu ») restent affichés en badge mais ne pilotent plus les totaux.
La console commerce charge une page bornée de dossiers (20) et n'affiche plus de total implicite.

## 6. Rollback

`git revert <sha>` : retour à `fb9b71e`. Aucune migration, aucune donnée modifiée.
