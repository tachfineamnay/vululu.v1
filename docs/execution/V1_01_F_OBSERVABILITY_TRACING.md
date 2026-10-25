# V1-01-F — OBSERVABILITE ET TRACING

- **Date** : 2026-10-25
- **Commit code F** : c4b5ab2

## 1. Propagation

    Fastify request (x-trace-id / x-request-id)
      -> ProductionUseCases
      -> JobRun.traceId + JobRun.requestId
      -> OrchestrationOutbox.traceId + requestId
      -> OutboxDispatcher
      -> HatchetOrchestratorAdapter input
      -> Worker task logs
      -> RunStateEvent / StepRun / Artifact
      -> Ops metrics et reconciliation

Les headers entrants sont sanitizes (caracteres autorises, longueur 128). S ils sont absents, UUID generes. Les headers sont renvoyes au client.

## 2. Logs JSON

Evenements structures sur stdout :

- http.request.completed : requestId, traceId, method, route, statusCode, durationMs.
- http.request.failed : code stable, sans body.
- outbox.dispatched / outbox.dispatch_failed : outboxId, jobRunId, attempts, workflowRunId, erreur.
- worker.started / worker.step.started / worker.step.completed / worker.step.failed : step, jobRunId, traceId, durationMs.
- worker.approval.waiting.
- rate_limit.backend_error.

Le logger redige les cles connues (token, authorization, cookie, password, secret, csrf, presigned URL, session, credentials). Aucun token ou cookie n est logge.

## 3. Preuve live

Production mock 10 s :

- header x-trace-id: f-live-trace-001 ;
- header x-request-id: f-live-request-001 ;
- JobRun cmvnmc3pk0004hahky2wqu7jz porte ces deux valeurs ;
- OrchestrationOutbox start_run porte les memes valeurs et workflowRunId d4f5726a-9b88-4a92-99c1-e7ec2875fdb1 ;
- logs worker.step.* avec jobRunId et traceId f-live-trace-001 ;
- outbox.dispatched avec traceId/requestId ;
- JobRun final succeeded apres approbation.

Le worker heartbeat worker-6820 etait running pendant le run.

## 4. Metriques et operations

- GET /api/ops/health (super_admin) : status ok/degraded, database, workersActive, outboxPending.
- GET /api/ops/metrics : Prometheus text (workers actifs, JobRun/StepRun/Outbox/Artifact par statut).
- GET /api/ops/snapshot : JSON pour diagnostic.
- POST /api/ops/reconcile : dry-run par defaut.

Preuves : health status=ok, workersActive=1, outboxPending=0 ; outbox snapshot dispatched=33 ; reconcile dryRun=true, incidents=0.

## 5. Limites

- Pas d OpenTelemetry exporte ; instrumentation portable par logs/IDs et extension future possible.
- Pas de dashboard Grafana.
- Pas de duree stockee en colonne dediee ; duree derivee des timestamps et logs.
- Les logs de test sont bruyants mais ne contiennent pas de secrets.
