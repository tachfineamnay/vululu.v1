# V1 — Audit de sécurité pré-push

**Lot** : V1-01-H — Phase B (audit sécurité AVANT publication vers la branche GitHub)
**Branche auditée** : `v1-01-g-architecture-certification`
**Commit de référence** : `bcf2c582a7e0277b193de0dc78dd766f319c2e5c` (attendu `bcf2c58`)
**Dépôt distant** : `https://github.com/tachfineamnay/vululu.v1.git` (références distantes vérifiées : `refs/heads/main` = `69c6549` uniquement ; la branche de certification n'existe pas encore à distance)
**Date de l'audit** : 2026-10-25 (UTC), fenêtre d'exécution 12:24Z–13:10Z
**Auditeur** : agent `security-auditor` (équipe de certification V1-01-H)
**Nature** : audit en lecture seule ; aucun push, commit, add, checkout, merge, update de dépendance ni modification de code. Seul fichier écrit : le présent rapport.
**Confidentialité** : ce rapport ne contient **aucun secret**. Les valeurs sensibles éventuelles sont masquées (`***`) ; la preuve se limite à `chemin:ligne:type`.

---

## 0. Verdict

> **VERDICT : `PUSH_SECURITAIREMENT_AUTORISE`**
>
> **0 constat P0.** Aucun secret réel (clé fournisseur, jeton GitHub, clé AWS/S3, clé privée PEM, JWT, URL présignée, identifiant en URL, secret de session) n'est présent dans l'arbre suivi ni dans l'historique des 37 commits `main..HEAD`. Aucun fichier interdit (`.env`, `.v0/`, `.v1/`, `data/`, `node_modules/`, dump, base SQLite/PostgreSQL, log, média généré) n'est suivi ni n'a jamais été ajouté à l'historique. Le contenu peut être poussé sans risque de fuite de secret **sous les conditions du § 7** (notamment : re-scan du contenu final une fois les phases D/E/F commitées, car l'arbre de travail évoluait pendant l'audit).
>
> **1 constat P1** (non bloquant pour le push) : vulnérabilités connues dans l'outillage dev/test (aucune dépendance d'exécution exposée). Les identifiants de démonstration locaux et les valeurs de repli historiques sont documentés en P2.
>
> **Aucune rotation de secret n'est nécessaire** : aucun secret réel n'a été exposé.

---

## 1. Périmètre et méthode

### 1.1 Références vérifiées (indépendamment du contexte transmis)

| Élément | Valeur constatée | Statut |
|---|---|---|
| Branche de travail | `v1-01-g-architecture-certification` | conforme |
| HEAD | `bcf2c582a7e0277b193de0dc78dd766f319c2e5c` | conforme |
| `git merge-base main HEAD` | `69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50` | main ancêtre de HEAD (fast-forward possible) |
| Commits `main..HEAD` | 37 | conforme |
| Diff `main..HEAD` | 287 fichiers, +38 963 / −42 | conforme |
| Fichiers suivis | 309 | conforme |
| Upstream branche de certification | **aucun** (`fatal: no upstream configured`) | branche jamais poussée |
| Références distantes `git ls-remote origin` | `HEAD` et `refs/heads/main` = `69c6549` uniquement | rien n'est encore publié depuis la branche |
| Worktrees | `C:/Users/hp/Desktop/vululu Ai` (v0, `ddda015`) et worktree de certification (`bcf2c58`) | conforme |
| État de l'arbre | `git status --porcelain` propre à 12:24Z | base d'audit saine |

### 1.2 Scans réalisés

