# Diagnostic frontend Vululu — 2026-11-05

## Périmètre et état Git

Product Design : audit du parcours existant avant intervention. Branche `codex/v1-demo-coolify`, seule entrée locale initiale non suivie `.dsh/`, laissée intacte. Kit absent : seul commit `505b4b10655495df5a10f2c110228a3894ac1d37` appliqué par cherry-pick (`f2556b6`), sans fusion de branche.

Exigences : PRD-02/15, CDC-F-010/011/012/013, CDC-N-001/003/007/008/009, E02-01/02/03/04. Contrats conservés : révisions append-only, confirmation humaine, `expectedVersion`, ressources du propriétaire, sélection de versions exactes. Aucun changement de domaine ou d’API prévu.

## Parcours observés au navigateur

1. Connexion et accueil : PASS sur une base isolée, bannière démo visible, session réelle. Accueil encore centré sur la verticale historique cinq scènes.
2. Contextes, état vide : fonctionnel ; vocabulaire exclusivement « marque », thème sombre violet/cyan et grands titres contraires au kit.
3. Création : persistée par l’API ; formulaire intégral prérempli de données fictives non signalées, retour à l’accueil sans sélection du contexte créé.
4. Consultation/révisions : données réelles et historique présents ; édition immédiate très longue, proposition MOCK avant le contenu, absence de recherche.
5. Ressources : code et contrat vérifiés ; import binaire, versions immuables, droits/provenance, sélection par projet disponibles. Capture interactive initiale reportée à la recette du lot suivant.

Captures locales inspectées : `.v1/design-captures/01-contexts-before.jpg`, `02-create-before.jpg`, `03-review-before.jpg`. La première capture en chargement a été rejetée et remplacée par l’état vide stabilisé.

## Réutilisation et limites

Réutiliser StudioNav, ContextReviewPanel, les classes btn/input/label/check-row, le client API avec CSRF, le formulaire et la bibliothèque existants. Pas de bibliothèque UI ni de framework supplémentaire.

L’analyse distante n’existe pas : la proposition est MOCK, `websiteFetched=false`. Aucun champ de contraintes distinct ; utiliser les champs existants explicitement, sans inventer de persistance. Pas d’API de suppression/renommage d’actif : ne pas créer de faux contrôles. Les couleurs client appartiennent au contenu, pas au thème de l’interface.

## Ordre d’implémentation

1. Fondations sous `data-vululu-theme="blue"` sur `/contexts` ; tokens canoniques, champs, boutons, focus, messages et sélection. Vérifier la cascade avant extension.
2. Retrouver et consulter : recherche locale des seules données autorisées, fiche synthétique, complétude fondée sur les champs présents, édition progressive et révisions.
3. Création courte sans valeurs fictives, puis liens gardant le contexte vers ressources et nouveau projet ; retour depuis un projet existant.
4. Étendre le scope uniquement à création/contexte et ressources ; import réel, nouvelle version, droits, erreurs et sélection de projet.
5. Recette desktop/mobile/clavier, tests existants de contexte/actifs/isolation, typage, lint, build et scans. Aucun déploiement.

## Environnement et limites de preuve

La configuration locale pointe vers `vululu_v1_00`, absente du cluster actif. Base isolée `vululu_design_20261105` préparée avec les 19 migrations existantes ; `.env` et bases existantes inchangés. Fournisseurs IA et Postiz MOCK ; aucun coût fournisseur. Le PNG choisi n’est pas embarqué ; les tokens, le plan SVG documentaire et les contrats du kit guident la tranche. Fidélité pixel à pixel au PNG : NOT_RUN. La vérification des captures n’est pas une certification WCAG.
