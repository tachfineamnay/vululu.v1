# Parcours et livraison des créations — 2026-11-06

## Périmètre

Demandes traitées dans l’ordre : parcours/flow consultable, puis consultation/livraison des créations. Exigences PRD-02/03/06/08/09/10/13/15 ; CDC-F-012/013/044/051/052. Sources : contrats effectifs et kit bleu (`UX.md`, `COMPONENTS.md`, `SCREENS.md`, `ACCESSIBILITY.md`, `IMPLEMENTATION.md`, tokens).

La recomposition complète du Studio, demandée auparavant, reste distincte : le PNG privé est absent. Cette tranche ne revendique pas cette recomposition ou sa fidélité exacte. Le shell legacy du Studio subsiste autour des panneaux migrés.

État Git initial conservé : tranches précédentes non commitées, `.dsh/` préexistant. Aucun ajout de dépendance, framework, migration ou modification backend. Aucun commit/push/publication.

## Capacités vérifiées

| Source existante | Consultation réelle | Limite |
|---|---|---|
| `GET /api/projects` puis `GET /api/projects/:id` | Projet/contexte, brief et révisions, confirmation exacte, scènes/versions, masters/QA/approbations/transferts, dernier job/run et étapes | Pas d’index global d’artefacts ni d’historique exhaustif des runs ; contexte courant distinct du snapshot ancien |
| `GET /api/projects/:id/production-plan` | Étapes prévisionnelles, `dependsOn`, capacité, admissibilité, checksum, prix et plafond MOCK | Recalcul avec la politique actuelle : pas les dépendances historiques du dernier run |
| `GET /api/projects/:id/runs/:runId/evidence` | Sorties persistées des étapes, parfois nulles | Chargement explicite du run autorisé ; entrées détaillées non exposées |
| `GET /api/projects/:id/master?version=N` | Binaire de la version choisie | Ancien frontend corrigé : `?v=N` était ignoré par le serveur |
| `POST .../approve`, `POST .../transfer` | Approbation exacte et transfert existants | Règles serveur conservées, transfert Postiz MOCK uniquement |

Édition du graphe, déplacement/duplication d’étapes, sauvegarde d’une méthode, clonage du projet et reprise d’une étape non raccordés dans ce parcours. Aucun faux canvas ou personnage IA de navigation.

## Parcours et réutilisation

`ProjectJourney` reçoit le même bundle et le même plan que le Studio. Les repères sont dérivés à la lecture, sans workflow métier parallèle ou état de flow persistant dans le navigateur : brief → scènes → production/examen → validation/transfert.

Confirmation vérifiée par version/checksum ; storyboard relié à la version du brief ; master et approbation courante tirés du serveur. Un résultat conservé ne prouve pas qu’il correspond aux dernières modifications du brief. Les liens mènent aux actions existantes avec focus ; entrées/conditions et résultats sont dépliables.

Flow avancé en `details/summary` natifs : plan prévisionnel avec dépendances et capacités, journal séparé du dernier run (états, tentatives, erreurs, dates), puis chargement de ses sorties persistées. Pas d’entrées ou de dépendances historiques inventées. Le moteur absent n’est pas déduit. En mode local, la clôture peut marquer plusieurs étapes ensemble : aucune précision d’instrumentation supplémentaire n’est affirmée.

Réutilisation disponible : contexte présélectionné dans un nouveau projet, ressources autorisées consultables. Aucun brief, média, scène ou méthode copié implicitement.

## Consultation et livraison

`/creations` organise les résultats par contexte puis projet, à partir de la liste existante et du bundle sélectionné. Les projets sans résultat ou après échec restent retrouvables. Aucun master n’est déduit du seul statut. Une réponse tardive ne remplace pas un autre projet sélectionné.

`CreationDelivery` est partagé avec le Studio : version consultée, version courante, approbation courante exacte, QA de la version consultée, historique et comparaison. Les lecteurs utilisent réellement `?version=N`. Les anciennes sélections restent en place pendant une actualisation.

- **Télécharger** récupère le MP4 exact sans approbation/transfert implicite ; erreur et sélection conservées. Le lien de téléchargement ne déclenche pas un faux avertissement de sortie de formulaire.
- **Approuver** est distinct, avec ID de version et checksum, uniquement sur le courant dont la QA est PASS, sans modification locale en attente.
- **Transférer** est distinct et disponible après approbation exacte du courant. Les transferts historiques sont rattachés à leur version.
- **Publier** est indisponible. `acknowledged` Postiz MOCK n’est jamais nommé publication.

Après correction, l’approbation invalidée est signalée ; une ancienne version ne peut pas approuver/transférer le courant. La QA technique ne certifie pas les licences ou la conformité créative. Ses contrôles ne donnent pas de Scene ID structuré : correction via le choix de scène existant, sans ciblage inventé.

Déclinaisons Reel/image/carrousel/motion non qualifiées : indisponibilité expliquée. Préparer un autre projet avec le contexte ne copie pas le média.

## Conservation et erreurs

Actualisation impossible : dernier bundle reçu conservé avec avertissement/reprise. Les erreurs de mutation ne sont plus effacées par le polling silencieux du Studio. Plan en échec : dernier plan conservé, identifié comme non actualisé ; confirmation/production bloquées jusqu’à récupération. Lecture, téléchargement, approbation et preuves ont leurs erreurs propres sans disparition du résultat.