1. **Arbre de travail (contenu poussé)** : les 309 fichiers suivis ont été scannés (306 fichiers texte + 3 fichiers `.docx` dont le XML `word/*.xml` a été extrait et scanné).
2. **Historique complet** : les **533 blobs distincts** accessibles depuis **toutes les références** (39 commits de HEAD, 45 commits toutes branches, dont les 37 commits de `main..HEAD`) ont été lus via `git cat-file --batch` et scannés ligne à ligne. Les blobs sont classés : `HEAD-NEW` (nouveaux, deviendront publics), `HEAD-OLD` (déjà publics via main), `AUTRE-REF` (branches locales non poussées).
3. **Deux passes de motifs** (voir § 2.1) + analyse d'entropie + vérification des fichiers sensibles ajoutés dans l'historique (`git log --all --diff-filter=A --name-only`).
4. **Objets Git** : `git cat-file --batch-all-objects`, `git count-objects -vH`, cartographie blob → chemins.
5. **Dépendances** : lecture de `package.json` (9 manifests), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `poc/hatchet/package-lock.json` ; `pnpm audit`, `pnpm licenses list`, `npm audit` (sous-projet poc), contrôle d'intégrité, analyse typosquat heuristique.
6. **Outil interne** `scripts/check-secrets.ps1` exécuté en preuve indépendante.
7. **Contrôles négatifs ciblés** : motifs supplémentaires (Google, Slack, Stripe, SendGrid, GitLab, Hugging Face, npm `_authToken`, age, Discord, Twilio, jeton de session AWS), affectations de type `.env`, messages de commit, e-mails externes, présence de symlinks/sous-modules/LFS.

### 1.3 Règles de traitement

- Aucune valeur sensible n'est affichée ni recopiée : seuls `chemin:ligne:type` et des valeurs masquées sont rapportés.
- Le fichier `.env` local (secrets de dev réels) **n'a jamais été affiché ni copié** ; son statut a été vérifié (non suivi, ignoré, jamais committé).
- Chaque contrôle est classé **PASS / FAIL / NOT_RUN / BLOCKED** ; aucune exécution distante n'est déclarée PASS sans preuve.

---

## 2. B1 — Secrets

### 2.1 Motifs recherchés

Passe 1 : AWS (`AKIA/ASIA/ABIA/ACCA` + secret key), GitHub (`ghp_/gho_/ghu_/ghs_/ghr_`, `github_pat_`), OpenAI/Anthropic (`sk-`, `sk-ant-`, `sk-proj-`), clés privées PEM, JWT (`eyJ...`), Bearer, S3, URL présignées (`X-Amz-Signature/Credential/Security-Token`), URL avec identifiants (`scheme://user:pass@host`), affectations `password|passwd|pwd|secret|token|api_key|access_key|session_secret`, auth Docker, en-têtes `Authorization`, URL PostgreSQL, entropie élevée.
Passe 2 : Google API key (`AIza`), Slack (`xox[baprs]-`), Stripe live, SendGrid, GitLab PAT, Hugging Face, npm `_authToken`, age, webhooks Discord, Twilio, jeton de session AWS, lignes de type `.env` (clé contenant SECRET/TOKEN/PASSWORD/KEY/CREDENTIAL avec valeur non vide), paramètres d'URL sensibles.

### 2.2 Résultats B1

