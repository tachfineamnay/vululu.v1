# V1-01-D — ORCHESTRATION MEDIA DURABLE

- **Date** : 2026-10-24
- **Commit code D** : 1110240
- **Engine** : Hatchet v0.110.5 embedded, WSL2
- **Worker** : apps/api/src/worker/main.ts (processus separe)
- **Verdict** : PASS sur la verticale locale

## 1. Contrat

DurableOrchestratorPort expose :

- submitStart
- signalApproval
- getRunStatus
- getRunEvidence
- cancelRun
- retryFailedStep
- resumeRun

HatchetOrchestratorAdapter est le seul import du SDK cote API. Le worker importe le SDK uniquement pour definir et executer le workflow.

## 2. Workflow

    validate-snapshot
      -> resolve-capabilities
      -> render-scenes
      -> assemble-master
      -> qa
      -> finalize
      -> approval (durable, waitForEvent)
      -> transfer (Postiz mock)

- validate-snapshot verifie le checksum du snapshot et passe le JobRun running.
- resolve-capabilities fige agent/config/provider/model/fallback/budget.
- render-scenes rend les cinq scenes, stocke chaque output dans StepRun.output et reprend apres crash.
- assemble-master et qa executent Sharp/FFmpeg dans le worker, jamais dans Fastify.
- finalize cree les versions de scene, le master, invalide les approbations et passe waiting_approval.
- approval utilise ctx.waitForEvent(production-approval:<jobRunId>) avec lookback 24h.
- transfer appelle PostizMockAdapter et complete le JobRun.

## 3. Production 10 secondes

Projet cmvmp0fvv0007ha4k0engk5vo, JobRun initial cmvmp0xsc000eha4kbxqz6wap.
Workflow Hatchet : dd0a8045-9cff-4842-85f2-62745a983d51.
Resultat : waiting_approval avec master v1 QA PASS, puis succeeded apres approbation exacte et transfert mock.
Duree observee des etapes de rendu/assemblage : de l ordre de 15 secondes pour 10 s de video.

## 4. Production 50 secondes

Projet cmvmp4cu20026ha4kra59j8gv, JobRun cmvmp4d0d002aha4kveiogven.
Scenes de 10 secondes, master v1 QA PASS.
Resultat : waiting_approval puis succeeded apres approbation. Le rendu reste hors du processus API.

## 5. Correction SCENE-003

Projet 10 s, JobRun cmvmp310n001aha4k8llb4mx7.
- SCENE-003 passe de v1 a v2.
- Les autres scenes restent en v1.
- Le master v1 est conserve ; le master v2 est cree.
- L approbation du master v1 est invalidee.
- Le nouveau master v2 est approuve et transfere.
Versions observees : master 1 et 2, SCENE-003 v1 et v2.

## 6. Crash worker reel

Projet cmvmp9s1b002zha4k4iop4c9i, JobRun cmvmp9s8g0033ha4k8pb86lj5.
- worker demarre avec DURABLE_SCENE_DELAY_MS=3000 ;
- apres l effet de SCENE-001, StepRun render-scenes = running, output scenes = 1 ;
- processus worker tue par Stop-Process -Force (PID 7944) ;
- JobRun reste running, aucun etat metier terminal force ;
- worker redemarre avec la meme configuration ;
- Hatchet re-assigne render-scenes ; l output deja persistant est reutilise ;
- render-scenes importe les 5 scenes puis succeeded ;
- reste du DAG termine jusqu a waiting_approval.

Le detail de la preuve est dans V1_01_D_TEST_EVIDENCE.md.

## 7. Concurrence

Deux demandes de production sont envoyees sur le meme projet.

- avant correction du perimetre actif, la deuxieme etait acceptee apres passage du premier run en waiting_approval ; ce defaut a ete detecte pendant la campagne ;
- l index JobRun_one_active_per_project couvre desormais waiting_approval et recovery_pending ;
- apres migration et redemarrage API, la deuxieme demande retourne HTTP 409 job_running ;
- un seul JobRun actif reste en base.

## 8. Timeout

Worker configure avec DURABLE_RENDER_TIMEOUT=2s et DURABLE_SCENE_DELAY_MS=5000.
JobRun cmvmq03qq000bhazsjbi54ryg : render-scenes echoue apres 3 tentatives avec Task exceeded timeout of 2s ; l etat metier est timed_out ; les etapes suivantes sont timed_out ; aucun master n est cree.

## 9. Limites

- Le worker est un processus unique non supervise.
- Un redemarrage complet du moteur Hatchet n a pas ete execute.
- L annulation end-to-end via API n a pas ete jouee ; cancelRun existe dans l adaptateur et la transition cancelled dans la machine, mais le scenario n est pas certifie.
- Les evenements Hatchet ne tuent pas le code JavaScript ; le timeout est constate par le moteur, le worker doit cooperer.
