# ADR-0001 — Monolithe modulaire et Domain Core indépendant

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Décideurs** : architecture Vululu AI
- **Sources** : [Architecture V1](../03_ARCHITECTURE_V1.md), sections Frontières essentielles et Modules ; [PRD V1.2](../01_PRD_V1.md), section 8

## Contexte

Vululu AI doit rester maintenable et évolutive sans dépendre d'un fournisseur IA, d'un orchestrateur ou d'un service externe. Le produit couvre plusieurs domaines (identité, contextes, workflow, agents, médias, artefacts, approbations, diffusion) et doit pouvoir démarrer avec une équipe réduite.

## Décision

Adopter un **monolithe modulaire** : une API applicative et des workers spécialisés, organisés en trois couches.

- **Domain** : modèles purs, invariants, transitions d'état, sans SDK IA, sans Hatchet, sans Postiz.
- **Application** : cas d'usage, contrôle de propriété, autorisations, budgets, idempotence, composition.
- **Infrastructure** : PostgreSQL, S3, Hatchet, fournisseurs IA, FFmpeg, Postiz, transport MCP, observabilité.

Modules identifiés : identity, contexts, projects, campaigns, workflow, briefs, agents, capabilities, providers, media, scenes, characters, artifacts, approvals, handoff, audit, costs, mcp.

## Conséquences

- Positives : frontières claires, tests du domaine sans infrastructure, déploiement simple, coût d'exploitation maîtrisé, migration progressive possible.
- Négatives : discipline nécessaire pour éviter les dépendances inverses ; le monolithe doit rester modulaire dans le temps.
- Impacts : les adaptateurs sont derrière des ports ; aucun SDK fournisseur dans le Domain Core ; les workers sont désactivables sans casser l'interface.

## Alternatives envisagées

- **Microservices dès le départ** : complexité opérationnelle et coût prématurés pour une V1 interne ; rejeté.
- **Monolithe sans séparation de couches** : couplage au fournisseur et à l'infrastructure ; incompatible avec la cible multi-fournisseurs ; rejeté.
- **Réutilisation directe de QeyNox ou SocioPulse** : dépendance métier non démontrée ; la référence architecturale doit être validée en P0-0 avant toute réutilisation ; rejeté pour la fondation.

## Références

- Architecture V1, section Frontières essentielles.
- PRD V1.2, section 8 (modular monolith et workers).
