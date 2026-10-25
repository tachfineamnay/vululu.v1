# V1-01-F — SUPERVISION ET RECUPERATION DES WORKERS

- **Date** : 2026-10-25
- **Commit code F** : c4b5ab2

## 1. Worker

- ID DURABLE_WORKER_ID ou worker-<pid>.
- Heartbeat WorkerHeartbeat toutes les 10 s.
- Statut running/stopped.
- Logs structures de demarrage et d arret.
- Arret gracieux SIGTERM/SIGINT : heartbeat stopped puis worker.stop.
- Le worker reste un processus separe, sans orchestrateur maison parallele a Hatchet.

## 2. Healthcheck et detection

/api/ops/health considere un worker actif si lastSeenAt < 30 s. Si aucun worker actif ou outbox > 50, status degraded.

Preuve :

- worker tue par Stop-Process : health degraded, workersActive=0 ;
- redemarrage : health ok, workersActive=1 ;
- heartbeat worker-18100 running.

## 3. Reconciliation

RuntimeReconciliationService produit :

- workers actifs/obsoletes ;
- outbox pending/dispatching/failed et claims anciens ;
- JobRun queued sans workflow, running stale, waiting approval, terminal mismatch ;
- StepRun running overdue ;
- ArtifactObject staged overdue ;
- incidents avec requiresHuman ;
- actions appliquees seulement si dryRun=false.

Actions automatiques limitees :

- recoverStaleClaims (retour pending des claims orphelins) ;
- reconcileApprovals (recreation du signal d approbation manquant).

Aucune seconde production n est creee. Une approbation humaine en attente n est pas classee bloquee.

## 4. Runs bloques

Classifications explicites :

- outbox_stale_pending / outbox_stale_dispatching ;
- job_queued_without_workflow ;
- job_running_stale ;
- step_running_overdue ;
- artifact_staged_overdue ;
- worker_absent.

Un incident est un diagnostic, pas un ordre de relance. La reconciliation est read-only par defaut.

## 5. Preuves

- Test F : rapport dryRun=true, actions vides, note approbation.
- Test worker health : degraded puis ok apres redemarrage.
- Test outbox D : panne Hatchet, reprise, un seul workflow.
- Test E : reprise crash worker S3 avec render attempts=2 et 6 objets distincts.

## 6. NOT_RUN

- Redemarrage complet du moteur Hatchet.
- Supervision systemd/Windows service.
- Test de charge multi-workers.
- Redemarrage du worker pendant upload S3 (couvert partiellement par le protocole et D/E).
