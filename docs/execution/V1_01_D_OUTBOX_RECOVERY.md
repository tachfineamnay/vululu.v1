# V1-01-D — OUTBOX, ATOMICITE ET RECONCILIATION

- **Date** : 2026-10-24
- **Commit code D** : 1110240
- **Modele** : Transactional Outbox -> dispatcher idempotent -> Hatchet

## 1. Probleme traite

La transaction PostgreSQL qui cree le JobRun ne peut pas inclure l appel reseau Hatchet. Un crash entre le commit et l enqueue laisserait un JobRun queued sans workflow.

## 2. Mecanisme

- PrismaProductionRunRepository.startRun cree, dans la meme transaction Serializable :
  - le snapshot ;
  - les StepRun ;
  - le ProductionJob ;
  - une ligne OrchestrationOutbox kind=start_run, idempotencyKey=start:<jobRunId>.
- DurableProductionExecutor appelle le dispatcher apres commit.
- Le dispatcher claim la ligne, appelle Hatchet, puis marque dispatched et enregistre workflowRunId sur le JobRun.
- Si Hatchet est indisponible, la ligne repasse pending avec attempts, lastError et nextAttemptAt (backoff exponentiel plafonne).
- Au demarrage API, recoverStaleClaims(0) remet les claims orphelins a pending et reconcileApprovals recree les signaux d approbation manquants.
- Aucune transaction PostgreSQL n est maintenue pendant un rendu media.

## 3. Idempotence

- Cle start:<jobRunId> unique.
- Hatchet recoit input.outboxId et le workflow declare une idempotence status sur input.outboxId.
- Une relance du dispatcher ne cree pas un second JobRun ni un second workflow logique.
- Les effets media/DB ont leurs propres cles : versions uniques, RunArtifact unique, CostEvent.idempotencyKey unique.

## 4. Preuve de panne de connectivite

Experience reelle :

1. API demarree avec HATCHET_CLIENT_API_URL=http://127.0.0.1:59999 (injoignable).
2. Production lancee : JobRun cmvmpv0i50004havwhoihhyu8, status queued, workflowRunId null.
3. Outbox start_run en echec avec lastError ECONNREFUSED, aucun run Hatchet cree.
4. API redemarree avec le vrai endpoint.
5. Le dispatcher reconcilie : workflowRunId 9ba3dc98-749c-4505-b57e-91e9a91d00c9, outbox dispatched, attempts=5 cumules.
6. Une seule ligne outbox et un seul JobRun ont ete crees.
7. Le run a termine succeeded apres approbation.

## 5. Approbation

OutboxApprovalSignal materialise le signal dans OrchestrationOutbox apres l ecriture metier de l approbation. La cle approval:<artifactVersionId>:<checksum> est unique. Si le crash survient entre l approbation et l outbox, reconcileApprovals retrouve le run waiting_approval, le StepRun finalize output et l approbation exacte, puis recree le message.

Limite : l ecriture de l outbox d approbation n est pas dans la meme transaction que l approbation. La reconciliation couvre la fenetre, mais ce n est pas une atomicite stricte. C est documente comme dette non critique.

## 6. Inspection

    SELECT "idempotencyKey", kind, status, attempts, "workflowRunId", "lastError"
    FROM "OrchestrationOutbox" ORDER BY "createdAt" DESC;

Sur la campagne : start_run dispatched et approval_signal dispatched, avec un seul travail logique par run.

## 7. Limites

- Pas de verrou distribue multi-instance API ; le mode local mono-instance est celui valide.
- Le dispatcher ne fait pas de compensation vers un autre orchestrateur.
- Un echec definitif apres 10 tentatives reste visible, il ne disparait pas.
