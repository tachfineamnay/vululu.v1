# QA Product Design — 2026-11-05

final result: blocked

## Comparaison de fidélité

Source visuelle demandée : maquette PNG privée, référencée dans `docs/design-system/reference/README.md` (1487 × 1058 annoncés dans le kit). Le PNG n’est pas présent dans le dépôt ni disponible comme pièce jointe de ce chat. Le plan `docs/design-system/reference/studio-layout.svg` est documentaire et représente un Studio ; il ne constitue pas une maquette des contextes ou des ressources. Aucune comparaison côte à côte fictive n’a été produite.

Implémentation observée : `.v1/design-captures/08-context-production-desktop.jpg` et `09-context-production-mobile.jpg`, build final sur 127.0.0.1:3200. Viewports CSS 1440 × 1024 et 390 × 844, capture du viewport, sans redimensionnement ni assemblage. Le navigateur peut exclure sa gouttière de défilement de l’image. État : contexte de recette persisté, révision 2, recherche active. Le serveur de contrôle a ensuite été arrêté ; preview de travail sur 3100.

Comparaison complète et régions ciblées avec le PNG : **NOT_RUN**. Bloqueur : source visuelle non accessible pour une comparaison du même écran et du même état. La présente tranche fonctionnelle est livrée avec preuves ; la fidélité exacte au PNG n’est pas déclarée achevée.

## Vérification des contrats et du rendu réel

- Typographie : fallback système déclaré par les tokens, titres/sections/labels raccordés ; DM Sans non fournie. Aucune fidélité de police au PNG revendiquée.
- Espaces et composition : sections lisibles, formulaire replié à l’ouverture, grille desktop et reflow mobile ; aucun débordement aux cinq largeurs de recette. Le Studio complet reste hors tranche.
- Couleurs : tokens canoniques importés sous scope, bleu `#2347BE`, surfaces blanches et fond `#F4F5F1` ; couples de contrastes statiques PASS. Login/admin hors scope, bannière démo conservée.
- Images : aucun nouvel asset décoratif ni imitation d’une image absente. Les imports de fichiers et anciennes versions sont réels et testés.
- Contenu : marque/activité/univers explicités ; site déclaré non analysé, proposition MOCK nommée, données manquantes et capacités absentes expliquées.

Itération observée : le titre du contexte mobile était trop étroit à côté du bouton (P2). Correction : en-tête de fiche empilé sous 640 px. Vérification du rendu post-correction et reflow E2E PASS. Les captures initiales en chargement ont été rejetées. Aucun P0/P1/P2 fonctionnel connu dans les parcours ciblés après recette ; la comparaison de fidélité reste bloquée séparément.

Interactions vérifiées : création, échec réseau contrôlé, recherche sans résultat, édition, confirmation humaine, conflit réel 409 conservant le brouillon, navigation annulable, historique, import/version, droits et retour au projet. Focus/contrôles au clavier et mobile testés. Console sur la fiche du build : aucun message d’erreur relevé.

## Pour clôturer la QA de fidélité

Ouvrir le PNG original, capturer l’écran correspondant au même viewport/état, placer les deux dans une comparaison commune puis corriger et recontrôler les différences P0/P1/P2. Ne pas transformer le plan SVG en preuve d’accès au PNG.

## Complément Mes projets — 2026-11-06

La comparaison exacte reste bloquée sur l’absence du PNG ; `final result: blocked` demeure le verdict de fidélité, sans annuler les recettes fonctionnelles documentées. Nouvelles surfaces : Mes projets, démarrage en quatre étapes et panneau du brief. Sources contractuelles : UX.md, SCREENS.md et tokens du kit.

Captures inspectées : `.v1/projects-design-captures/03-idea-after.jpg`, `04-destination-desktop.jpg`, `05-summary-mobile.jpg`, `07-projects-desktop.jpg`, `08-projects-mobile.jpg`, `09-projects-production.jpg`. Viewports de recette 1440/1024/768/390/320 px ; dernier rendu compilé 1440 × 1024, sans assemblage ni remise à l’échelle. Les captures blanches/en chargement ne sont pas retenues.

