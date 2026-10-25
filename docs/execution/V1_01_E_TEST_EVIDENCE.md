# V1-01-E — PREUVES DE TEST

- **Date** : 2026-10-25
- **Commit code E** : 4595d03

## 1. Executions automatiques

| Commande | Resultat |
|---|---|
| pnpm typecheck | PASS, 7 packages |
| pnpm test | 164 tests PASS, 2 S3 skipped, 19 fichiers |
| S3 tests avec E_S3_TEST=1 | 2 tests PASS |
| pnpm build | PASS |
| pnpm lint | PASS, 0 erreur, 42 warnings existants |
| prisma migrate deploy test | PASS |
| prisma migrate deploy dev | PASS |
| check-secrets | PASS, 274 fichiers |
| verify-foundation-docs | PASS |

Les tests E locaux couvrent : contrat local, upload/checksum/head/stream/range, idempotence publisher, ArtifactObject, acces storage et isolation proprietaire, inventaire sans suppression, migration dry-run, pipeline finalise avec metadonnees storage/manifest/objets ready.

Tests S3 reels : putObject, head, get, range, list, putObject 12 MiB multipart et range.

## 2. Campagne verticale

| Scenario | Backend | Resultat |
|---|---|---|
| Production 10 s | local | succeeded, master v8 storage local |
| Production 50 s | local | succeeded, master v2 local, 793741 octets |
| Correction SCENE-003 | local | succeeded, nouveau master et versions preservees |
| Production 10 s | S3 rclone | succeeded, master v10 S3 |
| Crash worker pendant render | S3 rclone | render attempts 2, 5 scenes, 6 objets distincts ready, succeeded |
| Acces image S3 | S3 rclone | HTTP 200, image/png, 202071 octets |
| Acces master Range | S3 rclone | HTTP 206, 10 octets, bytes 0-9/263130 |
| Inventaire S3 | S3 rclone | audit/dry-run, 18 ready, 287 legacy presentes, 0 suppression |
| Migration legacy | local | dry-run, candidats verifies par checksum, aucune ecriture |

## 3. Backend S3 de validation

MinIO n a pas pu etre telecharge (HTTP 410 Gone). Le backend utilise est rclone serve s3 v1.75.2, serveur S3-compatible local experimental, bucket vululu-e-test, endpoint 127.0.0.1:9100.

Ce backend valide le protocole S3, les uploads multipart, les metadonnees, les Range et les presigned URLs. Il ne vaut pas certification d un object store de production.

## 4. NON-RUN explicites

- Certification AWS S3, MinIO ou Ceph de production.
- TLS/SSE/IAM/politique de bucket de production.
- Production 50 s sur S3.
- Redemarrage complet du moteur Hatchet.
- Migration massive legacy -> S3.
- Suppression d artefacts historiques.
- Test de charge multi-workers et multi-instances.
- Reprise d un upload interrompu par coupure reseau S3 controlee (le retry est couvert par le contrat et la cle idempotente, pas par une panne reseau injectee).