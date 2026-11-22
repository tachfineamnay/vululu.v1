# P12-FINAL — Certification locale et aptitude à la release

**Dépôt :** tachfineamnay/vululu.v1 · **Branche :** `campaign/vululu-completion` · **Date :** 2026-11-21.
**HEAD certifié :** `5aed475` (`feat(p12-09)`), arbre propre, **ahead 10, behind 0** par rapport à
`origin/campaign/vululu-completion`. Aucun push, merge, déploiement ni activation de paiement/fournisseur.

**VERDICT : NO-GO** — les portes critiques d'acceptation (base de données réelle, images Docker, E2E
navigateur) n'ont pas pu être exécutées dans cet environnement. Détail en §6.

---

## 1. État Git, verrous et périmètre

| Élément | Valeur vérifiée |
|---|---|
| HEAD | `5aed475ac60b` |
| Branche / divergence | `campaign/vululu-completion`, `rev-list --left-right --count` → `0 10` (aucune divergence distante) |
| Arbre de travail | `git status --porcelain` → 0 entrée (hors artefacts ignorés) |
| Diff vs `main` | 225 fichiers, +24 543 / −1 277 |
| Verrou de dépendances | `pnpm-lock.yaml` **inchangé** vs `main` (`git diff --stat main...HEAD -- pnpm-lock.yaml` → vide) |
| Fichiers suivis | 946 ; aucun `.env`/`.env.local` suivi |
| Migrations | 40 dossiers, chacun avec `migration.sql`, ordre lexicographique cohérent ; dernière : `20261122160000_creative_direction_selection` |

## 2. Contrôles exécutés et verts (commandes exactes)

| Commande | Exit | Résultat |
|---|---|---|
| `prisma validate --schema packages/db/prisma/schema.prisma` | 0 | `The schema … is valid` |
| `prisma generate --schema packages/db/prisma/schema.prisma` | 0 | Client 6.19.3 généré |
| `tsc --noEmit -p apps/api/tsconfig.json` | 0 | 0 erreur |
| `tsc --noEmit -p apps/web/tsconfig.json` | 0 | 0 erreur |
| `tsc --noEmit -p packages/media/tsconfig.json` | 0 | 0 erreur |
| `eslint apps packages tests e2e scripts` | 0 | 0 erreur, 5 avertissements préexistants |
| `services/python-tools/.venv/Scripts/python.exe -m pytest tests -q` | 0 | **34 passed** (56,48 s) |
| `… python.exe scripts/smoke.py` | 0 | `SMOKE_RESULT=PASS checks=25 failures=0` |
| Audit secrets (946 fichiers suivis, 922 textes scannés ; équivalent Node de `check-secrets.ps1`) | 0 | **0 secret réel** ; 8 occurrences de placeholders (`<secret>`, `CHANGE_ME`, `${POSTGRES_PASSWORD}`) |
| Audit frontières domaine (23 fichiers `packages/domain/src`) | 0 | **0 import interdit** (@prisma/client, fastify, @vululu/db, sharp, hatchet) |
| Audit migrations (instruction par instruction) | 0 | 40/40 avec SQL ; 3 instructions `DROP INDEX/CONSTRAINT` **historiques** (§5.1) |
| Certification média réelle (FFmpeg/FFprobe 9.0.2, Sharp) | 0 | `MEDIA_CERT=PASS checks=5` (§3) |
| `node_modules/@playwright/test/cli.js test e2e/p12-09-… --list` | 0 | 1 test listé (spec syntaxiquement valide) |

## 3. Certification média réelle (images, vidéo, audio, master)

Exécutée sur le code de HEAD (package média compilé, FFmpeg/FFprobe 9.0.2 locaux, transport stdio en
fichiers car le sandbox refuse les pipes) :

| Contrôle | Mesure réelle |
|---|---|
| Image PNG | 151 305 octets, checksum + `textLayout` liés |
| Vidéo master 2 scènes fixes | **h264 / aac**, **1080×1920**, durée **2.000000 s** |
| QA master | **PASS** (aucun contrôle en échec) |
| Mixage audio (voix courte + musique duckée) | pcm_s16le **48 kHz**, **2.000000 s** |
| Master avec audio mixé | **2.000000 s**, `audioDuration = 2`, aac |

Le chemin « clip vidéo + transitions » n'a pas été rejoué ici ; il a été certifié au lot P12-07
(`PROBE2=PASS checks=14`) et `packages/media/src/motion.ts` n'a pas changé depuis (`fb9b71e`).

## 4. Sécurité et intégrité — vérifications statiques

| Invariant | Preuve |
|---|---|
| Bêta gratuite active par défaut | `apps/api/src/betaMode.ts:25-31` : vide/`1`/`true` → `beta`, `0`/`false` → `commercial`, valeur invalide → erreur |
| Aucune clé Stripe live dans les exemples | `.env.example` : 0 occurrence `sk_live_` ; vraies clés hors dépôt |
| Publication externe désactivée par défaut | `availability.ts:40` et `publishing/provider.ts:62` : `POSTIZ_PUBLISH_ENABLED === '1'` exigé |
| Domaine pur | 23 fichiers, 0 import d'infrastructure |
| Secrets | 0 secret réel ; seuls des placeholders documentés |

## 5. Anomalies constatées (non corrigées, avec justification)

### 5.1 Trois migrations contiennent des instructions destructives

```
20261024190000_v1_01_d_active_run_scope: DROP INDEX IF EXISTS "JobRun_one_active_per_project";
20261120150000_media_generation:          ALTER TABLE "ExecutionOperation" DROP CONSTRAINT …
20261120220000_billing_modes:             ALTER TABLE "BillingOrder" DROP CONSTRAINT …
```