Fondations : fallback système du kit, hiérarchie 28/20/16/14 px, bleu canonique, surfaces claires, focus et sélection nommés. Cadre de format purement indicatif, aucun média ou image générée annoncé. Textes métier et états tirés des API ; tarifs MOCK déclarés. Le Studio hors panneau de brief conserve son thème précédent dans cette tranche.

Itération P2 : dépassement de 5 px des liens de l’en-tête du Studio à 390 px, constaté en mesurant `clientWidth`. Correction limitée à `.project-topbar .topbar-actions` ; assertion E2E finale sur l’absence de débordement au retour dans le projet : PASS. Focus d’arrivée dans le brief : PASS. Sauvegarde, reprise et confirmation exacte du plafond/brief : PASS. Build final et rendu compilé : PASS ; aucun message d’erreur console dans le relevé de Mes projets. Voir le rapport daté du 2026-11-06 pour les limites et les rejeux.

## Complément parcours et livraison — 2026-11-06

Le verdict de fidélité au PNG privé reste `final result: blocked` : source absente, aucune comparaison exacte revendiquée. Cette tranche fonctionnelle n’implémente pas la recomposition complète du Studio.

Surfaces inspectées : parcours séquentiel, flow consultable et panneaux de livraison partagés avec `/creations`. Captures `.v1/journey-captures/02-parcours-desktop.jpg`, `04-comparison-desktop.jpg`, `05-ancienne-version-mobile.jpg`, `06-flow-desktop.jpg`, `07-flow-mobile.jpg`, `08-creations-final-desktop.jpg`. Recette 1440/1024/768/390 px, clavier natif, focus et état d’approbation obsolète contrôlés. Aucun personnage ou faux canvas ; sources média réelles versionnées.

Itérations : focus du lien Flow déplacé sur son summary, ancienne requête vidéo `?v=` remplacée par `?version=`, réponses tardives de la galerie ignorées pour un autre projet, anciennes sélections conservées lors des actualisations, marge legacy de l’en-tête de galerie supprimée à portée limitée. Après rechargement, vérification de la cascade : marge 0 ; débordement horizontal de page 0 à 1440. Les quatre largeurs sont couvertes par les nouveaux E2E. Aucune erreur console dans le relevé manuel final.

Le shell legacy du Studio reste une limite visible, particulièrement son en-tête mobile volumineux. Aucun verdict de conformité globale. Résultats détaillés, échecs initiaux et rejeux : `docs/reports/PRODUCT_DESIGN_PARCOURS_LIVRAISON_2026-11-06.md`.

## Audit des deux usages — 2026-11-06

Audit courant du navigateur : premier projet avec un compte réellement vide, puis reprise/correction/comparaison/export du même projet. Captures inspectées `.v1/audit-20261106/01` à `14`, sans réutiliser les anciennes captures comme preuves. Rapport : `docs/reports/PRODUCT_DESIGN_AUDIT_2026-11-06.md`.

Corrections vérifiées : perte de saisie au retour navigateur, ancien brouillon lié à une autre révision, commandes de génération pendant un run, notification d’approbation périmée, scène fictive par défaut, en-tête mobile volumineux, marque coupée et IDs trop petits. Le shell Studio reçoit désormais les tokens bleus ; assistance et style avancé repliés. La reprise d’un projet produit place le focus sur le résultat. Copie locale explicitement distincte d’une sauvegarde serveur.

Contrastes de l’échantillon rendu : 5,90 à 15,51:1 ; ID de scène contrôlé à 14 px après correction, focus bleu visible. Débordement horizontal de page nul aux quatre largeurs 1440/1024/768/390 et au reflow complémentaire 720 × 512. Lecture clavier et téléchargement natif vérifiés ; checksum du MP4 v1 exporté identique à la version consultée. 8 tests unitaires et 5 scénarios E2E distincts PASS dans cet audit, avec rejeux ciblés des corrections finales.

`final result: blocked` demeure le verdict de comparaison exacte au PNG : tentative d’accès au lien privé pendant l’audit, image non obtenue. La composition centrale complète demandée par SCREENS.md reste ouverte ; le thème bleu n’en vaut pas validation. Zoom navigateur natif 200 % : NOT_RUN, raccourcis sans effet mesurable ; reflow vérifié séparément. Aucune certification globale d’accessibilité ni recette de release revendiquée. Aucun déploiement.
