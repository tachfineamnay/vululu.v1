# Accessibilité et recette UX

Cible WCAG 2.2 AA ; ce document ne constitue pas une certification.
Les couleurs exactes et couples contrôlés sont dans tokens.json.

## Contrôles indispensables

- Texte courant : contraste >=4.5:1 ; grand texte >=3:1 ; repères de contrôle nécessaires >=3:1.
- Cible confortable 44px, bouton/champ 48px ; ce choix est plus généreux que le minimum AA de 24px avec exceptions.
- Focus visible de 2px + décalage 3px, non masqué par barre fixe ; sélection jamais indiquée par couleur seule.
- Labels persistants, erreurs liées aux champs et instructions avant l'action.
- Zoom texte 200%, reflow à 320px CSS selon exigences applicables ; aucune perte de fonction.
- Navigation clavier sans drag obligatoire ; séquence logique, lien d'évitement si navigation répétée.
- Icône décorative aria-hidden ; bouton icône seul limité aux conventions claires avec nom accessible.
- Titres hiérarchisés, nav/main/aside utilisés selon leur rôle.
- Annonces asynchrones sobres ; pas de saut de focus à chaque artefact généré.
- Réduction de mouvement, pas de flash ni autoplay sonore.
- Sous-titres/transcription pour les médias requis par le contenu et le périmètre ; ne pas déclarer un média accessible sur la seule présence de controls.

## Recette par tranche

1. Vérifier l'écran en 1440, 1024, 768 et 390px.
2. Parcourir sans souris : ouverture du projet, choix d'une scène, correction, sauvegarde, retour.
3. Provoquer un échec réseau réel ou contrôlé : saisie conservée et reprise explicite.
4. Vérifier loading, empty, erreur, succès, disabled avec une cause compréhensible.
5. Vérifier noms accessibles, labels, focus, contrastes réels et zoom.
6. Après modification : ancienne version accessible et état d'approbation conforme au serveur.
7. Rejouer le scénario E2E existant concerné ; ajouter un test seulement pour un nouveau comportement utile à protéger.

Automatiser avec l'outillage existant ; pas d'installation imposée d'une nouvelle dépendance.
Ne pas confondre un scan automatique sans alerte avec une conformité complète.

## Test d'usage à organiser

Recruter des indépendants débutants et des utilisateurs créatifs confirmés.
Sans tutoriel oral : créer un projet, retrouver les références, corriger une scène, comparer et exporter.
Noter réussite, hésitations, retours arrière, erreurs et temps. Cibles proposées à valider, pas résultats acquis.
Tester aussi un projet déjà existant pour mesurer l'efficacité des pros.

## Sources

- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://www.nngroup.com/articles/progressive-disclosure/
- https://www.nngroup.com/articles/flexibility-efficiency-heuristic/
