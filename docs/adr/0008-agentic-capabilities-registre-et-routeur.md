# ADR-0008 — Agentic Capabilities : registre versionné et routeur/fallback

- **Statut** : Acceptée
- **Date** : 2026-10-23
- **Décideurs** : Lead Architecture, Backend, QA
- **Sources** : CDC-F-030 à CDC-F-033, backlog E04, T-014 à T-017, ADR-0001, ADR-0007

## Contexte

La V1 ne possède aucun registre AgentDefinition/AgentConfigVersion, aucun catalogue providers/modèles/capacités, aucun routeur/fallback ni coût agentique. La mission V1-01-B doit poser ces fondations sans fournisseur payant, sans Hatchet et sans dépendre du moteur V0.

## Décision

1. Les agents et leurs configs sont des objets Domain purs : AgentDefinition, AgentConfigVersion, checksum, versionnement append-only.
2. La promotion et le rollback sont explicites. Une config active est figée pour un run par identifiant + checksum.
3. Le catalogue providers/modeles/capacites est versionné en PostgreSQL ; un modèle porte qualité, latence, coût, licence, activation et qualification.
4. Le routeur applique compatibilité de capacité, licence, seuils, coût, budget, puis classe qualité/coût/latence/id de façon déterministe.
5. La décision de routage est persistée avec candidats, primaire, fallback, critères et raison.
6. L exécution délègue à CapabilityProviderPort ; le provider est MOCK déterministe, sans réseau ni coût réel.
7. Le fallback est exécuté si le primaire échoue ; le coût réel normalisé est écrit dans CostEvent.
8. Aucune planification DAG, aucun Hatchet, aucun provider réel, aucune UI, aucun MCP dans ce lot.

## Conséquences

- Positives : socle agentique indépendant du moteur V0 ; configs versionnées/rollback ; routage explicable ; fallback tracé ; budget vérifié ; API super-admin.
- Négatives : capacités non encore branchées au workflow média ; T-018 non couvert ; provider mock seulement ; pas de quotas globaux ; pas de reprise durable.
- Impacts : migration additive agentic capabilities, nouveaux modules Domain/Application/Infrastructure, tests T-014 à T-017, routes admin.

## Alternatives envisagées

- Choisir un provider réel : rejeté, pas de budget/autorisation.
- Router dans les routes : rejeté, logique métier hors Application.
- Stocker la décision uniquement en logs : rejeté, besoin d audit DB.
- Implémenter le DAG dans le même lot : rejeté, périmètre et risque trop larges.

## Références

- docs/execution/V1_01_B_AGENTIC_CAPABILITIES.md
- packages/domain/src/agents.ts
- packages/domain/src/capabilities.ts
- packages/application/src/use-cases/agents.ts
- packages/application/src/use-cases/provider-catalog.ts
- packages/application/src/use-cases/routing.ts
- apps/api/src/routes/adminAgents.ts