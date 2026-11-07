# Runbook — préproduction Vululu V1 (Hatchet, PostgreSQL, S3-compatible)

- Date : 2026-11-01
- Statut : partiellement exécuté (S3/backup/restore PASS ; topologie Docker complète BLOCKED)
- Portée : préproduction locale uniquement ; aucun déploiement public
- Rapport de preuves : docs/reports/VULULU_PREPROD_EVIDENCE.md

## 1. Topologie cible

    [Navigateur] -> Web Next 3100 -> API Fastify 3101 -> Application use cases
                                        |-> PostgreSQL 17 (vululu)
                                        |-> outbox -> Hatchet engine (gRPC 17077, API 18243)
                                        |-> S3-compatible TLS (127.0.0.1:9443 en local)
                                        |-> worker tsx -> Hatchet -> rendre Sharp/FFmpeg -> S3

Conteneurs : postgres, cert-init, s3 (rclone), hatchet-pg, hatchet (sidecar embedded + socat).
Images fournies pour le VPS : Dockerfile.api, Dockerfile.web, Dockerfile.s3, Dockerfile.hatchet.

## 2. Prérequis

- Node 24, pnpm 10.6.1, PostgreSQL 17 (cluster local ou conteneur), FFmpeg.
- Docker 29+ avec disque data sain (sinon la topologie échouera en read-only).
- OpenSSL (Git for Windows) pour les certificats internes.
- Binaire Hatchet embedded v0.110.5 (SHA-256 18ddacae0005042bd982328bcb8d370cca6907352a1ab2a3c8406001d31e7dee) sous .v1/hatchet-embedded/.
- rclone 1.75.2 sous .v1/rclone-s3/.

## 3. Certificats TLS internes

    pwsh -NoProfile -File scripts/preprod/gen-certs.ps1
    # CERT_READY, SAN s3/localhost/127.0.0.1/::1 ; fichiers sous infra/preprod/runtime/certs

Aucun certificat n'est commité. NODE_EXTRA_CA_CERTS doit pointer vers ca.crt pour Node.

## 4. S3-compatible local (exécuté et validé)

    pwsh -NoProfile -File scripts/preprod/start-s3.ps1
    # écoute 127.0.0.1:9443, auth-key, bucket vululu-artifacts, TLS interne

Tests de contrat et d'intégrité :

    $env:E_S3_TEST='1'; $env:S3_ENDPOINT='https://127.0.0.1:9443'; $env:S3_BUCKET='vululu-artifacts'
    $env:S3_REGION='us-east-1'; $env:S3_ACCESS_KEY_ID='…'; $env:S3_SECRET_ACCESS_KEY='…'
    $env:S3_FORCE_PATH_STYLE='true'; $env:NODE_EXTRA_CA_CERTS='…/ca.crt'
    pnpm exec vitest run tests/v1/v1-01-e-storage.test.ts
    pnpm exec tsx scripts/preprod/verify-s3-presign.ts

Attendu : 8/8 tests PASS, PRESIGN_PUT/VERIFY/SIGNED_URL/RANGE PASS.

## 5. Moteur Hatchet (partiellement exécuté, BLOCKED pour la topologie complète)

    pwsh -NoProfile -File scripts/preprod/fetch-hatchet.ps1
    docker compose -f infra/preprod/docker-compose.yml --env-file infra/preprod/.env.preprod up -d postgres cert-init s3 hatchet-pg hatchet

Le sidecar écrit /data/handshake.json ; le token ne doit jamais être affiché. L'API et le worker lisent le token depuis ce fichier ou une variable d'environnement injectée par le coffre.

Statut constaté : le conteneur Hatchet a démarré avec PostgreSQL externe et produit un handshake valide ; le démon Docker est ensuite devenu read-only, empêchant la topologie complète et la connexion API/worker.
Correction : rétablir le disque Docker Desktop (ou utiliser un VPS Linux), rebuilder l'image avec socat, vérifier 17077/18243.

## 6. API et worker en mode Hatchet (hôte, preuve locale)

Variables minimales (valeurs jamais commitées) :

    ALLOW_NON_LOCAL_DATABASE=1        # uniquement APP_ENV=production + base non locale
    ORCHESTRATOR_MODE=hatchet
    HATCHET_CLIENT_TOKEN=<handshake.token>
    HATCHET_CLIENT_HOST_PORT=<hote>:17077
    HATCHET_CLIENT_API_URL=http://<hote>:18243
    ARTIFACT_STORAGE_BACKEND=s3
    S3_ENDPOINT=https://127.0.0.1:9443
    S3_BUCKET=vululu-artifacts
    S3_ACCESS_KEY_ID=<secret>
    S3_SECRET_ACCESS_KEY=<secret>
    S3_REQUIRE_TLS=1
    NODE_EXTRA_CA_CERTS=<ca.crt>
    DATABASE_URL=postgresql://…@…/vululu?schema=public
    SESSION_SECRET=<32+ caractères>

Commandes :

    pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
    pnpm --filter @vululu/api start        # API
    pnpm --filter @vululu/api worker       # worker séparé

## 7. Smoke tests

1. GET /api/health = 200.
2. Login super_admin, GET /api/admin/overview : storage.backend=s3, storage.ok=true, orchestrator.mode=hatchet.
3. Créer contexte + projet + brief + storyboard.
4. Lancer une production 10 s : outbox dispatchée, JobRun succeeded, artefacts S3, QA PASS.
5. Approuver la version exacte, transférer (postiz-mock), vérifier aucun doublon.
6. Corriger SCENE-003 : nouvelle version, ancienne conservation, approbation invalidée.

## 8. Procédure crash/reprise (NON EXÉCUTÉE — à rejouer après correction Docker)

1. Lancer une production 10 s et attendre render-scenes running.
2. docker compose kill worker ; vérifier StepRun running et aucun master finalisé.
3. redémarrer le worker ; attendre succeeded ; vérifier render-scenes attempts >= 2.
4. Répéter après upload avant finalisation, après finalisation avant approbation, après approbation avant transfert.
5. Assertions SQL obligatoires :
   - un seul JobRun par demande (clé start:<jobRunId>) ;
   - un seul RunArtifact par version ; aucun master dupliqué ;
   - un seul Transfer par approbation ;
   - ArtifactObject cohérents (ready) et aucun objet orphelin non expliqué.

## 9. Sauvegarde / restauration (exécuté)

    pwsh -NoProfile -File scripts/preprod/backup.ps1
    pwsh -NoProfile -File scripts/preprod/restore-test.ps1

Attendu : BACKUP_PASS + RESTORE_PASS ; vérification comptages SQL, SHA-256 des objets, objet de preuve métadonnée↔octet.
RPO 24 h / RTO 2 h proposés pour le staging ; PITR/WAL ≤ 1 h en production (décision séparée).
Ne jamais exécuter down -v. Ne jamais restaurer par-dessus la base source.

## 10. Rollback

1. Arrêter API et worker.
2. Identifier le dernier backup infra/preprod/backups/<ts>.
3. Restaurer dans une base/bucket neufs (restore-test.ps1) puis basculer la configuration.
4. Si le problème vient de l'image : revenir au digest précédent (à figer).
5. Ne jamais supprimer les volumes avant vérification du backup.

## 11. Sécurité

- Aucun port S3 public ; auth obligatoire ; TLS interne.
- Secrets uniquement côté serveur/coffre ; jamais dans Git, logs, UI ou chat.
- Aucun provider IA réel, aucun coût fournisseur, aucune publication Postiz.
- Ne pas réparer le disque WSL Docker sans accord explicite : risque pour les autres projets de la machine.
