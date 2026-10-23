# V1 TECHNICAL GAPS — VULULU AI

- **Date** : 2026-10-23
- **Baseline auditée** : v0-fullstack-sprint, code de92e24 + 5d2042a
- **Objet** : écarts entre la V0 fonctionnelle et la cible V1.2 (PRD, CDC, architecture, ADR)
- **Conclusion** : la V0 est une tranche verticale de référence, pas un socle V1. Les gaps ci-dessous sont classés par priorité.

## 1. Lecture du verdict

- La V0 prouve que le parcours contexte → brief → storyboard → PNG/MP4 → correction → QA → approbation → Postiz mock peut fonctionner.
- Elle ne prouve pas les exigences V1 : invitations, RBAC admin, providers réels, orchestration durable, S3, MCP, Postiz réel, coûts, audit, snapshots.
- Un développement V1 direct sur le code V0 créerait une dette structurelle difficile à récupérer.
- Un lot V1-00 de fondation est nécessaire avant les fonctionnalités V1.

## 2. Gaps P0 — bloquants avant toute fonctionnalité V1

### G-01 — Sessions non révocables

- Constat : @fastify/secure-session est un cookie chiffré stateless. Après logout, le serveur renvoie un cookie vide, mais un ancien cookie reste accepté.
- Preuve : ancien cookie rejoué après logout -> GET /api/auth/me 200, demo@vululu.local.
- Exigence V1 : sessions serveur révocables, expiration, révocation, éventuellement rotation.
- Impact : CDC-N-003, sécurité des accès.
- Décision requise : stockage de sessions (PostgreSQL/Redis) ou fournisseur d'identité, sans casser le mode local.

### G-02 — Identité, invitations et RBAC incomplets

- Constat : un utilisateur démo seedé, aucun endpoint d'invitation/activation, aucun admin, rôle user stocké mais non exploité pour les autorisations.
- Preuve : API limitée à login/logout/me ; User.role non utilisé dans les règles.
- Exigence V1 : CDC-F-001/002/003, PRD-01/11, page super-admin, invitations expirables, RBAC serveur, tests IDOR.
- Impact : impossible de qualifier l'accès privé V1.

### G-03 — Absence de Domain Core et de ports

- Constat : services applicatifs directement couplés à Prisma, FFmpeg, Postiz mock et au renderer déterministe. Pas de modèles de domaine purs, pas de ports Providers/Orchestrator/ArtifactStore/Postiz.
- Exigence V1 : ADR-0001, architecture section Frontières essentielles.
- Impact : providers réels, remplacement de moteur, tests de contrat et MCP seraient des refactors majeurs.
- Décision : extraire Domain/Application/Infrastructure avant d'ajouter des fonctionnalités.

### G-04 — Providers IA, registre et routage absents

- Constat : Vululu est une fonction buildVululuReply scriptée ; le média est un SVG déterministe Sharp + FFmpeg. Aucun provider, capacité, modèle, santé, coût, latence, fallback.
- Exigence V1 : PRD-06/07/13, CDC-F-030 à 033, PRD-14.
- Impact : la V0 ne peut pas satisfaire la promesse multimodèle.
- Décision : contrat ProviderAdapter + registry + router + mock de contrat avant premier provider réel.

### G-05 — Orchestration non durable

- Constat : ProductionJob en base, exécution asynchrone in-process (void runProduction). Aucun JobRun/StepRun, retry, checkpoint, reprise, idempotence de step.
- Exigence V1 : ADR-0003, CDC-F-043, CDC-N-004.
- Impact : un redémarrage perd le run ; pas de reprise sans duplication ; pas de granularité d'étapes.
- Décision : POC Hatchet P0-0, port Orchestrator, StepRun et ledger.

### G-06 — Stockage local sans S3

