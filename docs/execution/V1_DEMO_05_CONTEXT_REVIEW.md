# V1-DEMO — Relecture et révisions du contexte

- Date : 2026-11-04 ; complément fonctionnel du lot 5.
- Exigences : PRD-02, CDC-F-010/011/012, CDC-N-001/002/003/005.
- Contrat : [relecture de contexte](../releases/V1_DEMO_CONTEXT_REVIEW_CONTRACT.md).

## Comportement livré

L’écran Contextes expose une vraie fiche éditable et l’historique de ses révisions. Une proposition explicitement MOCK utilise uniquement les champs enregistrés. Les informations saisies sont séparées des hypothèses génériques d’audience et de ton. Le site déclaré n’est jamais consulté, aucune information distante ni étude de clientèle n’est inventée. Une proposition n’écrit pas le contexte ; ses hypothèses peuvent être reprises dans les seuls champs vides du brouillon.

Chaque édition exige relecture et confirmation explicite. Le serveur applique le même contrat, vérifie la propriété et verrouille la fiche lors de l’ajout transactionnel d’une révision. Une édition concurrente différente répond 409 ; le replay du même contenu ne crée pas une deuxième révision. Aucun ancien snapshot de run ou de contexte n’est réécrit. Les changements concernent les prochains lancements.

Les tailles sont bornées dans le domaine et le contrat HTTP ; les couleurs sont limitées aux codes hexadécimaux #RGB/#RRGGBB, sans URL CSS active. Les formulaires affichent les anciennes couleurs courtes en notation complète. Aucun SDK fournisseur, nouveau schéma DB, appel IA ni coût fournisseur ajouté. Le port d’analyse est remplaçable et les cas d’usage sont accessibles au futur transport MCP.

## Preuves

| Vérification | Résultat observé |
|---|---|
| Tests de comportement avant corrections de validation/checksum | 8 FAIL / 3 PASS ; les 7 bornes/couleurs et le checksum canonique manquaient |
| API avant raccordement des routes | 5 FAIL / 1 PASS ; les nouveaux endpoints répondaient 404 |
| Domaine + cas d’usage + API ciblés | 17 PASS |
| Régression domaine/application/API contexte | 132 PASS, 17 fichiers |
| Régression complète `pnpm exec vitest run tests --reporter=dot` | **290 PASS / 2 SKIP**, 35 fichiers, 262,41 s |
| Test réseau de la simulation | Serveur HTTP privé de test : zéro requête reçue lors de l’analyse |
| Propriété/CSRF/confirmation | PASS, y compris absence de bypass super-admin |
| Ancienne révision et snapshot de run après édition | PASS : identiques en base |
| Replay et édition concurrente différente | PASS : aucune révision doublée, conflit 409 |
| Typecheck complet et lint strict | PASS |
| Build API/Web | PASS ; rebuild Web après correction des libellés accessibles et du style |
| E2E sur build production | PASS, 15,5 s : proposition, reprise de brouillon, confirmation, reload, historique et mobile |
| E2E final + verticale existante sur le dernier build | 2 PASS, 39,7 s ; contrôle couleur ≥44 px, puis vidéo/correction/approbation/transfert MOCK |
| Frontières / documents fondateurs | PASS : 22 fichiers domaine, 22 application, 9 empreintes intactes |
| Scan de secrets final | PASS, 442 fichiers |

Un import de fixture a d’abord échoué à résoudre le package domaine depuis la racine ; corrigé en import local, sans être compté comme preuve métier. Le premier E2E a trouvé un label natif ambigu sur le textarea après remplissage ; un libellé accessible explicite l’a corrigé. Les captures finales .v1/context-review.png et .v1/context-color.png ont été inspectées après correction de la hauteur du sélecteur de couleur et affichage de sa valeur ; rejeu de capture PASS, 14,5 s.

Les 2 SKIP concernent S3 et ne sont pas comptés verts. Les traces réseau Playwright restent désactivées ; les captures et fixtures sont locales et fictives. Qualification Docker/Linux/Coolify/S3 : NOT_RUN pour cette tranche.

## Limites et suite

La proposition non sauvegardée est temporaire : recharger abandonne le brouillon. La simulation propose des exemples génériques ; elle n’analyse ni document binaire, ni site distant. La connexion IA réelle reste hors recette. Brief/wizard complet, formats de sortie, audio, revue par scène, MCP et exploitation restent ouverts dans le plan V1-DEMO.

L’observation du classement historique des erreurs Zod/domaine en 500 dans un événement de log, avant réponse HTTP correcte 400, reste à traiter au lot observabilité. Aucun déploiement, push ni publication externe effectué.

## Rollback

Redéployer le code précédent en gardant les révisions et données enregistrées. Aucune migration à annuler. Ne pas réécrire l’historique ni supprimer le travail enregistré ; vérifier login, liste de contextes et lecture des projets conservés.