`AGENTS.md` §14.4 interdit `DROP` sans ADR pour les migrations **nouvelles**. Ces trois migrations sont
**antérieures à la campagne P12 et déjà appliquées** ; les réécrire violerait l'interdiction de réécriture
d'historique (§20.2) et l'exigence d'additivité. Elles ne détruisent aucune donnée métier (index et
contraintes remplacés). **Risque résiduel** : aucune vérification par rejeu réel faute de PostgreSQL.

### 5.2 Aucun défaut de code nouveau trouvé dans cette passe

Les portes exécutables sont vertes ; aucune correction n'a donc été committée par ce lot. Les correctifs
validés de la campagne restent ceux de `253ebc9` → `5aed475` (10 commits, aucun poussé).

## 6. Bloqueurs environnementaux (causes vérifiées) et échecs restants

| Porte exigée | Résultat | Cause exacte vérifiée |
|---|---|---|
| PostgreSQL jetable + `prisma migrate deploy` + tests d'intégration API | **NOT_RUN** | `net.connect(127.0.0.1:55432)` → `ECONNREFUSED` ; **aucun binaire `pg_ctl`/`postgres`** sur la machine (`glob **/pg_ctl.exe` → 0) ; `scripts/arena/pg16-local.sh` nécessite une installation absente |
| Tests unitaires/intégration Vitest (isolation locataire, CSRF, RBAC, idempotence, reprise d'incident, rate-limit, persistance des résultats) | **NOT_RUN** | `vitest run tests/v1` → `Error: spawn EPERM` (esbuild, `errno -4048`) |
| Images Docker API / Web / python-tools | **NOT_RUN** | `docker version` → `failed to connect … npipe:////./pipe/docker_engine` (démon absent) ; aucun fichier compose à la racine (compose seulement sous `infra/`, `poc/`) |
| Démarrage services, `/healthz`, `/readyz`, réseau privé | **NOT_RUN** | dépend du démon Docker |
| E2E Playwright sur pile locale | **NOT_RUN** | aucun navigateur (`%LOCALAPPDATA%/ms-playwright` absent) + `spawn EPERM` + aucune pile API/Web/DB démarrée |
| Captures 390/768/1024/1440 px, libellés FR/EN à l'écran | **NOT_RUN** | navigateur indisponible |
| Parcours utilisateur réel complet (inscription → approbation d'un rendu → téléchargement) | **NOT_RUN** | base + worker + FFmpeg orchestrés par l'API requis |
| Scripts dépôt `check-secrets.ps1`, `check-migrations.ps1`, `check-architecture-boundaries.ps1`, `check-tracked-files.ps1` | **NOT_RUN** | `#Requires -Version 7` : Windows PowerShell 5.1 refuse (`ScriptRequiresUnmatchedPSVersion`), `pwsh` 7 indisponible (runner sandbox `CreateProcessAsUserW` échoue). **Équivalents Node exécutés** (§2) |
| Sauvegarde / restauration | **NOT_RUN** | pas de PostgreSQL |
| Revue d'images (vulnérabilités) | **NOT_RUN** | pas de Docker |

## 7. Parcours utilisateur validé

**Statique seulement.** Les routes, écrans et faits persistés ont été tracés au lot P12-09 (carte de
parcours cliquable, états dérivés du serveur, portes d'assets et d'approbation côté serveur) et la machine
à états a été prouvée par sonde (`JOURNEY_STATES_PROBE_PASS cases=8`). **Aucun parcours réel en navigateur
n'a été exécuté** dans cette certification : le parcours de bout en bout reste **non validé**.

## 8. Risques résiduels de sécurité et d'intégrité

1. **Migrations jamais appliquées à une base réelle** dans cet environnement → dérive possible entre le
   schéma Prisma validé et l'état attendu (40 migrations non rejouées).
2. **Suites d'isolation locataire, CSRF, RBAC, idempotence, reprise d'incident et rate-limit non exécutées**
   → aucun certificat sur ces invariants, seulement leur présence dans le code et les tests écrits.
3. **Images jamais construites** → dépendances système (`sharp`, `ffmpeg`, Python, OpenCV) non vérifiées
   en conteneur.
4. **Aucun E2E** → régressions d'intégration UI/API invisibles.
5. Trois migrations historiques à instruction destructive (§5.1) : conforme à l'historique, mais non
   rejouable de façon additive sur un environnement vierge sans revue.
6. Le dépôt local est **en avance de 10 commits non poussés** : la revue de code externe n'a pas eu lieu.

## 9. Conditions de passage à GO (minimales et vérifiables)

1. Installer PostgreSQL 16 local (binaires hors dépôt) → `prisma migrate deploy` sur base jetable
   `vululu_v1_00_test` → 40 migrations appliquées, `prisma migrate status` sans dérive.
2. Lever le blocage `esbuild/spawn EPERM` → `vitest run tests/v1` (toutes suites) exit 0.
3. Démon Docker disponible → `docker build` api/web/python-tools, `docker compose up`, `/healthz` + `/readyz`
   OK, réseau `python` interne vérifié.
4. Navigateurs Playwright installés + pile locale → `e2e/p12-09-customer-journey.spec.ts` et les parcours
   existants verts, captures 390/768/1024/1440 px.
5. Rejouer la certification média « clip + transitions » à HEAD.
6. Revue des 3 migrations historiques destructives (décision documentée, sans réécriture).

Tant que 1–4 ne sont pas exécutés, la certification reste **NO-GO**.
