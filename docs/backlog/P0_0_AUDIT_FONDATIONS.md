# Lot P0-0 — Audit et fondations

- **Statut** : proposé, non démarré
- **Date** : 2026-10-21
- **Prérequis** : Mission 00 livrée (corpus, ADR, structure)
- **Nature** : audit, décisions et préparation ; pas de fonctionnalité métier

## 1. Objectif

Lever les inconnues techniques qui bloquent le démarrage de la V1, produire les ADR manquants et préparer un environnement reproductible. À la fin de P0-0, l'équipe doit pouvoir démarrer P0-A sans choix structurant non tranché.

## 2. Contexte

Le corpus fondateur impose un monolithe modulaire, PostgreSQL, un stockage S3-compatible, une orchestration durable et un MCP branché sur les mêmes cas d'usage. Hatchet est retenu sous condition de POC. Aucun choix de langage, de framework, de package manager, ni d'outillage CI n'est encore validé. Les documents 04 (ADR) et 10 (tests d'acceptation) référencés par les spécifications sont absents.

## 3. Périmètre

Dans le périmètre :

- audit des dépôts de référence QeyNox et SocioPulse, sans reprise de code ;
- décision de stack et de structure cible ;
- stratégie d'environnement local et de secrets ;
- POC Hatchet ;
- stratégie de tests et document d'acceptation ;
- matrice de traçabilité et inventaire des contrats.

Hors périmètre : identité, contextes, wizard, rendu, Postiz, MCP, toute fonctionnalité métier.

## 4. Livrables

### D1 — Audit des références

Comparer QeyNox et SocioPulse sur : langage, structure, modèle de domaine, orchestration, stockage, MCP, tests, dette, licence, coût de réutilisation. Aucune reprise de code sans compatibilité démontrée et ADR.

### D2 — ADR stack et structure

ADR acceptés pour : langage, framework API, framework web, package manager, runtime, stratégie monorepo, workers, base de données, ORM/migrations. La structure cible est décrite sans être créée.

### D3 — Environnement local et secrets

Plan reproductible : PostgreSQL, stockage S3-compatible, Hatchet, workers, variables d'environnement, gestion des secrets, procédure de démarrage et de remise à zéro. Le fichier .env.example est confirmé.

### D4 — CI et qualité

Plan CI minimal : lint, typecheck, tests unitaires, tests de contrat, scan de secrets, vérification documentaire. Ajout des workflows uniquement si la stack est décidée. Aucune dépendance payante.

### D5 — POC Hatchet

Démontrer ou infirmer :

- reprise d'un run après arrêt brutal ;
- absence de duplication d'un effet de bord externe (mock d'appel payant) ;
- persistance d'une approbation humaine à travers un redémarrage ;
- granularité StepRun, retries bornés et idempotence.

Le POC vit dans un laboratoire jetable, hors des chemins de production. En cas d'impossibilité d'exécution, verdict NOT_RUN avec cause, plan de remplacement et décision requise.

### D6 — Tests d'acceptation

Produire docs/10_ACCEPTANCE_TESTS.md à partir de la section E du CDC : IDs de tests, préconditions, étapes, résultats attendus, exigence couverte, preuve. Couvrir invitation, isolation inter-utilisateurs, contextes, brief, audio/licences, routage/fallback, continuité des IDs, correction ciblée, QA/versioning, approbation exacte, Postiz idempotent, MCP IDE/cloud, rétention, redémarrage worker.

### D7 — Matrice de traçabilité

Matrice PRD → CDC → épics → lots → tests. Les exigences sans test doivent être visibles.

### D8 — Inventaire des contrats

Inventorier les contrats nécessaires (API, agents, modèles, artefacts, transferts, MCP), leur versionnement et leurs règles de compatibilité. Aucun contrat de production n'est figé avant P0-A.

## 5. Séquence

1. Relecture du corpus et des ADR.
2. Audit des deux dépôts de référence.
3. Rédaction des ADR stack/structure.
4. Mise à jour de .env.example et du plan d'environnement.
5. POC Hatchet et rapport.
6. Rédaction du document 10 et de la matrice.
7. Inventaire des contrats.
8. Revue finale, preuves, décision GO P0-A.

## 6. Interfaces à figer (conceptuel)

- **OrchestratorPort** : démarrer un run, reprendre, annuler, état, pause d'approbation.
- **ProviderAdapter** : exécuter une capacité, normaliser le résultat, exposer coût et droits.
- **ArtifactStore** : écrire un binaire immuable, checksum, URI temporaire.
- **HandoffPort** : transférer une version approuvée, idempotence, état.
- **McpGateway** : outil typé → cas d'usage, scopes et audit.

Aucune implémentation métier n'est requise ; seules les signatures et invariants sont documentés.

## 7. Critères d'acceptation

- ADR stack et structure acceptés et indexés.
- POC Hatchet exécuté avec preuves, ou NOT_RUN motivé avec décision requise.
- docs/10_ACCEPTANCE_TESTS.md complet au regard de la section E du CDC.
- Matrice de traçabilité sans exigence orpheline non signalée.
- Environnement local décrit et reproductible.
- Aucun secret, aucun code métier, aucun fournisseur réel engagé.
- Tous les livrables sont revus et tracés.

## 8. Tests et preuves

- POC : logs, captures, rapport de crash/restart, vérification d'absence de double appel.
- Documentation : script de vérification, liens, relecture.
- Sécurité : scan de secrets, aucune clé réelle.
- Aucun test d'acceptation métier n'est encore exécutable ; le document 10 est la référence à venir.

## 9. Rollback

P0-0 est documentaire et expérimental. Rollback : revert des commits du lot ; le POC est supprimé ou isolé sans impact sur le corpus fondateur.

## 10. Risques

- Hatchet inadapté : décision de fallback à prendre, le port limite l'impact.
- Stack surdimensionnée ou sous-dimensionnée : audit comparatif et ADR explicite.
- POC non exécutable localement : NOT_RUN et plan de validation en préproduction.
- Dérive documentaire : matrice de traçabilité et revue de clôture.

## 11. Décision requise

**GO P0-0** : autoriser l'audit, les ADR, le POC Hatchet et la rédaction du document 10, sans développement métier. À défaut de GO, le projet reste à l'état documentaire de la Mission 00.