| ID | Contrôle | Méthode | Résultat |
|---|---|---|---|
| B1-1 | Arbre suivi (306 texte + 3 docx) : aucun secret réel | scan motifs passe 1 | **PASS** |
| B1-2 | Historique : 533 blobs / 45 commits / 37 commits `main..HEAD` | `git cat-file --batch` + scan | **PASS** |
| B1-3 | AWS, GitHub, OpenAI/Anthropic, PEM, JWT, presigned, S3, Hatchet, Docker, URL à identifiants | regex dédiées | **PASS** (0 occurrence réelle) |
| B1-4 | Formats élargis + affectations `.env` | passe 2 | **PASS** (4 occurrences, toutes des variables de test internes : `csrfToken`, `invitationToken` — pas des secrets) |
| B1-5 | Ajouts historiques de fichiers sensibles | `git log --all --diff-filter=A --name-only` | **PASS** — aucun `.env`, `.v0/`, `.v1/`, `data/`, `node_modules/`, dump, base, log |
| B1-6 | `.gitignore` + `git check-ignore` | lecture + échantillon de 9 chemins | **PASS** (couvre `.env`, `.env.*`, `!.env.example`, `.v0/`, `.v1/`, `data/`, `node_modules/`, `test-results/`, logs, sqlite, backups, uploads) |
| B1-7 | `.env.example` : placeholders uniquement | lecture intégrale (fichier suivi, non secret) | **PASS** — valeurs de secrets vides, URLs PostgreSQL locales sans mot de passe, mot de passe démo `change-me`/vide (non utilisable) |
| B1-8 | `.env` local : non suivi, ignoré, jamais committé | `git ls-files`, `git check-ignore`, historique | **PASS** — contenu non affiché par règle ; aucune trace dans l'historique |
| B1-9 | `.docx` suivis (3) | extraction `word/*.xml` | **PASS** — 0 détection |
| B1-10 | Messages de commit (45 commits, toutes refs) | scan motifs | **PASS** — 0 détection |
| B1-11 | Workflow CI (état HEAD) : pas de secret en dur, secrets CI éphémères | lecture ciblée | **PASS** — `SESSION_SECRET=ci-session-...` généré à l'exécution (`openssl rand`), aucune référence à des secrets de dépôt |
| B1-12 | Outil interne `scripts/check-secrets.ps1` | exécution réelle | **PASS** — `SECRET_SCAN_PASS: aucun secret detecte.` (306 fichiers, exit 0) |
| B1-13 | Identifiants de démonstration locaux (voir SEC-01) | analyse ciblée | **PASS avec réserve P2** — présents, mais strictement locaux/tests |
| B1-14 | Valeurs de repli historiques dev (voir SEC-02, SEC-03) | `git log -S` + versions de blob | **PASS avec réserve P2** — présentes dans des versions intermédiaires, retirées avant HEAD |
| B1-15 | Analyse d'entropie (190 alertes brutes) | revue des contextes | **PASS** — 100 % faux positifs : noms de fichiers de documentation (ex. `docs/...md`), aucune chaîne de type jeton |

### 2.3 Constats B1 détaillés

**Aucun secret réel détecté.** Les seules occurrences sensibles relèvent de valeurs de démonstration/test locales, documentées ci-dessous et classées P2. Elles ne permettent d'accéder à **aucun système réel** :

- l'API refuse toute base non locale (`apps/api/src/env.ts:39-47`) ;
- le seed exige `V1_BOOTSTRAP_EMAIL` **et** `V1_BOOTSTRAP_PASSWORD` explicitement, sans valeur par défaut (`packages/db/prisma/seed.ts:8-12`) ;
- `SESSION_SECRET` est obligatoire, longueur ≥ 32, sinon démarrage refusé (`apps/api/src/env.ts:49-52`) — aucun repli ;
- le workflow CI génère son propre secret éphémère ;
- `.env.example` ne contient aucune valeur exploitable.

**Contrôles positifs observés (hors constats)** : sessions opaques hachées SHA-256 côté serveur, cookie `HttpOnly`, `Secure` en production, CSRF double-submit (`apps/api/src/security/session.ts`) ; secrets fournis par l'environnement uniquement.

---

## 3. B2 — Données et artefacts

### 3.1 Résultats B2

