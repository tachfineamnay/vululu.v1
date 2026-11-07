# Recette des parcours Studio — 2026-11-07

## Périmètre

Exigences : PRD-03, PRD-04, PRD-08, PRD-09 et PRD-13 ; CDC-F-020, CDC-F-024, CDC-F-040, CDC-F-042, CDC-F-044, CDC-F-051, CDC-N-001, CDC-N-007 et CDC-N-008. Critères : reprise du brief et des instructions, sélection exacte d’une scène, comparaison et téléchargement de la version choisie, erreurs récupérables et navigation clavier aux quatre largeurs demandées.

Une image de scène temporairement indisponible peut maintenant être rechargée depuis son aperçu, sans changer la scène, l’instruction ou le master affichés. Aucun contrat serveur ni aucune validation métier n’a été modifié.

## Preuves

- PASS : `pnpm exec vitest run tests/project-journey.test.ts tests/studio-draft.test.ts tests/creation-delivery.test.ts` — 11 tests.
- PASS : Playwright `studio-creation-view.spec.ts` et `studio-correction-drafts.spec.ts` — 10 tests avec API **MOCK**, dont erreur d’image puis reprise au clavier, conservation des brouillons et sélection au clavier à 1440, 1024, 768 et 390 px.
- PASS : Playwright `projects-start.spec.ts`, `project-journey.spec.ts` et `brief-profile.spec.ts` — création de contexte, reprise d’un projet interrompu, brief, scènes, production et lecture sur PostgreSQL local isolé.
- PASS : Playwright `v0.spec.ts` et `creation-delivery.spec.ts` sur la base isolée — parcours débutant jusqu’au téléchargement, reprise professionnelle, correction après échec simulé, comparaison, approbation, téléchargement de chaque version et contrôle d’empreinte. Un second compte fictif vérifie le refus d’accès aux ressources d’un autre utilisateur.
- PASS : `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`, `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` et `pwsh -NoProfile -File scripts/check-secrets.ps1`.

Les tests Playwright ont utilisé Chrome local et une configuration de lancement locale hors dépôt. Le rendu Sharp/FFmpeg et les médias sont locaux ; les coûts et le transfert Postiz sont **MOCK**. Fournisseurs et Postiz réels : **NOT_RUN**. La base locale initiale conserve sept migrations en attente et renvoie HTTP 500 pour les projets ; les tests authentifiés ont utilisé une base distincte entièrement migrée, sans modifier le schéma initial.

## Retour arrière

Retirer uniquement les ajustements d’interface et de tests de cette livraison en conservant les données et modifications antérieures. Aucune migration applicative ni action de publication n’est ajoutée. La prochaine opération sur la base locale initiale doit examiner les migrations en attente et prévoir une sauvegarde.
