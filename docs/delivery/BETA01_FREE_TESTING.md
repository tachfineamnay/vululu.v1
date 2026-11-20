# BETA01 — Phase de test réel gratuite et gel commercial

Date : 2026-11-20 · Branche de session : `arena/edd2b515-vululu-v1` · SHA de base : `e53029d87d0c84192cce68e620fd67e0b970d0bc` (`main`).
Périmètre : un commutateur serveur de mode bêta, le gel commercial, l'adaptation de l'interface, un accès bêta sans pass et un retour de bêta typé. **Aucune refonte** du module d'offres métier, **aucune activation** de paiement, **aucune migration destructive**, **aucun débit**.

---

## 1. Décision

Vululu entre en **test réel gratuit** encadré : des entrepreneurs sélectionnés utilisent le produit existant sans payer, pendant que l'architecture commerciale F05 reste **gelée, intacte et réactivable**.

Le mode est piloté par **une seule variable serveur** :

| Variable | Valeur | Effet |
|---|---|---|
| `VULULU_BETA_MODE` | `1` (ou `true`) | Bêta gratuite : aucun paiement client ne peut être ouvert, commerce gelé, interface « accès bêta gratuit » |
| | `0` (ou `false`) | Mode commercial : architecture F05 intacte, soumise à ses propres exigences d'activation |
| | **absent** | **`1`** — configuration sûre : une variable oubliée n'ouvre jamais une vente |
| | toute autre valeur | Démarrage refusé (`VULULU_BETA_MODE invalide`) — aucune valeur n'est devinée |

`betaMode.ts` est pur (aucune lecture base, réseau ou horloge) et testé sans dépendance : `tests/beta-mode.test.ts`.

---

## 2. Gel commercial : ce qui est fait, ce qui n'est pas touché

Les contrôles d'autorisation existants (`billing_hold`, `checkClaim`, déclencheurs SQL `billing_job` / `billing_start_job`) ne s'appliquent que si `BillingControl.enabled = true`. Un bras de fer commercial laissé actif **bloquerait les parcours ordinaires** d'un testeur sans pass (`billing_plan_required` sur un simple rendu).

Au démarrage de l'API (`apps/api/src/index.ts`), `freezeCommercialForBeta()` remet donc ce **seul commutateur** à `false` :

- idempotent — aucune écriture si le commerce est déjà fermé ;
- unidirectionnel — il **ferme**, il n'ouvre jamais ;
- audité — événement `commerce.beta.frozen` (`targetType: commercial`, `metadata.source = VULULU_BETA_MODE`), visible dans **Administration → Commerce** ;
- en échec de gel, l'API **ne sert pas** : mieux vaut une instance arrêtée qu'une bêta dont les parcours restent bloqués par un état commercial résiduel.

**Jamais touchés** : produits, prix, catalogue, commandes, reçus, `BillingUse`, droits, remboursements, ledger de crédits, migrations, comptes historiques, configuration Stripe. Aucune ligne financière n'est créée, supprimée ou réécrite.

---

## 3. Points d'application serveur

| Point | Comportement en bêta | Fichier |
|---|---|---|
| `POST /api/billing/checkout` et `checkout()` | Refus **403 `beta_mode_active`** avant toute lecture de configuration Stripe et **avant toute écriture** | `routes/billing.ts`, `infrastructure/billing/service.ts` |
| `POST /api/admin/commerce/enable` et `enableCommerce()` | Refus **409 `beta_mode_active`** : aucune réactivation administrative des ventes | idem |
| `GET /api/billing/account` | `beta = { enabled, paymentsFrozen }`, `checkoutAvailable = false`, `catalog = []` ; **historique et droits conservés** | idem |
| `GET /api/admin/commerce` | Expose `beta` (lu côté serveur) et l'audit `commerce.beta.frozen` ; l'activation n'est plus proposée | `routes/billing.ts` |
| `GET /api/beta/status` | Vue publique, sans authentification, sans identifiant ni secret | `routes/beta.ts` |
| `GET /api/health` | Ajoute `beta: true|false` pour la supervision | `server.ts` |
| Webhook Stripe, `verify`/`applyEvent`, `reconcileRefund`, reçu, fermeture de session | **Inchangés et disponibles** : traitement et rapprochement des transactions historiques préservés | `infrastructure/billing/service.ts` |
| Catalogue (création, visibilité) | Toujours possible : préparer une offre ne vend rien ; `checkout` reste fermé | `routes/billing.ts` |

