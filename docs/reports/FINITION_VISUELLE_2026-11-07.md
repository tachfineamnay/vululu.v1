# Finition visuelle Vululu — 2026-11-07

## Périmètre et critères

Exigences concernées : PRD-04, PRD-08, PRD-09 et PRD-14 ; CDC-F-040, CDC-F-041, CDC-F-042, CDC-F-044, CDC-F-050, CDC-F-051 et CDC-F-052. La finition suit `DESIGN.md`, les tokens bleu/jaune et `docs/design-system/SCREENS.md` : média prioritaire, bandeau de scènes unique, inspecteur, navigation adaptée et informations techniques secondaires. La référence vectorielle locale décrit le cadre ; la maquette PNG liée depuis la documentation n’était pas disponible localement.

Le conflit entre la grille générique d’en-tête et les actions flex est corrigé. Les badges utilisent les couleurs sémantiques du thème clair ; la vignette en attente utilise une taille et un contraste lisibles. Les versions restent accessibles près du média, les répétitions sont réduites et les limites de démonstration restent résumées à proximité. Aucun contrat serveur ni fournisseur n’a été modifié.

## Preuves

- PASS : inspection du catalogue ouvert dans le navigateur à 1440 et 390 px ; inspection du Studio à ces deux tailles avec un projet fictif et des médias produits localement.
- PASS : `studio-creation-view.spec.ts` avec API **MOCK** : contraste des badges et de la vignette, actions flex, accès aux limites, sélection de scène, versions, finalisation et absence de débordement à 1440, 1024, 768 et 390 px.
- PASS : `studio-correction-drafts.spec.ts` avec API **MOCK** : huit scénarios de brouillon et de reprise.
- PASS : `brief-profile.spec.ts` authentifié sur une base de recette locale séparée et entièrement migrée : brief, storyboard, changement de scène, production et lecture vidéo ; exécuté avant la dernière harmonisation des libellés de statut.
- PASS : `v0.spec.ts` authentifié sur cette base isolée après les derniers changements : navigation, production déterministe, correction ciblée, comparaison, approbation, transfert **MOCK** et déconnexion. Un premier essai avait révélé que l’indicateur Next de développement recouvrait le bouton de sortie ; l’action a été élargie, puis le scénario a été relancé avec succès.
- PASS : `pnpm typecheck`, TypeScript web après les derniers changements, ESLint ciblé, neuf tests unitaires du parcours et des brouillons, et `scripts/check-secrets.ps1`.
- La base locale initiale présente sept migrations en attente. Avant l’isolement, la recette authentifiée y a créé un contexte fictif puis échoué sur la création d’un projet avec HTTP 500 ; cette base n’a pas été migrée et le contexte de test a été conservé. Une base distincte a été créée pour la recette et les artefacts de test sont stockés séparément. Postiz et les coûts restent **MOCK** ; aucun fournisseur externe n’a été appelé.

## Retour arrière et suite

Annuler uniquement les ajustements de finition dans les composants, styles, libellés et assertions concernés, en préservant les modifications préexistantes ; aucune migration applicative n’est ajoutée. Pour utiliser les projets sur la base locale initiale, examiner et appliquer ses migrations en attente dans le cadre de la maintenance de cet environnement.
