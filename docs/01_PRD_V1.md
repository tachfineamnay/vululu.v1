# PRD — VULULU IA V1.2
**Product Requirements Document** · 21/10/2026 · **Destinataires : produit, UX, engineering, QA, DeepSeek Harness**

## 1. Vision et problème
Un créateur, une marque ou un opérateur interne doit produire des contenus adaptés à TikTok, Instagram et LinkedIn sans orchestrer manuellement dix outils IA, perdre les références de style, recommencer une vidéo entière pour changer un plan, ni fournir le même contexte à chaque brief. VULULU IA est un studio de production créative doté d'un workflow explicite, d'agents spécialisés, d'un catalogue de fournisseurs IA évolutif et d'un passage final vers Postiz. La **créativité est supervisée** ; l'utilisateur garde un droit d'interruption, de correction et d'approbation.

## 2. Objectifs V1 (P0)
**PRD-01 — Accès privé** : le super-utilisateur invite des utilisateurs ; compte, date d'invitation/activation, activité et rôles consultables ; pas de vente ni inscription ouverte.
**PRD-02 — Contextualisation réutilisable** : créer un ou plusieurs contextes de marque/projet à partir d'URL, descriptions, offres/produits, identité graphique, logos, médias, documents, liens sociaux ; agent d'accueil converse, synthétise et propose des fiches **validées manuellement**. Chaque contexte a un `context_id` et `revision_id`. Cette mémoire *documentaire explicite* reste V1 ; la mémoire sémantique adaptative est V2.
**PRD-03 — Workflow guidé** : contexte → réseau → type de publication → format/ratio/durée → organique ou intention sponsorisée → type de création → style/direction artistique → options voix/musique/mix → brief interactif → validation du brief.
**PRD-04 — Sorties créatives** : poster/image, carrousel, texte accompagné de visuels, motion design, vidéo multiscène et hybride (selon capacités qualifiées). Générer un master compatible avec le profil de plateforme sélectionné et un preview ; ne pas annoncer un format indisponible.
**PRD-05 — Audio professionnel** : choix voix off, langue, timbre/échantillon autorisé, texte lu, musique issue d'une bibliothèque licenciée ou fichier utilisateur, option sans voix/sans musique, niveau de mix initial automatique avec ducking et limites de crête, correction manuelle simple (voix/musique). Vérification des droits pour publicité.
**PRD-06 — Creative director** : convertir les choix en `BriefRevision` structuré ; agents de planification, spécialistes et QA avec capacités et contraintes distinctes ; journal des décisions de routage.
**PRD-07 — Multimodèle** : modèles/fournisseurs configurables par `capability`, qualité mesurée, droits, coût, latence, santé ; fallback contrôlé sans changement du brief ; pas de « meilleur modèle universel » codé en dur.
**PRD-08 — Édition ciblée** : stabilité de `scene_id` et `character_id` (identifiants applicatifs, pas promesse de mémoire native du fournisseur). Une commande « modifie scène 3 » crée version nouvelle et ne relance que les étapes effectivement dépendantes.
**PRD-09 — Boucle humaine** : voir storyboard et rendus, commenter par scène, comparer les versions, relancer, rejeter ou approuver **une version exacte** du master ; le feedback ne devient pas une préférence permanente par inférence.
**PRD-10 — Diffusion** : transfert **après approbation** vers Postiz avec payload, état, idempotence, confirmation et journal. Postiz gère les comptes sociaux / la publication ; VULULU IA n'est pas un gestionnaire natif d'API publicitaires.
**PRD-11 — Administration minimale** : super-utilisateur gère invitations, fournisseurs/modèles, profils de compétences, configurations des agents, « soul »/prompts versionnés, tests d'évaluation, activation/rollback, quotas et journaux.
**PRD-12 — MCP V1** : même capacité via un client MCP autorisé (Codex/IDE/cloud) que via le web : contextes, briefs, runs, scènes, assets, approbation, transfert ; admin restreinte. HTTP distant authentifié, pas d'accès direct DB/Hatchet.
**PRD-13 — Coûts/résilience/traçabilité** : estimation avant production, seuils, coûts réels, retries limités, reprise sans duplication, journal run→étapes→artefacts→versions→transfert.
**PRD-14 — Qualité/droits** : conformité aux dimensions/codec audio, contrôle du texte et identité, vérification licences/provenance, conformité au réseau, rapport QA avant approbation.
**PRD-15 — Bibliothèque créative** : retrouver les éléments validés par marque : logos, visuels, voix, styles explicitement enregistrés, modèles de composition et créations antérieures, avec leurs droits et versions ; réutiliser sans apprentissage automatique.
**PRD-16 — Campagne / opération** : pouvoir regrouper plusieurs projets et créations sous une campagne identifiée (ex. campagne hiver) sans mémoire sémantique ni automatisation publicitaire.

