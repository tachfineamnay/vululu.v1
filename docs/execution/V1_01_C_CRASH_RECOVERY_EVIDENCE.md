# V1-01-C — PREUVE CRASH RÉEL ET REPRISE

- **Date** : 2026-10-24
- **Engine** : Hatchet v0.110.5 embedded sidecar WSL2
- **Worker** : processus Node/TS séparé, Windows
- **Run** : poc-crash-1 (Hatchet 648541cd-8668-4855-917d-d1fbbfb78e15)
- **Projet POC** : poc-project-crash
- **Verdict expérience** : PASS

## 1. Protocole

1. Démarrer le worker.
2. Démarrer un workflow durable avec cinq scènes.
3. Attendre l'effet persistant de SCENE-001.
4. Tuer brutalement le processus worker avec Stop-Process -Force.
5. Vérifier l'état persistant avant reprise.
6. Redémarrer le worker avec la même configuration.
7. Vérifier la reprise et l'unicité des effets.
8. Pousser l'approbation durable et vérifier la terminaison.

## 2. État avant crash

Commande de lancement :

    Invoke-PocDriver start --runId poc-crash-1 --projectId poc-project-crash --crash

Effet observé avant kill :

    scene:poc-crash-1:SCENE-001

Commande de kill :

    Stop-PocWorker

Résultat :

    WORKER_STOPPED=9944

État ledger après kill :

    poc_run: poc-crash-1 | running
    poc_step:
      prepare | succeeded | attempt 1
      route   | succeeded | attempt 1
    poc_effect:
      route:poc-crash-1 | route_decision
      scene:poc-crash-1:SCENE-001 | scene

Le processus worker n'était plus vivant. Les étapes prepare et route étaient conservées ; generate n'était pas finalisé.
## 3. Après redémarrage

Le worker a été redémarré avec la même configuration (PID 19316), sans relancer le workflow manuellement.

État observé :

    poc_run: poc-crash-1 | waiting_approval

    poc_step:
      prepare  | succeeded | attempt 1 | timestamp 09:47:40
      route    | succeeded | attempt 1 | timestamp 09:47:41
      generate | succeeded | attempt 2 | timestamp 09:48:22
      validate | succeeded | attempt 1
      finalize | succeeded | attempt 1
      approval | waiting   | attempt 1

    scene effects: 5 exactement
      SCENE-001..SCENE-005, une seule ligne chacune

Interprétation :

- prepare et route n'ont pas été rejoués : leurs timestamps et attempts sont inchangés.
- generate a été repris avec attempt 2.
- l'effet SCENE-001 n'a pas été dupliqué : la clé d'idempotence a empêché la deuxième insertion.
- le run a atteint waiting_approval et les cinq effets sont uniques.

## 4. Terminaison après approbation durable

L'événement poc-approval-poc-crash-1 a été poussé après le redémarrage du worker. L'approbation a été persistée puis le transfert mock a terminé le run.

État final :

    poc_run: poc-crash-1 | succeeded
    approval: approved
    step transfer: succeeded
    cost: cost:poc-crash-1:transfer = 1 ligne, 1 cent

## 5. Worker indisponible

Expérience complémentaire :

- worker arrêté ;
- run poc-unavail-1 déclenché ;
- aucune ligne poc_run immédiatement (worker absent) ;
- worker redémarré ;
- run traité, approval poussée, run succeeded.

Preuve : PROCESSED_AFTER_WORKER_START=True, COMPLETED_AFTER_RESTART=True.

## 6. Conclusion

Le crash n'était pas un arrêt gracieux : le processus worker a été tué par Stop-Process -Force. La reprise a conservé les étapes validées, repris l'étape incomplète et préservé l'unicité des effets. Le run a terminé après redémarrage et approbation. Expérience PASS.