La galerie actualise à l’ouverture, à la sélection, sur action et sur demande ; pas d’abonnement temps réel annoncé. Le Studio conserve son polling. Les décisions finales restent vérifiées côté serveur.

## Preuves

| Contrôle | Résultat / journal local |
|---|---|
| `pnpm test -- tests/project-journey.test.ts tests/creation-delivery.test.ts tests/domain/artifact-approval.test.ts tests/domain/transfer.test.ts tests/v1/production-plan.test.ts` | **36 PASS**, 5 fichiers ; `.v1/journey-delivery-tests-final.log`. Accès PostgreSQL local. Première tentative sandbox interrompue, sans succès revendiqué. |
| `e2e/project-journey.spec.ts` | **PASS**, rejeu final 38,0 s ; `.v1/journey-delivery-e2e-final.log`. Focus/clavier, indisponibilité du plan, 503 contrôlée et reprise, mêmes données, réutilisation, 1440/1024/768/390 px. |
| `e2e/creation-delivery.spec.ts` | **PASS**, dernier rejeu 1,6 min ; `.v1/delivery-e2e-foreign-final.log`. Production/correction locales, IDs stables, MP4 v1 téléchargé comparé à son checksum et binaire v2 vérifié, approbation invalidée, erreurs contrôlées, transfert MOCK acquitté, galerie, clavier/mobile. Sans session : 401 ; bundle/master/preuves d’un autre compte distinct : 404. |
| Rejeux nécessaires | Premier essai : délai de navigation `/creations` dépassé. Deuxième : sélecteur d’alerte incluant l’annonceur Next, corrigé en le limitant au main. Troisième : variables démo/bootstrap désignant le même compte ; remplacées par une fixture réellement distincte avec assertion d’IDs différents. Aucun de ces essais n’est revendiqué PASS global. |
| `pnpm typecheck` | **PASS**, monorepo ; `.v1/journey-delivery-typecheck-final.log`. |
| Régressions démarrage / brief / conversation | **3 PASS**, `.v1/journey-delivery-regressions.log` : brief/profil/média, conversation/correction, démarrage/sauvegarde/reprise. Avec les deux nouveaux scénarios, cinq scénarios E2E distincts validés pour cette tranche après rejeux. |
| Lint strict | **PASS**, `.v1/journey-delivery-lint-final.log`. |
| Tokens / secrets / documents fondateurs | **PASS** : kit statique, scan de 556 fichiers, 9 empreintes documentaires ; `.v1/journey-delivery-kit.log`, `journey-delivery-secrets.log`, `journey-delivery-foundation.log`. |
| `pnpm build` final | **PASS**, API + Next.js, y compris `/creations` ; `.v1/journey-delivery-build-final.log`. Imports générés de `next-env.d.ts` retirés du diff après contrôle. |
| `git diff --check` | **PASS** ; revue des raccordements et absence de modification des contrats backend/documents fondateurs. |

Rendus Sharp/FFmpeg et fichiers locaux réels ; prix/routage/Postiz **MOCK**. Les réponses réseau injectées sont des échecs contrôlés de recette. Aucun fournisseur IA payant ou réseau social engagé. Fixture étrangère isolée : identifiants éphémères en mémoire du lanceur local, aucun secret écrit au dépôt.

## Captures et limites

Captures inspectées sous `.v1/journey-captures/`, non commitées : avant legacy, parcours, flow, galerie, comparaison de masters, ancienne approbation sur mobile. `08-creations-final-desktop.jpg` est la capture finale après rechargement, avec la cascade vérifiée (marge de l’en-tête corrigée à 0 et débordement de page nul). Les captures transitoires ou issues du cache de navigation ont été remplacées. Dimensions 1440/1024/768/390 vérifiées par les scénarios ciblés. Tokens réutilisés, médias contenus sans déformation, contrôles natifs/focus visible. Console du dernier relevé manuel : aucune erreur. Pas de certification globale d’accessibilité.

- Sorties du run parfois nulles ; entrées détaillées, dépendances historiques et historique exhaustif des runs non ajoutés à l’API.
- Le serveur expose la dernière image d’une scène : aucune comparaison historique fictive des PNG. La comparaison livrée concerne les masters versionnés.
- Téléchargement Blob en mémoire adapté aux médias démo ; streaming de gros exports avec `Content-Disposition` à traiter côté serveur séparément.
- Édition/clonage de flow, publication réelle, nouveaux formats et QA créative automatique : indisponibles.
- Fidélité exacte au PNG privé : **NOT_RUN** ; `design-qa.md` reste bloqué pour cette comparaison. L’en-tête legacy du Studio occupe encore beaucoup de place sur mobile.
- Suite globale/release et test d’usage externe : **NOT_RUN**.

## Rollback et suite

Sans migration : retirer sélectivement `/creations`, les deux composants et helpers/tests de cette tranche, leurs styles et raccordements ; rétablir l’ancienne zone de livraison par patch ciblé. Conserver les modifications antérieures des contextes/démarrage et les éditions utilisateur. Ne pas utiliser un reset global.

Suite : recomposition visuelle du Studio après réception du PNG ; qualification d’autres médias et contrats de réutilisation/édition de flow dans des lots métier distincts. Aucune capacité activée par la seule refonte.
