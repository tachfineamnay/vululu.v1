# Studio Vululu — recomposition du 2026-11-06

## Périmètre et contrats

Recomposition de la route projet selon `DESIGN.md`, `SCREENS.md`, les tokens et le plan SVG : navigation latérale, création et bandeau unique de scènes au centre, inspecteur contextuel, préparation et parcours repliables. PRD-03, PRD-04, PRD-08, PRD-09 et CDC-F-040 à 044 restent les références du lot. Aucune API, migration applicative, dépendance ou capacité fournisseur supplémentaire. Le brouillon local reste distinct du brief serveur ; les coûts et Postiz restent MOCK.

La sélection d’une scène commande sa durée et sa correction ; l’aperçu, les versions, la QA, l’approbation exacte et le téléchargement utilisent les fonctions existantes. La reprise d’un brouillon conflictuel garde le panneau de préparation ouvert. Les modifications préexistantes du libellé de storyboard ont été conservées.

## Recette et limites

- **PASS** : tests ciblés `tests/studio-draft.test.ts` et `tests/v1/production-plan.test.ts` (11 tests), PostgreSQL local réel pour le plan.
- **PASS** : E2E `brief-profile`, `conversation-demo`, `studio-audit`, `creation-delivery` et `project-journey` après rejeux. Correction ciblée, versions, invalidation d’approbation, téléchargement et checksum, accès anonyme et isolation entre comptes vérifiés. Le premier essai sur la base historique a échoué en HTTP 500 : sept migrations y manquaient. La recette a utilisé une nouvelle base isolée et des données fictives ; la base historique n’a pas été migrée.
- **PASS** : reflow automatisé à 1440, 1024, 768 et 390 px, sélection clavier ; captures locales desktop et mobile inspectées. Les captures ne constituent pas une certification d’accessibilité.
- **PASS** : vérification statique du kit de design, typecheck et lint ; build local vérifié séparément.
- **NOT_RUN** : comparaison pixel à pixel au PNG privé absent, zoom natif, lecteur d’écran et recette globale de release. La suite complète `pnpm test` a été interrompue après des échecs de connexion PostgreSQL dans le bac à sable ; aucun PASS global n’est revendiqué.

La base et les artefacts de recette isolés restent locaux. Aucun transfert réseau social ni appel IA payant n’a été effectué. Suite : qualification globale et vérification live séparées.

## Retour arrière

Revenir sur le commit de cette tranche, en préservant les modifications ultérieures éventuelles. Aucun changement de schéma applicatif ni suppression de données n’est nécessaire.
