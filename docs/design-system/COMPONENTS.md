# Contrats des composants

Réutiliser le HTML natif et les composants existants avant toute nouvelle abstraction. Les noms ci-dessous sont des contrats de design, pas une obligation de créer un fichier pour chacun.

| Composant | Contenu obligatoire | Comportement et accessibilité |
|---|---|---|
| Button | Verbe explicite, variante primary/secondary/quiet/danger | button type explicite ; loading annoncé, double soumission empêchée ; aucun lien déguisé en mutation |
| Link | Destination compréhensible | a/href pour naviguer ; souligné dans le contenu ; état focus visible |
| Field | Label persistant, valeur, aide/erreur | id/htmlFor, aria-describedby, aria-invalid ; required natif si nécessaire ; placeholder non substitut au label |
| RadioGroup | Question/legend + choix | fieldset/legend, radios natifs ; sélection exclusive ; flèches natives |
| CheckboxGroup | Choix cumulables | cases natives ; ne pas mélanger radio et checkbox pour un même groupe |
| ContextSelector | Nom du contexte et nature | select natif acceptable ; liste limitée aux ressources autorisées |
| ProjectHeader | Retour, titre, contexte, état réel, action | retours sans perte de saisie ; contrôle d'export selon artefact disponible |
| StepNavigation | Étape active et état | nav/ol + aria-current=step ; liens pour naviguer ; pas de rôle tab sans comportement de tabs |
| Status | Texte, éventuellement icône | couleur complémentaire ; mettre à jour sobrement, pas de badge géant |
| SceneStrip | Nombre variable de scènes, noms, durée | ol/li/button, aria-pressed sur la sélection ; un seul navigateur de scènes ; IDs stables comme clés |
| MediaPreview | Source réelle, ratio, lecture | video controls natif si possible ; image alt pertinent ; object-fit:contain ; pas d'autoplay sonore |
| Inspector | Nom de l'élément sélectionné, contrôles utiles | preserve draft lors du changement ; lien clair entre sélection et panneau |
| Disclosure | Réglages avancés | details/summary natif ; contrôles nécessaires à la décision non cachés |
| Versions | Version, état, aperçu et action | ancien résultat consultable ; comparaison nommée ; approbation liée à la bonne version |
| GenerationSummary | Livrables, estimation, plafond | confirmer avant effet payant ; unité et caractère simulé/inconnu explicites |
| Feedback | Sévérité, cause utile, reprise | erreur conservant les données ; role=alert seulement si action requise immédiatement |
| ConfirmDialog | Action, conséquence, annuler | focus initial pertinent, Échap, retour de focus, piège de focus correct ; danger réservé à destruction |
| EmptyState | Explication et prochaine action | phrase courte + une action réalisable ; aucun dashboard de faux exemples non identifiés |

## États à prévoir

Pour chaque composant interactif pertinent : défaut, survol, focus clavier, actif/sélection, désactivé, chargement, erreur.
Une commande indisponible indique pourquoi ; ne pas tout griser sans explication.
Un statut live peut utiliser role=status ; ne pas répéter une annonce à chaque seconde de rendu.

## Tabs de l'inspecteur

Texte / Visuel / Audio seulement si les capacités correspondantes sont raccordées.
Si tabs custom : rôles tablist/tab/tabpanel, aria-selected, aria-controls, flèches et Home/End.
Si cette complexité ne se justifie pas, utiliser boutons de section ou détails natifs correctement nommés.
Une section audio indisponible peut être omise ou annoncée localement « Audio non disponible dans cette version ».

## Texte et média

Le champ « Texte à l'écran » modifie le contenu média par la voie métier existante.
Si le moteur ne prend pas un style en charge, ne pas créer les choix « Sobre / Affirmé » comme faux réglages.
L'utilisateur doit connaître la portée : scène seule, montage global, nouvelle version et coût éventuel.

## Modale et panneau mobile

Un panneau non modal ne piège pas le focus.
Un panneau modal mobile doit gérer scroll, focus, fermeture et retour à la sélection.
Pas de dialogue pour une simple aide ou une édition courante.
