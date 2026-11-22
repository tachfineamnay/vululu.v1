# vululu-python-tools

Boîte à outils Python **interne** de Vululu (capacités locales de vision et d'audio). Elle n'orchestre rien :
le worker TypeScript reste seul décideur, l'agent ne fait que recommander.

## Capacités (registre explicite, versionné)

| Capacité | Action | Effet | Moteur | Sorties |
|---|---|---|---|---|
| `image.analyze@1` | READ | lecture seule | Pillow + NumPy + OpenCV | analyse JSON (dimensions, exposition, contraste, netteté, entropie, couleurs dominantes, pHash) |
| `image.segment@1` | GENERATE | dérive de nouvelles versions d'assets | OpenCV GrabCut | `cutout` (PNG transparent), `mask` (masque alpha PNG) |
| `audio.analyze@1` | READ | lecture seule | module `wave` + NumPy | analyse JSON (durée, fréquence, canaux, largeur, crête/RMS dBFS, écrêtage, silences) |

Aucun modèle n'est activé : le détourage est un algorithme **classique local** (GrabCut), sans
téléchargement ni dépendance à un fournisseur. **Ce n'est pas une segmentation apprise** : le registre
expose `learned: false` et `modelUsed: null` pour les trois capacités.

`app/models.py` **détecte** un fichier facultatif présent dans `/models` (monté en lecture seule) et le
déclare honnêtement : `present`, `active: false`, `loaded: false`, `usedBy: []`, `sha256Pinned`,
`verified` (vrai **seulement** si une empreinte attendue est épinglée et correspond), `download: "forbidden"`.
Un modèle présent ne rend jamais le service « prêt » et n'est jamais présenté comme actif.

## Sécurité (état P12-03)

- **Réseau privé** : `python-tools` n'est attaché qu'au réseau Compose `python` déclaré `internal: true`
  (aucune passerelle, donc aucun accès Internet) ; ni `db`, ni `web`, ni `s3` n'y sont attachés.
  L'API et le worker sont sur `internal` (sortant vers Vertex/Postiz) **et** sur `python`. Aucun port
  publié : `expose: 8090` seulement.
- **Jeton partagé** `PYTHON_TOOLS_TOKEN` (≥ 24 caractères) obligatoire ; comparaison à temps constant sur
  octets, `401` structuré même pour un en-tête non ASCII ou surdimensionné.
- **Corps borné avant tout tamponnage** : un middleware ASGI compte les octets réellement reçus et refuse
  au-delà de la limite — y compris en `Transfer-Encoding: chunked` sans `Content-Length`.
- **Traitement natif isolé** : chaque appel s'exécute dans un processus enfant dédié, jamais dans un thread
  du serveur. Un dépassement de délai **tue** le processus (annulation réellement applicable à OpenCV),
  puis le remplace ; le pool est borné (processus et requêtes en vol), le surplus est refusé en `503 overloaded`.
- **Bornes mémoire** : source base64 vérifiée en longueur avant décodage, pixels et dimensions contrôlés sur
  l'en-tête **avant** `image.load()` (bombes de décompression), sorties PNG bornées, échantillons audio bornés
  avant `readframes`.
- Aucune URL, aucun chemin de fichier, aucun SQL, aucune exécution de code dans les contrats.
- Aucun client HTTP sortant : les dépendances runtime n'incluent ni `requests` ni `httpx` (dev : `httpx` pour les tests).
- Conteneur non-root (UID 10001), rootfs en lecture seule, `/tmp` en tmpfs, `no-new-privileges`, capacités
  Linux supprimées, `pids_limit` et mémoire plafonnés, threads natifs limités à 1 par bibliothèque.
- Les octets source sont vérifiés par SHA-256 avant traitement ; chaque sortie est renvoyée avec son SHA-256
  et vérifiée par le worker avant stockage.

## Contrats

- `POST /v1/tools/image.analyze@1` : `{ requestId, source: { assetVersionId, sha256, mimeType, imageBase64 } }`.
- `POST /v1/tools/image.segment@1` : idem + `outputs?: ["cutout","mask"]`, `maxDimension?: 256..4096`.
- `POST /v1/tools/audio.analyze@1` : `{ requestId, source: { assetVersionId, sha256, mimeType: "audio/wav", audioBase64 } }`.
- Réponses : `{ requestId, capability, capabilityVersion, version, durationMs, data, source }`.
- Erreurs : `{ error: { code, message, requestId, retryable } }` (codes stables : `unauthorized`,
  `invalid_request`, `payload_too_large`, `source_checksum_mismatch`, `segmentation_empty`,
  `processing_timeout`, `overloaded`, `worker_unavailable`, `internal_error`...).
- Santé : `GET /healthz` = vivacité (sans jeton) ; `GET /readyz` = disponibilité **réelle** (pool de
  processus vivant + auto-test natif OpenCV/NumPy/Pillow), `503` sinon ; `GET /v1/capabilities` (jeton requis).

## Développement local

```bash
cd services/python-tools
uv lock
uv sync
PYTHON_TOOLS_TOKEN="CHANGE_ME_LOCAL_DEV_ONLY_32_CHARS" \
  PYTHON_TOOLS_LOG_LEVEL=info uv run python -m app
curl -s http://127.0.0.1:8090/readyz
```

Tests (34 cas : limites, auth, pool de processus, disponibilité, arrêt propre, formats réels,
ratios extrêmes, corruptions, empreintes, qualité du détourage, honnêteté des modèles, parité de
contrats Python/TypeScript/ToolBroker — aucun réseau, aucun binaire commité) :
```bash
uv run python -m pytest tests -q
```

Le contrat côté TypeScript est vérifié par `tests/v1/python-client-contract.test.ts` (serveur HTTP local,
aucune base) et par `tests/test_capability_quality.py` qui relit `adapter.ts`, `client.ts` et
`registry.ts` pour comparer champs, bornes et ordre des garde-fous avec les modèles Pydantic.

Smoke local (analyse, détourage et analyse audio réels sur des médias générés, sans réseau) :
```bash
uv run python scripts/smoke.py   # génère son propre jeton éphémère
```

## Intégration

- Worker TypeScript : `apps/api/src/infrastructure/python/{client,adapter}.ts`.
- Registre agent : `image.analyze@1` (READ, automatique) et `image.segment@1` (GENERATE, approbation humaine) — `apps/api/src/infrastructure/execution/registry.ts`.
- Les sorties sont stockées via `AssetUseCases.upload` : mêmes versions immuables, inspection, droits et checksums que les imports clients.
- Coolify : service `python-tools` dans `infra/coolify/docker-compose.yml`, réseau privé `python`, jamais exposé publiquement.

## Variables

| Variable | Rôle | Défaut |
|---|---|---|
| `PYTHON_TOOLS_TOKEN` | Jeton interne partagé (obligatoire) | — |
| `PORT` | Port d'écoute interne | `8090` |
| `PYTHON_TOOLS_MAX_SOURCE_BYTES` | Taille source maximale | `16777216` |
| `PYTHON_TOOLS_MAX_PIXELS` | Pixels maximaux (contrôlés avant décodage) | `24000000` |
| `PYTHON_TOOLS_MAX_DIMENSION` | Dimension maximale | `4096` |
| `PYTHON_TOOLS_MAX_OUTPUT_BYTES` | Taille maximale d'une sortie PNG | `8388608` |
| `PYTHON_TOOLS_MAX_AUDIO_SAMPLES` | Échantillons audio maximaux (avant lecture PCM) | `16000000` |
| `PYTHON_TOOLS_TIMEOUT_SECONDS` | Délai de traitement (au-delà : processus tué) | `25` |
| `PYTHON_TOOLS_MAX_CONCURRENCY` | Processus de traitement simultanés | `2` |
| `PYTHON_TOOLS_WORKER_START_SECONDS` | Délai de démarrage d'un processus | `20` |
| `PYTHON_TOOLS_MODELS_DIR` | Modèles facultatifs (lecture seule) | `/models` |

La borne du corps HTTP est dérivée automatiquement de `PYTHON_TOOLS_MAX_SOURCE_BYTES` (base64 + enveloppe JSON).

## Limites connues

- **Docker non exécuté dans cette session** : le démon Docker n'est pas joignable (voir le rapport P12-03) ;
  le `Dockerfile` et le `docker-compose.yml` sont validés par `docker compose config`, pas par un build réel.
- Le détourage GrabCut est local et déterministe ; il ne remplace pas un modèle de segmentation avancé.
- `audio.analyze@1` est local et déterministe (module `wave` + NumPy), WAV PCM uniquement.
- `/readyz` atteste le pool et la chaîne native ; il ne prouve pas la qualité d'une image fournie.