| ID | Contrôle | Preuve | Résultat |
|---|---|---|---|
| B2-1 | Aucun fichier interdit suivi (`.env`, `.v0/`, `.v1/`, `node_modules/`, `data/`, `test-results/`, dumps, bases, logs, uploads, backups) | `git ls-files` (309) + motif | **PASS** — 0 |
| B2-2 | Artefacts locaux ignorés, rien de sensible suivi par erreur | `git status --ignored` | **PASS** — ignorés : `.env`, `.v0/`, `.v1/`, `data/`, `node_modules/`, `test-results/`, `.next/`, logs/`*.pid` du POC |
| B2-3 | Aucun chemin interdit dans l'historique | 405 chemins distincts de `git rev-list --objects --all` | **PASS** — seuls `.env.example`, 3 `.docx` sources et 12 migrations `.sql` (faux positifs d'extension) |
| B2-4 | Aucun blob > 1 Mio | `git cat-file --batch-check` | **PASS** — 0 ; plus gros blob = 136,2 Kio (`pnpm-lock.yaml`) |
| B2-5 | Inventaire des objets et taille du dépôt | `git count-objects -vH`, `--batch-all-objects` | **PASS** — 984 objets (533 blobs, 406 arbres, 45 commits), contenu des blobs 3,53 Mo, objets non empaquetés 1,39 Mio, `.git` 1,55 Mo / 1 044 fichiers |
| B2-6 | Pas de binaires/médias générés/dumps | extensions suivies : `.ts` 142, `.md` 98, `.json` 19, `.ps1` 14, `.sql` 12, `.tsx` 7, `.docx` 3 (sources PRD/CDC), 0 image/vidéo/archive/base | **PASS** |
| B2-7 | Pas de symlink/sous-module/LFS | `git ls-files -s` (modes 120000/160000), `.gitattributes` | **PASS** |
| B2-8 | Documents internes / PII (voir SEC-07, SEC-08) | lecture ciblée | **PASS avec réserve P2** |
| B2-9 | Références/objets parasites (« garbage: 1 » dans `count-objects`) | inspection du gitdir du worktree | **PASS** (répertoire `refs` vide local, non poussé — sans impact) |

### 3.2 Détails utiles

- Les 3 fichiers `.docx` suivis sont des documents sources importés (`docs/source/VULULUIA_PRD_V1_2.docx`, `CDC_V1_2.docx`, `NOTE_V2_PROPOSITIONS.docx`) : contenu textuel scanné (0 secret). Leur présence est légitime ; leur **droit de publication** doit être confirmé (SEC-07).
- L'adresse e-mail personnelle `tachfine.amnay@gmail.com` figure dans `docs/INAUGURATION_REPORT.md:57` (identité Git) et dans les métadonnées de commit — déjà publique par nature via Git ; à confirmer par le propriétaire (SEC-08).
- Les documents d'audit internes déjà présents (`docs/reviews/V0_FINAL_AUDIT.md`, `V0_TEST_EVIDENCE.md`, `V1_IMPLEMENTATION_BASELINE.md`, `V1_TECHNICAL_GAPS.md`) et les nouveaux rapports de certification seront publiés si le dépôt est public (SEC-07).

---

## 4. B3 — Dépendances

### 4.1 Cohérence des manifests et du lockfile

| ID | Contrôle | Preuve | Résultat |
|---|---|---|---|
| B3-1 | Gestionnaire et version de lockfile | `packageManager: pnpm@10.6.1` ; `lockfileVersion: '9.0'` | **PASS** (compatible pnpm 10) |
| B3-2 | Importers du lockfile ↔ workspace | 8 importers : `.`, `apps/api`, `apps/web`, `packages/application`, `packages/contracts`, `packages/db`, `packages/domain`, `packages/media` ; 0 écart de specifier, 0 dépendance en trop/manquante | **PASS** |
| B3-3 | Versions critiques épinglées (manifeste + lockfile + installé) | voir tableau § 4.2 | **PASS** |
| B3-4 | Résolutions registre + intégrité | 459 entrées `resolution` avec `integrity`, 0 `tarball`/git/HTTP ; 486 entrées, 474 noms uniques ; aucun `.npmrc`, aucun registre alternatif | **PASS** |
| B3-5 | Scripts de build restreints | `onlyBuiltDependencies` = `@prisma/client`, `@prisma/engines`, `esbuild`, `prisma` (dans `pnpm-workspace.yaml` et `package.json`) | **PASS** |
| B3-6 | Typosquat / paquets suspects | 474 noms passés en revue ; heuristique distance 1 sur ~60 paquets populaires = 0 ; aucun caractère non-ASCII ; aucun paquet crypto/wallet/payload | **PASS** |
| B3-7 | Licences | MIT 256, Apache-2.0 61, BSD-3 19, ISC 16, BSD-2 7, 0BSD 1, BlueOak 1, CC-BY-4.0 1, Apache-2.0 AND BSD-3 1, `@img/sharp-win32-x64` Apache-2.0 AND LGPL-3.0-or-later 1 — aucune GPL/AGPL/UNLICENSED | **PASS avec note LGPL** (binaire sharp, usage interne non redistribué) |
| B3-8 | Vulnérabilités connues (pnpm) | `pnpm audit` (réseau disponible) | **FAIL** — 6 avis (SEC-04), aucune correction appliquée (mise à jour de dépendances interdite dans ce lot) |
| B3-9 | Vulnérabilités connues (sous-projet POC) | `npm audit` dans `poc/hatchet` | **FAIL** — 1 avis high (SEC-05), POC local uniquement |
| B3-10 | Reproductibilité / peers | `autoInstallPeers: true` (note P2) ; `react`/`react-dom` en `^19.0.0` résolus exactement par le lockfile ; `typescript`/`eslint` en ranges `^5.9.0`/`^10.13.0` résolus exactement | **PASS avec note** |

