# V1-01-D — PREUVES DE TEST

- **Date** : 2026-10-24
- **Commit code D** : 1110240
- **Branche** : v1-01-d-durable-orchestration

## 1. Executions automatiques

| Commande | Resultat |
|---|---|
| pnpm typecheck | PASS (7 packages) |
| pnpm test | 158 tests PASS, 18 fichiers |
| pnpm build | PASS (API + Next 16.4.2) |
| pnpm lint | PASS, 0 erreur, 40 warnings existants ou POC |
| prisma migrate deploy (test) | PASS |
| prisma migrate deploy (dev) | PASS |
| tests cibles D | 8 PASS |
| check-secrets | PASS (a confirmer dans le commit final) |

Tests D :

- production-state.test.ts : 4 tests ;
- v1-01-d-durable.test.ts : 4 tests (outbox transactionnel/reconciliation, pipeline complet, correction/invalidation, fallback/budget).

## 2. Campagne verticale reelle

| Scenario | Run / projet | Resultat |
|---|---|---|
| Production 10 s | cmvmp0xsc000eha4kbxqz6wap | waiting_approval puis succeeded |
| Production 50 s | cmvmp4d0d002aha4kveiogven | waiting_approval puis succeeded |
| Correction SCENE-003 | cmvmp310n001aha4k8llb4mx7 | master v2, v1 conserve, approbation v1 invalidee |
| Crash worker | cmvmp9s8g0033ha4k8pb86lj5 | render repris, 5 scenes, succeeded |
| Concurrence | 10s seconde demande | HTTP 409 job_running |
| Fallback | cmvmpk5bg0010hayslts4bgme | mock-b, usedFallback true |
| Budget insuffisant | cmvmpm3i5001whays0hmh3yaa | failed, 0 scene, 0 cout |
| Panne Hatchet | cmvmpv0i50004havwhoihhyu8 | outbox pending puis reconcile, 1 seul workflow, succeeded |
| Timeout | cmvmq03qq000bhazsjbi54ryg | timed_out apres Task exceeded timeout of 2s |

## 3. Commandes de lancement utilisees

    wsl -d docker-desktop -u hatchet -e sh -c 'sleep 2147483647 | ...hatchet-embedded-sidecar...'
    node poc/hatchet/scripts/tcp-proxy.cjs <WSL_IP>  # non utilise dans la derniere config : WSL IP directe
    ORCHESTRATOR_MODE=hatchet pnpm --filter @vululu/api start
    pnpm --filter @vululu/api worker

En execution locale, le SDK cible :

    HATCHET_CLIENT_HOST_PORT=<WSL_IP>:7078
    HATCHET_CLIENT_API_URL=http://<WSL_IP>:28244
    HATCHET_CLIENT_TLS_STRATEGY=none

Les details d exploitation sont dans V1_01_D_ARCHITECTURE.md.

## 4. NON-RUN explicites

- Docker Compose Hatchet : non execute (Docker Desktop indisponible, disque WSL sans FS) ; aucune reinitialisation destructive.
- Redemarrage complet du moteur Hatchet : NON-RUN, a faire en certification d infrastructure.
- Annulation end-to-end via API : NON-RUN ; cancelRun et l etat cancelled existent mais ne sont pas certifies.
- Postiz reel, provider IA reel, S3 externe : NON-RUN par contrainte de perimetre.
- Test de charge multi-workers : NON-RUN.

## 5. Points de vigilance detectes et corriges

- Deux productions pouvaient coexister si la premiere etait waiting_approval : index actif elargi et migration 20261024190000.
- Un echec de dispatch pouvait laisser l outbox dans dispatching : statut remis pending et recovery au demarrage.
- Une approbation pouvait perdre son signal en cas de crash : reconciliationApprovals ajoutee.
- Les tentatives de step rejouees incrementent desormais attempts et tracent la reprise.
