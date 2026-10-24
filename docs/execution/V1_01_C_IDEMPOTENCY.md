# V1-01-C — IDEMPOTENCE, RETRIES ET CONCURRENCE

- **Date** : 2026-10-24
- **Engine** : Hatchet v0.110.5 embedded
- **Ledger** : PostgreSQL vululu_hatchet_poc
- **Verdict** : PASS sur C2, C3, C6, C7

## 1. C2 — effet unique sous retry

Run : poc-idem-1, projet poc-project-idem, mode transient.

Le task generate échoue volontairement :
- tentative 0 : erreur transiente avant les effets ;
- tentative 1 : effet SCENE-001 et SCENE-002 déjà persistés, puis erreur ;
- tentative 2 : les clés existent, aucun doublon, terminaison.

État observé :

    poc_run: poc-idem-1 | succeeded
    generate: attempt = 3
    scene effects = 5 (SCENE-001..005, une ligne chacune)
    cost events = 1
    approval = approved
    transfer = succeeded

La première erreur ne crée aucun effet ; la deuxième laisse des effets déjà présents ; le retry les réutilise. Le coût n'est comptabilisé qu'une fois.

## 2. C3 — erreur permanente

Run : poc-perm-2, projet poc-project-perm-2, mode permanent.

Le task generate lève NonRetryableError. Hatchet ne retente pas indéfiniment. Le handler onFailure projette l'échec.

État observé :

    poc_run: poc-perm-2 | failed
    steps:
      prepare | succeeded
      route   | succeeded
      failure | failed
    effects = 1 (route seulement)
    generate n'a créé aucun effet de scène

## 3. Retry transitoire et backoff

Dans C2, le worker a exécuté generate plusieurs fois avec backoff configuré factor=2, maxSeconds=2. Les logs worker montrent :
- transient_generation_failure ;
- transient_after_effect_should_not_duplicate ;
- puis terminaison réussie.

Le retry est observable techniquement (tentatives), mais l'effet métier reste unique.

## 4. C6 — deux productions concurrentes

Deux drivers lancés simultanément sur le même projet poc-project-conc.

Résultat :

    poc-conc-a | waiting_approval (gagnant)
    poc-conc-b | failed, task prepare = run_already_active_for_project

Le run b a été rejeté par la contrainte unique PostgreSQL sur les runs actifs, pas par un verrou mémoire. L'état Hatchet de b est FAILED ; le task on-failure est COMPLETED. Le nombre de runs actifs pour le projet est resté 1.

## 5. C7 — budget

Run : poc-budget-1, budget 1 cent, modèles à 2 et 5 cents.

Le routeur échoue avant tout effet de scène. Le handler onFailure projette l'échec.

État observé :

    poc_run: poc-budget-1 | failed
    scene effects = 0
    cost events = 0
    steps: prepare succeeded, failure failed

Aucune dépense n'est enregistrée pour un run refusé, et aucun événement de coût n'est dupliqué.

## 6. Conclusion

Les effets métier sont protégés par des clés uniques persistantes ; les retries techniques peuvent se répéter sans doubler les scènes, les approbations, les transferts ou les coûts. La concurrence est refusée par une contrainte PostgreSQL durable. Ces expériences sont PASS.
