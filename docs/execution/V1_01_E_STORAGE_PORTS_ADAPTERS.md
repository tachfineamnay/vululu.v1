# V1-01-E — PORTS ET ADAPTATEURS DE STOCKAGE

- **Date** : 2026-10-25
- **Commit code E** : 4595d03

## 1. Matrice capability -> port -> adaptateur

| Capacite | Port | Local | S3 |
|---|---|---|---|
| ecrire un buffer/flux | ArtifactStoragePort.putObject | oui | oui |
| ecrire un fichier sans chargement memoire | putFile | oui | oui, multipart |
| metadonnees | head | oui | oui |
| existence | head != null | oui | oui |
| SHA-256 | verify | oui, calcul local | oui, metadata objet |
| lecture complete | get | oui | oui |
| lecture partielle HTTP | get(range) | oui | oui, Range S3 |
| URL temporaire | getSignedReadUrl | null (pas de bucket) | oui, presignee |
| inventaire | list | oui | oui, pagine |
| acces applicatif | ArtifactAccessPort | oui | oui |
| suppression | non exposee | non | non |

## 2. LocalFilesystemArtifactStorage

- Racine configurable.
- Refus des cles absolues, des .. et des separateurs inverses.
- Ecriture atomique : fichier temporaire puis rename.
- putFile verifie le SHA-256 source avant copie.
- head recalcule le SHA-256 local.
- get retourne un Readable et supporte start/end.
- getSignedReadUrl retourne null : aucun bucket, donc aucune URL signee.
- list ignore les fichiers temporaires.

## 3. S3CompatibleArtifactStorage

- AWS SDK v3 @aws-sdk/client-s3, lib-storage et presigner.
- Compatible S3 standard, path-style configurable, endpoint, region, bucket.
- Upload multipart (partSize 8 MiB) sans charger le fichier complet en memoire.
- Metadonnee x-amz-meta-sha256 pour l integrite ; ETag n est jamais assimile a SHA-256.
- requestChecksumCalculation et responseChecksumValidation en WHEN_REQUIRED pour compatibilite avec le serveur S3-compatible de test.
- timeouts via NodeHttpHandler, maxAttempts borne, erreurs ArtifactStorageError structurees.
- get renvoie un Readable, y compris pour Range.
- getSignedReadUrl limite a 1..3600 secondes.
- list pagine ListObjectsV2.

## 4. Validation

Tests locaux : upload, checksum, head, stream, range, idempotence, conflit de checksum, inventaire.

Tests S3 reels : putObject, head, get, range, list, putFile multipart 12 MiB, verification SHA. Backend : rclone serve s3 v1.75.2, bucket vululu-e-test, endpoint local 127.0.0.1:9100.

## 5. Limites

- Le serveur de validation n est pas un object store de production.
- Les policies IAM, chiffrement SSE, TLS de production et lifecycle bucket ne sont pas certifies.
- Aucun acces direct S3 n est expose au navigateur ; les routes API servent les flux.
