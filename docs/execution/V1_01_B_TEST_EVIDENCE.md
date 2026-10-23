# V1-01-B — PREUVES ET LIMITES

- **Date** : 2026-10-23
- **Branche** : v1-01-b-agentic-capabilities
- **Base** : 429a93e
- **Périmètre** : T-014 à T-017
- **Verdict** : GO CONDITIONNEL

## 1. Tests

| Contrôle | Résultat |
|---|---|
| pnpm typecheck | PASS, 7 projets |
| pnpm test | PASS, 150 tests, 16 fichiers |
| pnpm lint | PASS, 0 erreur / 39 warnings |
| pnpm build | PASS, API + Next.js |
| Playwright E2E | PASS, 1/1, 1,3 min, projet cmvlb6l07000fhaksgyhea7jy |
| Migration sur copie V0 | PASS |
| Scan secrets | PASS, 206 fichiers |
| GitHub Actions | NOT_RUN |

Détail : 78 Domain (71 V1-00 + 7 agentic), 20 infrastructure, 23 sécurité, 10 API, 1 média, 10 A.1, 8 B.

## 2. Tests B

- versionnement AgentConfigVersion et checksums ;
- promotion explicite et rollback ;
- gel de version active ;
- refus configuration à un non super-admin ;
- filtrage capacité/licence/qualité/coût ;
- classement déterministe ;
- primaire + fallback tracés ;
- fallback exécuté si primaire en échec et coût enregistré ;
- budget insuffisant refusé ;
- modèle non qualifié refusé.

## 3. Preuves API

- agent 4b6c21ef-21f2-46a9-8897-3b13d58542d0 ;
- config v1 c5680bec-ddb2-47ec-8634-9e1e615b2de7 ;
- config v2 31c30abd-5730-4c72-b246-0f290d0dfd08 ;
- promotion v2 puis rollback v1 confirmés par activeConfigVersionId ;
- provider mock-1792779830200 créé, désactivé, routage 400, réactivé ;
- deux modèles primary/fallback, décision primaire + fallback ;
- exécution mock costCents=2 ;
- CostEvent provider=mock-1792779830200, model=primary, units=1, amountCents=2.

## 4. Migration

20261023183000_v1_01_b_agentic_capabilities testée sur copie de V0 :

- 16 projets ;
- 23 JobRun legacy ;
- 5 tables AgentDefinition, AgentConfigVersion, Provider, Model, RoutingDecision ;
- aucune donnée supprimée.

## 5. NOT_RUN / hors périmètre

- T-018 planification DAG et exécution en étapes : NOT_RUN.
- Intégration agent config dans le snapshot de production : NOT_RUN.
- Provider réel, qualification réelle : NOT_RUN ; mock déterministe uniquement.
- Hatchet, retries durables, reprise crash : NOT_RUN.
- UI admin, MCP : NOT_RUN.
- Quotas globaux/par projet : NOT_RUN ; budget par routage seulement.
- CI GitHub : NOT_RUN.
- Rate limiting/purge sessions : NOT_RUN.

## 6. Conclusion

Le socle Agentic Capabilities est réel et testé. Il ne couvre pas la planification, la durabilité, les providers réels ni le branchement au workflow de production. Verdict GO CONDITIONNEL, sans masquer ces dettes.