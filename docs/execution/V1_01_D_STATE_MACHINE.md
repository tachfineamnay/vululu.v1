# V1-01-D — MACHINE A ETATS METIER

- **Date** : 2026-10-24
- **Code** : packages/domain/src/productionState.ts
- **Commit code D** : 1110240

## 1. Etats JobRun

    queued
    running
    waiting_approval
    recovery_pending
    succeeded
    failed
    cancelled
    timed_out

Transitions principales :

| Depuis | Vers autorises |
|---|---|
| queued | running, cancelled, failed |
| running | waiting_approval, recovery_pending, succeeded, failed, cancelled, timed_out |
| waiting_approval | succeeded, failed, cancelled, recovery_pending |
| recovery_pending | running, failed, cancelled, timed_out |
| succeeded / failed / cancelled / timed_out | aucun |

## 2. Etats StepRun

    pending -> running -> succeeded | failed | cancelled | timed_out
    running -> waiting_approval -> succeeded | failed | cancelled

Une repetition du meme etat est idempotente et ne cree pas d evenement. Une transition interdite leve ProductionStateError (code Domain invalid_transition).

## 3. Persistance et audit

- JobRun.status et StepRun.status sont les etats metier.
- RunStateEvent conserve fromState, toState, scope (job ou step:nom), source, metadata et createdAt.
- Les transitions sont ecrites en transaction avec le statut.
- Les evenements techniques Hatchet ne modifient jamais directement un etat metier terminal.
- Le store est PrismaDurableProductionStore.transitionJob / transitionStep.

En preuve : 172 RunStateEvent produits pendant la campagne D, incluant job queued->running, running->waiting_approval, waiting_approval->succeeded et step running->succeeded.

## 4. Idempotence et concurrence

- Meme etat : pas de nouvelle transition metier ; une reprise de step running incremente attempts et trace une reprise.
- Transition concurrente : updateMany conditionne sur l ancien statut ; si count != 1, conflit 409.
- Etat terminal : une tentative de retour leve une erreur (test de transition succeeded -> running).
- L index unique JobRun_one_active_per_project couvre queued, running, waiting_approval et recovery_pending.

## 5. Tests

- tests/domain/production-state.test.ts : 4 tests.
- tests/v1/v1-01-d-durable.test.ts : transitions persistees, terminal refuse, finalisation idempotente.

## 6. Limites

La machine est utilisee par le chemin durable. Le LocalProductionExecutor historique conserve ses mises a jour directes pour compatibilite ; il est explicitement non durable et n est pas utilise en mode hatchet. Le mode local ne doit pas etre presente comme equivalent a D.
