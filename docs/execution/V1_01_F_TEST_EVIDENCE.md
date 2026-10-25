# V1-01-F — PREUVES DE TEST

- **Date** : 2026-10-25
- **Commit code F** : c4b5ab2

## 1. Executions automatiques

| Commande | Resultat |
|---|---|
| pnpm typecheck | PASS |
| pnpm test | 170 PASS, 2 S3 skipped, 20 fichiers |
| tests S3 isoles | 2 PASS |
| pnpm build | PASS |
| pnpm lint | 0 erreur / 0 warning |
| LINT_STRICT=1 pnpm lint | PASS |
| prisma migrate deploy test/dev | PASS |
| tests F cibles | 6 PASS |
| gate local -SkipTests | PASS |

## 2. Scenarios F

| Scenario | Statut | Preuve |
|---|---|---|
| Authentication/logout session revoquee | PASS | auth-security 23, F logout |
| Revocation globale | PASS | route logout-all, reason logout_all, test F |
| Purge sessions | PASS | dry-run puis apply sur session ancienne |
| CSRF mutation non autorisee | PASS | tests V1-00 existants |
| Isolation deux utilisateurs | PASS | auth-security + E storage |
| Rate limit login | PASS unitaire | test consumeRateLimit, 3e refus, DB |
| Rate limit operations couteuses | PASS code/test unitaire | preHandlers routes + test F |
| Production mock trace_id continu | PASS live | header f-live-trace-001, JobRun/outbox/worker |
| Routing fallback audite | PASS | D fallback mock-b |
| Refus budget | PASS | D budget failed, 0 effet |
| Retry cout idempotent | PASS | E/D CostEvent unique |
| Worker tue/redemarre | PASS supervision | health degraded puis ok |
| Outbox bloquee/recuperee | PASS D | panne 59999, reconcile, 1 workflow |
| Approbation exacte apres interruption | PASS D/E | approval outbox, run succeeded |
| Streaming autorise | PASS | S3 HTTP 200/206 |
| Streaming interdit inter-users | PASS | E isolation + auth tests |
| Reconciliation artefact incomplet | PASS code/inventaire | ArtifactObject staged, dry-run |
| Logs sans secrets | PASS | logger redaction, check-secrets |
| Configuration invalide rejetee | PASS | env/backend tests/validation code |
| Origin non autorisee | PASS live | HTTP 403 origin_invalid |

## 3. Preuves live

- Trace : JobRun cmvnmc3pk0004hahky2wqu7jz, traceId f-live-trace-001, requestId f-live-request-001, workflowRunId d4f5726a-9b88-4a92-99c1-e7ec2875fdb1.
- Worker heartbeat worker-6820 running pendant le run.
- Ops health : status ok, workersActive=1, outboxPending=0.
- Ops snapshot : outbox dispatched=33.
- Reconcile dry-run : incidents=0.
- Worker tue : health degraded workersActive=0 ; redemarrage : health ok workersActive=1.
- Range invalide : HTTP 416, Content-Range bytes */263361.
- Origin malveillante : HTTP 403.

## 4. Non rejoue apres F

- Production 50 s : non rejouee apres F, car les changements F portent sur securite/logs/heartbeat et le 10 s live a valide le meme chemin ; preuves E conservees.
- Engine Hatchet redemarrage complet : NOT_RUN.
- CI GitHub : NOT_RUN (aucun push).
- Charge multi-workers/multi-instances : NOT_RUN.
- TLS/IAM/SSE production : NOT_RUN.

## 5. Limites

Les tests de test DB et les logs JSON generent du bruit stdout, mais aucun secret n a ete observe. Les tests S3 par defaut sont skipped sans E_S3_TEST=1 ; les 2 tests S3 ont ete executes separement.