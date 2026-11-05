# Frontend Vululu — consignes de design

Ces consignes complètent AGENTS.md à la racine ; elles ne changent ni sécurité, ni périmètre, ni architecture.

Avant une modification visuelle, lire ../../DESIGN.md puis ../../docs/design-system/README.md. Charger ensuite seulement les rubriques utiles, pour économiser les tokens.

- Direction retenue : troisième piste affinée, studio clair bleu/jaune ; public indépendant débutant et professionnel.
- Utiliser les valeurs sémantiques de docs/design-system/tokens.json et la référence tokens.css. Pas de couleurs inventées.
- Conserver le backend, les vrais états et les use cases. Une maquette ne prouve pas une capacité.
- Adapter les composants existants ; ne pas ajouter Tailwind, shadcn, une bibliothèque UI ou un nouveau package de composants par réflexe.
- Parcours simple au démarrage, accès direct aux scènes/versions/flow pour les usages avancés.
- Un seul bandeau de scènes sous l'aperçu. Inspecteur limité à l'élément sélectionné.
- Une action dominante par tâche, boutons avec texte, labels visibles, focus clavier et erreurs actionnables.
- Aucun faux Enregistré, faux pourcentage, faux coût, faux transfert ou publication. Respecter le mode démonstration.
- Ne pas hardcoder les trois scènes de l'exemple ; respecter scene_id et les données effectives.
- Toute mutation reste sur les services/API existants ; aucune clé fournisseur côté navigateur.
- Implémenter par petites tranches ; vérifier 1440/1024/768/390 px, clavier et scénario réel concerné.
- Aucun changement silencieux de PRD/CDC, d'AGENTS racine ou d'ADR accepté.
- Le thème violet existant est une migration à réaliser, pas une seconde direction artistique autorisée.
- Ne pas modifier le thème global de toutes les routes à l'aveugle : suivre IMPLEMENTATION.md.
- Rapport final : changement, preuves PASS/FAIL/NOT_RUN, limites. Pas de certification globale à partir d'un seul écran.
