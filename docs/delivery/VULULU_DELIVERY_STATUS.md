# VULULU — STATUT DE LIVRAISON

- **Mission courante** : **R00 — Baseline & socle de livraison** — `DONE` (documents produits, code inchangé)
- **Date** : 2026-11-19
- **Branche de session** : `arena/c3982856-vululu-v1`
- **SHA de base** : `ccc1977a1131ef2243c0f52055307df91de75b08` (= `main` = `origin/main`)
- **Dernière preuve exécutée** : 2026-11-19 (voir §4)
- **Verdict global** : **NO-GO PRODUIT** — **GO CONDITIONNEL INGÉNIERIE** (C0–C2 uniquement)

> Ce document est la **seule vérité d'avancement**. Il ne remplace pas `docs/certification/`,
> qui est une photographie datée du 2026-10-25. Toute divergence doit être tranchée **en faveur de ce
> document**, parce qu'il est adossé à des commandes rejouées.

---

## 1. Où en est le produit, en une phrase par couche

| Couche | État | Lecture |
|---|---|---|
| Domaine | **REAL** | 141 tests verts, zéro dépendance runtime, invariants d'approbation/version tenus |
| Application | **REAL** | 20 cas d'usage, ports injectés, autorisations et idempotence câblées |
| Infrastructure API | **PARTIAL** | Prisma/S3/Hatchet câblés, mais **non exécutables** dans cet environnement ; typecheck rouge sur 3 erreurs réelles |
| Média | **MOCK visuel** | Sharp + FFmpeg déterministes : poster typographique, **aucun modèle IA**, **assets ignorés** |
| Web / Studio | **REAL (code)** | 18 pages, parcours complet câblé, proxy `/api` runtime |
| Sécurité | **REAL (code)** | Session hachée, CSRF, origines, RBAC, isolation propriétaire, rate limit DB |
| IA / fournisseurs | **ABSENT** | Zéro `fetch` sortant, zéro clé consommée |
| Postiz | **MOCK** | `externalId: null`, aucun réseau |
| Monétisation | **ABSENT** | Hors périmètre V1/V2 : rien à encaisser |
| Exploitation | **PARTIAL** | Outbox, réconciliation, heartbeat, métriques en code ; mode par défaut **non durable** |

**Traduction commerciale** : le produit sait *orchestrer un parcours de production et prouver la
traçabilité de ses artefacts*. Il ne sait pas *produire un contenu original*, *utiliser les assets du
client*, *publier* ni *facturer*. On peut vendre une **démonstration encadrée**, pas un SaaS.

---

## 2. Matrice des fonctionnalités (synthèse exécutive)

Détail complet et preuves : `VULULU_BASELINE.md` §3. Table de suivi opérationnelle :