### 4.2 Versions critiques vérifiées

| Paquet | Attendu | Manifeste | Lockfile | Installé |
|---|---|---|---|---|
| `prisma` | 6.19.3 | 6.19.3 | 6.19.3 | 6.19.3 |
| `@prisma/client` | 6.19.3 | 6.19.3 | 6.19.3 | 6.19.3 |
| `fastify` | 5.12.7 | 5.12.7 | 5.12.7 | 5.12.7 |
| `next` | 16.4.2 | 16.4.2 | 16.4.2 | 16.4.2 |
| `@hatchet-dev/typescript-sdk` | 1.43.0 | 1.43.0 (api + poc) | 1.43.0 | 1.43.0 |
| `sharp` | 0.35.5 | 0.35.5 | 0.35.5 | 0.35.5 |
| `bcryptjs` | 3.0.3 | 3.0.3 | 3.0.3 | 3.0.3 |
| `zod` | 4.6.7 | 4.6.7 | 4.6.7 | 4.6.7 (`poc` : 3.25.76 épinglé séparément) |
| `@playwright/test` | 1.64.1 | 1.64.1 | 1.64.1 | 1.64.1 |
| `typescript` | 5.9.x | `^5.9.0` | 5.9.3 | 5.9.3 |
| `eslint` | 10.x | `^10.13.0` | 10.13.0 | 10.13.0 |
| `@aws-sdk/client-s3` | — | `^3.1156.0` | 3.1156.0 | 3.1156.0 |
| `vitest` | — | `^3.2.0` | 3.2.7 | 3.2.7 |

Sous-projet `poc/hatchet` (projet npm autonome, hors workspace pnpm) : `package-lock.json` v3, 128 paquets, 100 % résolus depuis `registry.npmjs.org` — versions épinglées (`@hatchet-dev/typescript-sdk` 1.43.0, `pg` 8.16.3, `zod` 3.25.76, `tsx` 4.20.0, `typescript` 5.9.2).

### 4.3 Vulnérabilités connues (aucune correction appliquée — consigne de non-mise à jour respectée)

**pnpm (dépôt principal)** — `pnpm audit` : 467 dépendances, **6 avis** : 2 critical, 1 high, 3 moderate.

| Avis | Sévérité | Paquet vulnérable (installé) | Chaîne | Version corrigée | Portée |
|---|---|---|---|---|---|
| GHSA-5gmw-xhrv-c9v3 / CVE-2026-104848 | critical | `tinypool` 1.1.1 | `vitest` → `tinypool` | ≥ 2.1.1 | dev/test |
| GHSA-85c8-ppgw-ccpr / CVE-2026-104849 | critical | `tinypool` 1.1.1 | `vitest` → `tinypool` | ≥ 2.1.2 | dev/test |
| GHSA-ggr8-5vv4-36mx / CVE-2026-40345 | high | `deepmerge-ts` 7.1.5 | `prisma@6.19.3` → `@prisma/config` → `deepmerge-ts` | ≥ 8.0.0 | outillage Prisma (CLI/config) |
| GHSA-82fw-gwwq-j7x9 / CVE-2026-84373 | moderate | `vitest` 3.2.7 | racine (devDependency) | ≥ 4.1.11 | dev/test |
| GHSA-82fw-gwwq-j7x9 / CVE-2026-84373 | moderate | `@vitest/mocker` 3.2.7 | `vitest` | ≥ 4.1.11 | dev/test |
| GHSA-qxg6-89mg-rqv8 / CVE-2026-112949 | moderate | `@vitest/mocker` 3.2.7 | `vitest` | ≥ 4.1.12 | dev/test |

