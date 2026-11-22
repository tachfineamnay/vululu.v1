# DSH-02B — Finition runtime et tests navigateur réels (2026-11-22)

**Branche :** `integration/vululu-release-20261121` · **HEAD de départ :** `6c464d9`.
**Pile utilisée :** projet Compose `vululu-qa` déjà démarré (web **3190**, API **3191**, PostgreSQL 17 **3193**,
worker Hatchet, python-tools). Aucun second serveur de développement n'a été lancé.
**Garde-fous :** `VULULU_BETA_MODE=1`, aucun fournisseur payant, aucune publication, aucun push,
aucun merge vers `main`, aucun déploiement.

---

## 1. Régression Python — isolation du répertoire de travail

**Symptôme (run précédent) :** 33 passés / 1 échec. Le test
`test_capabilities_are_classical_and_models_are_not_active` écrivait dans
`Path(os.getcwd()).parents[1] / "data"`, c'est-à-dire dans l'arborescence du dépôt.

**Mécanisme reproduit dans le conteneur QA réel** (`docker exec vululu-qa-python-tools-1`) :

```
Python -c "from pathlib import Path; p=Path('/app').parents[1]/'data'"  -> IndexError: 1
docker inspect ... HostConfig.ReadonlyRootfs = True   (compose: read_only: true, tmpfs /tmp:64m)
```

À `cwd=/app`, `parents[1]` n'existe pas (IndexError) ; même résolu, le chemin viserait une racine en
lecture seule. Le test ne pouvait donc jamais passer dans l'image de production.

**Correctif (test uniquement, aucune faille ouverte) :** le test reçoit la fixture `tmp_path` de pytest
(`TMPDIR`, soit `/tmp` en tmpfs dans l'image) et n'écrit plus jamais dans le dépôt. Les réglages de
sécurité du runtime (`read_only: true`, `/tmp` tmpfs 64 M, `user 10001`, `no-new-privileges`, `cap_drop ALL`)
sont conservés à l'identique.

**Nouvelle régression 448 px** (`test_segmentation_downscaled_to_448_keeps_mask_aligned`,
paramétrée 900×1200 et 1600×900) : le masque doit revenir aux dimensions exactes de la source, rester
aligné sur le sujet (`IoU >= 0.90`, couverture à ±0,02 de la vérité terrain), sans trou, sans pixel isolé,
sans pointe fine, avec un contour à moins d'une marche d'agrandissement (`ceil(max(w,h)/448)+2` px) ;
la durée mesurée doit rester sous le budget de production de **25 s**.
`test_segmentation_timeout_is_enforced_and_service_recovers` vérifie en plus qu'un budget de 1 s coupe
réellement le processus natif (**504 `processing_timeout`, retryable**), que `/readyz` reste `ready`
après remplacement de l'enfant tué et que la requête suivante aboutit.

**Suite complète (dépôt, venv du service) :**

| Commande | Résultat |
|---|---|
| `python -m pytest -q` (services/python-tools) | **37 passed**, 1 warning, **99,10 s**, exit 0 |

Note : pytest n'est pas installé dans l'image de production (`--no-dev`) ; la suite complète est donc
exécutée hors conteneur, et le mécanisme d'échec est prouvé dans le conteneur QA (ci-dessus).

## 2. Analyse de secrets

Détection unique : `FINDING pattern=assigned-secret file=services/python-tools/.env.example line=2` —
la valeur placeholder du jeton `PYTHON_TOOLS_TOKEN` faisait 25 caractères, au-delà du seuil de 24 du motif
`assigned-secret`. Aucun secret réel : c'était un placeholder (la valeur exacte n'est pas recopiée ici,
pour ne pas recréer la détection dans ce rapport).

**Correctif retenu (le plus étroit, sans toucher au scanner) :** placeholder aligné sur la convention du
dépôt (`CHANGE_ME`, comme `SESSION_SECRET=CHANGE_ME` de `infra/coolify/.env.example`), avec un commentaire
sur la longueur minimale réelle (24, recommandé 32). Aucune exclusion ajoutée, aucun motif désactivé.

| Commande | Résultat |
|---|---|
| `pwsh -NoProfile -File scripts/check-secrets.ps1` | **`SECRET_SCAN_PASS`**, exit 0 (voir compte de fichiers au §7) |

## 3. Défaut produit trouvé et corrigé : `AssistantTurn_kind_check`

