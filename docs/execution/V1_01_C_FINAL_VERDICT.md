# V1-01-C — VERDICT FINAL

- **Date** : 2026-10-24
- **Branche** : v1-01-c-hatchet-poc
- **Commit POC** : fea95ed
- **Base** : v1-01-b-agentic-capabilities @ 5827a19
- **Gate D conservé** : v1-01-d-gate-blocked @ 9b35d1e
- **Verdict** : GO CONDITIONNEL
- **Suite** : READY_FOR_D, sans démarrage effectif de D

## 1. Matrice des expériences

| Test | Résultat | Preuve principale |
|---|---|---|
| C1 crash réel du worker | PASS | worker tué PID 9944 ; prepare/route conservés ; generate attempt 2 ; 5 effets uniques ; run succeeded |
| C2 idempotence | PASS | poc-idem-1 : generate attempt 3 ; 5 effets scène uniques ; 1 coût |
| C3 retry transitoire | PASS | erreurs transientes rejouées ; terminaison réussie |
| C3 erreur définitive | PASS | NonRetryableError ; run failed ; failure step ; aucun effet scène |
| C4 approbation durable | PASS | pending avant arrêt worker ; worker redémarré ; approbation poussée ; run succeeded |
| C5 timeout | PASS | timeout-step FAILED, erreur Task exceeded timeout of 2s |
| C5 worker indisponible | PASS | run absent avant worker ; traité après redémarrage ; succeeded |
| C6 concurrence | PASS | un seul run actif ; second FAILED run_already_active_for_project |
| C7 budget | PASS | refus avant effet ; 0 scène ; 0 coût |
| Docker packaging | NOT_RUN | Docker Desktop read-only / disque WSL sans FS ; alternative embedded exécutée |

## 2. Audit des frontières

- Aucun import Hatchet dans packages/domain ou packages/application.
- Le POC est isolé dans poc/hatchet.
- Le worker est un processus Node séparé de l'API.
- Le Domain existant routeCapability est réutilisé pour le routage mock.
- Le ledger POC est une base PostgreSQL séparée.
- Aucun appel provider payant, aucun Postiz réel, aucun S3.
- Aucune migration destructive ; le compose Docker est additif.
- V0 ddda015 intacte ; main 69c6549 inchangé ; aucun push.

## 3. Preuves d'exécution

- Hatchet engine v0.110.5, SDK TypeScript 1.43.0, Node 24.21.0.
- Sidecar embedded officiel, worker Windows séparé, ledger vululu_hatchet_poc.
- Crash C1 : poc-crash-1, Hatchet 648541cd-8668-4855-917d-d1fbbfb78e15.
- Approbation C4 : poc-approval-1, Hatchet 991ba610-a523-4842-a3e0-d756b66dc634.
- Timeout C5 : Hatchet 2661976b-2ca8-4533-9901-6ebbb4f36829.
- Concurrence C6 : poc-conc-a gagnant, poc-conc-b FAILED.
- Budget C7 : poc-budget-1 failed, 0 effet, 0 coût.

## 4. Conditions du GO CONDITIONNEL

1. **Docker** : le compose pinned doit être exécuté sur un hôte Docker sain (Linux/macOS ou Docker Desktop réparé) et C1/C4 rejoués. Le disque Docker WSL actuel ne doit pas être formaté sans décision explicite.
2. **Packaging** : le sidecar embedded est officiel mais n'est pas un service supervisé ; avant D, décider si l'environnement local Windows/WSL est accepté pour les preuves D ou si Docker est obligatoire.
3. **Supervision** : le worker est relancé manuellement dans le POC. D devra définir le redémarrage des workers et la détection des runs bloqués.
4. **Intégration** : le POC n'est pas branché à l'API V1, conformément au périmètre C. D devra le faire via OrchestratorPort.
5. **Périmètre D** : le prompt D est disponible dans la conversation, mais D n'est pas démarré car le verdict est conditionnel. READY_FOR_D est déclaré, pas GO D.

## 5. Dettes résiduelles

- Docker non validé sur cette machine.
- Sidecar embedded non supervisé.
- Approbation mock, non signée cryptographiquement.
- Coûts mockés, aucun provider réel.
- Timeout d'une étape seulement ; pas de reaper global des runs bloqués.
- POC DB séparée, sans migration versionnée (schéma créé par seedSchema).
- Aucun test de charge, de sécurité réseau WSL ou de redémarrage de l'engine.
- La configuration Docker compose contient des variables d'environnement, aucun secret commité.

## 6. Conclusion

Les garanties essentielles demandées sont démontrées sur un vrai moteur Hatchet : crash brutal et reprise, conservation des étapes, idempotence des effets, retries, approbation persistante, timeout, indisponibilité worker, concurrence et budget. Le seul écart est le packaging Docker local, non exécutable sur cet hôte sans risque pour les données Docker existantes.

Verdict : **GO CONDITIONNEL**. Le checkpoint C est exploitable, mais D ne doit pas démarrer sans accepter explicitement l'alternative embedded ou valider le compose Docker. Aucun push, merge ou déploiement.
