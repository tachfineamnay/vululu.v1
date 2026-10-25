# V1 — READINESS DE DEPLOIEMENT

- **Date** : 2026-10-25
- **Commit code G** : 0e79c08
- **Verdict** : DEPLOYMENT_NOT_READY

## 1. Services necessaires

| Service | Local | Production |
|---|---|---|
| PostgreSQL 17 | oui | oui, TLS, backups |
| API Fastify | oui, Windows | Linux, reverse proxy, TLS |
| Web Next | oui, dev | Linux / hebergement |
| Worker Hatchet | oui, WSL | service supervise, Linux |
| Hatchet engine | sidecar local | deployment dedie |
| Stockage artefacts | filesystem local | S3-compatible certifie |
| CI | local gate | GitHub Actions |
| Observabilite | logs stdout/metrics | collecte, alerting |

## 2. Conditions non satisfaites

- Docker/Linux runtime : NOT_RUN. Docker n etait pas utilisable ; aucun deploiement.
- Redemarrage complet Hatchet : NOT_RUN.
- Supervision worker automatique : NON IMPLEMENTEE (heartbeat + detection seulement).
- CI GitHub : NOT_RUN (aucun push).
- S3 production : NOT_RUN (rclone local experimental).
- TLS/IAM/SSE/policies : NOT_RUN.
- Sauvegarde/restauration binaire S3 : NOT_RUN ; metadonnees PostgreSQL testees.
- Tests de charge multi-workers/multi-instances : NOT_RUN.
- MFA : non implemente.
- Rotation de secrets : manuelle.
- Reseau : localhost/WSL, pas de reverse proxy TLS.
- Configuration .env : locale, pas de coffre de secrets.

## 3. Configuration minimale attendue

- APP_ENV=production.
- APP_ORIGIN/WEB_ORIGIN obligatoires.
- SESSION_SECRET >= 32, SESSION_COOKIE_SECURE=1.
- DATABASE_URL locale uniquement dans le code actuel : la validation V0 refuse une base non locale. Une validation production devra etre ajoutee separement, sans affaiblir le mode local.
- ARTIFACT_STORAGE_BACKEND=s3, S3_BUCKET, S3_ENDPOINT, region, credentials, S3_REQUIRE_TLS=1.
- HATCHET_CLIENT_TOKEN fourni par secret, jamais logge.
- TRUST_PROXY selon reverse proxy.
- RATE_LIMIT_FAIL_MODE configure.
- DURABLE_WORKER_ID stable.

## 4. Procedure de deploiement proposee, non executee

1. Provisionner PostgreSQL et appliquer les 12 migrations.
2. Provisionner l objet store, bucket prive, TLS, IAM minimal.
3. Deployer Hatchet engine et son stockage persistant.
4. Deployer l API et le worker avec secrets fournis par coffre.
5. Verifier health, workers actifs, outbox pending.
6. Executer un run 10 s mock, verifier artefact et approbation.
7. Executer un run 50 s, verifier Range/QA/transfert mock.
8. Tester crash worker et reconciliation.
9. Activer sauvegardes DB + artefacts.
10. Activer CI et observabilite.

## 5. Conditions d arret

- Base non locale refusee par le code actuel : decision de configuration requise avant production.
- Aucune migration destructive.
- Aucun push/deploiement sans revue humaine.
