# V1-DEMO — Invocations MOCK bornées et résultats validés

- Date : 2026-11-05 ; tranche 6F, ADR 0025 ; preuves locales dans `docs/execution/V1_DEMO_06F_INVOCATION_FAILURES.md`.
- Exigences : PRD-07/11/13/14, CDC-F-031/032/033/043/050/061, CDC-N-002/004/005/007.

Les invocations de capacité restent MOCK et sans réseau. Un résultat doit identifier le fournisseur et le modèle sélectionnés, porter mock=true, un objet output JSON borné, un coût entier non négatif et une latence finie non négative. Un résultat invalide est un échec d’invocation, jamais un succès de run. Les coûts du workflow durable proviennent toujours du catalogue MOCK figé, comme au lot 6B ; la réponse ne peut pas augmenter ce tarif.

Le routeur administrateur vérifie aussi le coût MOCK retourné contre le plafond demandé avant d’enregistrer un coût de succès. Un dépassement tente au plus un fallback admissible puis reste un échec si son résultat dépasse encore le plafond. Les tentatives MOCK échouées ne sont pas facturées ; cela ne décrit pas la facturation d’un service réel.

Un délai de réponse borne chaque tentative. Le port reçoit un AbortSignal et doit coopérer à l’annulation ; un résultat tardif est ignoré et ne crée ni décision réussie, ni coût, ni étape validée. Cette garantie porte sur les adaptateurs MOCK de la démo ; elle ne qualifie aucun fournisseur réel ni effet distant. Le routeur tente au plus le modèle principal puis un fallback admissible selon les droits et le plafond figés. Une absence de fallback conserve la cause initiale de l’échec.

Les scénarios de panne, timeout et résultat invalide sont capturés au lancement, jamais relus depuis l’environnement par un run en file. Une politique historique absente reste refusée. Les anciens snapshots conservant une politique mais sans nouveaux champs utilisent le délai de compatibilité documenté ; leur checksum n’est pas réécrit. Les erreurs et journaux ne contiennent pas les données renvoyées ni le contenu privé du brief.

Les contrôles attendus couvrent : nominal, panne/fallback, timeout/fallback et annulation, réponse invalide/fallback, échec terminal sans fallback, refus de candidat hors budget ou droits, résultat tardif sans coût, snapshot inchangé et reprise sur checkpoint sans nouvelle invocation. Les journaux HTTP doivent indiquer le même statut et code d’erreur que la réponse effectivement envoyée, y compris pour les validations domaine et contrat.

Le délai capturé est de 5000 ms par tentative ; compatibilité identique pour une ancienne politique sans ce champ. La borne JSON porte sur 65536 octets UTF-8, avec refus des tableaux comme racine, valeurs non sérialisables, nombres non finis, références circulaires et tailles excessives. Les corps ne sont pas recopiés dans les erreurs. La politique de fallback expose seulement le code de cause primaire. Les variables opérateur `DURABLE_MOCK_FAIL_MODEL`, `DURABLE_MOCK_TIMEOUT_MODEL`, `DURABLE_MOCK_INVALID_MODEL` contiennent des listes de modelKey séparés par virgule et sont lues uniquement à la capture. Aucun fournisseur IA, compte externe ou coût réel ajouté.
