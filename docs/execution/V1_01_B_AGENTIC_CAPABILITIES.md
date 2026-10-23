# V1-01-B — AGENTIC CAPABILITIES

- **Date** : 2026-10-23
- **Branche** : v1-01-b-agentic-capabilities
- **Base** : v1-01-a1-consolidation, commit 429a93e
- **Périmètre retenu** : E04-01 à E04-04 et T-014 à T-017
- **Hors périmètre explicite** : T-018 planification DAG, Hatchet, providers réels, UI admin, MCP
- **Verdict** : GO CONDITIONNEL

## 1. Note de cadrage

Le dépôt ne contient aucun fichier nommé Architecture First ni de définition du lot B. Le périmètre a donc été dérivé des documents fondateurs : CDC-F-030 à CDC-F-033, backlog E04 Core agentique, acceptance tests T-014 à T-017, architecture V1 (agents, capabilities, providers).

Ce document déclare explicitement cette hypothèse de périmètre. Il ne prétend pas couvrir T-018 ni la durabilité Hatchet.

## 2. Domaine ajouté

- packages/domain/src/agents.ts : AgentDefinition, AgentConfigVersion, checksum, versionnement, sélection de version, gel de version active.
- packages/domain/src/capabilities.ts : ModelDefinition, CapabilityRequirement, licence, qualité, latence, coût, éligibilité, classement déterministe, décision de routage, fallback, budget.
- Aucun import Prisma/HTTP/réseau dans ces modules.
- Nouveaux codes Domain : agent_config_not_found, agent_config_stale, no_route, budget_exceeded.

## 3. Application Layer

- AgentConfigUseCases : création agent, configuration versionnée, promotion explicite, rollback explicite, résolution de la configuration active pour un run.
- ProviderCatalogUseCases : providers, modèles, capacités, activation/désactivation, qualification.
- RoutingUseCases : preview, décision tracée, exécution mock, fallback si le primaire échoue, enregistrement du coût.
- Ports : AgentRepository, ProviderCatalogRepository, RoutingRepository, CostRepository, CapabilityProviderPort.
- Aucun use case n importe Prisma.

## 4. Infrastructure

Migration additive 20261023183000_v1_01_b_agentic_capabilities :

| Table | Rôle |
|---|---|
| AgentDefinition | identité agent + exigences de capacités + config active |
| AgentConfigVersion | soul, instructions, guardrails, checksum, version unique par agent |
| Provider | fournisseur mock, actif/inactif |
| Model | modèle, capacités, qualité, latence, coût, licence, qualification |
| RoutingDecision | candidats, primaire, fallback, critères, raison, horodatage |

Adaptateurs Prisma : PrismaAgentRepository, PrismaProviderCatalogRepository, PrismaRoutingRepository, PrismaCostRepository.

Provider mock : MockCapabilityProvider, aucun réseau, aucun coût réel, résultat déterministe.

## 5. API super-admin

Routes ajoutées, protégées par session + CSRF + RBAC super_admin :

| Méthode | Route | Rôle |
|---|---|---|
| GET | /api/admin/agents | lister les agents |
| POST | /api/admin/agents | créer un agent |
| GET | /api/admin/agents/:id/configs | historique des configs |
| POST | /api/admin/agents/:id/configs | nouvelle config versionnée |
| POST | /api/admin/agents/:id/promote | promotion explicite |
| POST | /api/admin/agents/:id/rollback | rollback vers une version |
| GET | /api/admin/providers | lister providers |
| POST | /api/admin/providers | créer un provider mock |
| POST | /api/admin/providers/:key/active | activer/désactiver |
| GET | /api/admin/models | lister modèles par capacité |
| POST | /api/admin/models | créer un modèle |
| POST | /api/admin/models/:id/active | activer/désactiver un modèle |
| POST | /api/admin/models/:id/qualification | qualifier/déqualifier |
| POST | /api/admin/routing/preview | décision de routage tracée |
| POST | /api/admin/routing/execute | exécution mock + coût |

## 6. Preuves fonctionnelles

Création agent : 4b6c21ef-21f2-46a9-8897-3b13d58542d0.

- config v1 : c5680bec-ddb2-47ec-8634-9e1e615b2de7 ;
- config v2 : 31c30abd-5730-4c72-b246-0f290d0dfd08 ;
- promotion v2 : activeConfigVersionId = v2 ;
- rollback v1 : activeConfigVersionId = v1.

Registre routeur :

- provider mock-1792779830200 créé puis désactivé ;
- routage après désactivation : HTTP 400, aucun modèle éligible ;
- provider réactivé : routage de nouveau possible ;
- deux modèles, primaire qualité 90, fallback qualité 70 ;
- décision : primaire + fallback, raison primary_selected ;
- exécution mock : costCents=2, CostEvent persisté provider=mock-1792779830200, model=primary, units=1.

Tests automatisés :

- fallback primaire en échec -> fallback exécuté, coût enregistré ;
- budget inférieur au coût -> aucun modèle éligible ;
- modèle non qualifié/licence incompatible -> refus ;
- promotion/rollback/freeze de config ;
- RBAC super_admin.

## 7. Ce qui n est pas livré

- T-018 : planification DAG et exécution en étapes.
- Intégration de la config agent dans le snapshot de production : les capacités sont un registre autonome, pas encore consommées par le workflow média.
- Hatchet, reprise crash, retries durables.
- Providers réels et modèles qualifiés réels : uniquement mock déterministe.
- UI admin, MCP.
- Quotas globaux/par projet : seul le plafond d un routage est vérifié.
- CI GitHub.

## 8. Conclusion

Le socle Agentic Capabilities est réel : registre versionné, promotion/rollback, qualification, routage déterministe, fallback tracé, coût persisté et API super-admin protégée. Il n est pas encore branché au workflow de production ni à la planification d agents. Verdict GO CONDITIONNEL, sans prétendre couvrir T-018.