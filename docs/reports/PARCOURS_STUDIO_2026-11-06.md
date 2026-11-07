# Parcours guidé du Studio — 2026-11-06

## Périmètre et critères

Exigences concernées : PRD-03, PRD-06, PRD-08, PRD-09 et PRD-13 ; CDC-F-020, CDC-F-024, CDC-F-030, CDC-F-042 et CDC-F-061 ; ADR-0019, 0020 et 0022. Le même projet présente les étapes Préparer, Créer et Finaliser. La recommandation dépend de la confirmation exacte du brief, du storyboard associé, du nombre de scènes du plan lorsqu'il est disponible et de la présence d'un master. Les validations serveur, la confirmation et le plafond MOCK restent inchangés.

## Vérifications

- PASS : `pnpm exec vitest run tests/project-journey.test.ts tests/studio-draft.test.ts tests/creation-delivery.test.ts` : 10 tests.
- PASS : vérification Chrome locale avec API **MOCK** : saisie et enregistrement du brief, rechargement avant confirmation, formulaire ouvert, valeurs conservées, prochaine action et motif de blocage affichés. Les trois accès aux étapes ont été activés au clavier ; aucun débordement horizontal constaté à 1440, 1024, 768 et 390 px dans ce scénario.
- PASS : `pnpm --filter @vululu/web typecheck`, ESLint ciblé et `pnpm --filter @vululu/web build`.
- PASS : contrôle des documents fondateurs, recherche de secrets et `git diff --check`.
- NOT_RUN : scénario E2E authentifié contre l'API et PostgreSQL réels, faute de session ou d'identifiants de recette. Le scénario existant inclut désormais une vérification de la reprise après sauvegarde, mais ce contrôle MOCK ne prouve pas la persistance serveur réelle.

## Retour arrière et suite

Restaurer les modifications de cette tranche sans toucher aux modifications antérieures du cadre de navigation ; aucune migration de données. Prochaine étape : rejouer `e2e/project-journey.spec.ts` sur un environnement de recette authentifié avec les services requis.
