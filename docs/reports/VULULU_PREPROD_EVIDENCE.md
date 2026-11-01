# VULULU V1 — Preuves de préproduction orchestration et stockage (Mission 05)

- Date : 2026-11-01
- Environnement : Windows 11, Node 24.21.0, pnpm 10.6.1, PostgreSQL 17.2 portable (127.0.0.1:55432), Docker 29.8.1 (4 CPU, 6 Go), rclone 1.75.2, OpenSSL Git for Windows
- Base démo vululu_v1_00 : jamais écrite (comptages identiques avant/après)
- Base de test vululu_v1_00_test : utilisée pour les migrations, tests et preuves
- Aucun secret affiché ; aucune clé fournisseur réelle ; aucun coût payant
- Verdict global : PARTIEL — S3/backup/restore PASS, orchestrateur Hatchet BLOCKED par Docker Desktop

## 1. Ce qui est PASS

| # | Preuve | Commande / condition | Résultat |
|---|---|---|---|
| 1 | Politique base non locale | pnpm exec vitest run tests/v1/env-policy.test.ts | 6/6 PASS |
| 2 | Certificat TLS interne | scripts/preprod/gen-certs.ps1 + openssl verify | CERT OK, SAN s3/localhost/127.0.0.1/::1 |
| 3 | Serveur S3 TLS privé | scripts/preprod/start-s3.ps1 (rclone 1.75.2, 127.0.0.1:9443, auth-key) | écoute loopback, aucun port public, auth obligatoire |
| 4 | Tests contrat stockage | E_S3_TEST=1 S3_ENDPOINT=https://127.0.0.1:9443 S3_BUCKET=vululu-artifacts NODE_EXTRA_CA_CERTS=… pnpm exec vitest run tests/v1/v1-01-e-storage.test.ts | 8/8 PASS dont les 2 tests S3 auparavant SKIP ; upload, head, get, Range, multipart 12 Mio |
| 5 | URL signée + intégrité + Range | pnpm exec tsx scripts/preprod/verify-s3-presign.ts | PUT PASS, VERIFY PASS, SIGNED_URL PASS (HTTP 200, SHA identique), RANGE PASS (10 octets) |
| 6 | Sauvegarde PostgreSQL + objets | pwsh -File scripts/preprod/backup.ps1 | BACKUP_PASS ; dump SHA-256 84432afc… ; 3 objets, 12 584 010 octets ; manifeste avec comptages |
| 7 | Restauration isolée | pwsh -File scripts/preprod/restore-test.ps1 | RESTORE_PASS ; nouvelle base vululu_restore_20261101t185707z ; nouveau bucket ; comptages, SHA des objets et objet de preuve vérifiés |
| 8 | Moteur Hatchet démarré | docker run … vululu-hatchet:0.110.5 avec HATCHET_DATABASE_URL vers hatchet-pg | conteneur Up, logs engine postgres-pubsub/tasks-controller, handshake.json généré (token non affiché) |
| 9 | Binaire Hatchet vérifié | scripts/preprod/fetch-hatchet.ps1 | SHA-256 18ddacae… conforme, 59 072 674 octets |

Comptages démo avant/après (SELECT COUNT read-only) : User 3, BrandContext 28, Project 36, Scene 160, SceneVersion 249, Transfer 44, ProductionJob 71, JobRun 64, StepRun 240, AuditEvent 285 — identiques.

## 2. Ce qui est FAIL / BLOCKED

