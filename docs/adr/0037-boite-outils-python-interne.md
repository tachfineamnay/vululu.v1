# ADR-0037 — Boîte à outils Python interne (`services/python-tools`)

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Décideurs** : porteur produit + ingénierie Vululu (campagne P06)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0036 (exécution outillée agentique), mission P06.

## Contexte

Certaines capacités de vision (segmentation, masques, analyse fine) ne sont pas couvertes par Sharp. P06 ajoute un service Python **indépendamment déployable** dans l'infrastructure existante, sans devenir un orchestrateur : le worker TypeScript reste seul décideur, l'agent ne fait que recommander, et les résultats reviennent par le système d'assets/versions existant.

## Décision

1. **Service FastAPI interne** dans `services/python-tools/` : contrats Pydantic stricts, registre explicite et versionné (`image.analyze@1`, `image.segment@1`), `uv` + lockfile, Python 3.12 épinglé, image Docker non-root (UID 10001) en lecture seule.
2. **Exposition strictement interne** : aucun port publié dans `infra/coolify/docker-compose.yml` (`expose: 8090` uniquement), réseau Compose interne, jeton partagé obligatoire (`PYTHON_TOOLS_TOKEN`, ≥ 24 caractères, comparaison à temps constant).
3. **Aucune exécution arbitraire** : pas d'URL, pas de chemin, pas de SQL, pas de shell, pas de client HTTP sortant ; seules les fonctions de capacités enregistrées traitent des octets fournis. Aucun téléchargement de modèle à l'exécution (`models.py` détecte un modèle facultatif monté en lecture seule et l'annonce `download: forbidden`).
4. **Intégration contrôlée côté TypeScript** : `apps/api/src/infrastructure/python/{client,adapter}.ts` ; le registre P05 expose `image.analyze@1` (READ, auto) et `image.segment@1` (GENERATE, approbation humaine) ; l'engine `runtime.ts` les dispatche. Les paramètres sont revalidés, les octets source et sorties sont vérifiés par SHA-256, puis les sorties sont stockées via `AssetUseCases.upload` (versions immuables, inspection, licences, audit).
5. **Aucun moteur supplémentaire** : l'exécution reste dans le worker Hatchet existant ; le service Python ne planifie, ne publie et ne persiste aucune donnée client.

## Conséquences

- **Positives** : capacités de vision réelles hors du périmètre Sharp ; surface réseau interne minimale ; résultats vérifiés et versionnés ; prêt pour P07 (modèles embarqués) sans changer le broker.
- **Négatives / coûts** : un service supplémentaire à opérer (mémoire 768 Mio, CPU 1) ; GrabCut est déterministe mais moins précis qu'un modèle spécialisé ; l'image Docker et Compose restent `NOT_RUN` tant qu'aucun hôte Docker n'est disponible.
- **Sécurité** : jeton interne, aucune donnée de base côté Python, limites de taille/pixels/délai/concurrence, conteneur en lecture seule avec capacités supprimées.

## Alternatives envisagées

- **Tout faire dans Node/Sharp** : rejeté — segmentation et masques alpha fiables nécessitent OpenCV.
- **Service exposé via Traefik** : rejeté — aucune raison d'exposer des outils internes publiquement.
- **Orchestration Python (files, retries)** : rejeté — duplication du broker/worker ; P06 garde un service sans état.
- **Modèle ONNX lourd dès P06** : rejeté — taille/licence/hardware non vérifiés ; détourage local GrabCut en P06, modèle optionnel détecté pour P07.

## Références

- `services/python-tools/` (README, pyproject, uv.lock, Dockerfile, app)
- `apps/api/src/infrastructure/python/`, `apps/api/src/infrastructure/execution/{registry,runtime}.ts`
- `infra/coolify/docker-compose.yml`, ADR-0036, P06 dans le plan de complétion
