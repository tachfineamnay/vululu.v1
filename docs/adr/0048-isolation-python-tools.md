# ADR-0048 — Isolation process-level et réseau privé du service python-tools

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P12-03)
- **Sources** : ADR-0037 (boîte à outils Python interne), ADR-0012 (durcissement sécurité), `docs/delivery/P12-03_PYTHON_TOOLS_HARDENING.md`.

## Contexte

Le service `python-tools` exécutait les traitements natifs (OpenCV, NumPy, Pillow) dans un
`ThreadPoolExecutor`. Trois défauts en découlaient :

1. `asyncio.wait_for` n'annule pas un appel natif : au-delà du délai, le thread continuait de tourner
   (souvent plusieurs minutes sur un GrabCut), consommant CPU et mémoire hors de tout contrôle.
2. Le pool de threads et le sémaphore d'admission n'étaient pas corrélés : les requêtes expirées
   libéraient leur créneau pendant que les traitements zombies occupaient encore les threads, ce qui
   empilait des travaux sans borne réelle.
3. La limite de corps ne vérifiait que `Content-Length` : une requête `Transfer-Encoding: chunked`
   était intégralement tamponnée avant validation, et les dimensions d'image n'étaient contrôlées
   qu'après `image.load()` (bombe de décompression).

Sur le plan réseau, tous les services partageaient un unique réseau bridge avec accès sortant :
`python-tools` pouvait donc joindre Internet et était joignable par `web`, `db` et `s3`.

## Décision

1. **Un processus par traitement**, dans un pool borné (`PYTHON_TOOLS_MAX_CONCURRENCY`, 1–8). Aucun
   thread du serveur n'exécute de code natif.
2. **Annulation réelle** : au-delà de `PYTHON_TOOLS_TIMEOUT_SECONDS`, le processus enfant est tué
   (`terminate` puis `kill`) et remplacé immédiatement ; la requête reçoit `504 processing_timeout`
   (rétractable). Aucune tâche native ne survit à son délai.
3. **Admission bornée** : au plus `size` exécutions simultanées et `max(2, size×4)` requêtes en vol ;
   le surplus reçoit `503 overloaded` au lieu d'être empilé. `uvicorn limit_concurrency` reste aligné
   (`max(8, size×4)`).
4. **Transport IPC sans named pipe** : le parent écoute sur `127.0.0.1` (port éphémère), chaque enfant
   s'authentifie par un nonce à usage unique, messages bornés par un cadre longueur+JSON. Ce choix
   évite `multiprocessing.Pipe` (named pipes Windows) et tout partage de descripteur.
5. **Corps borné avant tamponnage** : middleware ASGI qui compte les octets réellement reçus, refuse
   `413` au-delà de la limite (dérivée de `PYTHON_TOOLS_MAX_SOURCE_BYTES`), y compris en chunked sans
   `Content-Length`, et rejoue le corps déjà lu à l'application.
6. **Bornes mémoire** : longueur base64 contrôlée avant décodage, format/dimensions/pixels lus dans
   l'en-tête avant `image.load()` (et `Image.MAX_IMAGE_PIXELS` aligné), sorties PNG bornées
   (`PYTHON_TOOLS_MAX_OUTPUT_BYTES`), échantillons audio bornés avant `readframes`
   (`PYTHON_TOOLS_MAX_AUDIO_SAMPLES`), threads natifs limités à 1 par bibliothèque.
7. **Réseau privé** : nouveau réseau Compose `python` en `internal: true` (aucune passerelle). Seuls
   `api` et `worker` y sont attachés, en plus du réseau `internal` qui garde l'accès sortant vers
   Vertex/Postiz. `python-tools` n'est que sur `python` : ni Internet, ni `db`, ni `web`. Aucun port publié.
8. **Disponibilité réelle** : `/readyz` n'est `200` que si le pool est complet et vivant **et** si
   l'auto-test natif (OpenCV/NumPy/Pillow) réussit ; `503` sinon. Le `HEALTHCHECK` Docker et Compose
   utilise `/readyz` ; `/healthz` reste la vivacité.
9. **Authentification inchangée dans son principe** : jeton partagé, comparaison à temps constant,
   désormais sur octets (un en-tête non ASCII ou surdimensionné produit `401`, jamais `500`).
10. **Aucun ajout de surface** : pas d'exécution de code arbitraire, pas d'URL, pas d'outil shell, pas de
    téléchargement de modèle, aucune nouvelle orchestration ; le registre de capacités reste fermé.

## Conséquences

- **Positives** : une tâche native ne peut plus dépasser son délai ; la mémoire et les processus sont
  bornés ; le service est réellement injoignable depuis Internet et des conteneurs non autorisés ;
  la disponibilité annoncée correspond à la capacité réelle de traitement.
- **Négatives / coûts** : chaque enfant réimporte NumPy/OpenCV (démarrage ≈ 1 s, remplacement inclus) ;
  la mémoire par conteneur augmente (processus dupliqués) — `mem_limit: 1g` avec
  `max_concurrency=2` ; l'IPC loopback ajoute un port éphémère interne (jamais publié, nonce obligatoire).
- **Exploitation** : un enfant tué est remplacé à la demande ; si le stockage des processus est saturé,
  `/readyz` passe à `503` et le `HEALTHCHECK` échoue.

## Alternatives envisagées

- **Rester en threads + `wait_for`** : rejeté — aucune annulation possible d'un appel natif.
- **Plafonner le temps CPU par thread** : rejeté — pas d'API portable, et le thread resterait bloqué.
- **`multiprocessing.Pipe`** : rejeté — named pipes sous Windows, non disponibles ici, et partage de
  descripteurs via `resource_sharer` (lui-même un named pipe).
- **Un processus par requête (spawn à la demande)** : rejeté — latence et pression mémoire par requête.
- **Réseau `internal: true` pour tous les services** : rejeté — couperait l'accès sortant requis
  (Vertex, Postiz, Stripe, S3, Hatchet).

## Références

- ADR-0012, ADR-0037
- [Preuves P12-03](../delivery/P12-03_PYTHON_TOOLS_HARDENING.md)