Le parcours navigateur a révélé un **défaut produit réel** : `POST /api/projects/:id/assistant` renvoyait
**500 internal_error** pour tout brainstorming. Cause prouvée par appel direct du cas d'usage sur la base QA :

```
PrismaClientUnknownRequestError: new row for relation "AssistantTurn" violates check constraint
"AssistantTurn_kind_check" (PostgreSQL 23514)
```

La migration d'origine `20261120200000_project_assistant` n'autorisait que `marketing` et `creative`,
alors que le service persiste aussi `brainstorm` (P12-05) et `agent` (P12-06). Sur toute base construite
par `migrate deploy`, le brainstorming et les tours d'agent étaient donc impossibles.

**Correctif :** migration additive `20261122180000_assistant_turn_kinds` (élargissement de la contrainte,
aucune ligne ni colonne modifiée) + régression dans `tests/db/migration-chain.test.ts` (accepte
`brainstorm`/`agent`, refuse toujours un kind inconnu en 23514).

| Commande | Résultat |
|---|---|
| `prisma migrate deploy` sur base neuve `vululu_dsh02b_test` (3193) | **42 migrations**, toutes appliquées |
| `vitest run tests/db/migration-chain.test.ts` | **9 passed**, exit 0 |
| `prisma migrate deploy` sur la base QA `vululu` | migration appliquée, contrainte = 4 kinds |
| Appel direct `createTurn` (brainstorm, offline) | `TURN_OK` (avant : 23514) |

## 4. Playwright réel sur la pile QA

**Configuration dédiée `playwright.qa.config.ts`** : `baseURL` = `http://127.0.0.1:3190` (surcharge
`QA_WEB_URL` bornée à la pile locale sauf `QA_ALLOW_REMOTE=1`), **aucun `webServer`** — elle ne peut pas
démarrer un second serveur de développement.

**Parcours client réel** (`e2e/qa-customer-journey.spec.ts`, un seul test, compte QA `qa-demo@vululu.local`) :
connexion → création d'identité de marque (formulaire) → création de campagne → création de projet
(objectif/canal/format/identité/campagne) → import réel d'un visuel dans la bibliothèque →
sélection + **confirmation explicite** des ressources → brainstorming hors ligne (aucun fournisseur) →
génération de directions artistiques locales → **choix humain** (pointeur serveur) → édition Studio
(calque texte, aperçu serveur, nouvelle révision) → **rendu média local par le worker** →
revue + **approbation liée version+checksum** → **téléchargement de l'artefact** (PNG, SHA-256 comparé
au manifeste, taille comparée) → **persistance après rechargement** (approbation et pointeur) →
**déconnexion** (session fermée : `/api/auth/me` → 401).

| Commande | Résultat |
|---|---|
| `playwright test --config playwright.qa.config.ts e2e/qa-customer-journey.spec.ts --reporter=list` | **1 passed (49,8 s)**, exit 0 |

## 5. Spécifications V0 historiques — état et adaptation

Les quatre plus anciennes spécifications V0 échouaient sur la pile QA actuelle. Causes réelles :

| Spécification | Cause d'échec constatée | Adaptation (assertions conservées) |
|---|---|---|
| `e2e/v0.spec.ts` | `nav-catalog`, `catalog-page`, `format-Video`, `format-Affiche`, `project-platform`, `project-format` supprimés ; l'ancien catalogue annonçait « Affiche NON IMPLÉMENTÉ », désormais faux ; ordre du formulaire projet changé | Navigation par liens réels (Guide/Ressources/Mes projets), ordre de création courant (objectif → canal/format → identité → vérification), testids actuels. **Tout le cœur est conservé** : brief, storyboard, production vidéo MP4, QA, checksums, correction SCENE-002, comparaison v1/v2, approbation, transfert **MOCK**, persistance, déconnexion |
| `e2e/admin.spec.ts` | `browser.newContext({ baseURL: 'http://127.0.0.1:3100' })` codé en dur → `ERR_CONNECTION_REFUSED` sur la pile QA (3190) | Utilise le `baseURL` de la recette ; les 8 sections, l'invitation, l'activation et le refus RBAC restent testés. Compte `super_admin` QA créé par le bootstrap documenté `packages/db/prisma/seed.ts` (`V1_BOOTSTRAP_EMAIL/PASSWORD` fournis hors dépôt, base QA jetable) |
| `e2e/brief-profile.spec.ts` | `brief-confirm` désactivé : le plan n'est pas prêt car un plafond MOCK de 0 est refusé (`budget_exceeded`) — règle produit réelle | Plafond 5 centimes (couvre le coût du modèle simulé) et texte d'estimation dérivé du calcul serveur (`/production-plan`), plus de valeur figée |
| `e2e/demo-mode.spec.ts` | Bannière « MODE DÉMO » présente (pile QA en `DEMO_MODE=1`) alors que le runner n'avait pas la variable | Aucune modification : exécution avec `DEMO_MODE=1` (état réel de la pile). Le test vérifie champs vides, focus clavier, responsive |