| # | Fonctionnalité | État | Bloque la commercialisation ? | Réf. risque |
|---|---|---|---|---|
| F-01 | Authentification, sessions serveur, CSRF, origines | REAL | non | — |
| F-02 | RBAC `super_admin`/`user`, isolation propriétaire | REAL | non | — |
| F-03 | Invitations + activation | UNVERIFIED | non (à re-prouver) | — |
| F-04 | Rate limiting distribué | REAL | non | — |
| F-05 | MFA | ABSENT | non (P2) | — |
| F-06 | Contexte de marque versionné | REAL | non | — |
| F-07 | Analyse de contexte « IA » | MOCK | non (étiqueté) | P0-02 |
| F-08 | Brief versionné + confirmation exacte | REAL | non | — |
| F-09 | Storyboard | PARTIAL (templaté) | **oui** | P1-02 |
| F-10 | Personnages | PARTIAL (`CHAR-001` figé) | **oui** | P1-02 |
| F-11 | Campagnes | REAL | non | — |
| F-12 | Projets / cycle de vie | REAL | non | — |
| F-13 | Upload + inspection réelle des assets | REAL | non | — |
| F-14 | Versionnement immuable des assets + licences | REAL | non | — |
| F-15 | Sélection d'assets par projet | REAL (code) | non | — |
| F-16 | **Composition des assets dans les scènes** | **ABSENT** | **oui** | **P0-03** |
| F-17 | Rendu d'image de scène | MOCK (poster) | **oui** | **P0-01** |
| F-18 | Correction de scène | PARTIAL (cosmétique) | **oui** | P1-03 |
| F-19 | Assemblage master MP4 | UNVERIFIED | oui (preuve) | P0-06 |
| F-20 | Audio (voix, musique, mix) | ABSENT | **oui** | P1-06 |
| F-21 | Formats Affiche / Carrousel | PARTIAL (refusés) | oui | P1-05 |
| F-22 | QA média | REAL (code) / UNVERIFIED | non | P1-07 |
| F-23 | Approbation d'une version exacte | REAL | non | — |
| F-24 | Invalidation d'approbation | REAL | non | — |
| F-25 | Orchestration durable | PARTIAL (opt-in) | oui | P1-01 |
| F-26 | Outbox, réconciliation, heartbeat, métriques | REAL (code) | non | — |
| F-27 | Catalogue fournisseurs / routing / fallback | REAL (logique) + MOCK | non | — |
| F-28 | **Fournisseur IA réel** | **ABSENT** | **oui** | **P0-01** |
| F-29 | Coûts réels | ABSENT (`mode: 'MOCK'`) | **oui** | P0-04 |
| F-30 | **Postiz réel** | **MOCK** | **oui** | **P0-05** |
| F-31 | **Monétisation** (abonnement, crédits, facturation) | **ABSENT** | **oui** | **P0-04** |
| F-32 | Serveur MCP (périmètre V1) | ABSENT | non pour la vente | P1-08 |
| F-33 | Stockage local | REAL | non | — |
| F-34 | Stockage S3-compatible | UNVERIFIED | oui (prod) | — |
| F-35 | Admin (8 pages, audit, jobs, fournisseurs) | REAL (code) | non | — |
| F-36 | Observabilité (trace, logs, Prometheus) | REAL | non | — |
| F-37 | Licence du dépôt | ABSENT | **oui** | P1-09 |

**Comptage** : REAL 21 · PARTIAL 11 · MOCK 6 · ABSENT 8 · UNVERIFIED 7.
**Capacités bloquantes pour la commercialisation : 12.**

---

## 3. Risques — tableau de bord

### P0 (7) — la commercialisation est impossible tant qu'ils sont ouverts

| ID | Risque | Preuve | Étape de correction |
|---|---|---|---|
| P0-01 | Aucune génération IA réelle | `sceneComposition.ts` ; `grep` fournisseurs = 0 ; PNG `DÉMO MOCK` | C6, C7 |
| P0-02 | Discours produit ≠ réalité (« agentique multimodèle ») | `README.md` vs baseline §3.6 | **C8 (immédiat, coût nul)** |
| P0-03 | Assets jamais composés | baseline §D-02, preuve négative `grep` | C7 |
| P0-04 | Aucune monétisation possible | hors périmètre V1/V2 | **ADR de périmètre requis** |
| P0-05 | Postiz MOCK | `postizMockAdapter.ts` | C6 |
| P0-06 | Aucune preuve d'exécution E2E récente | §4 ci-dessous | **C0, C2** |
| P0-07 | Historique Git écrasé (1 commit) | `git rev-list --count HEAD` = 1 | ADR de gouvernance |

### P1 (10) — à traiter avant pilote payant

| ID | Risque | Étape |
|---|---|---|
| P1-01 | Mode par défaut non durable | C3 |
| P1-02 | Storyboard templaté, personnage figé | C6 |
| P1-03 | Corrections cosmétiques | C6 |
| P1-04 | `typecheck` rouge (3 erreurs réelles) | **C1** |
| P1-05 | Affiche/Carrousel refusés | à planifier |
| P1-06 | Audio absent | à planifier |
| P1-07 | QA des scènes réutilisées (`width/height = 0`) | **C4** |
| P1-08 | MCP absent | à planifier |
| P1-09 | Aucune licence de dépôt (D-09) | **C5** |
| P1-10 | Gates sécurité en PowerShell seulement | R5.5 |

