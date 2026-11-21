# vululu-python-tools

Boîte à outils Python **interne** de Vululu (capacités locales de vision et d'audio). Elle n'orchestre rien :
le worker TypeScript reste seul décideur, l'agent ne fait que recommander.

## Capacités (registre explicite, versionné)

| Capacité | Action | Effet | Moteur | Sorties |
|---|---|---|---|---|
| `image.analyze@1` | READ | lecture seule | Pillow + NumPy + OpenCV | analyse JSON (dimensions, exposition, contraste, netteté, entropie, couleurs dominantes, pHash) |
| `image.segment@1` | GENERATE | dérive de nouvelles versions d'assets | OpenCV GrabCut | `cutout` (PNG transparent), `mask` (masque alpha PNG) |
| `audio.analyze@1` | READ | lecture seule | module `wave` + NumPy | analyse JSON (durée, fréquence, canaux, largeur, crête/RMS dBFS, écrêtage, silences) |

Aucun modèle n'est activé en P06 : le détourage est un algorithme local déterministe (GrabCut),
sans téléchargement ni dépendance à un fournisseur. `app/models.py` détecte un modèle facultatif
présent dans `/models` (monté en lecture seule) ; `download: "forbidden"` est explicite.

Le checkpoint P09B ajoute l'analyse audio locale `audio.analyze@1` (module standard `wave` + NumPy) :
WAV/PCM uniquement, aucun modèle audio, aucun téléchargement.

## Sécurité

- Aucun port publié : `expose: 8090` seulement, réseau Compose interne.
- Jeton partagé `PYTHON_TOOLS_TOKEN` (≥ 24 caractères) obligatoire ; comparaison à temps constant.
- Aucune URL, aucun chemin de fichier, aucun SQL, aucune exécution de code dans les contrats.
- Aucun client HTTP sortant : les dépendances runtime n'incluent ni `requests` ni `httpx` (dev : `httpx` pour de futurs tests).
- Limites : source ≤ 16 Mio, ≤ 24 Mpx, dimensions ≤ 4096, délai 25 s, concurrence 2, corps JSON borné. Audio : WAV/PCM, 1–2 canaux, 8–96 kHz, 1–4 octets par échantillon, durée ≤ 300 s.
- Conteneur non-root (UID 10001), rootfs en lecture seule, `/tmp` en tmpfs, `no-new-privileges`, capacités Linux supprimées.
- Les octets source sont vérifiés par SHA-256 avant traitement ; chaque sortie est renvoyée avec son SHA-256 et vérifiée par le worker avant stockage.

## Contrats

- `POST /v1/tools/image.analyze@1` : `{ requestId, source: { assetVersionId, sha256, mimeType, imageBase64 } }`.
- `POST /v1/tools/image.segment@1` : idem + `outputs?: ["cutout","mask"]`, `maxDimension?: 256..4096`.
- `POST /v1/tools/audio.analyze@1` : `{ requestId, source: { assetVersionId, sha256, mimeType: "audio/wav", audioBase64 } }`.
- Réponses : `{ requestId, capability, capabilityVersion, version, durationMs, data, source }`.
- Erreurs : `{ error: { code, message, requestId, retryable } }` (codes stables : `unauthorized`, `invalid_request`, `payload_too_large`, `source_checksum_mismatch`, `segmentation_empty`, `processing_timeout`...).
- Santé : `GET /healthz` (sans jeton), `GET /readyz` (dépendances + modèles), `GET /v1/capabilities` (jeton requis).

## Développement local

```bash
cd services/python-tools
uv lock
uv sync
PYTHON_TOOLS_TOKEN="CHANGE_ME_LOCAL_DEV_ONLY_32_CHARS" \
  PYTHON_TOOLS_LOG_LEVEL=info uv run python -m app
curl -s http://127.0.0.1:8090/healthz
```

Smoke local (vérifie analyse, détourage et analyse audio réels sur des médias générés, sans réseau) :
```bash
uv run python scripts/smoke.py   # génère son propre jeton éphémère
```

## Intégration

- Worker TypeScript : `apps/api/src/infrastructure/python/{client,adapter}.ts`.
- Registre agent : `image.analyze@1` (READ, automatique) et `image.segment@1` (GENERATE, approbation humaine) — `apps/api/src/infrastructure/execution/registry.ts`.
- Les sorties sont stockées via `AssetUseCases.upload` : mêmes versions immuables, inspection, droits et checksums que les imports clients.
- Coolify : service `python-tools` dans `infra/coolify/docker-compose.yml`, jamais exposé publiquement.

## Variables

| Variable | Rôle | Défaut |
|---|---|---|
| `PYTHON_TOOLS_TOKEN` | Jeton interne partagé (obligatoire) | — |
| `PORT` | Port d'écoute interne | `8090` |
| `PYTHON_TOOLS_MAX_SOURCE_BYTES` | Taille source maximale | `16777216` |
| `PYTHON_TOOLS_MAX_PIXELS` | Pixels maximaux | `24000000` |
| `PYTHON_TOOLS_MAX_DIMENSION` | Dimension maximale | `4096` |
| `PYTHON_TOOLS_TIMEOUT_SECONDS` | Délai de traitement | `25` |
| `PYTHON_TOOLS_MAX_CONCURRENCY` | Traitements simultanés | `2` |
| `PYTHON_TOOLS_MODELS_DIR` | Modèles facultatifs (lecture seule) | `/models` |

## Limites P06

- Aucune exécution Docker/Compose vérifiée dans cette session (`NOT_RUN`) ; le smoke local ne certifie pas l'image.
- Le détourage GrabCut est local et déterministe ; il ne remplace pas un modèle de segmentation avancé (P07+).
- P09B : `audio.analyze@1` est local et déterministe (module `wave` + NumPy), WAV PCM uniquement (format 0x0001 et sous-type PCM du format étendu 0xFFFE, accepté par Python 3.12) ; aucun modèle audio, aucun téléchargement. Le smoke audio n'a pas été exécuté dans cette phase (`NOT_RUN`).
- Pas de tests complets (P12).
