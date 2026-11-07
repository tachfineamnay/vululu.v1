# Zone Création du Studio — 2026-11-06

## Périmètre et critères

Exigences concernées : PRD-04, PRD-08, PRD-09 et PRD-14 ; CDC-F-040, CDC-F-041, CDC-F-042, CDC-F-044, CDC-F-050, CDC-F-051 et CDC-F-052. La zone Création présente un aperçu, un unique bandeau de scènes et l’inspecteur des commandes existantes. La scène sélectionnée détermine l’image et les commandes ; la vidéo complète et les versions du master restent distinctes. Qualité, approbation et transfert sont regroupés dans Finaliser.

L’API existante expose la dernière image d’une scène, sans clip individuel ni sélection d’une ancienne version d’image. L’interface le précise et ne rattache pas cette image à une version particulière du master. Aucun contrat serveur, fournisseur ou mécanisme d’approbation n’a changé.

## Preuves

- PASS : test Playwright ciblé `e2e/studio-creation-view.spec.ts` avec API et médias **MOCK**. Changement de scène, URL de l’image, durée et correction envoyées au bon Scene ID, conservation d’une instruction non envoyée, scène sans image, absence de master, vidéo et comparaison de versions, approbation du checksum exact, transfert MOCK et consultation dans Mes créations.
- PASS : contrôle de la sélection et de l’absence de débordement global à 1440, 1024, 768 et 390 px dans ce scénario simulé ; inspection des captures desktop et mobile.
- PASS : tests unitaires ciblés du parcours, du brouillon et de la livraison ; TypeScript, ESLint ciblé, compilation web, contrôle du kit de design et `git diff --check`.
- NOT_RUN : E2E authentifié avec PostgreSQL et médias réels, faute de session de recette. Les tests existants de livraison et de vidéo ont été adaptés au nouvel accès à Finaliser et au lecteur ; leur exécution reste à réaliser dans l’environnement de recette. Le test MOCK ne prouve ni le stockage réel ni le rendu vidéo.

## Retour arrière et suite

Annuler uniquement les modifications de cette tranche dans les composants, styles et tests concernés, sans annuler les travaux précédents du cadre et du parcours ; aucune migration ni suppression de données. Prochaine étape : exécuter les scénarios E2E authentifiés de livraison, de correction et de vidéo sur un projet de recette.
