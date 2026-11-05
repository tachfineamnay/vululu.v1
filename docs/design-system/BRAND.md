# Direction artistique et fondations

## Positionnement

**Vululu — votre activité a son studio.**
Un studio créatif organisé par contextes, projets, flows et destinations. Résultat = création exploitable ; aucune promesse automatique de conversion commerciale.

Personnalité : précise, accueillante, créative, professionnelle. L'indépendant retrouve son activité et son travail ; le créatif confirmé garde la maîtrise.

## Signature

- Wordmark texte « vululu », encre, bas de casse, graisse 700 ; petit trait bleu droit sous le mot. Ce traitement typographique provisoire ne prétend pas être un logo vectoriel final.
- Encadrement d'aperçu par quatre repères de cadrage fins, facultatifs, bleu. Jamais sur tous les composants.
- Jaune limité au repère d'étape active ; ne pas multiplier simultanément les accents jaunes.
- Photos et créations de l'utilisateur donnent le caractère visuel. Aucun univers de céramique imposé : Noma est une fixture.
- Priorité de séparation : espace, alignement, filet, fond léger, puis bordure. Ombre seulement pour un élément réellement superposé.

## Palette canonique

| Rôle | Hex | Usage |
|---|---|---|
| background | #F4F5F1 | Fond |
| surface | #FFFFFF | Travail et champs |
| text | #172536 | Texte principal |
| text-muted | #596579 | Texte secondaire utile |
| action | #2347BE | Action principale, lien, focus |
| action-hover | #1C3898 | Survol actif |
| selected | #EDF1FF | Fond de sélection |
| accent | #F5D867 | Repère, avec texte encre |
| border | #D7DCE4 | Séparateur décoratif |
| control-border | #7A8798 | Contour nécessaire à identifier un champ |
| success / success-bg | #216347 / #EBF6EF | État réussi explicitement nommé |
| warning / warning-bg | #77520B / #FFF3CF | Attention expliquée |
| danger / danger-bg | #B1372F / #FFF0EE | Erreur ou suppression |

Les couleurs de marque du client appartiennent aux créations, pas aux boutons de Vululu.
Un liseré gris clair seul ne suffit pas à identifier un contrôle.
Ne pas utiliser le jaune comme petit texte, lien, focus ou signal de succès.

## Typographie

DM Sans pour toute l'interface : 400, 500, 600, 700 ; fallback ui-sans-serif/system-ui/Segoe UI.
Corps 16px / 1.5 ; labels et métadonnées 14px / 1.5 ; titre d'écran 28px / 1.2 ; titre de section 20px / 1.3.
Pas de 10-12px pour une information essentielle. Titre 36px au maximum sur accueil ; pas de hero marketing dans le Studio.
Les fichiers de police ne sont pas livrés. Au raccordement : police locale autorisée avec sa licence, ou fallback système déclaré ; éviter une dépendance réseau imprévue au build.

## Géométrie

Échelle d'espace : 0, 4, 8, 12, 16, 24, 32, 48, 64px.
Bouton/champ : hauteur minimale 48px ; cible secondaire 44px lorsque possible.
Rayons : 6px petit, 8px standard, 12px pour dialogue ; pill réservé à un usage motivé.
Icônes 20px, trait cohérent ; texte avec les actions. Pas de nouvelle bibliothèque d'icônes nécessaire pour appliquer la charte.

## Mouvement

120–180ms pour un changement d'état ; aucune animation permanente de décoration.
Respecter prefers-reduced-motion. Ne pas simuler une progression avec une animation de pourcentage.
Fond du lecteur sombre autorisé pour juger le média, interface périphérique claire.

## À exclure

Dégradés violet/cyan, halos, verre translucide systématique, mascottes d'agents, orbites, étoiles « magique », statistiques de remplissage, badges partout, cartes imbriquées décoratives, boutons ronds sans texte pour les tâches principales.
Le thème sombre existant est à migrer par tranches ; ce kit n'ajoute pas de thème sombre alternatif.