### P2 (7)

Node 22 vs `engines >=24` · scripts de build `protobufjs`/`hatchet-sdk` ignorés ·
`apps/web/AGENTS.md` gitignoré · import `Invitation` depuis `@prisma/client` ·
profil `v1-demo-2026-11-04` en dur · coût mock `2¢` en dur · `allowedDevOrigins` limité à localhost.

---

## 4. Registre de preuves (PASS / FAIL / NOT_RUN)

**Appareil de mesure** : Linux, Node `v22.22.3`, pnpm `10.6.1`, aucun PostgreSQL, aucun FFmpeg, aucun Docker, aucun `pwsh`.
**Date** : 2026-11-19. **SHA** : `ccc1977`.

### 4.1 PASS (10)

| # | Commande | Résultat |
|---|---|---|
| P-01 | `pnpm install --frozen-lockfile` | PASS — lockfile inchangé |
| P-02 | `pnpm lint` | PASS — 0 erreur / 0 warning |
| P-03 | `tsc --noEmit` → `packages/domain` | PASS |
| P-04 | `tsc --noEmit` → `packages/media` | PASS |
| P-05 | `tsc --noEmit` → `packages/contracts` | PASS |
| P-06 | `tsc --noEmit` → `packages/application` | PASS |
| P-07 | `tsc --noEmit` → `apps/web` | PASS |
| P-08 | `vitest run tests/domain` | PASS — **141/141**, 16 fichiers |
| P-09 | `vitest run tests/{studio-draft,project-journey,project-presentation,creation-delivery}.test.ts` | PASS — 13/13 |
| P-10 | `renderScene()` direct (hors DB) | PASS — PNG 1080×1920, checksum `185cb7d2eb26…` |

**Cumul** : 141 + 13 = **156 tests verts**, + 2 tests média partiels (19 PASS sur 26 dans les fichiers mixtes).

### 4.2 FAIL (9) — 1 réel, 8 environnementaux

| # | Commande | Nature | Cause |
|---|---|---|---|
| F-01 | `tsc --noEmit` → `apps/api` | **RÉEL** | 3 erreurs de code : `TS7006` ×2 (`projectBundleQuery.ts:159,223`), `TS2347` (`rateLimiter.ts:41`) + 20 dérivées du client Prisma non généré |
| F-02 | `pnpm -r typecheck` | dérivé | propage F-01 |
| F-03 | `pnpm db:generate` | environnement | `binaries.prisma.sh` injoignable |
| F-04 | `tests/responsive-layout.test.ts` (1) | environnement | `FFMPEG_PATH requis` |
| F-05 | `tests/asset-inspection.test.ts` (3) | environnement | `FFMPEG_PATH requis pour ce test reel` (wav/mp3/mp4) |
| F-06 | `tests/media.test.ts` (1) | environnement | FFmpeg absent (5 PNG + MP4) |
| F-07 | `tests/production-profile-media.test.ts` (2) | environnement | FFmpeg absent (master 4:5) |
| F-08 | `tests/api.test.ts` | environnement | `prisma migrate deploy` bloqué ; 10 tests skipped |
| F-09 | `tests/v1/**` | environnement | idem F-08 |

**Point de discipline** : le seul FAIL imputable au code est **F-01**. Les 8 autres ont une cause
externe nommée et vérifiée. Aucun n'est converti en `PASS`.

### 4.3 NOT_RUN (14)

`pnpm build` · `prisma migrate deploy` · `prisma migrate status` · `prisma validate` ·
`pnpm exec vitest run` (suite complète) · `pnpm test:e2e` (16 specs Playwright) ·
CI GitHub Actions (4 jobs, jamais déclenchée) · 9 gates `scripts/check-*.ps1` ·
Docker/Coolify/HTTPS · S3 réel · Hatchet réel (moteur + worker + reprise) · PostgreSQL ·
`pnpm db:seed` · charge multi-workers.

---

## 5. Plan de corrections — état d'avancement

