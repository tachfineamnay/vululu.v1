# V1-01-E — MIGRATION ET COMPATIBILITE HISTORIQUE

- **Date** : 2026-10-25
- **Commit code E** : 4595d03
- **Migration** : 20261025100000_v1_01_e_artifact_storage

## 1. Migration additive

La migration ajoute :

- storageKey, storageProvider, mimeType, sizeBytes, sha256, finalizationState, manifest a SceneVersion et ArtifactVersion ;
- manifest et storageProvider a RunArtifact ;
- la table ArtifactObject.

Aucune colonne historique n est supprimee. Aucun CHECK destructif. Les anciennes valeurs imagePath/masterPath restent presentes.

## 2. Compatibilite de lecture

PrismaArtifactAccess :

- si storageKey et storageProvider existent : lit via ArtifactStoragePort (local ou S3) ;
- sinon : resout l ancien chemin sous la racine locale historique, avec la protection contre les traversals.

Une ancienne version reste donc consultable sans migration prealable.

## 3. Migration progressive

ArtifactMigrationService :

- plan() liste les SceneVersion/ArtifactVersion sans storageKey ;
- verifie existence et SHA-256 du fichier legacy ;
- dry-run par defaut ;
- apply explicite uniquement ;
- upload via storage puis mise a jour transactionnelle des colonnes et de ArtifactObject.

Le script scripts/migrate-artifacts-to-storage.ts est en dry-run par defaut. Aucune migration massive n a ete executee pendant E.

## 4. Preuve dry-run

Commande executee sur la base V1 historique :

    pnpm exec tsx scripts/migrate-artifacts-to-storage.ts --limit 5

Resultat : DRY_RUN=true, candidats scenes et masters, existence verifiee, checksums identiques. Aucune ecriture de masse, aucun media marque migre.

## 5. V0

La V0 n est pas modifiee. Aucun script de migration n a ete execute contre la base V0. Les chemins et artefacts V0 restent intacts.

## 6. Limites

- Une copie S3 reelle de toute la bibliotheque n a pas ete executee ; elle exige une autorisation et un plan par lots.
- Un media n est considere migre qu apres verification checksum, pas seulement apres upload.
- Le manifest des anciens medias est minimal (sourcePath, sourceChecksum), pas reconstructible comme un manifest D complet.
