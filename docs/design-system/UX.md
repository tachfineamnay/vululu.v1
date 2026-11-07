# Règles UX — simple au départ, précis à l'usage

## Modèle mental

| Objet | Explication destinée à l'utilisateur |
|---|---|
| Contexte | Votre marque, univers, projet ponctuel et ses références |
| Projet | Ce que vous préparez cette fois |
| Destination | Où la création sera utilisée |
| Parcours de création | Les étapes qui produisent le résultat |
| Flow | Vue avancée et réutilisable de ces étapes |
| Création | Résultat, versions et déclinaisons |

Le contexte n'est pas obligatoirement une marque commerciale.
Plusieurs univers explicites sont possibles ; aucun apprentissage silencieux, héritage sémantique ou Memory Bank dans la V1.

## Navigation

Trois entrées globales : Mes projets / Marques et références / Mes créations. Aide à emplacement stable.
Campagnes et bibliothèque s'insèrent dans les vues appropriées ; ne pas ajouter un onglet pour chaque table backend.
Mes créations est une galerie de résultats ; Mes projets organise le travail. Si la galerie n'a pas de backend dédié, utiliser une vue des données existantes ou la différer clairement.

## Démarrage

1. Votre idée : formulation libre courte, exemples, but et type de résultat.
2. Vos références : choisir un contexte existant, ajouter des ressources ou continuer sans marque.
3. Votre destination : réseau + usage + format expliqué ; choix différable ; aperçu du ratio.
4. Votre création : propositions puis production et correction.

Ces étapes conceptuelles se regroupent ensuite en Brief / Création / Finalisation dans le projet.
Ne jamais exiger la construction d'un flow ou un choix de modèle pour obtenir une première création.
Respecter les champs requis par le serveur ; une interface permissive ne doit pas inventer un backend acceptant des données absentes.

## Novices et professionnels

Une seule application, aucun questionnaire obligatoire « débutant ou expert ».
Le novice bénéficie d'exemples, réglages recommandés et explications locales.
Le professionnel peut rouvrir un projet, modifier directement, comparer, dupliquer une méthode et accéder au flow quand ces capacités existent.
Les étapes déjà remplies sont consultables et modifiables ; ne pas imposer le wizard à chaque retour.
Les réglages avancés ne cachent pas les informations nécessaires à une décision : coût, portée d'une correction, destination et état restent accessibles.

## Travail quotidien

- Contexte actif et nom du projet persistants.
- Création centrale, un seul sélecteur de scènes, inspecteur lié à la sélection.
- Texte libre utile pour exprimer une correction ; contrôles directs pour les changements précis.
- Un aperçu aide à comprendre le choix. Un exemple est identifié comme exemple.
- Une action dominante par tâche ; retour, annuler et aide restent secondaires.
- Action sans effet réel : pas de faux bouton opérant, expliquer l'indisponibilité au bon endroit.
- Rester sur un contenu en cours pendant une erreur ; offrir une reprise ciblée si le backend la permet.

## Budget et exécution

Avant génération coûteuse : résultat attendu, estimation qualifiée, plafond et confirmation.
Montants simulés identifiés ; coût inconnu signalé. Ne pas afficher de chiffre inventé.
Exécution longue : étape et artefacts disponibles ; pourcentage seulement si calcul réel.
Les actions annuler/reprendre n'existent à l'écran que si leur sémantique serveur est implémentée.
Pas de nouvelle confirmation pour chaque clic réversible. Confirmer les actions coûteuses, destructives ou à effet externe pertinentes.

## Versions et approbation

Modifier une scène conserve son ID et crée les versions nécessaires ; ne pas annoncer « les autres scènes sont conservées » si une dépendance globale impose leur régénération.
Après modification d'un master, invalider visuellement l'approbation obsolète conformément au serveur.
Exporter n'approuve ni ne transfère implicitement.
Transfert Postiz après approbation de la version exacte. Acquitté par Postiz ne signifie pas publié sur le réseau.

## Enregistrement

Enregistré uniquement après confirmation serveur.
États : Modifications en cours / Enregistrement… / Enregistré / Enregistrement impossible — Réessayer.
Sans endpoint de sauvegarde, conserver un vrai formulaire et une action Enregistrer.
Ne pas effacer les saisies après erreur ou changement de panneau ; avertir avant de quitter uniquement si perte réelle possible.
