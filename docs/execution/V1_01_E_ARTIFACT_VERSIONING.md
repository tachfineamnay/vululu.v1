# V1-01-E — IDENTITE ET VERSIONNEMENT DES ARTEFACTS

- **Date** : 2026-10-25
- **Commit code E** : 4595d03

## 1. Identite metier

Les identites existantes sont conservees :

- projectId
- sceneId
- sceneVersionId
- artifactVersionId
- characterId
- jobRunId
- checksum

Une SceneVersion et une ArtifactVersion restent immuables. Une nouvelle production cree une nouvelle version, jamais un ecrasement.

## 2. Metadonnees ajoutees

SceneVersion et ArtifactVersion portent desormais :

- storageKey
- storageProvider
- mimeType
- sizeBytes
- sha256
- finalizationState
- manifest

Les anciennes colonnes imagePath et masterPath restent presentes pour la compatibilite. Elles ne sont plus la reference principale lorsqu une storageKey existe.

## 3. Regle d immutabilite

- La cle contient le SHA-256 du contenu.
- Un objet existant avec le meme checksum est reutilise de facon idempotente.
- Un objet existant avec un checksum different est refuse (artifact_object_conflict).
- Une finalisation rejouee retourne le RunArtifact existant et ne cree pas une seconde version.

## 4. ETag et SHA-256

L ETag S3 n est pas utilise comme checksum metier. Le SHA-256 est calcule sur les octets avant upload et conserve dans les metadonnees de l objet et en base. Les uploads multipart peuvent produire un ETag different du SHA-256 ; le contrat ne les confond pas.

## 5. Preuve de versionnement

- Production E : master v11 S3 et master v10 S3 coexistent avec les masters v1..v9 legacy/local du meme projet.
- Correction E : nouveau master v9 et nouvelle version de SCENE-003 (v10), sans suppression des versions anterieures.
- 26 versions de scene et 6 versions de master portent une storageKey a la fin de la campagne ; les versions legacy restent presentes.

## 6. Limites

Les versions historiques restent referencees par chemin local jusqu a migration progressive ; la compatibilite est assuree par fallback. Aucun media historique n a ete supprime.
