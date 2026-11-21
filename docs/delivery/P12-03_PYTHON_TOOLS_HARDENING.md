# P12-03 — Durcissement du service python-tools

**Lot :** P12-03 · **Branche :** `campaign/vululu-completion` · **Base :** `35f968b`.
**Date :** 2026-11-21. **Statut :** code compilé et **16 tests pytest + smoke 25 contrôles exécutés verts**, plus une
vérification HTTP réelle (uvicorn) du corps chunked. **Docker : NON EXÉCUTÉ** (démon injoignable, §6). Aucun appel
fournisseur, aucune publication, aucun déploiement.

Décision : [ADR-0048](../adr/0048-isolation-python-tools.md).

---

## 1. Constat d'audit (avant correction, HEAD `35f968b`)

| # | Défaut | Emplacement | Effet |
|---|---|---|---|
| 1 | `asyncio.wait_for` autour de `run_in_executor` | `app/main.py:44` | un GrabCut qui dépasse le délai continue dans son thread : CPU/mémoire hors contrôle, aucune annulation |
| 2 | Admission non corrélée au pool | `_slots` + `ThreadPoolExecutor` | les requêtes expirées libèrent leur créneau pendant que les threads zombies travaillent → empilement non borné |
| 3 | Limite de corps sur `Content-Length` seul | `app/main.py:61-65` | un corps `chunked` sans en-tête est intégralement tamponné avant contrôle |
| 4 | Dimensions vérifiées après `image.load()` | `app/imaging.py:53-68` | bombe de décompression : allocation de plusieurs centaines de Mo avant refus |
| 5 | Base64 décodé avant contrôle de taille | `imaging.decode_source` / `audio.decode_source` | allocation liée à la longueur encodée, pas à la limite métier |
| 6 | Aucune borne de sortie | `_png_bytes` | un PNG très volumineux pouvait être renvoyé (base64 + réponse non bornés) |
| 7 | Comparaison de jeton sur `str` | `app/auth.py:17` | un en-tête non ASCII lève `TypeError` → 500 au lieu d'un 401 |
| 8 | `/readyz` = versions de paquets | `app/registry.py:63` | se déclare prêt même si le traitement natif est indisponible |
| 9 | `HEALTHCHECK` sur `/healthz` | Dockerfile, compose | la vivacité était confondue avec la disponibilité |
| 10 | Un seul réseau bridge avec sortie Internet | `infra/coolify/docker-compose.yml:323` | `python-tools` joignait Internet et était joignable par `web`, `db`, `s3` |

## 2. Corrections

1. **Corps borné sans `Content-Length`** : `app/limits.py` (middleware ASGI pur) compte les octets réels,
   refuse `413` dès dépassement, sans jamais tamponner au-delà de la limite, puis rejoue le corps déjà lu.
   La limite est dérivée de `PYTHON_TOOLS_MAX_SOURCE_BYTES`.
2. **Bornes de décodage** : longueur base64 contrôlée **avant** `b64decode` ; dimensions/format/pixels lus
   dans l'en-tête **avant** `image.load()` et `Image.MAX_IMAGE_PIXELS` aligné (bombe de décompression →
   `422 image_pixels_exceeded`, jamais une allocation géante) ; sorties PNG bornées
   (`PYTHON_TOOLS_MAX_OUTPUT_BYTES`, `413`) ; échantillons audio bornés avant `readframes`.
3. **Annulation process-level** : `app/worker.py` (exécution), `app/pool.py` (pool borné), `app/ipc.py`
   (cadre longueur+JSON sur socket loopback avec nonce à usage unique). Au-delà du délai, le processus
   est tué puis remplacé ; `504 processing_timeout`.
4. **Anti-épuisement** : plus aucun thread de traitement ; `size` processus au plus, `max(2, size×4)`
   requêtes en vol, surplus → `503 overloaded` ; `OMP/OPENBLAS/MKL/NUMEXPR_NUM_THREADS=1`, `pids_limit: 64`.
5. **Réseau privé** : réseau Compose `python` en `internal: true` (aucune passerelle). `python-tools` n'y est
   que seul avec `api` et `worker` ; `db`, `web`, `migrate` restent sur `internal` seul ; `api`/`worker`
   gardent `internal` (sortant Vertex/Postiz/Stripe/S3/Hatchet) + `python` (privé). Aucun port publié.
6. **Disponibilité réelle** : `/readyz` = pool complet et vivant **et** auto-test natif OpenCV/NumPy/Pillow ;
   sinon `503`, avec `workers`, `selfTest` et `limits`. `HEALTHCHECK` Docker et compose → `/readyz`.