| Commande | Résultat |
|---|---|
| `playwright test --config playwright.qa.config.ts e2e/demo-mode.spec.ts e2e/brief-profile.spec.ts e2e/admin.spec.ts e2e/v0.spec.ts --reporter=line` | **5 passed (4,1 min)**, exit 0 |

## 6. Qualification S3 locale — NOT_RUN

| Tentative | Résultat |
|---|---|
| `docker run minio/minio:latest` (volume isolé, port 127.0.0.1:3194) | **FAIL environnemental** : `pull access denied for minio/minio, repository does not exist or may require docker login` (registre inaccessible) |
| `rclone` (recette `scripts/preprod/start-s3.ps1`) | `rclone` absent du PATH et aucun binaire local |
| Tests `E_S3_TEST=1` (`tests/v1/v1-01-e-storage.test.ts`) | **NOT_RUN** : aucun backend S3 local disponible ; les 2 tests restent ignorés |

Aucun compte S3 externe, aucun volume existant n'a été touché. Le stockage local (défaut Compose) reste
vérifié par la suite storage du dépôt (hors périmètre de ce run).

## 7. Contrôles complémentaires

| Commande | Résultat |
|---|---|
| `pnpm typecheck` (7 projets) | exit 0 |
| `pnpm exec eslint e2e/qa-customer-journey.spec.ts e2e/admin.spec.ts e2e/brief-profile.spec.ts e2e/v0.spec.ts playwright.qa.config.ts tests/db/migration-chain.test.ts` | exit 0 |
| `tsc --noEmit --strict` sur les 4 specs E2E | exit 0 |
| `pwsh -NoProfile -File scripts/check-secrets.ps1` | `SECRET_SCAN_PASS`, exit 0, **930 fichiers** scannés |

## 8. Limites et défauts restants

1. **S3 local non qualifié** (§6) : upload/lecture/checksum/métadonnées/reprise S3 restent `NOT_RUN`.
2. **Parcours Affiche (PNG) en navigateur** : le parcours DSH-02B couvre l'image carrée ; le master
   **MP4** et le transfert **MOCK** sont couverts par `e2e/v0.spec.ts` (production vidéo réelle sur la
   même pile QA), pas par le parcours client (qui reste sur un format image pour rester court).
3. **Plafond MOCK 0** : refusé par la politique actuelle (`budget_exceeded`) ; c'est un comportement
   produit assumé, les specs ont été alignées.
4. **CI GitHub** : toujours `NOT_RUN` (aucune exécution runner).
5. **Docker Desktop** a redémarré en début de session (moteur arrêté) ; la pile `vululu-qa` s'est
   rétablie seule (`restart: unless-stopped`), aucune ressource Lumira touchée.

## 9. Rollback

`git revert <sha>` : rétablit tests et specs précédents. La migration `20261122180000` ne détruit rien
(élargissement de contrainte) : la laisser appliquée reste sûr ; la retirer exigerait une migration
contraire dédiée. La base `vululu_dsh02b_test` est jetable et a été créée uniquement pour la preuve.

## 10. Reproduction

```powershell
# Python
cd services/python-tools; python -m pytest -q

# Secrets
pwsh -NoProfile -File scripts/check-secrets.ps1

# Chaîne de migrations (base jetable locale)
docker exec vululu-qa-db-1 psql -U vululu -d vululu -c "CREATE DATABASE vululu_dsh02b_test"
$env:DATABASE_URL="postgresql://vululu:<mdp>@127.0.0.1:3193/vululu_dsh02b_test?schema=public"
pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
pnpm exec vitest run tests/db/migration-chain.test.ts

# Parcours navigateur (pile QA déjà démarrée, aucun serveur relancé)
$env:DEMO_EMAIL="<compte QA>"; $env:DEMO_PASSWORD="<mdp QA>"
pnpm exec playwright test --config playwright.qa.config.ts e2e/qa-customer-journey.spec.ts --reporter=list
```
