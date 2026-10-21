# ADR-0005 — Postiz : transfert après approbation exacte

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Décideurs** : architecture Vululu AI
- **Sources** : [PRD V1.2](../01_PRD_V1.md), PRD-10 ; [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md), CDC-F-051 et CDC-F-052 ; [Architecture V1](../03_ARCHITECTURE_V1.md)

## Contexte

Postiz gère les comptes sociaux et la publication. Vululu AI doit transférer un master approuvé, sans devenir un gestionnaire natif d'API publicitaires et sans publier automatiquement.

## Décision

- Postiz reste un service externe, derrière un **adaptateur idempotent**.
- Le transfert n'est possible qu'après approbation humaine d'une **version exacte** (version + checksum).
- Un TransferRecord journalise l'état : pending, submitted, acknowledged ou failed ; acknowledged signifie confirmé par Postiz, pas publié sur le réseau.
- En cas d'indisponibilité de Postiz, le master approuvé est conservé et le transfert reste en attente ou en échec ; aucune régénération automatique.
- Vululu AI n'achète pas d'espace publicitaire et ne publie jamais sans feu vert humain.

## Conséquences

- Positives : séparation claire des responsabilités, auditabilité, pas de couplage aux API sociales.
- Négatives : dépendance à l'API Postiz, à qualifier ; réconciliation des états nécessaire.
- Impacts : contrat d'adaptateur, mapping des formats, tests d'idempotence, gestion des erreurs de destination.

## Alternatives envisagées

- **Publication directe via les API des réseaux** : périmètre trop large, maintenance lourde, risque de publication non supervisée ; rejeté.
- **Publication automatique après génération** : incompatible avec PRD-09 et CDC-F-051 ; rejeté.
- **Postiz comme orchestrateur métier** : confusion des rôles et du Temporal ; rejeté.

## Références

- PRD-10, CDC-F-051/052.
- Architecture V1, section Approbation et transfert.
