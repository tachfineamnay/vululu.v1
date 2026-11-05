# Langage et microcopy

Interface française, ton direct, professionnel et accueillant. Vouvoiement cohérent. Une phrase explique une chose. Éviter « magique », « révolutionnaire », « unleash », « agent qui réfléchit » et les promesses de performance non mesurées.

## Dictionnaire

| Technique | Libellé UI conseillé |
|---|---|
| BrandContext | Marque et références / Contexte, avec explication |
| JobRun | Création en cours |
| ArtifactVersion | Version |
| Capability provider | Réglages avancés / Fournisseur dans l'administration |
| DAG / workflow | Parcours de création |
| Scene ID | Nom + numéro de scène ; ID conservé dans les détails |
| Generation prompt | Décrivez la modification |
| ratio 9:16 | Vidéo verticale, avec aperçu |
| Postiz acknowledged | Transfert confirmé, pas Publié |

## Actions

Nouveau projet · Ajouter des références · Voir les propositions · Créer cette version · Modifier cette scène · Comparer les versions · Télécharger · Transférer vers Postiz.
Un bouton ne dit pas « Continuer » si sa conséquence peut être plus précise.
« Publier » seulement pour une action de publication réellement connectée et autorisée.

## États

- Chargement : « Chargement du projet… »
- Production : « Création de la scène 2 sur 5. » si information réelle disponible.
- Sauvegarde : « Enregistrement… », puis « Enregistré » après réponse positive.
- Échec sauvegarde : « Vos modifications n'ont pas été enregistrées. Réessayer. »
- Échec scène : « Cette scène n'a pas pu être créée. Vos autres résultats restent disponibles. »
- Dépendance globale : « Cette modification demande de refaire le montage. Les versions précédentes restent disponibles. »
- Quota/plafond : « Cette création dépasse le plafond choisi. Modifiez le projet ou augmentez le plafond. »
- Indisponibilité : « Ce format n'est pas encore disponible dans cette version. »
- Mode démo : « Mode démonstration : les capacités IA et le transfert sont simulés. »
- Export manquant : « Créez une version pour pouvoir la télécharger. »
- Ressource inaccessible : « Ce projet est introuvable ou n'est pas accessible. »
- Transfert échoué : « La création est conservée. Le transfert n'a pas abouti. Réessayer le transfert. »

Adapter ces exemples à la vraie cause ; ne pas annoncer la conservation d'éléments non vérifiée par le serveur.
Aucune stack trace, URL privée ou clé dans l'interface ou les journaux.
Un message local suffit ; éviter toast + alerte + badge pour le même événement.

## Correction

« Modifier cette scène » désigne l'objet avant de demander une instruction.
« Appliquer à cette scène » seulement si le backend respecte cette portée.
Si une correction coûte : l'annoncer avant l'exécution, avec la portée et l'estimation.

## États vides

Projets : « Votre premier projet commence ici. » / Créer un projet.
Références : « Ajoutez les éléments que Vululu doit utiliser. » / Ajouter des références.
Créations : « Vos créations apparaîtront ici. » / Ouvrir mes projets.
Aucune donnée d'exemple présentée comme travail réel de l'utilisateur.
