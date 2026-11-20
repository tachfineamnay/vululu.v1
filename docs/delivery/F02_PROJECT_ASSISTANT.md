# F02 — Assistant de campagne et composition

**Date :** 2026-11-20 · [ADR 0034](../adr/0034-assistant-vertex.md)

## Parcours utilisateur

Dans le Studio d’un projet, ouvrir **Assistant de campagne et composition**.

- **Campagne** : choisir une offre confirmée et un lundi UTC, décrire l’objectif. Le modèle propose une idée de campagne et trois publications (accroches, légendes, CTA et storyboards) dans les créneaux calculés localement. Les faits déclarés et les suggestions restent séparés. Le texte est éditable, une modification crée une révision, et l’approbation concerne seulement le brouillon exact. Un changement des sources impose un nouveau brouillon.
- **Composition** : sélectionner une scène d’une version déjà enregistrée, décrire la modification, relire les changements et éventuellement générer l’aperçu visuel local. Confirmer pour créer une nouvelle révision de composition. L’IA ne choisit ni cible ni média. L’application n’engendre ni rendu maître, ni publication.
- **Continuité** : sélectionner **Poursuivre cette demande** pour joindre au plus trois résumés du même projet et de la même offre/scène. Pour repartir sans contexte conversationnel, choisir **Nouvelle conversation**.
- **Sans IA** : le module local utilise le profil métier et l’offre pour proposer le plan C07 sans interpréter le texte libre. Les modifications explicites (`CTA "Posez votre question" ; couleur #225588`) utilisent le traducteur C03. Le Studio, le plan historique et les invitations restent utilisables.

## Activation opérateur (pas effectuée en Arena)

1. Appliquer la migration additive `20261120200000_project_assistant`. Laisser `ASSISTANT_VERTEX_ENABLED=0` tant que l’inférence n’est pas autorisée. L’API et le worker Hatchet doivent recevoir la même configuration.
2. Configurer `ASSISTANT_VERTEX_PROJECT`, `ASSISTANT_VERTEX_LOCATION` (ou `global`) et `ASSISTANT_VERTEX_MODEL` (`gemini-2.5-flash` ou `gemini-2.5-flash-lite`). La disponibilité modèle/région n’a pas été vérifiée. Activer l’API Vertex dans le projet autorisé. Fournir ADC au **worker seulement**, de préférence via identité de workload ; pour un fichier ADC, le monter en lecture seule et pointer `GOOGLE_APPLICATION_CREDENTIALS` vers ce chemin. Ne pas placer de JSON ou de jeton dans le frontend, les exemples d’environnement ou les journaux. Accorder à cette identité la permission de prédiction Vertex minimale dans le seul projet concerné.
3. Fournir des bornes tarifaires **arrondies par excès** en micro-USD/jeton (équivalents USD/million) dans `ASSISTANT_VERTEX_INPUT_MICROUSD` et `ASSISTANT_VERTEX_OUTPUT_MICROUSD`, selon le modèle, la région et les tarifs applicables. Ne pas supposer que les tarifs d’une autre région/option s’appliquent. Aucune valeur commerciale n’est présélectionnée. La borne par appel ToolBroker est de 8 cents USD, et le worker refuse une estimation supérieure. Configurer aussi les quotas d’usage Vertex et la surveillance fournisseur ; la borne locale suppose que la configuration tarifaire est correcte.
4. Démarrer le worker Hatchet existant, autoriser `assistant.draft@1` et un plafond fini dans chaque compte d’exécution éligible. En mode commercial, le produit doit également inclure `assistant.draft@1` : aucun ancien produit ou compte ne reçoit ce droit automatiquement. Aucun appel sans accord de dépense sur l’opération. Les incidents de coût `UNKNOWN` ne sont pas rejoués ; revue via l’interface d’incidents C05.
5. Retour arrière : `ASSISTANT_VERTEX_ENABLED=0` sur l’API et le worker. Les nouvelles demandes restent locales ; le worker bascule les demandes déjà approuvées non émises sur le résultat local si le contexte n’a pas changé. Ne pas rejouer les opérations déjà émises ou inconnues. Conserver la migration additive pour préserver l’historique.

## Recette ciblée

```sh
pnpm test tests/assistant-vertex.test.ts tests/v1/project-assistant.test.ts tests/marketing-evaluation.test.ts tests/v1/marketing-intelligence.test.ts tests/creative-actions.test.ts tests/v1/execution-broker.test.ts
pnpm exec playwright test --config playwright.assistant.config.ts
pnpm lint
pnpm --filter @vululu/api --filter @vululu/web --filter @vululu/contracts --filter @vululu/db typecheck
```

Les fixtures couvrent artisanat, conseil, commerce, psychothérapie et formation. Les tests navigateur emploient un fournisseur **MOCK** dans le serveur de recette uniquement, sur une base locale jetable. Le contrat HTTP Vertex est testé avec `fetch` simulé. Qualité réelle du modèle, ADC réel, latence et facturation fournisseur, et transport Hatchet réel pour F02 : **NOT_RUN**. Aucun appel externe, coût ou déploiement n’a été déclenché.

Vérification Arena : migrations SQL appliquées sur PostgreSQL local jetable ; 34 tests ciblés réussis (un test existant de transport ignoré), parcours Playwright bureau et mobile réussis (2/2), lint et vérification TypeScript des quatre packages réussis.