## 3. Utilisateurs et droits
**Super-utilisateur** : invite/révoque, configure prompts et fournisseurs, consulte métriques globales et coûts, produit du contenu. **Utilisateur invité** : crée ses contextes/projets/flux et contenus, gère ses versions et valide son propre master. Les données d'un utilisateur ne sont jamais visibles par un autre sans partage explicitement spécifié ; **partage non prévu en V1**.

## 4. Parcours principal
1. Invitation reçue ; activation sécurisée ; accueil « Mes contextes ».
2. Création d'un contexte : URL + description + logos + produits + assets + contraintes ; analyse assistée, validation explicite des faits extraits ; possibilité d'en avoir plusieurs.
3. Sélection du contexte ; nouveau projet/création ; choix de TikTok/Instagram/LinkedIn ; catalogue de formats et options compatibles.
4. Choix organique ou sponsorisé (cette option gouverne **le brief et la validation des licences**, pas l'achat média) ; création image/carrousel/vidéo/motion ; style ; audio ; mix.
5. Débrief avec agent, version du brief, estimation ; confirmation du lancement.
6. Production distribuée, avancement par scène/étape, previews ; échec isolé et reprise.
7. Commentaires ciblés par `scene_id`, nouvelle version ; QA automatique et revue humaine.
8. Approbation du master **checksum + version** ; transfert à Postiz ; accusé, état et historique accessibles.

## 5. Parcours alternatifs
- Absence de fournisseur vidéo ou audio : option indisponible affichée avec explication ; rendu sans voix si approuvé par l'utilisateur.
- Requête de correction sur scène inexistante : refuser clairement, ne jamais modifier une scène au hasard.
- Changement de modèle pendant un run : version active au lancement figée ; nouvelle config applicable aux runs suivants sauf relance explicitement choisie.
- URL d'une marque non accessible : ne pas inventer le contenu ; demander confirmation manuelle.
- Postiz indisponible : master approuvé conservé et `TransferRecord` en attente/échec ; pas de nouvelle génération.

## 6. Non-objectifs stricts V1
Pas de paiement, crédits commercialisés, inscriptions publiques, gestion agences facturée, campagnes publicitaires via Ads API, analytics sociaux avancés, bibliothèque d'apps Everything LLM, agent mémoire autonome, embeddings/vecteurs, préférences auto-apprises, avatars cross-modèles garantis, publication autonome sans feu vert.

## 7. Mesure du succès du pilote
- Parcours V1 complet reproductible pour au moins **un format visuel statique et un format audiovisuel**, sur comptes de test autorisés.
- Taux de réussite de chaque test P0 = 100 % ; pas de fuite de données inter-utilisateurs.
- Reprise d'un workflow après interruption, **sans perte des étapes valides**.
- Démonstration de correction ciblée `scene_id` et conservation de l'ancienne version.
- Démonstration de 2 fournisseurs interchangeables pour une capacité quand disponibles, sinon adaptateur mock certifiant le contrat + statut « provider live non testé ».
- Démonstration MCP sur 1 client IDE et 1 client cloud compatibles et autorisés, avec preuves.
- Coût par run calculable et plafond de dépense appliqué.
- Remise Postiz confirmée **ou** non-disponibilité documentée sans succès fictif.

## 8. Dépendances, hypothèses, risques
Compte Postiz accessible, API / mécanisme d'import à qualifier ; droits d'exploitation sur images/voix/musique, disponibilité de fournisseurs IA par pays/tarif ; coûts GPU et temps de vidéo ; exigences évolutives par plateforme. L'architecture utilise un **modular monolith** et des workers spécialisés ; tests d'intégration nécessaires avant de figer une implémentation concrète.

## 9. Lots de livraison
P0-A fondation/auth/contextes ; P0-B workflow/brief ; P0-C orchestrateur/routeur/agents ; P0-D rendu/scene-version/QA ; P0-E MCP + approbation + Postiz ; P0-F observabilité, sécurité et recette. Aucun lot ne déclenche automatiquement un déploiement public.