| # | Élément | Constat exact | Correction attendue |
|---|---|---|---|
| 1 | Images MinIO | docker pull minio/minio:latest et minio/mc:latest : pull access denied ; quay.io/minio/minio et bitnami/minio : no such manifest | Utiliser un registre MinIO/entreprise ou un S3 managé ; le repli rclone est documenté et limité |
| 2 | Docker Desktop data disk | pendant la reconstruction Hatchet : write /var/lib/desktop-containerd/…/meta.db: read-only file system ; WSL /dev/sde 124,8 M utilisé à 85 % | Libérer/réparer le disque Docker Desktop ou exécuter la topologie sur un VPS Linux ; ne pas réparer le disque WSL sans accord (autres projets) |
| 3 | Topologie compose complète | non exécutée ; le démon Docker est devenu read-only avant le démarrage API/worker/S3 en conteneurs | Après correction Docker, exécuter infra/preprod/docker-compose.yml et rejouer les smoke tests |
| 4 | Accès hôte au moteur | le sidecar écoute 127.0.0.1 dans son conteneur ; les ports 7077/28243 ne sont pas joignables depuis Windows ; le correctif socat (17077/18243) est écrit mais n'a pas pu être reconstruit | Rebuild de l'image Hatchet avec socat, publication 17077/18243, ou exécution API/worker dans le réseau Docker |
| 5 | Crash / reprise worker | NOT_RUN : impossible sans topologie Hatchet joignable | Exécuter la procédure du runbook (kill worker aux 4 checkpoints, restart, assertions d'unicité) |
| 6 | Persistance objet après remplacement de conteneur | NOT_RUN : le S3 de preuve a tourné sur l'hôte, pas en conteneur | Exécuter le compose après correction Docker, supprimer/recréer le conteneur S3, vérifier head/get/Range |
| 7 | Santé stockage dans l'Admin via API | NOT_RUN : la preuve API S3 a été interrompue par un arrêt de processus ; le code Admin expose backend + ok + détail et le test admin local-backend passe | Rejouer avec API stable : GET /api/admin/overview, vérifier storage.backend=s3 et storage.ok=true |
| 8 | Tests de charge | NOT_RUN | Mesurer 1 et 2 runs concurrents avec docker stats après rétablissement Docker |
| 9 | Sauvegarde avant/après arrêt brutal | Partiel : backup/restore PASS ; pas de test de restauration après kill -9 pendant écriture | Ajouter un scénario d'arrêt brutal pendant pg_dump/écriture MinIO |

## 3. Garanties de non-régression et sécurité

- Base de démonstration jamais écrite ; seules des SELECT COUNT l'ont lue.
- Aucune migration destructive ; aucune suppression de données.
- S3 : aucun port public, auth obligatoire, TLS interne, bucket privé ; aucun secret affiché ni commité.
- Aucune fourniture IA payante, aucun transfert Postiz réel, aucun déploiement.
- Backups et objets de test sont sous infra/preprod/backups et infra/preprod/runtime, ignorés par Git.

## 4. RPO/RTO proposés (staging)

| Élément | Proposition | Limite |
|---|---|---|
| RPO | 24 h (sauvegarde quotidienne) | Pas de PITR/WAL ; à réduire à ≤ 1 h en production |
| RTO | 2 h | Restauration testée sur base/bucket isolés, pas sur un VPS |
| Rétention | 14 sauvegardes quotidiennes + 4 hebdomadaires | Politique à valider |
| Restauration | base + objets + manifeste + vérification SHA | Testée PASS le 2026-11-01 |

## 5. Corrections exactes avant de déclarer la Mission 05 complète

1. Rétablir Docker Desktop ou utiliser un hôte Linux : disque data non read-only, espace libre suffisant.
2. Rebuilder l'image Hatchet avec socat, publier 17077/18243, vérifier handshake + connexion API/worker.
3. Exécuter le compose complet (postgres, cert-init, s3, hatchet-pg, hatchet, migrate, api, worker, web) sur Linux.
4. Rejouer les crash tests aux 4 checkpoints et prouver l'unicité master/transfert.
5. Recréer le conteneur S3 et vérifier l'accès aux objets persistés.
6. Rejouer la santé Admin avec storage.backend=s3 et storage.ok=true.
7. Mesurer la charge de base et compléter le rapport en PASS/FAIL/BLOCKED.