7. **Jeton** : comparaison en octets à temps constant, en-tête borné à 512 caractères, `401` structuré pour
   schéma invalide, jeton vide, non ASCII ou surdimensionné.
8. **Readiness après arrêt** : le pool remet `running=false` et tue ses enfants ; un enfant orphelin sort seul
   à la fermeture de la socket (EOF).

## 3. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `python -m pytest tests -q` (venv 3.12.4, service) | 0 | **16 passed**, 22 s | PASS |
| `python scripts/smoke.py` | 0 | `SMOKE_RESULT=PASS checks=25 failures=0` (analyse, détourage, audio réels) | PASS |
| uvicorn réel (`python -m app`, port 8096, limite source 1 Kio) + sonde HTTP | 0 | `/healthz` 200, `/readyz` 200 (pool 1/1), sans jeton 401, analyse réelle 200 | PASS |
| idem, POST `chunked` **sans Content-Length** (256 Kio) | — | `413 payload_too_large` | PASS |
| idem, POST 64 Kio avec Content-Length | — | `413` | PASS |
| arrêt du serveur puis reconnexion au port 8096 | — | port fermé, aucun enfant rémanent | PASS |
| `docker compose config` (plugin v5.5.1, profils worker+durable) | 0 | `python-tools` → `[python]` ; `api`/`worker` → `[internal, python]` ; `db`/`web`/`migrate` → `[internal]` ; `python: internal: true` | PASS |
| `docker info` | 1 | `failed to connect to the docker API at npipe:...` | NOT_RUN (env.) |

Tests couverts : jeton absent / invalide / non ASCII, corps déclaré trop gros, corps **chunked sans
Content-Length** (preuve ASGI que seuls 3 morceaux sur 10 sont lus), base64 décodé trop gros, bombe de
décompression (6000×6000 annoncés, refus avant décodage), image malformée, sortie PNG bornée, chaîne image+audio
réelle, **timeout** (processus tué, pool remplacé, requête suivante servie), **concurrence** (6 tâches sur 2
processus, au plus 2 PID), **surcharge** (503 plutôt qu'empilement), **démarrage et arrêt** (readiness 200 puis
aucun processus orphelin), **readiness 503** quand le pool est arrêté (vivacité toujours 200).

## 4. Fichiers

- Service : `app/config.py` (bornes + `max_body_bytes`), **`app/limits.py`** (nouveau), `app/ipc.py` (nouveau),
  **`app/pool.py`** (nouveau), **`app/worker.py`** (nouveau), `app/main.py` (réécrit), `app/auth.py`,
  `app/imaging.py`, `app/audio.py`, `app/__main__.py` inchangé, `scripts/smoke.py`, `pyproject.toml`
  (`testpaths`), `Dockerfile`, `.env.example`, `README.md`, **`tests/`** (nouveau : 16 cas + cibles de test).
- Infra : `infra/coolify/docker-compose.yml` (réseau `python` privé, rattachements, limites, healthcheck).
- Docs : ADR-0048, ce rapport, index ADR, `.gitignore` (`pytest-cache-files-*`).

## 5. Invariants respectés

Routes de capacité authentifiées inchangées (mêmes chemins, mêmes contrats) ; aucun code arbitraire, aucune URL,
aucun outil shell, aucune nouvelle orchestration, aucun téléchargement de modèle ; registre fermé ; sorties
toujours vérifiées par SHA-256 et bornées ; conteneur non-root (10001), rootfs en lecture seule, `no-new-privileges`,
capacités supprimées.

## 6. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| `docker build services/python-tools` | démon Docker absent : `npipe:////./pipe/dockerDesktopLinuxEngine` introuvable | NOT_RUN |
| `docker run` / `docker compose up` (isolation réseau réelle, read-only, UID) | idem | NOT_RUN |
| Validation de l'image en production (healthcheck container, mémoire sous charge réelle) | idem | NOT_RUN |

**Limites assumées :** la latence de remplacement d'un processus après timeout (≈ 1 s, réimport NumPy/OpenCV)
n'est pas mesurée sous charge ; `mem_limit: 1g` est une provision (2 enfants + parent), non éprouvée par un
test de charge ; l'IPC loopback ouvre un port éphémère strictement local (nonce obligatoire, jamais publié) ;
le `docker compose config` prouve la topologie déclarée, pas son application par un moteur Docker.

## 7. Rollback

`git revert <sha>` : retour à `35f968b`. Aucune migration, aucune donnée touchée ; le service revient au pool
de threads et au réseau partagé.
