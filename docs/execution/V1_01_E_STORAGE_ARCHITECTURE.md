# V1-01-E — ARCHITECTURE DE STOCKAGE DES ARTEFACTS

- **Date** : 2026-10-25
- **Branche** : v1-01-e-storage-media
- **Base D** : 88921e7
- **Commit code E** : 4595d03
- **Verdict** : GO CONDITIONNEL
- **Portee** : architecture locale et validation d adaptateurs

## 1. Decision

Le stockage d artefacts devient un port applicatif interchangeable. Le Domain et l Application ne connaissent ni S3, ni bucket, ni chemin Windows, ni SDK fournisseur.

Deux backends sont implementes :

- LocalFilesystemArtifactStorage, pleinement fonctionnel (dev, tests, compatibilite, fallback).
- S3CompatibleArtifactStorage, API S3 standard via AWS SDK v3, valide contre un serveur S3-compatible reel local.

## 2. Chaine media

    Worker Hatchet
      -> rendu Sharp / FFmpeg dans un espace temporaire local
      -> ArtifactPublisherPort
      -> ArtifactStoragePort
         -> local filesystem OU S3-compatible
      -> verification SHA-256 + taille
      -> finalisation PostgreSQL transactionnelle
      -> SceneVersion / ArtifactVersion / RunArtifact / ArtifactObject
      -> ArtifactAccessPort (local ou S3, streaming et Range)

Le worker ne depend plus d un chemin permanent : le chemin local n est qu un espace de travail. La reference metier est artifactVersionId ou sceneVersionId ; la reference de stockage est une cle opaque.

## 3. Separation des responsabilites

| Responsabilite | Port / composant |
|---|---|
| Octets et flux | ArtifactStoragePort |
| Metadonnees, versions et identites | SceneVersion, ArtifactVersion, RunArtifact |
| Politique d acces | ArtifactAccessPort, RBAC et proprietaire projet |
| Cycle de vie et inventaire | ArtifactInventoryService, ArtifactObject |
| Provenance | manifest de RunArtifact et ArtifactVersion |
| Orchestration durable | D / Hatchet et Outbox |

## 4. Identite et cle de stockage

Une cle n est jamais fournie par l utilisateur. Exemples :

    artifacts/<projectId>/scenes/<sceneId>/v<version>/<sha256>.png
    artifacts/<projectId>/master/v<version>/<sha256>.mp4

La cle contient le SHA-256 : deux contenus differents ne peuvent pas ecraser le meme objet. Une nouvelle generation cree une nouvelle version metier et une nouvelle cle.

## 5. Environnements

- local : defaut, utilise pour les tests et la compatibilite historique.
- s3 : ARTIFACT_STORAGE_BACKEND=s3, endpoint, region, bucket, credentials locaux, forcePathStyle, timeouts, retries.
- Le backend S3 de validation E est rclone serve s3 v1.75.2, serveur S3-compatible local experimental. Ce n est pas une certification AWS/MinIO de production.
- MinIO Windows/Linux a repondu HTTP 410 Gone au telechargement ; aucun service n a ete installe.

## 6. Limites

- Pas de deploiement multi-region.
- Pas de TLS/mTLS S3 valide en production ; la configuration existe.
- Pas de politique de bucket publique, pas de liste publique.
- Pas de migration massive executee.
- Pas de certification AWS S3, MinIO ou autre fournisseur commercial.
- Le rendering reste local (Sharp/FFmpeg) ; les entrees distantes ne sont pas encore telechargees par le renderer.