Le refus ne dépend **pas** du navigateur : masquer un bouton n'est qu'un confort d'interface.

---

## 4. Politique d'accès bêta (plus petite surface possible)

Le ToolBroker, ses budgets, ses quotas et ses approbations **ne sont pas contournés**. La bêta ne fait qu'une chose : elle supprime l'exigence de **pass commercial** (gel ci-dessus). Restent en vigueur, inchangés :

- autorisation explicite de l'utilisateur avant toute opération facturable (`approve` + digest) ;
- budget fini par compte (`ExecutionAccount.limitCents`, `spentCents`, `reservedCents`) ;
- liste d'outils autorisés par compte (`ExecutionAccount.tools`, `enabled`) — contrôle administratif ;
- historique auditable (`execution.*` dans `AuditEvent`) ;
- idempotence et récupération (`ExecutionOperation.digest`, `key`, `recover`, incidents `UNKNOWN`) ;
- fournisseurs payants **non activés** : la bêta n'allume aucun fournisseur média/IA ni Postiz.

Conséquence assumée et documentée : un testeur bêta peut rendre, exporter et composer sans pass ; il ne peut **pas** dépenser au-delà de son budget ni utiliser un outil non autorisé.

---

## 5. Expérience client (FR/EN)

- **Accueil public**, **création de compte**, **guide**, **conditions** : mention « **Bêta gratuite / Free beta** » et « accès bêta gratuit, aucun paiement ni carte bancaire » ; aucune fonctionnalité fermée n'est annoncée comme disponible.
- **Mon compte** : en bêta, la section catalogue est remplacée par une carte *Accès bêta gratuit* ; le titre devient « Mon accès et l'assistance » ; l'historique d'achats et les droits restent consultables ; plus aucun bouton d'achat n'est rendu.
- **Assistance** : le formulaire existant propose, **en bêta uniquement**, un type de demande « Bug ou suggestion (bêta) ».
- **Administration → Commerce** : bandeau de gel et activation retirée ; le catalogue, les commandes et les incidents restent visibles.
- Conservés sans changement : profil, projets, calendrier, Studio, compositions et révisions, exports, résultats, ressources, offres métier (`ConfirmedOffer`), parcours de publication manuelle et assistant hors ligne.

---

## 6. Testeurs et retours (sans nouveau CRM)