- Constat : artefacts dans data/artifacts, chemins locaux, URLs servies par l'API. Pas de S3, URLs signées, MIME, rétention.
- Exigence V1 : ADR-0002, CDC-N-006.
- Impact : non partageable entre workers, non durable, non déployable.
- Décision : ArtifactStorePort + adaptateur local + adaptateur S3.

### G-07 — MCP absent

- Constat : aucun serveur MCP, aucun outil typé, aucune auth scopes/audience.
- Exigence V1 : ADR-0004, PRD-12, CDC-F-070/071.
- Impact : parité web/MCP non démontrée ; MCP est un P0 V1.

### G-08 — Postiz réel absent

- Constat : transfert mock dans production.ts, statut submitted puis setTimeout acknowledged. Pas d'adaptateur, mapping, credentials, idempotency key, erreurs destination.
- Exigence V1 : ADR-0005, CDC-F-051/052.
- Impact : Postiz acknowledged ne signifie pas publié ; la cible V1 exige un adaptateur réel ou une limitation acceptée.
- Décision : contrat PostizPort, mock contractuel, puis qualification API réelle.

### G-09 — Contextes, personnages, snapshots et campagnes incomplets

- Constat : BrandContext sans révision ; Scene stable mais Character sans CharacterVersion ; pas de Campaign/Asset ; BriefRevision ajouté mais pas de snapshot figé de contexte/brief/agent/provider au lancement.
- Exigence V1 : PRD-02/08/15/16, CDC-F-010/012/013/040, architecture Source de vérité.
- Impact : reproductibilité d'un run ancien impossible ; correction et audit incomplets.

### G-10 — Audit, coûts et observabilité absents

- Constat : aucun AuditEvent, CostEvent, trace_id, provider_id, version de prompt/modèle, mesure de coût. Logs Fastify désactivés ; pas de monitoring.
- Exigence V1 : CDC-N-005/012, PRD-13, CDC-F-061.
- Impact : impossible de prouver les coûts, les décisions de routage, la traçabilité et la reprise.

### G-11 — Recette V1 non exécutée et CI absente

- Constat : docs/10 contient 42 tests SPECIFIED/NOT_RUN. Aucun workflow CI. E2E unique, sérialisé, sur base de démo locale.
- Exigence V1 : CDC-N-007, CDC section E, roadmap P0-F.
- Impact : aucun GO/NO-GO V1 fiable.
- Décision : CI, base de test isolée, mocks providers contractuels, exécution progressive du catalogue.

### G-12 — Durcissement HTTP incomplet

- Constat : cookie Secure seulement si APP_ENV=production ; HTTP local ; SameSite=Lax sans CSRF token ; aucun rate limit ; pas de headers de sécurité ; pas de rotation de session au login.
- Exigence V1 : CDC-N-003.
- Impact : sécurité insuffisante hors local.
- Décision : reverse proxy HTTPS, session store, CSRF, rate limit, headers, tests.

## 3. Gaps P1 — importants après fondation

| ID | Sujet | Constat V0 | Conséquence |
|---|---|---|---|
| G-13 | Re-production et idempotence | chaque run régénère les 5 PNG et crée des versions | coûts et versions inutiles |
| G-14 | Performance API/UI | polling 1,5 s, bundle complet, pas de pagination | charge et latence V1 |
| G-15 | Preview par version de scène | image toujours dernière version | comparaison de versions incomplète |
| G-16 | QA média limitée | dimensions, durée, codecs, checksum ; pas de texte/droits/audio/plateformes | CDC-F-050 partiel |
| G-17 | Audio absent | audio silencieux AAC | PRD-05 non couvert |
| G-18 | Formats absents | vidéo 5 scènes uniquement, pas image/carrousel/motion | PRD-04 non couvert |
| G-19 | Erreurs et corrélation | pas de codes d'erreur versionnés, correlation id, structured logs | diagnostic V1 |
| G-20 | Tests et données | E2E crée des données persistantes dans la base démo | isolement de test |
| G-21 | Reproductibilité | db:migrate nomme toujours init, next-env.d.ts change selon dev/build | CI |
| G-22 | Accessibilité UI | labels de base, pas d'audit clavier/contraste | CDC-N-008 |

