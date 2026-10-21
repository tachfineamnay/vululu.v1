# ADR-0004 — MCP : même domaine, entrée différente

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Décideurs** : architecture Vululu AI
- **Sources** : [Architecture V1](../03_ARCHITECTURE_V1.md), section MCP ; [PRD V1.2](../01_PRD_V1.md), PRD-12 ; [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md), CDC-F-070 et CDC-F-071

## Contexte

La V1 doit être pilotable depuis un client MCP autorisé (IDE ou cloud) avec les mêmes capacités que l'interface web. Le MCP ne doit pas devenir un contournement du RBAC, des approbations ou des budgets, ni un accès direct à la base, à Hatchet ou à Postiz.

## Décision

- Le serveur MCP distant expose des **outils typés** qui appellent les mêmes cas d'usage applicatifs que le web.
- Authentification et autorisation : token, scopes, RBAC, audience et expiration ; le mécanisme exact (OAuth 2.1 resource server ou token signé) reste à trancher en P0-0.
- Aucun accès direct à PostgreSQL, Hatchet ou Postiz.
- Les tâches longues renvoient immédiatement un run_id ; le suivi se fait par requête.
- Les approbations et checksums sont identiques à ceux du web.
- Aucun outil shell, SQL arbitraire ou bypass de quota.

## Conséquences

- Positives : une seule logique métier, parité web/MCP, surface d'attaque réduite.
- Négatives : conception d'authentification MCP dédiée, tests multi-clients, découverte d'outils à maintenir.
- Impacts : tests de sécurité MCP obligatoires, journalisation des appels, scopes par outil.

## Alternatives envisagées

- **MCP avec sa propre logique métier** : duplication et risque de divergence ; rejeté.
- **MCP local uniquement** : ne satisfait pas PRD-12 (client cloud autorisé) ; rejeté pour V1.
- **Accès direct à la base depuis MCP** : viole l'isolation et l'audit ; rejeté.

## Références

- Architecture V1, section MCP.
- PRD-12 et CDC-F-070/071.
