# ADR-0010 — Orchestration durable par Outbox et Hatchet Embedded

- **Statut** : Acceptee sous condition
- **Date** : 2026-10-24
- **Sources** : ADR-0003, ADR-0009, V1-01-D

## Contexte

Le POC C a demontre la durabilite de Hatchet v0.110.5. Le lot D devait brancher le pipeline media V1 sans laisser le moteur dans un POC isole, tout en gardant le Domain et l Application independants du fournisseur. L environnement Docker local etait indisponible ; Hatchet Embedded sous WSL2 a ete autorise pour le developpement local.

## Decision

1. Le pipeline media passe par un OrchestratorPort durable et un adaptateur Hatchet confine a l infrastructure.
2. La creation JobRun + snapshot + outbox est atomique en PostgreSQL ; le dispatcher idempotent envoie vers Hatchet.
3. Le worker durable separe execute validation, routage, rendu, assemblage, QA, finalisation, approbation et transfert mock.
4. Les etats metier sont persistes par une machine a etats et des RunStateEvent ; un etat terminal n est jamais ecrase par un evenement technique.
5. Le mode ORCHESTRATOR_MODE=local reste le fallback legacy ; le mode hatchet est le chemin D.
6. Une approbation est un acte metier PostgreSQL exact (version + checksum + QA PASS), materialise par un signal durable.
7. Docker reste non valide et doit etre certifie sur un hote sain avant tout environnement de deploiement.

## Consequences

Positives : pipeline V1 durable, worker hors API, reprise reelle, outbox reconciliable, versions et approbations preservees, routage/Budget/Couts traces.

Negatives : dependance a un sidecar embedded non supervise, Docker non certifie, cancellation end-to-end non jouee, redemarrage moteur non teste, outbox d approbation non strictement atomique.

## Alternatives

- Rester sur LocalProductionExecutor : rejete pour D, conserve comme fallback.
- Integrer Hatchet directement dans les use cases : rejete (frontiere).
- Attendre Docker : rejete, l autorisation embedded permet de progresser sans risque de destruction.

## References

- docs/execution/V1_01_D_ARCHITECTURE.md
- docs/execution/V1_01_D_ORCHESTRATION.md
- docs/execution/V1_01_D_OUTBOX_RECOVERY.md
- docs/execution/V1_01_D_FINAL_AUDIT.md
- ADR-0003, ADR-0009
