# V1-01-D — AUDIT FINAL ET VERDICT

- **Date** : 2026-10-24
- **Branche** : v1-01-d-durable-orchestration
- **Base C** : 87eb18d
- **Commit code D** : 1110240
- **Commit docs D** : a completer par le commit final
- **Verdict** : GO CONDITIONNEL
- **Portee** : architecture locale ; pas de production, pas de deploiement

## 1. Definition of Done

| Exigence | Statut | Preuve |
|---|---|---|
| Pipeline media V1 via Hatchet Embedded | PASS | 10 s, 50 s, correction |
| Rendu hors processus API | PASS | worker Node separe |
| Use cases independants de Hatchet | PASS | audit imports |
| Snapshots et versions preserves | PASS | master v1 conserve, SCENE-003 v2, snapshots checksum |
| Agent config et routing integres | PASS | RunRoutingSnapshot, fallback mock |
| Operations sensibles idempotentes | PASS | cles scene/master/cout/approval/transfer |
| Soumission durable et reconciliable | PASS | outbox transactionnel, panne 59999, reconciliation |
| Reprise crash sur pipeline V1 | PASS | run cmvmp9s8g..., render 5 scenes apres kill |
| Approbation exacte et durable | PASS | waiting_approval, signal outbox, v1 invalidee par correction |
| Budgets et couts mock coherents | PASS | fallback mock-b, budget refuse, 0 cout en refus |
| Parcours 10/50 s | PASS | deux masters QA PASS |
| Invariants metier critiques | PASS | versions, IDs, QA, approbation exacte |

## 2. Audit des frontieres

- packages/domain et packages/application n importent pas @hatchet-dev/typescript-sdk.
- Le SDK est confine a apps/api/src/infrastructure/durable/hatchetOrchestratorAdapter.ts et apps/api/src/worker/pipeline.ts.
- Le worker est un processus separe (apps/api/src/worker/main.ts) ; Fastify ne rend pas de media.
- Les use cases metier ne dependent pas de Prisma ni de Hatchet.
- Postiz reste mock ; aucun appel reseau externe payant.

## 3. Migrations et donnees

- 20261024180000_v1_01_d_durable_orchestration : additive (colonnes, tables, index).
- 20261024190000_v1_01_d_active_run_scope : remplace l index JobRun_one_active_per_project pour inclure waiting_approval/recovery_pending ; aucune donnee detruite.
- Aucune donnee V0, projet historique ou artefact n est supprime/reinitialise.
- Docker/WSL n a pas ete reformate.

## 4. Risques residuels

| Risque | Gravite | Condition |
|---|---|---|
| Docker non valide | elevee pour deploiement | certifier le compose sur hote sain |
| Redemarrage moteur Hatchet non teste | moyenne | test de certification infrastructure |
| Sidecar embedded non supervise | moyenne | service/supervision avant production |
| Annulation end-to-end non jouee | moyenne | valider cancelRun et l etat cancelled via API |
| Approbation outbox non atomique | faible | reconciliation existante ; amelioration ulterieure |
| Statut projet failed apres echec d un nouveau run | faible | revoir la politique de statut projet |
| Trace/duree non stockees comme colonnes dediees | faible | correlation workflow/outbox |
| Test de charge absent | faible | campagne dediee |

## 5. Conditions du verdict

1. Ne pas presenter Docker comme valide ; le compose reste NOT_RUN.
2. Valider un redemarrage complet du moteur Hatchet avant certification infrastructure.
3. Implementer et tester l annulation via le port API (cancelRun + etat cancelled).
4. Definir la supervision des workers (service ou orchestrateur local).
5. Revoir la politique de statut projet lors d un echec de nouveau run sur projet deja transfere.
6. Ne pas utiliser D comme GO production ; la production reste non autorisee.

## 6. Rollback

Le mode ORCHESTRATOR_MODE=local conserve le chemin historique. Les tables D sont additives et peuvent rester en place ; aucun rollback SQL destructif n est necessaire. La branche D peut etre abandonnee sans toucher V0/main.

## 7. Verdict

**GO CONDITIONNEL** pour l architecture locale. Le pipeline V1, le worker separe, l outbox, la reprise crash, l approbation durable, le routage et les parcours 10/50 s sont prouves. Les limites d environnement et de couverture restent explicitement non certifiees.

**READY_FOR_E** conditionnel, non demarre : aucun prompt E n est present dans une file explicitement autorisee.

Aucun push, merge, deploiement, provider paye, Postiz reel ou S3 externe.
