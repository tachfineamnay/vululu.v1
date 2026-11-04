# ADR-0016 — V1 complète en mode démo sans connexion IA

- Date : 2026-11-04.
- Statut : Acceptée pour le périmètre démo autorisé par l’utilisateur ; livraison non certifiée.
- Décideur : porteur du projet (« V1 complète avec un compte démo, sans connecter l’IA », puis GO sur le plan).
- Complète : ADR-0001/0004/0005/0008/0013/0014 ; ne les remplace pas.
- Sources : PRD-01 à PRD-16, CDC V1.2, E00-03/04, addendum V1_DEMO_SCOPE_2026-11-04.

## Décision

Construire les parcours V1 avec une variante démo explicite et sans clé IA. Les adaptateurs de capacités produisent des résultats déterministes marqués MOCK. Les médias générés, données, contrôles de droits, artefacts, approbations et opérations restent réels. La remise Postiz est MOCK tant que son intégration réelle n’est pas qualifiée ; jamais une publication.

Le compte démo est un utilisateur ordinaire sur une instance privée. Le super-admin est distinct. Le bootstrap lit ses credentials côté serveur, refuse un compte existant non identifié comme démo, reste répétable et n’écrase ni mot de passe ni données de travail. Aucun login automatique ni secret frontend.

Une identité technique stable réservée au seed démo et un audit de création permettent de reconnaître ce bootstrap. Une collision d’identité ou d’email entraîne un refus transactionnel. Le seed n’applique pas une promotion de rôle à un compte préexistant.

## Conséquences

La recette démo n’est pas la qualification de fournisseurs live et ne change pas le corpus verbatim. Les montants simulés restent MOCK ; les voix préenregistrées ne sont pas présentées comme TTS libre. Les choix S3, moteur durable, auth MCP et rétention restent à qualifier par leurs lots.

Déploiement et ouverture à une audience exigent leur autorisation et des preuves d’exploitation. Aucun coût IA ni extension V2 n’est introduit.

## Alternatives

Connecter des fournisseurs réels maintenant contredit la demande utilisateur. Réduire la livraison au démonstrateur vidéo existant ne satisfait pas les parcours complets demandés. Donner le rôle administrateur au compte démo créerait un accès injustifié.
