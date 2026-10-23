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

## Décisions encore ouvertes

Les arbitrages suivants ne sont pas des ADR acceptés : stack applicative, authentification MCP, fournisseur S3, API Postiz, licence, protection de branche, budgets et rétention. Voir la section 9 du [rapport d'inauguration](../INAUGURATION_REPORT.md).

## Sources

- [Architecture V1](../03_ARCHITECTURE_V1.md)
- [PRD V1.2](../01_PRD_V1.md)
- [Cahier des charges V1.2](../02_CAHIER_DES_CHARGES_V1.md)