- **Comptes** : réutilisation du parcours existant (auto-inscription vérifiée par email → profil d'activité → projet). Aucune invitation n'est exigée : l'opérateur choisit à qui il communique l'URL, et garde les invitations existantes pour les rôles internes.
- **Autorisation des capacités coûteuses** : mécanisme existant `PUT /api/admin/execution/accounts/:account` (`enabled`, `tools`, `limitCents`), audité `execution.policy_updated`. Aucun nouveau système d'invitation.
- **Retours** : même file d'assistance, dossier typé `BETA_FEEDBACK` (`kind` déjà textuel — **aucune migration**), visible par le support `GET /api/support/cases`, réponse support autorisée, et **distinct** d'un incident de facturation. Hors bêta, l'ouverture d'un retour bêta est refusée (`400 beta_mode_inactive`) plutôt qu'acceptée silencieusement.
- **Données** : aucune collecte supplémentaire ; le type de dossier est facultatif (défaut `SUPPORT`).

---

## 7. Transition sûre bêta → commercial (réversible)

1. **Avant** : s'assurer que les obligations F05 (juridique, fiscale, opérationnelle, prix approuvés) sont couvertes. La bêta ne les remplace pas.
2. Passer `VULULU_BETA_MODE=0` (Coolify) et redémarrer l'API. Le gel automatique ne s'applique plus ; **rien n'est activé automatiquement**.
3. `BillingControl.enabled` reste `false` : le comportement est exactement celui d'avant la bêta. Les parcours ordinaires exigent de nouveau un pass.
4. Suivre la procédure F05 inchangée (`docs/delivery/F05_COMMERCIAL_BILLING.md`) : mode `test` ou `live`, clés injectées côté serveur, `STRIPE_LIVE_CHECKOUT_ENABLED`, phrase d'activation saisie par un super-administrateur, référence d'accord.
5. Vérifier après activation : `GET /api/beta/status` → `beta:false`, `GET /api/billing/account` → `beta.enabled:false`, `checkoutAvailable` selon la configuration, audit `commerce.enforcement.enabled`.
6. Un retour arrière est toujours possible : `VULULU_BETA_MODE=1` referme la vente au redémarrage suivant, sans toucher aux données.

Aucune migration, aucune suppression, aucune conversion de mode n'est nécessaire dans un sens comme dans l'autre.

---

## 8. Fichiers

**Nouveaux** : `apps/api/src/betaMode.ts`, `apps/api/src/infrastructure/beta/freeze.ts`, `apps/api/src/routes/beta.ts`, `apps/web/lib/beta.ts`, `scripts/arena/beta01-freeze-check.sh`, `tests/beta-mode.test.ts`, `tests/v1/beta-free-testing.test.ts`, ce document.

**Modifiés (API)** : `env.ts` (validation au démarrage), `index.ts` (gel au boot), `server.ts` (routes bêta, santé), `infrastructure/billing/{service,support,messages}.ts`, `routes/billing.ts`.

**Modifiés (Web)** : `app/account/page.tsx`, `app/admin/commerce/page.tsx`, `app/catalog/page.tsx`, `app/support/page.tsx`, `app/terms/page.tsx`, `components/{AccountEntry,PublicLanding,ServiceCases}.tsx`.

**Configuration** : `.env.example`, `infra/coolify/.env.example`, `infra/coolify/docker-compose.yml`, `infra/coolify/docker-compose.recette.yml`.

**Tests existants ajustés (déclaration explicite, aucune suppression)** : `tests/v1/commercial.test.ts` et `tests/helpers/{customer-billing,customer-account}-server.mts` fixent `VULULU_BETA_MODE=0` : ces suites reproduisent une instance commerciale, ce qui doit rester dit.

---

## 9. Vérification exécutée (sandbox Arena, 2026-11-20)

Base PostgreSQL 16.2 locale jetable (`scripts/arena/pg16-local.sh`, 34 migrations, 67 tables). Aucune base distante, aucun secret réel, aucun appel fournisseur.

| # | Commande | Résultat |
|---|---|---|
| 1 | `pnpm exec vitest run tests/beta-mode.test.ts` | **PASS** — 5/5 (défaut sûr, valeurs 1/0, refus des valeurs inconnues, messages) |
| 2 | `pnpm --filter @vululu/web typecheck` | **PASS** — exit 0 |
| 3 | `pnpm --filter @vululu/web build` | **PASS** — exit 0, 22 routes compilées |
| 4 | `pnpm lint` | **PASS** — exit 0, aucune sortie |
| 5 | `bash scripts/arena/beta01-freeze-check.sh` | **PASS** — 3/3 : commerce actif → `billing_plan_required` ; commerce gelé → rendu accepté, `uses=0` ; audit `commerce.beta.frozen` enregistrable |
| 6 | `psql` état `BillingControl` après exécution | **PASS** — `f`, `test` (aucun état modifié : transactions annulées) |
| 8 | `pnpm exec vitest run tests/v1/beta-free-testing.test.ts` | **NOT_RUN** — 10 cas collectés puis ignorés (dont la matrice A–J ci-dessous) : `@prisma/client did not initialize yet` (client Prisma non générable, §10) |
| 9 | `pnpm --filter @vululu/api typecheck` | **NOT_RUN (environnemental)** — 217 erreurs, **toutes** de typage Prisma (`tsx`/`tx` non typés, `Prisma.*` absents). Référence sans ce lot : **216** ; delta **+1** = `freeze.ts(29,37) tx implicit any`, même cause |
| 10 | `pnpm test` (suite complète) | **NOT_RUN** — même cause Prisma |
| 11 | `npx playwright install chromium` | **NOT_RUN** — téléchargement refusé (`Download failure, code=1`) ; aucun navigateur disponible |
| 12 | Rendu/export réel FFmpeg | **NOT_RUN** — `ffmpeg` absent de la sandbox (`command -v ffmpeg` vide) |
| 13 | Stripe réel, IA payante, Postiz réel | **NOT_RUN** — interdits par la mission : aucun fournisseur externe, aucun secret, aucun débit |

Correspondance de la suite `tests/v1/beta-free-testing.test.ts` avec les scénarios demandés : **A** inscription et amorçage · **B** profil, projet, composition, rendu et export sans achat · **C** refus du paiement côté serveur · **D** activation live impossible + gel audité · **E** historique financier et catalogue conservés · **F** dépense IA/média non autorisée refusée · **G** opération approuvée bornée par le budget, l'approbation et l'audit · **H** exports et parcours hors ligne · **I** retours bêta typés et file d'assistance · **J** bêta désactivée, architecture commerciale intacte et verrouillée.

**Aucun test n'est déclaré réussi sans exécution.** Les cas 8 à 13 sont dus à l'environnement, pas à une assertion contredite.

### Preuve du gel (commande rejouable)

```sh
bash scripts/arena/pg16-local.sh start && bash scripts/arena/pg16-local.sh migrate
bash scripts/arena/beta01-freeze-check.sh
```

Sortie obtenue :

```text
PASS  commerce actif : rendu refusé sans pass
PASS  commerce gelé : rendu accepté
PASS  audit commerce.beta.frozen enregistrable

BETA01 : gel commercial vérifié sur vululu_v1_00_test (transactions annulées).
```

Chaque cas s'exécute dans une transaction `ROLLBACK` : **aucune donnée n'est laissée en base**. Le script prouve le mécanisme exact (`billing_hold` et déclencheurs `billing_job`) sur lequel repose le gel, sans client Prisma.

---

## 10. Cause racine des NOT_RUN (vérifiée, non contournée)

```text
$ pnpm db:generate
Error: request to https://binaries.prisma.sh/all_commits/c2990dca…/schema-engine.gz.sha256 failed,
reason: Client network socket disconnected before secure TLS connection was established
```

`binaries.prisma.sh` est hors de la liste d'autorisation réseau de la sandbox, et le cache d'engines est vide. Sans client Prisma généré, aucun module important `@vululu/db` ne peut être chargé : ni les suites HTTP/PostgreSQL, ni l'API elle-même. **Ce n'est pas contourné** (pas de stub de typage, pas de SQLite, pas de mock du client Prisma) : la preuve locale serait fictive.

Ce qui reste prouvé : décision de mode (test pur), compilation et build du Web, lint, et le comportement réel des déclencheurs SQL de facturation sur PostgreSQL, qui est précisément le mécanisme sur lequel repose le gel.

---

## 11. Risques résiduels et limites

1. **La suite d'intégration BETA01 n'a pas tourné** (Prisma bloqué). Elle est écrite et exécutable hors sandbox : `pnpm exec vitest run tests/v1/beta-free-testing.test.ts` sur une base `*_test` locale migrée. C'est le premier contrôle à rejouer en environnement disposant du client Prisma.
2. **Le gel au démarrage ajoute une dépendance base au boot.** Si la base est indisponible ou non migrée, l'API en bêta ne démarre pas (comportement voulu et signalé par le log `beta.commercial_frozen`). Le service `migrate` de Coolify s'exécute avant l'API.
3. **Un opérateur peut toujours modifier `BillingControl` en base.** Aucun code ne peut l'empêcher ; l'audit `commerce.beta.*` et la documentation rendent l'écart visible.
4. **Coûts externes** : la bêta n'allume aucun fournisseur. Un opérateur qui autorise `media.*`, `assistant.draft@1` ou `postiz.schedule@1` engage une dépense réelle — budget et quotas existants s'appliquent, sans exception bêta.
5. **Interface** vérifiée par compilation et build, **pas** par navigateur (Chromium indisponible). Les textes bilingues sont relus, non capturés.
6. **Reçu Stripe / webhook** : inchangés ; ils ne sont exerçables qu'avec une configuration Stripe réelle, hors périmètre de cette sandbox.

## 12. Rollback

- Fonctionnel : `VULULU_BETA_MODE=0` + redémarrage → retour au comportement F05 exact (commerce toujours `false`).
- Code : revert du lot ; aucune migration ajoutée, donc aucune base à rétrograder.
- Données : le lot n'écrit que `BillingControl.enabled=false` (déjà l'état par défaut) et un événement d'audit.
