# Brouillons de correction par scène — 2026-11-07

## Exigences et contrat

Exigences concernées : PRD-08, PRD-09 et PRD-13 ; CDC-F-040, CDC-F-042 et CDC-F-044 ; ADR-0020. Chaque instruction est associée à la clé stable de sa scène dans le brouillon local déjà isolé par compte et projet. La scène affichée, le libellé de l’action et la route de correction utilisent la même sélection. Aucun contrat serveur ni mécanisme d’approbation n’est modifié.

La copie reste dans `sessionStorage` : elle est propre à l’onglet, ne constitue pas une sauvegarde serveur et peut disparaître à sa fermeture. Le format local existant est lu ; l’ancienne instruction est rattachée à sa scène enregistrée ou, si aucune scène n’était sélectionnée, à la scène qui était utilisée par défaut. Si aucune scène n’existe, elle reste non attribuée et peut être affectée explicitement sans écraser une instruction déjà présente. Les instructions de scènes absentes et les brouillons en conflit restent consultables.

## Preuves

- PASS : test Playwright local avec API **MOCK** : A → B → A, chemin et corps exacts de la requête, échec et rechargement, conservation du résultat, changement de scène pendant une requête, isolation compte/projet et protection des autres saisies.
- PASS : reprise du format historique, saisie non attribuée, conflit de révision, refus d’écrasement par une proposition, panne de stockage locale et nom long sur mobile. Le test de la zone Création existante est également exécuté avec API **MOCK** : 9 scénarios navigateur au total.
- PASS : `pnpm exec vitest run tests/studio-draft.test.ts tests/project-journey.test.ts tests/creation-delivery.test.ts` : 11 tests ; TypeScript et ESLint ciblé.
- PASS : `pnpm --filter @vululu/web build`, contrôle des documents fondateurs, recherche de secrets et `git diff --check`.
- NOT_RUN : E2E authentifié contre l’API, PostgreSQL et les médias réels, faute de session et d’environnement de recette disponibles. Les essais MOCK ne démontrent pas l’isolation serveur ni l’exécution réelle d’une correction.

## Retour arrière et suite

Annuler uniquement les modifications de cette tranche, sans annuler les changements précédents du Studio ; aucune migration de base ni suppression de données. Un ancien client ne lit que l’instruction historique et peut écraser les champs supplémentaires à sa prochaine sauvegarde : préserver les brouillons locaux hors du dépôt avant un retour à cet ancien client. Prochaine étape : exécuter la recette authentifiée de correction sur un projet de test.
