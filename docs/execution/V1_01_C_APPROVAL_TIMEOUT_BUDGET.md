# V1_01_C — APPROBATION DURABLE, TIMEOUTS ET WORKER INDISPONIBLE

- **Date** : 2026-10-24
- **Engine** : Hatchet v0.110.5 embedded
- **Verdict** : PASS sur C4 et C5

## 1. C4 — approbation durable

Run : poc-approval-1 (Hatchet 991ba610-a523-4842-a3e0-d756b66dc634), projet poc-project-approval.

Séquence réelle :

1. Le workflow atteint la tâche durable approval.
2. L'approbation est en base : status pending, checksum e4eec741f855b7fa79ffcf338db930c9572157daa94f08705bfa2e3c2221a849.
3. Le worker est arrêté brutalement (Stop-PocWorker).
4. L'état ledger reste pending et le step approval reste waiting.
5. Le worker est redémarré.
6. L'événement poc-approval-poc-approval-1 est poussé avec le checksum exact.
7. La tâche durable reprend, l'approbation passe approved, le run passe succeeded.

Preuves :

    APPROVAL_PENDING_BEFORE_STOP=True
    pending avant arrêt
    WORKER_STOPPED=5324
    restart worker PID=7748
    POC_APPROVAL_PUSHED ... e4eec741...
    APPROVAL_RESUMED_AFTER_RESTART=True
    poc_run = succeeded
    poc_approval = approved
    steps = approval succeeded, transfer succeeded

L'attente humaine n'a pas bloqué un worker : la tâche durable a suspendu l'exécution, et le redémarrage a repris après événement.

## 2. C5 — timeout d'exécution

Workflow : vululu-poc-timeout, task timeout-step, executionTimeout 2s, sleep 5s.

Résultat Hatchet :

    status = FAILED
    error = Task exceeded timeout of 2s

Le timeout est traité comme un échec terminal, pas comme un succès silencieux.

## 3. C5 — worker indisponible

Run : poc-unavail-1, projet poc-project-unavail.

- Worker arrêté.
- Run déclenché.
- Aucune ligne poc_run immédiatement : le worker n'a pas commencé.
- Worker redémarré.
- Run traité, approval poussée, run succeeded.

Preuves :

    run_rows = 0 pendant l'absence du worker
    PROCESSED_AFTER_WORKER_START=True
    COMPLETED_AFTER_RESTART=True

## 4. Budget

Le refus budget est détaillé dans V1_01_C_IDEMPOTENCY.md :

    poc-budget-1 | failed
    scene effects = 0
    cost events = 0

## 5. Limites

- L'approbation est un événement durable mock, pas une signature cryptographique.
- Le timeout de 2s est une expérience isolée ; le workflow principal utilise 10m.
- Aucun mécanisme de relance automatique d'un run bloqué au-delà du retry Hatchet n'est implémenté.
- Le worker Windows est un processus Node unique, sans supervision système.

## 6. Conclusion

Approbation après arrêt/redémarrage, timeout terminal et indisponibilité worker sont démontrés sur Hatchet v0.110.5. C4 et C5 sont PASS.
