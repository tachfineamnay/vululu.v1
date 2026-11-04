# Décisions d'architecture — Vululu AI

Ce dossier contient les décisions d'architecture (Architecture Decision Records) de Vululu AI. Il remplace opérationnellement le document docs/04_DECISIONS_ADR.md, référencé par le prompt maître mais absent du corpus reçu.

## Format

Chaque décision suit [template.md](template.md) :

- un identifiant stable ADR-XXXX ;
- un statut : Proposée, Acceptée, Remplacée, Abandonnée ;
- une date et les sources documentaires ;
- le contexte, la décision, les conséquences et les alternatives.

## Règles

- Une décision acceptée n'est jamais réécrite : elle est remplacée par un nouvel ADR qui la référence.
- Un ADR ne peut contredire le PRD, le CDC ou l'architecture sans révision documentaire explicite.
- Les décisions encore ouvertes ne reçoivent pas d'ADR accepté ; elles restent dans le rapport et la roadmap.
- Les ADR sont rédigés en français, avec des identifiants techniques en anglais.

## Index

| ADR | Sujet | Statut | Date |
|---|---|---|---|
| [0001](0001-monolithe-modulaire-et-domain-core.md) | Monolithe modulaire et Domain Core indépendant | Acceptée | 2026-10-21 |
| [0002](0002-postgresql-source-de-verite-et-s3.md) | PostgreSQL source de vérité, S3 pour les binaires | Acceptée | 2026-10-21 |
| [0003](0003-hatchet-port-orchestration-durable.md) | Hatchet derrière un port d'orchestration durable | Acceptée sous condition POC | 2026-10-21 |
| [0004](0004-mcp-meme-domaine-entree-differente.md) | MCP : même domaine, entrée différente | Acceptée | 2026-10-21 |
| [0005](0005-postiz-transfert-apres-approbation.md) | Postiz : transfert après approbation exacte | Acceptée | 2026-10-21 |
| [0006](0006-application-layer-et-snapshots-versionnes.md) | Application Layer par use cases et snapshots versionnés | Acceptée | 2026-10-23 |
| [0007](0007-consolidation-applicative-et-suppression-legacy.md) | Consolidation applicative et suppression du workflow legacy | Acceptée | 2026-10-23 |
| [0008](0008-agentic-capabilities-registre-et-routeur.md) | Agentic Capabilities : registre versionné et routeur/fallback | Acceptée | 2026-10-23 |
| [0009](0009-poc-hatchet-durabilite-prouvee.md) | POC Hatchet : durabilité prouvée, packaging Docker conditionnel | Acceptée sous condition | 2026-10-24 |
| [0010](0010-orchestration-durable-outbox-hatchet.md) | Orchestration durable par Outbox et Hatchet Embedded | Acceptée sous condition | 2026-10-24 |
| [0011](0011-artefacts-immuables-stockage-interchangeable.md) | Artefacts immuables et stockage interchangeable | Acceptée sous condition | 2026-10-25 |
| [0012](0012-durcissement-securite-observabilite.md) | Durcissement sécurité, observabilité et exploitation | Acceptée sous condition | 2026-10-25 |
| [0013](0013-certification-locale-readiness-separees.md) | Certification locale et readiness de déploiement séparées | Acceptée sous condition | 2026-10-25 |
| [0014](0014-admin-dans-apps-web.md) | Administration dans apps/web | Acceptée pour V1 | 2026-11-01 |
| [0015](0015-topologie-preprod-hatchet-s3.md) | Topologie préproduction Hatchet/S3 | Acceptée avec limites ; déploiement complet non validé | 2026-11-01 |
| [0016](0016-v1-demo-sans-fournisseur-ia.md) | V1-DEMO sans connexion IA et compte ordinaire distinct | Acceptée pour la démo autorisée | 2026-11-04 |
| [0017](0017-campagnes-groupement-simple-projets.md) | Campagnes : regroupement explicite de projets par propriétaire | Acceptée localement, revue de release requise | 2026-11-04 |

## Décisions encore ouvertes

[ADR 0018](0018-bibliotheque-actifs-versionnes.md) : bibliothèque, versions, droits et sélection figée (2026-11-04).

Le registre d’inauguration reste historique. La stack présente est décrite dans les ADR et rapports V1 ; les choix encore ouverts portent notamment sur l’authentification MCP, le S3 et le moteur qualifiés pour la cible finale, Postiz réel, licence, protection de branche, budgets réels et rétention. Leur état courant est suivi dans la [traçabilité V1-DEMO](../releases/V1_DEMO_TRACEABILITY.md). Aucun statut conditionnel n’est transformé en certification par cet index.

## Sources

- [Architecture V1](../03_ARCHITECTURE_V1.md)
- [PRD V1.2](../01_PRD_V1.md)
- [Cahier des charges V1.2](../02_CAHIER_DES_CHARGES_V1.md)
