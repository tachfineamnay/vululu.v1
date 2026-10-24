# V1-01-D — OBSERVABILITE

- **Date** : 2026-10-24
- **Commit code D** : 1110240

## 1. Correlations disponibles

Chaque run peut etre relie par :

- jobRunId (JobRun.id) ;
- workflowRunId (JobRun.workflowRunId, rempli par le dispatcher) ;
- projectId ;
- stepRunId / StepRun.name ;
- outbox idempotencyKey ;
- traceId logique = workflowRunId ou outbox id (pas de colonne dediee) ;
- agentDefinitionId, agentConfigVersionId, agentConfigChecksum ;
- providerKey, modelKey, fallback ;
- attempt (StepRun.attempts) ;
- status metier et etat technique Hatchet ;
- error ;
- estimatedCents, actualCents, CostEvent ;
- artifactVersionId, checksum, masterVersion.

## 2. Tables et separation

| Donnee | Stockage |
|---|---|
| Etats et transitions metier | JobRun, StepRun, RunStateEvent |
| Sorties d etapes | StepRun.output |
| Routage fige | RunRoutingSnapshot, RoutingDecision |
| Couts mock | CostEvent.idempotencyKey |
| Historique workflow | Hatchet details / evidence route |
| Audit metier | AuditEvent |
| Artefacts | SceneVersion, ArtifactVersion, RunArtifact |

## 3. Preuves

- 172 RunStateEvent observes sur la campagne D.
- StepRun.output conserve les scenes rendues et permet la reprise apres crash.
- RunRoutingSnapshot contient la config agent et le provider/model effectif.
- CostEvent totalise 10 evenements mock.
- Route GET /api/projects/:id/runs/:jobRunId/evidence expose les transitions, le routage et les outputs de step apres verification proprietaire.
- Les IDs de preuve sont dans V1_01_D_TEST_EVIDENCE.md.

## 4. Logs et secrets

- Le worker loggue les taches et les erreurs sans token Hatchet.
- Le token Hatchet reste dans l environnement du processus, jamais dans les fichiers commités.
- Les logs de run ne contiennent ni mot de passe, ni secret de session.
- Aucun fournisseur reel n est appele.

## 5. Limites

- Pas de metriques Prometheus ni de duree stockee explicitement ; les durees se derivent de createdAt/startedAt/finishedAt et des evenements Hatchet.
- Pas de collecteur de traces distribue ; la correlation est workflowRunId/jobRunId.
- Pas de dashboard Grafana.
- Le scan secrets reste la protection principale.
