# Prompt prêt à copier dans l'IDE

## Première utilisation

Lis AGENTS.md racine, DESIGN.md, apps/web/AGENTS.md et docs/design-system/README.md.
Travaille dans le checkout effectif ; commence par son état Git et les contrats de release actuels.
Le design choisi est le troisième concept, atelier clair bleu/jaune affiné pour indépendants et pros.
Lis BRAND.md et UX.md, puis seulement les contrats nécessaires à l'écran demandé.

Objectif de cette tâche : appliquer le design system à l'écran que je nomme, en conservant ses fonctionnalités.
Si je ne nomme aucun écran, commence par la route Studio et ses composants déjà existants, sans refonte globale du backend.
Respecte tokens.json, la composition SCREENS.md et le plan SVG ; adapte le code existant.
La référence est une création centrale, un seul bandeau de scènes dessous et un inspecteur contextuel.
Le contexte reste visible ; les réglages avancés sont facultatifs ; les pros accèdent directement aux versions et au parcours.

N'ajoute ni Tailwind/shadcn, ni nouveau package de composants, ni fournisseur, ni migration par défaut.
Préserve sessions, CSRF, propriétaire, scene_id, versions, snapshots, approbation exacte et bannière démo.
Vérifie chaque capacité avant d'afficher une action active. Aucun endpoint inventé ni succès simulé.
N'affiche Enregistré qu'après une réponse positive et n'efface pas une saisie après échec.
Ne hardcode pas le métier Noma, trois scènes, 15 secondes ou une métrique de coût de la maquette.
Ne confonds pas prototype visuel, rendu déterministe et IA réelle.

Implémente une tranche cohérente ; conserve le travail déjà présent.
Vérifie au navigateur 1440/1024/768/390px, clavier, chargement, erreur, vide et scénario utile.
Utilise les tests existants pertinents et les contrôles locaux du dépôt.
Rapporte : ce qui a changé, preuves effectivement exécutées, limitations et suite.
Un contrôle non exécuté reste NOT_RUN. Ne demande pas une validation pour chaque choix réversible déjà cadré.

## Pour une tâche suivante

Lis DESIGN.md et le contrat utile du design system. Applique-les à [écran/composant].
Préserve les cas d'usage existants ; vérifie la capacité réelle avant chaque action.
Livre une tranche testée avec les preuves et limites, sans relire ni régénérer tout le kit.

## Pour les outils qui ne chargent pas AGENTS.md

Joindre DESIGN.md, docs/design-system/README.md et ce fichier au contexte du chat.
Cursor : règle .cursor/rules/vululu-design.mdc auto-attachée selon globs.
Copilot compatible : .github/instructions/vululu-ui.instructions.md selon applyTo.
Claude/DeepSeek : joindre explicitement les fichiers si leur environnement ne les charge pas ; ne pas écraser leurs instructions existantes.
