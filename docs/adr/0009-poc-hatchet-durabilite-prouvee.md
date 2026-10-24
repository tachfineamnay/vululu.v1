# ADR-0009 — POC Hatchet : durabilité prouvée, packaging Docker conditionnel

- **Statut** : Acceptée sous condition
- **Date** : 2026-10-24
- **Décideurs** : Lead Architecture, Backend, QA
- **Sources** : ADR-0003, mission V1-01-C, preuves POC

## Contexte

L'ADR-0003 retenait Hatchet sous condition d'un POC bloquant : reprise après crash, idempotence d'un effet métier, approbation humaine persistante, correction ciblée. Le POC C devait fournir ces preuves avant le lot D.

Le POC a été exécuté avec Hatchet v0.110.5 et le SDK TypeScript 1.43.0, avec un worker Node séparé et un ledger PostgreSQL. Docker Desktop était indisponible sur l'hôte Windows (système de fichiers containerd en lecture seule, disque WSL sans FS) ; le POC a utilisé le sidecar embedded officiel sous WSL2, sans formatage ni destruction des données Docker existantes.

## Décision

1. Le POC C est reconnu GO CONDITIONNEL : les garanties de durabilité sont démontrées, le packaging Docker local ne l'est pas.
2. Les preuves retenues sont : crash worker réel, reprise avec étapes conservées, effets métier uniques, retries transitoires, NonRetryable, approbation persistante après arrêt worker, timeout, worker indisponible, concurrence et budget.
3. Le moteur Hatchet reste le candidat pour l'orchestration durable V1, derrière OrchestratorPort.
4. Aucun SDK Hatchet n'entre dans Domain ou Application. Le POC reste isolé.
5. Le lot D ne démarre pas automatiquement tant que la condition Docker n'est pas acceptée explicitement ou résolue.
6. Le compose Docker pinned v0.110.5 est fourni ; il devra être exécuté sur un hôte Docker sain et les scénarios C1/C4 rejoués avant de déclarer la condition levée.

## Conséquences

- Positives : preuves réelles de durabilité, choix Hatchet maintenu, worker séparé, états persistants, idempotence et approbation durable validés.
- Négatives : environnement Windows/WSL spécifique, sidecar non supervisé, Docker non validé, POC non intégré à l'API.
- Impacts : checkpoint C fea95ed (code) et 85cd3b0 (docs) ; D reste READY_FOR_D conditionnel.

## Alternatives envisagées

- Intégrer D directement sans POC : rejeté.
- Attendre Docker sans preuve de durabilité : rejeté, le POC embedded apporte les preuves.
- Remplacer Hatchet par un orchestrateur maison : rejeté à ce stade, la cible reste Hatchet derrière port.

## Références

- docs/execution/V1_01_C_FINAL_VERDICT.md
- docs/execution/V1_01_C_POC_ARCHITECTURE.md
- docs/execution/V1_01_C_CRASH_RECOVERY_EVIDENCE.md
- docs/execution/V1_01_C_IDEMPOTENCY.md
- docs/execution/V1_01_C_APPROVAL_TIMEOUT_BUDGET.md
- docs/execution/V1_01_C_OPERATIONS.md
- poc/hatchet/
- ADR-0003