| Étape | Objet | Critère de sortie | Statut |
|---|---|---|---|
| **C0** | Rétablir la chaîne de preuve (Node 24, `pwsh`, PostgreSQL 17, FFmpeg, `db:generate`) | F-03→F-09 levés, `pnpm build` PASS | **TODO** |
| **C1** | Corriger les 3 erreurs TS réelles | F-01 PASS | **TODO** |
| **C2** | Rejouer la CI en local, puis premier run distant **sur GO** | 4 jobs verts | **TODO** |
| **C3** | Décider et sécuriser le mode d'orchestration par défaut | ADR + test de reprise | **TODO** |
| **C4** | QA des scènes réutilisées (dimensions réelles) | test correction multi-scènes vert | **TODO** |
| **C5** | Trancher la licence du dépôt (D-09) et l'ADR QeyNox | ADR acceptés | **TODO** |
| **C6** | Premier fournisseur réel derrière le port (sur GO + budget) | 1 appel tracé, budget dur | **BLOQUÉ (C5)** |
| **C7** | Composer les assets sélectionnés dans la scène | PNG contenant l'asset | **BLOQUÉ (C6)** |
| **C8** | Aligner le discours produit sur la réalité | revue de cohérence | **PRÊT (coût nul)** |

**Ordre imposé.** C8 est la seule étape exécutable **avant** C0 sans dépense ni risque : elle supprime
le risque P0-02, qui est le plus dommageable commercialement pour le moins d'effort.

**Interdiction** : aucune étape fonctionnelle (C6, C7) avant C0+C1+C2 verts et C5 accepté.

---

## 6. Décisions en attente (bloquantes)

| ID | Décision | Bloque | Propriétaire |
|---|---|---|---|
| **D-09** | Licence du dépôt (« tous droits réservés » par défaut) | C5, C6, toute commercialisation | porteur du projet |
| **X-17** | Réutilisation QeyNox (O/N) — licence + contrats non vérifiables ici | C5 | porteur du projet |
| **D-10** | Protection de `main` + PR obligatoire | C2 | porteur du projet |
| **NEW-1** | Périmètre de monétisation : reste-t-il interdit (V2) ou devient-il un lot V1.5 ? | P0-04, C6-C7 | porteur du projet |
| **NEW-2** | Fournisseur IA cible + plafond de dépense en cents | C6 | porteur du projet |
| **NEW-3** | Cible de publication réelle (Postiz ou autre) | P0-05 | porteur du projet |

**Aucune de ces décisions ne peut être prise implicitement par un agent.**

---

## 7. Journal des lots

| Lot | Date | Objet | État | Preuves |
|---|---|---|---|---|
| **R00** | 2026-11-19 | Baseline, règles de travail, statut de livraison | **DONE** | 3 documents ; 156 tests verts ; 9 FAIL (1 réel) ; 14 NOT_RUN ; code **inchangé** |

### Prochain lot recommandé

**C8 (coût nul, risque nul)** puis **C0 (environnement)**.

C8 : aligner `README.md` sur l'état réel (`MOCK`, déterministe, assets non composés, pas de
publication, pas de facturation) et retirer du titre toute promesse « agentique multimodèle ».
C'est la correction la moins coûteuse et la plus protectrice juridiquement.

C0 : reconstituer l'environnement de preuve. Ne demande **aucun** GO de production, aucune dépense,
aucun accès distant payant.

---

## 8. Ce qu'il ne faut pas faire maintenant

- Ne pas **refondre** : les frontières sont saines et testées ; le problème est fonctionnel, pas structurel.
- Ne pas **implémenter la monétisation** : hors périmètre V1/V2 → ADR d'abord (NEW-1).
- Ne pas **brancher un fournisseur** avant C5 (licence) et NEW-2 (budget) : coût réel non autorisé.
- Ne pas **importer QeyNox** : licence inconnue, ADR-0001 a déjà tranché contre, X-17 ouvert.
- Ne pas déclarer la **CI verte** : elle n'a jamais tourné.
- Ne pas **pusher / merger / déployer** : aucun GO n'a été donné.
