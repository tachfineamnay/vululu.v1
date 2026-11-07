# Cadre de navigation Vululu — 2026-11-06

## Périmètre et critères

Exigences concernées : PRD-02, PRD-03, PRD-09, PRD-15 et PRD-16 ; CDC-F-010, CDC-F-013 et CDC-N-001. La tranche concerne uniquement la présentation et l'accès aux parcours existants : trois entrées principales, outils secondaires accessibles, navigation commune dans le Studio et adaptation mobile. Les actions et contrats serveur restent inchangés ; aucune capacité nouvelle ni donnée simulée n'est ajoutée.

## Preuves

- PASS : navigation entre les trois entrées et les pages Campagnes, Ressources et Catalogue dans le navigateur, aux largeurs 1440, 1024, 768 et 390 px ; pas de débordement horizontal constaté sur ces pages.
- PASS : contrôle statique du kit `node docs/design-system/scripts/check.mjs` ; vérification TypeScript et ESLint ciblé.
- PASS : `scripts/verify-foundation-docs.ps1` et `scripts/check-secrets.ps1`.
- NOT_RUN : parcours E2E authentifié de création, Studio et protection des brouillons : la session locale requiert une connexion et les identifiants de recette ne sont pas disponibles. Le navigateur Playwright géré n'est pas installé ; le Chrome automatisé n'a pas pu accéder au serveur local dans le bac à sable.
- NOT_RUN : tests d'intégration métier et de sécurité, hors modification des contrats serveur ; aucune certification globale ni recette fonctionnelle n'est revendiquée.

## Retour arrière et suite

Restaurer les fichiers de cette tranche depuis leur état précédent ; aucune migration ni modification de données. Prochaine étape : exécuter le scénario E2E authentifié existant et vérifier le Studio sur les quatre largeurs avec un projet de recette.
