# DSH-03 — Vérification du Studio fusionné (PR #29)

**Branche :** `integration/vululu-release-20261121` · **Cible distante :** `9fd146a` (PR #29 fusionnée).
**Pile :** projet Compose `vululu-qa` (web **3190**, API **3191**, PostgreSQL 17 **3193**, worker Hatchet,
python-tools). **Garde-fous :** `VULULU_BETA_MODE=1`, 42 migrations, aucun fournisseur payant, aucune
publication, aucun push, aucun merge vers `main`, aucun déploiement.

---

## 1. Git : récupération et avance rapide

| Contrôle | Résultat |
|---|---|
| Branche | `integration/vululu-release-20261121` |
| HEAD de départ | `46f8c1f` (arbre propre, 0 fichier modifié) |
| `git fetch origin --prune` | succès (aucune substitution de ref) |
| Distance avant | `HEAD...9fd146a` = **0 ahead / 8 behind**, `merge-base --is-ancestor` = 0 |
| Avance rapide | `git merge --ff-only 9fd146a` → **HEAD = `9fd146a`**, arbre propre |
| Migrations | **42** avant et après (PR #29 n'ajoute aucune migration) |

Commits intégrés : PR #28 (`ebb1d56`, correctifs de sécurité) et PR #29 (`9fd146a`, Studio + correctifs P09).

## 2. Inspection des diffs

**PR #28 — correctifs de sécurité présents et vérifiés dans le code :**
`localProductionExecutor.guardQa` + `qaPassedOrThrow` (une QA non PASS ne finalise jamais),
`mediaGeneration.windowSeconds: 60` (plus de fenêtre de 16 h 40), validation calendaire pure dans
`packages/domain/src/timestamp.ts` (30 février refusé), `cookieSecure()` au logout, champs système du
logger écrits en dernier, classification éditoriale unifiée, sonde `probe` media stricte,
`appendBounded` linéaire, fusion du manifeste de migration d'artefacts.

**PR #29 — 34 fichiers, 10 défauts Studio corrigés** (ordre de peinture des calques, spec réduite
d'aperçu sans audio, `clampLayer` borné au millième, sous-titres non vides et bornés, audio/sous-titres
ramenés dans la durée, preset de canal sans audio pour une image, outils avancés bornés, forme d'onde
limitée à 12 Mio, `pointercancel`, annotation de livraison). Tests ajoutés : `studio-editor`,
`studio-canvas-order`, `local-executor-qa-gate`, `audit-regressions`, `domain/timestamp`.

## 3. Gates statiques et tests unitaires

| Commande | Résultat |
|---|---|
| `pnpm db:generate` | exit 0 (client Prisma 6.19.3 généré) |
| `pnpm typecheck` (7 projets) | exit 0 |
| `LINT_STRICT=1 pnpm lint` | exit 0 **après correctif** (2 erreurs `no-useless-assignment` corrigées, cf. §6) |
| `vitest run tests/studio-editor.test.ts tests/studio-canvas-order.test.tsx tests/studio-draft.test.ts` | **23 passed** (3 fichiers), exit 0 |
| `vitest run` global (base neuve `vululu_dsh03_test`, 42 migrations) | **voir §7** |

## 4. Reconstruction Docker et préservation

| Élément | Résultat |
|---|---|
| Images reconstruites | `vululu-api:qa` et `vululu-web:qa` depuis `9fd146a` |
| Services recréés | `api`, `web`, `worker` (`up -d --no-deps`) |
| Préservés | `db` (PostgreSQL + volumes), `hatchet`, `hatchet-pg`, `python-tools` — aucun `down`, aucun volume supprimé |
| Ressources Lumira | conteneurs `lumira-*` non touchés |
| Incidents | registre npm intermittent (ECONNRESET) pendant les builds ; builds relancés avec succès (api 525 s, web 629 s) ; Docker Desktop partagé avec un autre projet (`qeynox-*`), non modifié |

**Disponibilité après reconstruction :**

| Sonde | Résultat |
|---|---|
| `GET http://127.0.0.1:3191/api/health` | 200 `{"status":"ok","service":"vululu-api","version":"v1","beta":true}` |
| `GET http://127.0.0.1:3191/api/ready` | 200 `{"status":"ready"}` |
| `GET http://127.0.0.1:3190/login` | 200 (Next rendu) |
| `GET http://127.0.0.1:3190/api/health` (proxy) | 200, même charge utile |
| python-tools `/readyz` | `ready`, pool 2 workers |
| worker | vivant, étapes Hatchet `render-scenes → assemble-master → qa → finalize → approval → transfer` observées |

## 5. Playwright réel contre `http://127.0.0.1:3190`

Configuration `playwright.qa.config.ts` (aucun `webServer`, base QA 3190), compte QA isolé.

**Studio (`e2e/qa-studio-editor.spec.ts`, nouveau)** : ordre de peinture des calques (le calque cliqué
est bien le dernier peint), ajout de calque texte non vide et sélectionné, inspecteur (texte, corps, X/Y),
timeline (durée 2,5 s, total 3,5 s, ajout puis retrait de scène), sous-titres (repère non vide, bornes,
retrait annoncé hors durée, réactivation), piste audio réelle importée (WAV) et volume, aperçu de scène
serveur **200** malgré un sous-titre plus long que la scène (correctif P09 n°2), enregistrement de
révision valide, rendu vidéo par le worker, approbation exacte, exports **PNG** (signature vérifiée),
**MP4** (`ftyp`), **SRT** (texte + plage horaire) et **M4A**, persistance après rechargement.

| Commande | Résultat |
|---|---|
| `playwright test --config playwright.qa.config.ts e2e/qa-studio-editor.spec.ts` | **1 passed (3,1 min)** |
| `playwright test … e2e/qa-customer-journey.spec.ts` | **1 passed (2,1 min)** — identité, campagne, ressources confirmées, brainstorming, directions, Studio, rendu, approbation, checksum, téléchargement, persistance, déconnexion |
| `playwright test … e2e/v0.spec.ts` | **1 passed (2,0 min)** — production MP4 déterministe, QA PASS, correction SCENE-002, comparaison v1/v2, approbation, transfert **MOCK**, reprise |

## 6. Correctifs de code livrés

1. **Lint strict rouge sur deux fichiers** (détecté par `LINT_STRICT=1`) :
   `apps/api/src/infrastructure/python/client.ts:49` et `apps/api/src/routes/ops.ts:173` —
   `let x: unknown = null` suivi d'une affectation dans `try` **et** `catch` : l'initiale n'est jamais lue
   (`no-useless-assignment`). Les déclarations sont désormais sans initiale, les deux branches affectant
   avant usage (aucun changement de comportement). Gate strict de nouveau vert.
2. **Portabilité des tests vers la base QA isolée** (défaut de test, pas de produit) : **16 fichiers**
   forçaient `DATABASE_URL`/`DATABASE_URL_TEST` vers `127.0.0.1:55432` même quand une base de test était
   fournie, d'où des échecs purement environnementaux : `tests/api.test.ts` et
   `tests/v1/{assets,auth-security,admin-bootstrap,admin-read,campaigns,context-review,conversation-demo,
   demo-bootstrap,frozen-routing,http-error-status,infrastructure,invocation-failures,provider-credentials,
   v1-01-application,v1-01-f-hardening}.test.ts`. Trois tests qui créent leur propre base jetable dérivent
   désormais hôte/port/identifiants de la base fournie au lieu du 55432 codé en dur :
   `tests/v1/campaign-migration.test.ts`, `tests/v1/production-plan.test.ts` et
   `tests/v1/recette-password-reset.test.ts`. Preuve : 10 fichiers / **109 tests**, puis 7 tests de
   migration et la chaîne `production-plan` passent sur la QA (PostgreSQL 17, 42 migrations).
3. **Deux fixtures obsolètes** : `tests/v1/python-client-contract.test.ts` comparait le jeton reçu au
   `process.env` mutable (le refus 401 devenait impossible une fois le jeton changé par le test) — le
   jeton attendu est désormais figé dans le stub ; `tests/v1/agent-tool-execution.test.ts` utilisait
   `BrandAsset.name` (champ supprimé du schéma) et omettait `BrandAssetVersion.provenance` (obligatoire).
4. **Isolation de fixture** : `tests/asset-inspection.test.ts` réutilisait `.v1/asset-inspection` et
   échouait sur `EEXIST` (rendu immuable) ; la racine d'artefact est désormais unique par exécution.
5. **Adaptations E2E** (aucune règle produit affaiblie) : attente de fin de run durable avant correction
   (409 `job_running` réel), fenêtre de quota de rendu avant aperçu/rendu, reprise de l'aperçu via le
   bouton prévu par l'interface, délai d'import audio porté à 60 s, nouveau test `qa-studio-editor`.
   Détail : les aperçus automatiques de l'éditeur et les rendus partagent **10 opérations/minute/compte** ;
   un 429 transitoire `creative_busy` est possible quand plusieurs aperçus natifs partent ensemble.

## 7. Vitest complet

Base jetable neuve `vululu_dsh03b_test` (127.0.0.1:3193, 42 migrations, FFmpeg/FFprobe locaux),
exécution **après** les correctifs de portabilité :

| Résultat | Détail |
|---|---|
| `vitest run` | **87 fichiers passés / 10 échoués / 2 ignorés** ; **664 tests passés / 14 échoués / 15 ignorés** (693), 556 s |
| Avant correctifs (même base neuve) | 29 fichiers / 32 tests échoués — dont 10 fichiers purement environnementaux (base 55432 codée en dur) |
| Échecs environnementaux restants | `media-generation` ×2 (FFmpeg ne peut pas créer son fichier dans `%TEMP%` sous Windows : `Permission denied`), `media-p12-07-regressions` ×1 (option ffprobe non reconnue par le binaire local) |
| Dérive de tests préexistante (hors code PR #28/#29) | `agent-tool-execution` ×2, `beta-free-testing` ×1, `calendar-persistence` ×1, `creative-core` ×1, `creative-direction-selection` ×1 (`directions.decisions` n'existe plus dans le service), `multiformat` ×1, `project-assistant` ×3 et `results` ×1 (tests antérieurs à la porte `assets_required`) |

Aucun de ces 14 échecs ne touche un fichier modifié par les PR #28/#29 (vérifié par
`git diff --name-only 46f8c1f..9fd146a`), et aucun n'est introduit par les correctifs de ce run :
les fichiers de tests concernés n'ont pas été modifiés par ces deux PR.

## 8. Limites et défauts restants

1. **Aperçu Studio et 429 transitoires** : l'éditeur peut demander plusieurs aperçus natifs en parallèle ;
   au-delà de 2 rendus simultanés (ou 10/min/compte), l'interface affiche « Rendu en cours, réessayez » et
   l'utilisateur doit cliquer « Actualiser l'aperçu ». Contourné dans les tests (comportement prévu par
   l'UI), non corrigé côté produit — piste : dédupliquer les aperçus dans `useStudioPreview`.
2. **Correction après approbation** : tant que le run durable exécute ses étapes approbation/transfert,
   `POST /scenes/:key/correct` répond 409 `job_running`. Sérialisation voulue ; l'UI ne désactive pas le
   bouton pendant cette fenêtre. Contourné par attente dans le test, non corrigé côté produit.
3. **S3 réel** : non qualifié ici (aucun backend S3 local disponible) ; stockage local vérifié.
4. **CI GitHub** : toujours `NOT_RUN` (aucune exécution runner).
5. **Docker Desktop partagé** : builds dépendants du registre npm (ECONNRESET) et d'un autre projet
   (`qeynox-*`) ; aucune ressource de cet autre projet modifiée.

## 9. Rollback

`git revert <sha>` (correctifs lint + tests) ; les images QA peuvent être reconstruites depuis `46f8c1f`
si nécessaire. Aucune migration, aucun volume, aucune donnée de production modifiés.

## 10. Reproduction

```powershell
git fetch origin; git merge --ff-only 9fd146a
pnpm db:generate; pnpm typecheck; $env:LINT_STRICT='1'; pnpm lint
pnpm exec vitest run tests/studio-editor.test.ts tests/studio-canvas-order.test.tsx tests/studio-draft.test.ts

# Reconstruction QA (PostgreSQL/volumes préservés)
docker compose -p vululu-qa --env-file <qa.env> -f infra/coolify/docker-compose.yml -f <override-qa.yml> \
  --profile durable --profile worker up -d --no-deps api web worker

# Navigateur réel (pile déjà démarrée, aucun second serveur)
$env:DEMO_EMAIL="<compte QA>"; $env:DEMO_PASSWORD="<mdp QA>"
pnpm exec playwright test --config playwright.qa.config.ts \
  e2e/qa-studio-editor.spec.ts e2e/qa-customer-journey.spec.ts e2e/v0.spec.ts
```
