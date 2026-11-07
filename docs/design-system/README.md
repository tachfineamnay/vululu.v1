# Design System Vululu — Atelier bleu

Version **1.0.0**, 2026-11-05. Kit de cadrage pour l'IA de l'IDE, pas une librairie de composants déjà intégrée.

## Démarrer

Lire [../../DESIGN.md](../../DESIGN.md), [BRAND.md](BRAND.md), [UX.md](UX.md).
Demander ensuite à l'IA une tranche précise avec [IDE_PROMPT.md](IDE_PROMPT.md).
Les règles proches du code et les connecteurs IDE renvoient ici sans recopier toute la charte.

## Lecture ciblée

| Travail | Fichiers à lire |
|---|---|
| Couleur, typo, espacement, états | BRAND.md + tokens.json + tokens.css |
| Parcours novice/pro, contexte, destination, flow | UX.md |
| Bouton, champ, scène, inspecteur, dialogue | COMPONENTS.md |
| Écran ou adaptation mobile | SCREENS.md + reference/studio-layout.svg |
| Libellé, erreur, état vide | CONTENT.md |
| Clavier, contraste, retours d'état, recette | ACCESSIBILITY.md |
| Migration du thème existant | IMPLEMENTATION.md |
| Décisions, périmètre, contradictions | DECISIONS.md + HANDOFF.md |

Ne pas charger tout le kit pour une modification isolée.

## Contenu et autorité

- tokens.json est la source numérique canonique ; format simple propre au projet, pas une revendication de conformité DTCG.
- tokens.css contient les mêmes variables et des styles de référence à portée limitée.
- COMPONENTS.md définit les contrats, pas un nouveau package React.
- reference/studio-layout.svg est un plan de composition vectoriel ; ce n'est pas la capture générée ni une validation visuelle.
- reference/README.md identifie la dernière maquette choisie et les directions abandonnées.
- DECISIONS.md enregistre le choix utilisateur sans réécrire les documents fondateurs.
- HANDOFF.md distingue les vérifications réalisées et celles à lancer dans l'IDE.

## Validation du kit

Depuis la racine du dépôt, Node >= 24 :

    node docs/design-system/scripts/check.mjs

Le contrôle vérifie JSON, synchronisation CSS, liens internes, contrats d'entrée et couples de contrastes. Il ne remplace ni rendu navigateur, ni test utilisateur, ni suite applicative.

## Périmètre

La cible de conception accueille débutants et pros. L'état fonctionnel reste celui des contrats de release.
Audio, flow éditable, nouveaux formats, publication réelle et monétisation ne deviennent pas disponibles parce qu'ils apparaissent dans un document.
Aucune dépendance, migration, import global, clé IA, publication ou activation de thème dans ce kit.
