# F04 — Publication multicanale depuis le calendrier

Date : 2026-11-20 · suite de [C06](C06.md). Les contrats de création, le calendrier, ToolBroker, le worker Hatchet et le relais signé existant restent en place.

## Parcours client

1. Dans **Calendrier → Comptes de publication**, saisir la clé API de son propre espace Postiz hébergé. Un compte social déjà connecté peut être sélectionné directement. **Préparer l’autorisation du réseau** ouvre le consentement OAuth du réseau géré par Postiz dans un autre onglet ; revenir dans Vululu et charger les comptes. Les comptes désactivés ou de type inconnu ne sont pas proposés. Vululu vérifie de nouveau la destination avant de l’associer et avant tout envoi. La clé reste côté serveur après association, chiffrée AES-256-GCM avec liaison à l’identifiant de connexion. Aucun mot de passe réseau n’est demandé.
2. Choisir un contenu éditorial approuvé, une création rendue et approuvée liée à sa version, puis le réseau et le compte. Le calendrier montre la date, le média, la légende et le canal. Sélectionner un autre réseau réutilise explicitement la création et la légende approuvées ; le client vérifie leur adéquation. **Préparer la programmation** ne contacte pas le réseau ; **Autoriser la programmation** approuve cette demande exacte dans ToolBroker. Une date future est exigée ; pour distribuer rapidement, choisir un créneau proche dans le calendrier.
3. Un identifiant Postiz confirme uniquement la soumission. **Vérifier chez Postiz** réconcilie par identifiant de post **et** de canal ; l’état `PUBLISHED` n’est confirmé qu’avec une preuve réseau. Un résultat manquant ou inconnu n’est jamais interprété comme un échec certain ni automatiquement renvoyé. Le statut éditorial demeure indépendant. Le relais signé opérateur continue de fonctionner pour les connexions déjà configurées.
4. Avant le créneau, une demande d’annulation distincte doit être approuvée ; le worker ne supprime qu’une entrée encore signalée `QUEUE` par Postiz. L’état peut évoluer entre lecture et annulation. Pour changer de créneau, attendre confirmation de l’annulation, modifier la date dans l’éditeur existant, puis approuver une création liée à la nouvelle version et une nouvelle demande. Pas de modification distante implicite. Les demandes simultanées pour le même contenu/version/compte sont dédupliquées ; une publication active, publiée ou incertaine bloque aussi un nouvel envoi du même contenu au même compte après une modification du calendrier.
5. **Dissocier de Vululu** détruit les secrets locaux et retire les opérations locales qui n’ont pas encore été acquises par le worker. Une demande déjà acceptée par Postiz n’est pas annulée par la dissociation. Révoquer la clé ou le compte à la source si nécessaire. Pour renouveler la clé, réassocier le même compte : l’identifiant de connexion et son historique sont conservés. Vululu applique une durée locale de 90 jours aux nouvelles associations client ; cela ne prétend pas être l’expiration de la clé annoncée par Postiz.
6. Le **kit manuel** contient les médias originaux numérotés, la légende, les instructions et un manifeste (réseau, date, source, type MIME, SHA-256). Disponible pour les formats ou comptes non éligibles ; une légende trop longue est conservée avec un avertissement. Le kit n’envoie rien et ne contourne pas l’approbation éditoriale.

## Capacité mise en œuvre

| Destination | Envoi Postiz de F04 | Autres formats / opérations |
| --- | --- | --- |
| LinkedIn personnel / Page | Une image carrée ou portrait, légende ≤ 3 000 caractères | Kit manuel |
| Page Facebook | Une image carrée ou portrait, légende ≤ 5 000 (limite Vululu) | Pas de profil personnel ; kit manuel hors périmètre |
| Instagram professionnel | Une photo JPEG carrée ou portrait `post_type: post` ≤ 5 Mo, légende ≤ 2 200 | Reels, stories et carrousels en kit manuel |
| Google Business Profile | `gmb`, `topicType: STANDARD`, une photo carrée JPEG et texte ≤ 1 500 | Pas d’offre, événement, alerte, CTA distant ou vidéo automatisés par F04 |
| TikTok | Connexion/disponibilité visible ; **aucune écriture distante** | Kit manuel. Pas de valeur de confidentialité choisie par défaut, d’audit présumé ni de consentement TikTok inventé |

Les règles du fournisseur, du compte, de la région ou du profil s’appliquent encore. Le JPEG déterministe pour Instagram et Google est dérivé uniquement du rendu approuvé et vérifié ; la source ne change pas. Les seuls uploads automatiques sont des images issues de l’artefact interne et contrôlées en taille. Vululu ne télécharge pas d’URL client et ne suit pas les redirections du fournisseur.

Sources : [Postiz — intégrations](https://docs.postiz.com/public-api/integrations/list), [autorisation OAuth](https://docs.postiz.com/public-api/integrations/connect), [création et paramètres](https://docs.postiz.com/public-api/posts/create), [liste et reçus](https://docs.postiz.com/public-api/posts/list), [paramètres gmb](https://docs.postiz.com/public-api/providers/gmb), [Google Local Posts](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts), [TikTok — exigences de partage et d’audit](https://developers.tiktok.com/docs/en/content-sharing-guidelines).

## Activation (non effectuée)

Appliquer la migration additive `20261120210000_publication_schedule`, configurer `POSTIZ_PUBLISH_ENABLED=1` et la même `PUBLISHING_ENCRYPTION_KEY` (32 octets en base64, dans le gestionnaire de secrets) pour l’API et le worker Hatchet. Autoriser `postiz.schedule@1` et, si applicable, `postiz.cancel@1` sur le compte d’exécution et dans les habilitations commerciales existantes. Prévoir un espace Postiz isolé ou autorisé par client. Le kit manuel fonctionne sans clé fournisseur. La désactivation stoppe les nouvelles écritures Vululu, mais ne retire pas les entrées déjà chez Postiz.

Recette : `pnpm test tests/postiz-multichannel.test.ts tests/v1/{publishing,execution-broker,results}.test.ts` et `pnpm exec playwright test --config playwright.publishing.config.ts` (base PostgreSQL locale jetable et FFmpeg/ffprobe). Le transport HTTP Postiz et le dispatcher navigateur sont **MOCK**, le stockage et les approbations sont réels en local. OAuth, connexions sociales, publications réelles, transport Hatchet réel et déploiement : **NOT_RUN**.

Résultats Arena : 28 tests ciblés réussis (1 scénario existant de transport ignoré) ; Playwright bureau et mobile 2/2 (association, aperçu, autorisation ToolBroker, reçu simulé et kit TikTok) ; lint et vérification TypeScript API, Web, Media et DB réussis. Migration SQL appliquée sur la base locale jetable.
