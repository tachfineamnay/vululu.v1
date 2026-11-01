# ADR-0015 — Topologie de préproduction : Hatchet embedded, PostgreSQL et S3-compatible

- Date : 2026-11-01
- Statut : Accepté avec limitations pour la préproduction locale ; NON VALIDÉ pour un déploiement complet
- Décideurs : Lead engineer (proposition)
- Contexte : Mission 05 — compléter orchestration et stockage V1, prouver leur exploitation en préproduction sans services IA payants.
- Remplace : aucun
- Complète : ADR-0002 (PostgreSQL/S3), ADR-0003 (Hatchet), ADR-0009 (POC Hatchet), ADR-0011 (artefacts immuables)

## 1. Contexte et contraintes observées

- Le runtime par défaut de main est local in-process (ORCHESTRATOR_MODE absent) : non durable, sans reprise.
- Hatchet n'est pas actif sans engine, token et worker ; le POC C a prouvé l'engine v0.110.5 via le sidecar embedded sous WSL.
- Docker Desktop est disponible (29.8.1, 4 CPU, 6 Go), mais son disque de données WSL est devenu read-only pendant la mission : builds et runs ont commencé puis ont échoué (read-only file system sur les métadonnées containerd). Le disque n'a pas été réparé pour ne pas risquer les données d'autres projets de la machine.
- Les images MinIO ne sont plus distribuées au moment de la mission : minio/minio, minio/mc, quay.io/minio/minio et bitnami/minio renvoient accès refusé ou manifeste inexistant.

## 2. Décisions

### D1 — Hatchet embedded v0.110.5 conteneurisé, PostgreSQL externe

- Image infra/preprod/Dockerfile.hatchet : binaire sidecar v0.110.5 vérifié SHA-256 (18ddacae…).
- PostgreSQL dédié hatchet fourni par un conteneur Postgres 17 ; le sidecar utilise -database-url au lieu de télécharger son PostgreSQL embarqué (téléchargement Maven bloqué sur ce poste).
- Le sidecar écoute uniquement 127.0.0.1 dans son conteneur ; deux proxies socat exposent 17077 (gRPC) et 18243 (API) sur le réseau Docker.
- Le token est lu depuis le handshake /data/handshake.json, jamais affiché ni commité.
- Limite explicite : pas de HA, pas de supervision production, sidecar embedded non certifié pour un VPS public ; décision production ultérieure (managed Hatchet ou hatchet-lite + superviseur).

### D2 — S3-compatible : rclone serve s3 v1.75.2 + TLS interne (repli explicite)

- MinIO étant indisponible, le backend de préproduction locale retenu est rclone serve s3 v1.75.2, déjà éprouvé par la campagne E.
- TLS interne : CA et certificat auto-signés générés par scripts/preprod/gen-certs.ps1 (SAN s3/localhost/127.0.0.1/::1).
- Authentification obligatoire par --auth-key ; écoute uniquement 127.0.0.1:9443 ; bucket privé vululu-artifacts ; aucun port public.
- Limite explicite : rclone serve s3 est expérimental et n'offre ni IAM, ni politiques de bucket, ni réplication, ni durabilité certifiée. Pour la production : MinIO auto-hébergé, S3 managé ou stockage objet certifié — décision séparée.

### D3 — API et worker sur l'hôte pour la preuve locale ; images fournies pour le VPS

- Les images Dockerfile.api et Dockerfile.web sont fournies pour le déploiement VPS/Coolify.
- La preuve locale a exécuté l'API/worker en runtime tsx sur l'hôte (V0_TEST_DB=1, base de test isolée), connectés au S3 TLS et au moteur Hatchet.
- Le compose complet infra/preprod/docker-compose.yml n'a pas pu être exécuté à cause du blocage Docker ; il est fourni comme configuration de référence à valider sur Linux.

### D4 — Sauvegarde/restauration isolée

- scripts/preprod/backup.ps1 : pg_dump -Fc + copie des objets + manifeste de checksums.
- scripts/preprod/restore-test.ps1 : restauration dans une NOUVELLE base et un NOUVEAU bucket, vérification des comptages, des SHA-256 et d'un objet de preuve dont la métadonnée correspond à l'octet.
- RPO proposé 24 h, RTO proposé 2 h pour le staging ; production : PITR/WAL ≤ 1 h, décision séparée.

## 3. Conséquences

- La préproduction locale prouve S3/TLS, upload, URL signée, Range, intégrité, sauvegarde et restauration.
- Le chemin Hatchet complet (engine → worker → reprise après crash) reste BLOCKED sur ce poste par Docker ; la procédure et les corrections exactes sont dans le runbook et le rapport de preuves.
- Aucun fournisseur IA payant, aucune publication Postiz, aucun déploiement public.

## 4. Références

- docs/preprod/RUNBOOK.md
- docs/reports/VULULU_PREPROD_EVIDENCE.md
- infra/preprod/*, scripts/preprod/*
