# V1-01-E — PROVENANCE ET MANIFEST MEDIA

- **Date** : 2026-10-25
- **Commit code E** : 4595d03

## 1. Manifest

Le manifest est construit a la finalisation a partir du run D :

- schemaVersion, createdAt ;
- jobRunId, projectId ;
- snapshotChecksum ;
- agentDefinitionId, agentConfigVersionId, agentConfigChecksum ;
- capabilityKey, providerKey, modelKey, fallbackModelId, usedFallback ;
- renderer name/version ;
- scenes : sceneId, sceneKey, version, checksum, imagePath, storageKey ;
- master : version, checksum, storageKey, duration, codecs ;
- qa : status et checks ;
- license : known=false si aucune licence reelle connue.

Le manifest est stocke dans RunArtifact.manifest, ArtifactVersion.manifest, SceneVersion.manifest et ArtifactObject.manifest. Il est immuable apres creation.

## 2. Coherence avec D

Le routage fige provient de RunRoutingSnapshot du lot D. Une modification de configuration agent apres le run ne reecrit pas le manifest. Les provider/model/fallback et checksums des scenes sont les valeurs effectivement utilisees.

## 3. Reconstruction

Le manifest permet d identifier les sceneId, versions, checksums et storageKey exacts d un master. Il ne promet pas une reproduction bit a bit pour un futur provider IA non deterministe. Le renderer actuel est deterministe mais cette propriete n est pas generalisee aux futurs providers.

## 4. Preuves

RunArtifact et ArtifactVersion portent un manifest non nul pour les runs E. Les tests verifient que le manifest RunArtifact existe et que les 6 objets publies sont references.

## 5. Limites

- Aucune licence fournisseur reelle n est inventee ; le manifest indique known=false.
- Les entrees distantes d un futur provider ne sont pas encore modelisees dans le renderer local.
- Le manifest n est pas signe cryptographiquement.