## 4. Gaps par domaine

### Identité et accès
G-01, G-02, G-12, G-18, G-20.

### Domaine et application
G-03, G-04, G-05, G-09, G-10.

### Médias et données
G-06, G-08, G-15, G-16, G-17, G-18.

### Intégrations
G-04, G-05, G-06, G-07, G-08.

### Qualité et exploitation
G-10, G-11, G-12, G-19, G-20, G-21, G-22.

## 5. Ce que la V0 apporte déjà

- Une verticale réelle et vérifiée de bout en bout.
- Des invariants utiles : scene_id stable, versions immuables, checksums, approbation exacte, invalidation, Postiz mock étiqueté, isolation propriétaire.
- Des choix média reproductibles : Sharp pour PNG, FFmpeg complet, durées configurables, QA sur fichiers réels.
- Un modèle de données minimal cohérent pour Project/Brief/BriefRevision/Scene/SceneVersion/Character/Artifact/ArtifactVersion/Approval/Transfer/ProductionJob.
- Des scripts de vérification et un runbook local.

## 6. Priorisation proposée

### V1-00 — Fondation et durcissement, obligatoire

1. ADR stack/exception V0, décisions sessions, stockage, provider, MCP, Postiz, branches.
2. Sessions serveur révocables + CSRF + rate limit + HTTPS local/preprod.
3. Extraction Domain/Application/Infrastructure ; ports Providers, Orchestrator, ArtifactStore, Postiz, Clock, Audit/Cost.
4. Adaptateurs locaux/mock derrière ces ports ; préserver la verticale V0.
5. CI + base de test isolée + premiers tests de contrat.
6. Modèle V1 minimal : Invitation, ContextRevision, CharacterVersion, JobSpec/JobRun/StepRun, AuditEvent, CostEvent.
7. Gate de sortie : verticale V0 rejouée via les ports, sans régression, avec preuves.

### V1-01 — Identité et contextes
Invitations, admin, RBAC, context revisions, assets/campagnes, snapshot de contexte.

### V1-02 — Providers et orchestration
Registre, router, fallback, budgets, Hatchet POC, reprise, coûts, audit.

### V1-03 — Rendu et contrôle
Provider image/vidéo réel ou mock contractuel, audio/mix, profils plateformes, CharacterVersion, QA étendue, corrections ciblées.

### V1-04 — Diffusion et MCP
Postiz adapter, idempotence, erreurs, MCP auth/scopes/tools, parité web/MCP.

### V1-05 — Recette
Exécution des tests docs/10, sécurité, charge, backups, observabilité, GO/NO-GO.

## 7. Conditions de GO V1

GO conditionnel si :

- les ADR et décisions ouvertes sont tranchés ;
- V1-00 est planifié comme un lot distinct avec preuves ;
- la branche V0 est conservée comme prototype, sans merge automatique dans main ;
- les tests de non-régression V0 sont rejoués dans V1-00 ;
- la sécurité session/CSRF/HTTPS est traitée avant toute donnée réelle ;
- les providers restent mockés tant que les contrats et budgets ne sont pas validés.

NO-GO si :

- on ajoute des fonctionnalités V1 directement aux services V0 sans ports ;
- on branche un provider réel avant les contrats, coûts et garde-fous ;
- on considère la V0 comme une validation P0-0 ou une base de production ;
- on déploie, publie ou transfère réellement sans autorisation.

## 8. Références

- PRD-01 à PRD-16.
- CDC-F-001 à CDC-F-071, CDC-N-001 à CDC-N-012.
- ADR-0001 à ADR-0005.
- Roadmap P0-0 à P0-F.
- docs/10_ACCEPTANCE_TESTS.md.
- V0_FINAL_AUDIT.md, V0_TEST_EVIDENCE.md, V1_IMPLEMENTATION_BASELINE.md.
