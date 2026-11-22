# DSH-02 — Runtime local complet (2026-11-22)

Exécution réelle de la pile Vululu sur Docker Desktop, branche
`integration/vululu-release-20261121`, HEAD de départ `3a70cc6`. Aucun fournisseur payant,
aucune publication, `VULULU_BETA_MODE=1`, aucun déploiement, `main` intacte.

## Topologie (projet Compose `vululu-qa`, images des Dockerfiles du dépôt)

| Service | Image | État | Accès |
|---|---|---|---|
| `db` | `postgres:17` | healthy | 127.0.0.1:**3193** (QA locale) |
| `migrate` | `vululu-api:qa` | exit **0** — **41 migrations** | one-shot, bloque l'API si échec |
| `api` | `vululu-api:qa` | healthy | 127.0.0.1:**3191** (`/api/health`, `/api/ready`) |
| `web` | `vululu-web:qa` | healthy | 127.0.0.1:**3190** (`/login` 200, proxy `/api`) |
| `python-tools` | `vululu-python-tools:qa` | healthy | réseau privé `python` (`/healthz`, `/readyz`) |
| `worker` | `vululu-api:qa` | running | profile `worker`, `ORCHESTRATOR_MODE=hatchet` |
| `hatchet` + `hatchet-pg` | `vululu-hatchet:qa` / `postgres:17` | healthy | handshake `/data/handshake.json` |

Aucune ressource Lumira touchée (conteneurs `lumira-*` arrêtés avant la mission, volumes
intacts). Le `.env` du dépôt pointe 55432 : toutes les commandes QA ont surchargé
`DATABASE_URL` vers la base jetable 3193.

## Preuves

| Contrôle | Résultat |
|---|---|
| `GET /api/health` | 200 `{"status":"ok","service":"vululu-api","version":"v1","beta":true}` |
| `GET /api/ready` | 200 `{"status":"ready"}` (transaction sur `billingControl`) |
| `GET http://127.0.0.1:3190/login` | 200, HTML Next rendu |
| `GET http://127.0.0.1:3190/api/health` | 200 (proxy web → API) |
| python `/healthz` / `/readyz` | 200 / 200 — selfTest ok (cv2 4.10.0, numpy 2.2.1, pillow 11.1.0), 2 workers |
| `tests/media.test.ts` (dans `vululu-api:qa`) | **PASS** — 5 PNG 1080×1920, MP4 **h264 + aac**, QA PASS, QA FAIL sur checksum altéré |
| `tests/v1/v1-01-e-storage.test.ts` | **6 passés**, 2 S3 ignorés (aucun backend S3 provisionné) |
| Worker — succès | `qa-render-1` queued → running → **succeeded**, progress 100, `CreativeRevision` scellée (1 frame) |
| Worker — échec | spec invalide → `failed`, reason « Rendu non terminé… », aucune boucle infinie |
| Worker — reprise | `qa-render-2` en `running` avec bail expiré → repris (**attempts 1 → 2**), succeeded, scellé |
| Artefact | fichier `creative/v1-demo-project/5d15…png` — `sha256sum` = manifeste, taille 37212 = `sizeBytes` |
| Python suite | `pytest` : **33 passés / 1 échec environnemental** (le test exige `cwd` à 2 niveaux pour écrire `data/` ; montage `/repo` en lecture seule) |

## Défauts réels corrigés

1. **`image.segment@1` ne pouvait jamais aboutir** (`services/python-tools/app/imaging.py`).
   La résolution de travail GrabCut suivait `maxDimension` (défaut API/contrat **2048**) alors que
   le pool coupe à **25 s** avec `cpus: 1` et `OMP_NUM_THREADS=1` : mesuré **91,5 s à 1024 px**
   (HTTP 504 systématique). La résolution de travail est désormais bornée à **448 px**
   (`_GRABCUT_WORK_DIMENSION`), le masque restant remonté à la taille source : sorties inchangées.
   Après correctif, `maxDimension=2048` répond **200 en 12,7 s** (masque 1200×900, couverture 0,156).
2. **Suites DB verrouillées sur 55432** (`tests/v1/v1-01-d-durable.test.ts`,
   `tests/v1/v1-01-e-storage.test.ts`). L'URL était forcée en dur, donc inutilisable sur une
   instance QA isolée (risque de viser la base d'un autre projet). Elles lisent maintenant
   `DATABASE_URL_TEST` **en conservant le garde-fou** (hôte local + suffixe `_test`).

## Limites (honnêtes)

- Le moteur Docker Desktop a **planté 3 fois pendant l'export d'images volumineuses**
  (`rpc error: … EOF`) ; chaque fois relancé, builds repris séquentiellement et réussis.
  C'est une instabilité de l'hôte, pas du dépôt.
- Backend **S3 non provisionné** ⇒ 2 tests S3 ignorés ; le stockage local (défaut Compose) est vérifié.
- **Aucun fournisseur payant** appelé ; `MEDIA_GENERATION_ENABLED=0`, `POSTIZ_PUBLISH_ENABLED=0`.
- CI GitHub toujours `NOT_RUN`.
- La pile reste **démarrée** pour inspection ; arrêt : `docker compose -p vululu-qa down`.

## Reproduction

```powershell
# override QA (hors dépôt) : ports 3190/3191/3193 + cookie non sécurisé en HTTP local
docker compose -p vululu-qa --env-file <env-qa> \
  -f infra/coolify/docker-compose.yml -f <override-qa.yml> \
  --profile durable --profile worker up -d api web python-tools worker
```

`docker-compose.qa.yml` utilisé (fichier temporaire, non commité) :

```yaml
services:
  db:  { ports: ["127.0.0.1:3193:5432"] }
  api: { ports: ["127.0.0.1:3191:3101"], environment: { SESSION_COOKIE_SECURE: "0" } }
  web: { ports: ["127.0.0.1:3190:3100"] }
```