Analyse : **aucune de ces dépendances n'est une dépendance d'exécution du serveur API ou du web** (elles n'apparaissent que via `vitest`/`@vitest/mocker`/`tinypool` — runner de tests — et `prisma` CLI/`@prisma/config` — outillage de génération/migration). Les corrections imposent des montées majeures (vitest 4.x, prisma/deepmerge) : **hors périmètre de ce lot** (mise à jour de dépendances interdite) et **non bloquantes pour le push**.

**npm (sous-projet `poc/hatchet`)** — 1 avis : `zod` 3.25.76 (high, GHSA-mrhx-c7xc-m3w5, correctif 4.6.7) ; POC local de démonstration Hatchet, non déployé, hors API V1.

---

## 5. Synthèse des constats

Aucun constat **P0**. Constats classés par sévérité décroissante.

| ID | Catégorie | Sévérité | Emplacement | Preuve | Impact |
|---|---|---|---|---|---|
| SEC-01 | B1 — Identifiants démo locaux en dur | **P2** | `e2e/v0.spec.ts:6-7`, `scripts/verify-v0.ps1:40-42`, `tests/api.test.ts:13`, `tests/v1/auth-security.test.ts:12` (valeurs de test) | identifiants de démonstration locaux (e-mail `demo@vululu.local`, mots de passe de démo/test) utilisés uniquement par tests, E2E local et scripts de vérification | Aucun accès réel : base non locale refusée (`env.ts:39-47`), seed sans mot de passe par défaut (`seed.ts:8-12`), `.env` requis. Ne pas déployer de données démo en public |
| SEC-02 | B1 — Repli historique de `SESSION_SECRET` | **P2** | versions intermédiaires de `apps/api/src/env.ts` dans `main..HEAD` | `git log -S` : ancienne valeur de repli « dev-only… change-me » (masquée), retirée avant HEAD ; HEAD impose ≥ 32 caractères sans repli (`env.ts:49-52`) | Valeur de dev connue et inutilisable (aucun système ne l'utilise) ; reste visible à jamais dans l'historique public. **Pas de réécriture d'historique recommandée** (non autorisée et non nécessaire) |
| SEC-03 | B1 — Repli historique du seed | **P2** | versions intermédiaires de `packages/db/prisma/seed.ts` | `git log -S` : ancien repli `|| 'vululu-demo'` retiré avant HEAD ; seed actuel exige les deux variables | Identifiant de démo local, sans accès réel ; visible dans l'historique public |
| SEC-04 | B3 — Vulnérabilités outillage dev/test | **P1** | `pnpm-lock.yaml` (`vitest` 3.2.7, `@vitest/mocker` 3.2.7, `tinypool` 1.1.1, `deepmerge-ts` 7.1.5) | `pnpm audit` : 6 avis (2 critical, 1 high, 3 moderate) | Aucune dépendance d'exécution exposée ; pas de correctif dans ce lot ; planifier vitest 4.x et montée `deepmerge-ts`/`prisma` |
| SEC-05 | B3 — Vulnérabilité POC | **P2** | `poc/hatchet/package-lock.json` (`zod` 3.25.76) | `npm audit` : 1 high (GHSA-mrhx-c7xc-m3w5) | POC local Hatchet uniquement, non déployé ; hors API V1 |
| SEC-06 | B3/CI — Supply chain actions | **P2** | `.github/workflows/ci.yml` (état HEAD) | `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4` : tags majeurs non épinglés SHA | Durcissement recommandé (épinglage SHA) après refonte CI Phase D |
| SEC-07 | B2 — Documents internes / sources | **P2** | `docs/reviews/*`, `docs/execution/*`, `docs/source/*.docx` | documents d'audit interne, preuves de sécurité et PRD/CDC importés présents dans le contenu à publier | Vérifier la politique de divulgation avec le propriétaire si le dépôt distant est public |
| SEC-08 | B2 — Donnée personnelle | **P2** | `docs/INAUGURATION_REPORT.md:57` | e-mail personnel de l'auteur | Déjà exposé par les métadonnées Git ; confirmer l'acceptation ou masquer dans la doc |
| SEC-09 | B3 — Hygiène dépendances POC | **P3** | `poc/hatchet/package-lock.json` | second gestionnaire (npm) hors workspace pnpm | Double maintenance ; aucun risque sécurité direct |
| SEC-10 | B2 — Hygiène dépôt | **P3** | gitdir du worktree | `count-objects` signale « garbage: 1 » (répertoire `refs` vide) | Aucun impact sur le push ; nettoyage local possible |
| SEC-11 | B3 — Reproductibilité | **P3** | `pnpm-lock.yaml` (`settings.autoInstallPeers: true`) ; ranges `^` pour typescript/eslint/react | lockfile résout exactement | Reproductibilité assurée par lockfile ; documentation recommandée |
| SEC-12 | Processus — contenu final non figé | **P2** | arbre de travail au moment de l'audit | modifications Phase D en cours non commitées (`.github/workflows/ci.yml`, `scripts/check-secrets.ps1`, `apps/web/next-env.d.ts`, 3 nouveaux scripts `check-*.ps1`) ; scannées à titre indicatif : 0 secret | Le contenu poussé différera de HEAD : **re-scan obligatoire avant push** (§ 7) |

### Risques prioritaires

- **P0 (bloquants push)** : **aucun**.
- **P1 (à planifier, non bloquants)** : SEC-04 (vulnérabilités outillage dev/test, 2 critical + 1 high), et re-scan final SEC-12.
- **P2 (documentés, non bloquants)** : SEC-01, SEC-02, SEC-03, SEC-05, SEC-06, SEC-07, SEC-08, SEC-12.
- **P3 (hygiène)** : SEC-09, SEC-10, SEC-11.

---

## 6. Contrôles non exécutés / limites

| Élément | Statut | Commentaire |
|---|---|---|
| Exécution réelle GitHub Actions (distante) | **NOT_RUN** | Aucun run distant possible/effectué : le workflow n'a jamais tourné sur la branche ; les statuts CI ne peuvent pas être certifiés par cet audit (Phase D/F). |
| Visibilité effective du dépôt GitHub (public/privé) | **NON VÉRIFIÉ** | Paramètre GitHub non accessible sans authentification ; l'audit suppose un dépôt potentiellement public conformément à la mission. |
| Contenu du `.env` local | **NON AFFICHÉ (par règle)** | Vérifié uniquement : non suivi, ignoré, jamais committé. Sa validité/rotation relève de l'exploitation locale. |
| Images intégrées aux `.docx` | **NON SCANNÉES** | Seul le texte XML a été extrait et scanné ; les images des documents sources ne contiennent pas de secret par nature (documents PRD/CDC). |
| Scan heuristique | Limite connue | Deux passes de motifs + entropie + contrôles dédiés ; un format de secret inédit resterait possible. Aucune exécution de scanner commercial. |
| Arbre de travail pendant l'audit | Partiel | Des fichiers de la Phase D étaient en cours de modification (SEC-12) ; ils ont été scannés à titre indicatif (0 secret) mais ne sont pas figés. |
| Historique plus large (`--all`, branches locales non poussées) | PASS informatif | 45 commits / 533 blobs scannés ; les branches v0 et intermédiaires restent locales (seule la branche de certification sera poussée). |

---

## 7. Verdict et conditions du push

### Verdict : `PUSH_SECURITAIREMENT_AUTORISE`

Motivation : aucun secret réel, aucun artefact interdit, aucun blob volumineux, historique des 37 commits propre ; les seuls constats de sécurité sont documentés, non bloquants, et les vulnérabilités connues concernent uniquement l'outillage de développement/test (aucune dépendance d'exécution exposée).

**Conditions impératives avant le push** :

1. **Re-scan du contenu final** : après commit des phases D/E/F, ré-exécuter `pwsh -NoProfile -File scripts/check-secrets.ps1` et un scan des fichiers modifiés ; résultat attendu : 0 détection (état constaté le 2026-10-25 : 0).
2. **Ne jamais committer `.env`** ni aucun fichier de secret : `.gitignore` le couvre ; vérifier `git status --ignored` et `git diff --cached --name-only` avant push.
3. **Pousser uniquement** `v1-01-g-architecture-certification` (jamais la branche locale `v0-fullstack-sprint`, jamais de force push) ; main reste protégée/PR (décision D-10).
4. **Aucune rotation de secret nécessaire** (aucun secret réel exposé).
5. **Décisions humaines** : valider la publication des documents internes/sources importées (SEC-07) et de l'e-mail personnel (SEC-08) si le dépôt est public ; planifier les montées de dépendances (SEC-04/SEC-05) hors de ce lot.
6. **Exploitation** : ne jamais déployer publiquement avec les identifiants de démonstration locaux (SEC-01) ; conserver l'exigence `SESSION_SECRET` ≥ 32 caractères et le refus de base non locale.

---

## 8. Plan de remédiation

Aucun correctif P0 requis. Plan proposé (hors périmètre du présent lot, aucune action de mise à jour effectuée) :

| Priorité | Action | Référence |
|---|---|---|
| Avant push | Re-exécuter le scan de secrets sur le contenu final commité ; vérifier l'inventaire des fichiers poussés | SEC-12, B1-12 |
| Court terme | Planifier montée `vitest` 4.x (corrige `tinypool`/`@vitest/mocker`) et `deepmerge-ts` ≥ 8 via montée Prisma ; `zod` ≥ 4.6.6 dans le POC | SEC-04, SEC-05 |
| Court terme | Épingler les actions GitHub par SHA dans le workflow refondu ; conserver secrets CI éphémères | SEC-06 |
| Moyen terme | Documenter la politique de publication (documents internes, sources, données personnelles) ; masquer l'e-mail si requis | SEC-07, SEC-08 |
| Hygiène | Unifier les dépendances du POC (workspace pnpm ou projet isolé assumé) ; nettoyer le répertoire `refs` vide du worktree | SEC-09, SEC-10 |

---

## 9. Annexe — commandes et preuves (sorties masquées)

Toutes les preuves brutes (valeurs masquées) sont stockées **hors du dépôt** dans `%TEMP%\vululu-v1-evidence\` : `findings.json`, `lock-package-names.txt`, `pnpm-audit.json`, `pnpm-licenses.json`, `npm-audit-poc.json`, `check-secrets.out.txt`. **Aucun fichier temporaire n'a été écrit dans le dépôt.**

Commandes principales exécutées (workdir `C:\Users\hp\Desktop\vululu-ai-v1-00`) :

```text
git rev-parse HEAD ; git merge-base main HEAD ; git rev-list --count main..HEAD
git diff --shortstat main..HEAD ; git ls-files ; git status --porcelain ; git status --ignored
git ls-files -- .env '.env.*' ; git check-ignore -v .env .v0 .v1 data node_modules test-results
git log --all --diff-filter=A --name-only          # ajouts historiques de fichiers sensibles
git rev-list --objects --all | git cat-file --batch  # lecture de tous les blobs (scan secrets)
git cat-file --batch-all-objects --batch-check ; git count-objects -vH
git log --all --oneline -S 'dev-only-vululu' ; git log ... -S "|| 'vululu-demo'"
git for-each-ref ; git worktree list --porcelain ; git ls-remote origin
pwsh -NoProfile -File scripts/check-secrets.ps1    # exit 0 : SECRET_SCAN_PASS
pnpm audit --json ; pnpm licenses list --json ; pnpm list -r --depth -1 --json
npm audit --json (poc/hatchet)
```

---

*Rapport produit par l'agent security-auditor (équipe V1-01-H), en lecture seule. Aucun secret réel n'est reproduit dans ce document. Ce rapport ne remplace pas la revue humaine finale du Lead avant publication.*
