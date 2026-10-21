# Propositions V2 — garde-fou

Ce dossier conserve la vision V2 de Vululu AI. Il est **hors périmètre d'implémentation V1**.

## Statut

La note [NOTE_SPECIALE_PROPOSITIONS_V2.md](NOTE_SPECIALE_PROPOSITIONS_V2.md) est une réserve de vision validée par le porteur du projet. Elle n'est pas un backlog. Toute fonctionnalité qui s'y trouve nécessite une nouvelle validation de périmètre avant conception.

## Règle absolue

Pendant tous les lots V1 :

- ne pas coder Memory Bank, mémoire sémantique, embeddings, base vectorielle ;
- ne pas coder l'apprentissage des préférences ni les suggestions automatiques ;
- ne pas coder monétisation, abonnements, crédits, wallet, marketplace ;
- ne pas coder Everything LLM ni de protocole inter-agents ;
- ne pas ajouter de table, de port ou de dépendance V2 « au cas où ».

## Points d'extension prévus en V1

L'architecture V1 prévoit uniquement des points d'extension documentés :

- SemanticMemoryStore et MemoryPolicy comme ports séparés derrière ContextResolver, à créer en V2 ;
- BillingLedger et EntitlementPolicy derrière les services de coûts, à créer en V2 ;
- conservation des snapshots de contexte, brief, agents et providers pour permettre une migration ;
- identifiants stables et catalogue fournisseur extensible.

Aucun de ces points n'est actif en V1. Ils ne doivent pas créer de dépendance ni de table maintenant.

## Processus de passage en V2

1. Nouvelle validation de périmètre par le porteur du projet.
2. ADR de cadrage V2.
3. Découpage en lots et critères d'acceptation.
4. Migration et compatibilité avec les données V1.
5. Décision GO V2 explicite.

## Références

- [Note V2](NOTE_SPECIALE_PROPOSITIONS_V2.md)
- [PRD V1.2](../01_PRD_V1.md), section 6 (non-objectifs)
- [Architecture V1](../03_ARCHITECTURE_V1.md), section Extension V2
- [Rapport d'inauguration](../INAUGURATION_REPORT.md)
