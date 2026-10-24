# V1-01-D — APPROBATION DURABLE ET SECURITE

- **Date** : 2026-10-24
- **Commit code D** : 1110240
- **Portee** : locale, aucun transfert Postiz reel

## 1. Approbation exacte

ProductionUseCases.approve conserve les invariants existants :

- projet possede par l acteur ;
- master courant obligatoire ;
- artifactVersionId exact ;
- checksum exact ;
- QA PASS obligatoire ;
- approbation creee/mise a jour sur la version exacte.

L approbation est ensuite signalee au workflow durable par OutboxApprovalSignal et Hatchet events.

## 2. Worker durable

La tache approval est une durableTask :

    await ctx.waitForEvent(production-approval:<jobRunId>, ..., lookback 24h)

Le worker n est pas occupe pendant l attente humaine. Apres evenement, confirmApproval verifie a nouveau latestMaster, checksum, QA et invalidatedAt. Un evenement brut Hatchet ne suffit donc pas : l etat metier PostgreSQL reste la source de verite.

## 3. Preuves

- Run cmvmp0xsc000eha4kbxqz6wap : master v1, approbation puis transfert.
- Correction : master v1 approbation invalidee, master v2 actif.
- La correction SCENE-003 a cree une version de scene v2 et un master v2 sans ecraser le v1.
- L approbation du master v1 porte invalidatedAt non nul apres correction.
- Le transfert mock est unique par approbation.
- Les evenements d approbation sont materialises dans OrchestrationOutbox avec une cle unique.

## 4. Securite existante

- RBAC serveur, filtrage proprietaire, CSRF double-submit et IDOR restent ceux de V1-00.
- Les tests de securite V1 (23 tests) passent toujours dans la suite complete.
- Aucun secret dans les logs, les documents ou les commits.
- Aucun endpoint MCP n accede directement a PostgreSQL ou Hatchet.
- Postiz reste exclusivement mock.

## 5. Cas couverts / non couverts

Couverts : approbation apres redemarrage worker, approbation exacte, invalidation par correction, signal at-least-once, transfert mock sans duplication.

Non couverts end-to-end : approbation repetee via API, approbation perimee via API, utilisateur non autorise sur cette route, annulation pendant l attente.

## 6. Dette

L outbox d approbation est cree apres le commit de l approbation. La reconciliation au demarrage repare la fenetre de crash, mais l atomicite stricte approval+outbox reste une amelioration future.
