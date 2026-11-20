# Vululu AI — Carte des lots P01–P11 (campagne de complétion)

- **Date** : 2026-11-20 (P00) · **Branche** : `campaign/vululu-completion` · **Base** : `main` @ `f5d515b`.
- **Autorités** : `docs/implementation/VULULU_FINISH_CONTRACT.md`, `docs/implementation/VULULU_FEATURE_INVENTORY.md`, `AGENTS.md` Partie C, `docs/product/VULULU_EXPERIENCE_VISION_2026-11-20.md`.
- **Portée** : P01–P11 seulement. **P12–P13** (vérification réelle, certification et décision de sortie) ne sont pas planifiés ici.
- **Statut de ce document** : carte de construction, révisable lot par lot. Aucun lot n'est certifié ; chaque lot = un commit `feat(pXX): … [BUILD_UNVERIFIED]`.
- **Preuve** : P00 n'a exécuté aucun test, lint, typecheck, build ni E2E. Les statuts ci-dessous décrivent la présence/absence de **code à HEAD**, jamais une certification. Compteurs relus dans le code : 34 migrations, 66 modèles Prisma, 22 fichiers de routes API, 32 pages `apps/web/app/**/page.tsx`, 23 composants ; l'inventaire P00 fait foi en cas d'écart.

## Constats de départ vérifiés (P00)

- `apps/web/app/projects/new/page.tsx` : 4 étapes (idée → références → destination → récap) ; l'identité (contexte) précède canal/format ; aucune étape assets.
- `apps/web/components/ProjectStudio.tsx` : assistant, `MarketingAssistant`, éditeur créatif et pipeline Vidéo de démonstration coexistent sans parcours campagne unifié ; `apps/web/lib/projectJourney.ts` ne décrit que brief→storyboard→production→finalisation.
- Assets : bibliothèque et sélection existent (`apps/web/app/assets/page.tsx`, `apps/api/src/routes/assets.ts`, `packages/application/src/use-cases/assets.ts`) mais aucun prérequis serveur avant le brainstorming.
- Brainstorming/DA : `AssistantTurn` + `ProjectAssistant`/`MarketingAssistant` existent ; Vertex derrière `ASSISTANT_VERTEX_ENABLED` (désactivé) avec repli local déterministe (`apps/api/src/infrastructure/assistant/service.ts`) ; aucune direction artistique persistée ni sélection humaine persistée.
- Création/revue/export : `CreativeRevision`/`CreativeSpec`, rendu Sharp/FFmpeg local, approbation exacte et export existent (`apps/api/src/routes/creative.ts`, `apps/web/components/CreativeEditor.tsx`). Publication Postiz derrière `POSTIZ_PUBLISH_ENABLED` (désactivé) ; mesures derrière `POSTIZ_ANALYTICS_ENABLED` ; kit manuel présent.
- Résultats : `ResultEvent`/`PostMeasure` et page `/results` existent ; pas de boucle campagne → résultats → reprise.

## P01 — Parcours campagne : objectif → canal → format

**Objectif / vision** : créer une création dans l'ordre intention → canal → format et afficher une carte de parcours unique (étapes 1–3, socle des étapes 4–12).
**Inclus** : réordonner l'assistant de création (idée+objectif, canal+format, contexte, récap) ; campagne optionnelle via l'endpoint existant `PUT /api/projects/:id/campaign` ; nouvelle carte `CampaignJourney` avec états dérivés et étapes suivantes « à venir ».
**Exclu** : gate assets, assistant, DA, modification de schéma/API, refonte du pipeline Vidéo de démonstration.
**Points de départ** :
- `apps/web/app/projects/new/page.tsx` — ordre des étapes et champs.
- `apps/web/lib/projectPresentation.ts` — `ProjectDraft` (+ campagne optionnelle).
- `apps/web/lib/projectJourney.ts` + nouveau `apps/web/components/CampaignJourney.tsx` — carte des 12 étapes.
- `apps/web/components/ProjectStudio.tsx` (montage avant l'éditeur) ; `apps/web/components/ProjectJourney.tsx` conservé pour le pipeline Vidéo ; `apps/web/app/campaigns/page.tsx` (entrée vers `/projects/new?campaign=<id>`).
**Acceptation manuelle (non certification)** : l'objectif précède le choix du contexte ; le récap affiche objectif/canal/format ; un projet créé avec campagne y est rattaché ; `/projects/:id` montre la carte avec étapes 1–3 actives ; un projet Vidéo démo ouvre toujours l'ancien pipeline.
**Dépendances / risques / statut** : socle de tous les lots ; risque de désalignement des specs E2E `projects-start`/`project-journey` → réalignement prévu en P12. Statut : UI sur contrats existants ; `BUILD_UNVERIFIED`.

## P02 — Assets d'abord : prérequis et confirmation

**Objectif / vision** : les assets de l'utilisateur sont disponibles et explicitement confirmés avant le brainstorming principal (étape 4).
**Inclus** : étape assets dans la carte ; réutilisation de l'import/sélection existants ; confirmation serveur (même bibliothèque vide, avec mention « aucune matière ») ; migration additive `Project.assetsConfirmedAt`.
**Exclu** : nouveaux types d'assets, S3, génération d'images, refonte de la page `/assets`.
**Points de départ** :
- `packages/db/prisma/schema.prisma` + `packages/db/prisma/migrations/20261121100000_project_assets_confirmation/migration.sql` (ADD COLUMN nullable).
- `packages/application/src/use-cases/assets.ts`, `packages/application/src/ports.ts`, `apps/api/src/routes/assets.ts` — confirmation de sélection + audit.
- `apps/api/src/infrastructure/prisma/` (dépôt Project/Asset — **à confirmer en P02**) ; `apps/web/components/CampaignJourney.tsx`.
- Nouveau `apps/web/components/ProjectAssetsStep.tsx` extrait de `apps/web/app/assets/page.tsx` (la page reste utilisable) ; `apps/web/lib/api.ts` (statut de confirmation).
**Acceptation manuelle (non certification)** : brainstorming désactivé tant que les assets ne sont pas confirmés ; import + sélection puis confirmation → étape validée ; confirmation sans asset possible et affichée honnêtement ; `/assets` fonctionne toujours ; projet d'un autre utilisateur → 404.
**Dépendances / risques / statut** : dépend de P01. Risque : extraction de page sans duplication (sinon garder la page et un lien + bouton de confirmation). Statut : upload/sélection IMPLEMENTED, gate MISSING → `BUILD_UNVERIFIED`.

## P03 — Brainstorming ancré dans l'identité et les assets

**Objectif / vision** : session de brainstorming persistée, grounded dans BrandContext/ConfirmedOffer + assets confirmés, sans résultat figé immédiat (étape 5).
**Inclus** : nouveau type de tour additif `brainstorm` dans `assistantRequest` ; snapshot serveur incluant identité, offre et versions d'assets sélectionnées ; refus 409 `assets_required` si non confirmés ; repli hors ligne déterministe ; surface UI principale unique.
**Exclu** : activation Vertex, nouveau fournisseur, propositions visuelles (P04), prompt libre non validé.
**Points de départ** :
- `packages/contracts/src/assistant.ts` — membre additif `kind: 'brainstorm'` (union discriminée stricte).
- `apps/api/src/infrastructure/assistant/service.ts` — snapshot assets + identité, garde `assets_required`, fallback déterministe.
- `apps/api/src/routes/assistant.ts` (endpoints existants) ; `packages/db/prisma/schema.prisma` (`AssistantTurn.snapshot` suffit, aucune migration attendue).
- Nouveau `apps/web/components/BrainstormPanel.tsx` réutilisant les tours ; `apps/web/components/ProjectAssistant.tsx`/`MarketingAssistant.tsx` repliés en détails ; `apps/web/lib/api.ts`.
**Acceptation manuelle (non certification)** : sans confirmation assets, l'envoi est refusé et expliqué ; après confirmation, un tour est persisté avec identité/offre/assets dans le snapshot ; rechargement conserve la session ; sans Vertex, réponse étiquetée hors ligne/MOCK ; `engine:'ai'` sans flag → 409 `assistant_unavailable`.
**Dépendances / risques / statut** : P02. Risque : extension de contrat public → conserver les membres existants. Assistant offline MOCK/déterministe ; Vertex PROVIDER_DEPENDENT, appel réel NOT_VERIFIED ; `BUILD_UNVERIFIED`.

## P04 — Directions artistiques multiples et comparaison

**Objectif / vision** : produire 2–3 directions artistiques persistantes, explicables et comparables, ancrées dans identité, assets et brief (étape 6).
**Inclus** : génération déterministe côté serveur via `composeGuide` (concepts existants étendus) ; persistance en `CreativeRevision` brouillons marqués `label`/`origin` ; comparaison côte à côte ; ADR-0035 (directions = brouillons `CreativeRevision`, aucune nouvelle entité).
**Exclu** : approbation, publication, génération IA payante, refonte de l'éditeur.
**Points de départ** :
- `packages/contracts/src/compositionGuide.ts` + `packages/contracts/src/creative.ts` — presets de directions et schéma de requête.
- `apps/api/src/application/creative.ts` (CreativeStudio) + `apps/api/src/routes/creative.ts` — route `POST /api/projects/:id/creative/directions`.
- `packages/db/prisma/schema.prisma` + `migrations/20261121110000_creative_direction_metadata/migration.sql` (ADD COLUMN `label`, `origin` nullables) ; `apps/api/src/infrastructure/prisma/creativeRepository.ts`.
- Nouveau `apps/web/components/ArtDirections.tsx` + `apps/web/components/RevisionCompare.tsx` (comparaison) ; `apps/web/components/CampaignJourney.tsx`.
**Acceptation manuelle (non certification)** : après brainstorming, 2–3 brouillons numérotés et étiquetés apparaissent ; deux peuvent être comparés ; rechargement les conserve ; aucune approbation/manifest n'est créé ; aucune action réseau externe.
**Dépendances / risques / statut** : P03. Risque : sémantique de versions (directions = brouillons, la tête éditable reste choisie en P05) ; ADR requis avant code. Composition Sharp IMPLEMENTED ; copie IA PROVIDER_DEPENDENT ; `BUILD_UNVERIFIED`.

## P05 — Couche d'exécution outillée agentique (mission redéfinie le 2026-11-20)

> La mission P05 de la campagne a été **redéfinie** : elle livre la couche d'exécution outillée contrôlée (registre étendu, propositions structurées de l'agent, scopes sans révision créative, résultats structurés, statut projet, ADR-0036). Le choix humain de direction du plan initial devient une livraison séparée après P05/P06 (pointeur `Project.selectedCreativeVersion` + route de sélection + UI, en réutilisant `ArtDirections`). La fiche historique suit.

### P05-bis (déplacé) — Choix humain de la direction

**Objectif / vision** : l'utilisateur choisit, rejette ou demande une variation ; la décision est persistée et oriente la suite sans perdre les propositions (étape 7).
**Inclus** : pointeur projet `selectedCreativeVersion` (migration additive) ; route de sélection avec ownership + audit ; UI de choix/refus ; la carte reflète la direction choisie ; l'éditeur s'ouvre sur ce choix.
**Exclu** : suppression de brouillons, nouvelle table, approbation finale.
**Points de départ** :
- `packages/db/prisma/schema.prisma` + `migrations/20261121120000_project_selected_direction/migration.sql` (ADD COLUMN nullable).
- `apps/api/src/application/creative.ts` + `apps/api/src/routes/creative.ts` — sélection/refus, vérification de version, audit.
- `apps/api/src/infrastructure/prisma/creativeRepository.ts` ; `apps/web/lib/api.ts` (type du projet).
- `apps/web/components/ArtDirections.tsx` + `apps/web/components/CampaignJourney.tsx` (états choisis/refusés).
**Acceptation manuelle (non certification)** : sélection persistée après rechargement ; choisir une autre direction met à jour le pointeur sans détruire les autres ; refus explicite conservé ; la direction choisie est ouverte dans l'éditeur ; version d'un autre projet → 404 ; aucune approbation créée.
**Dépendances / risques / statut** : P04. Risque : deux choix concurrents → last-write avec verrou/audit. Aucun fournisseur ; `BUILD_UNVERIFIED`.

## P06 — Création éditable depuis la direction choisie

**Objectif / vision** : ouvrir l'édition réelle à partir de la direction choisie, produire des brouillons versionnés éditables (étape 8, brouillon permanent).
**Inclus** : amorçage de `CreativeEditor` sur la version choisie (restauration en nouvelle révision) ; édition calques/textes/assets ; enregistrement de nouvelles révisions ; formats existants Affiche/Story/Carrousel/Reel/Vidéo ; mode expert conservé.
**Exclu** : Motion/audio/TTS (non implémentés), nouveau moteur de rendu, refonte de l'éditeur, édition vidéo avancée.
**Points de départ** :
- `apps/web/components/CreativeEditor.tsx` — prop de version initiale, reprise de la direction, garde de rendu.
- `apps/web/components/FormatGuide.tsx` — presets alignés sur les directions, assets confirmés préremplis.
- `apps/web/lib/api.ts` et `apps/web/components/CampaignJourney.tsx` (étape création).
- `apps/api/src/application/creative.ts` + `apps/api/src/routes/creative.ts` (réutilisation de `save/restore`, aucun nouveau contrat attendu).
**Acceptation manuelle (non certification)** : depuis la direction choisie, l'éditeur affiche la composition ; modifier puis enregistrer crée une nouvelle révision ; les directions/versions précédentes restent visibles ; rendu local disponible ; aucun fournisseur IA/media requis.
**Dépendances / risques / statut** : P05. Risque : `CreativeEditor.tsx` (772 lignes) → modifications ciblées, pas de réécriture. Composition native Sharp/FFmpeg IMPLEMENTED ; génération IA fournisseur hors périmètre ; `BUILD_UNVERIFIED`.

## P07 — Revue puis approbation exacte

**Objectif / vision** : revue unifiée (rendu, comparaison, checksum) puis approbation explicite d'une version exacte ; statut calendrier cohérent (étapes 9–10).
**Inclus** : surface de revue dédiée dans le parcours campagne ; réutilisation de `RevisionCompare`, `CreativeReviewSurface`, `CreativeEditor` ; approbation version+checksum uniquement après rendu ; lien optionnel avec l'item calendrier (statuts `READY_FOR_REVIEW`→`APPROVED`).
**Exclu** : validation automatique, QA média externe, publication.
**Points de départ** :
- `apps/web/components/CreativeEditor.tsx` (section livraison) + `apps/web/components/CreativeReviewSurface.tsx` + `apps/web/components/RevisionCompare.tsx`.
- Nouveau `apps/web/components/ReviewApprovalStep.tsx` monté par `apps/web/components/CampaignJourney.tsx`.
- `apps/api/src/routes/creative.ts` (`/:version/approve`, `/:version/export`) ; `apps/api/src/application/creative.ts`.
- `apps/web/app/calendar/PublishingPanel.tsx` + `apps/web/app/calendar/page.tsx` (lien contenu↔création, statuts `packages/contracts/src/calendar.ts`).
**Acceptation manuelle (non certification)** : approbation impossible sans rendu manifeste ; checksum erroné → 409 ; approbation affichée avec version+checksum ; une nouvelle révision invalide visuellement l'approbation précédente ; statut calendrier cohérent ; aucune publication déclenchée.
**Dépendances / risques / statut** : P06. Risque : ne pas confondre approbation créative et approbation éditoriale calendrier (deux objets, même exigence de version exacte). IMPLEMENTED pour les briques ; PARTIAL pour l'intégration campagne ; `BUILD_UNVERIFIED`.

## P08 — Export et publication (désactivée par défaut)

**Objectif / vision** : livrer une version approuvée (téléchargement/kit manuel) et proposer la publication uniquement via le flux Postiz existant, désactivé par défaut (étape 11).
**Inclus** : étape livraison dans la carte ; export approuvé (PNG/MP4/ZIP carrousel, lot campagne avec manifest) ; kit manuel ; réutilisation de `PublishingPanel`/`SocialConnections` ; message explicite « publication externe non activée ».
**Exclu** : activation `POSTIZ_PUBLISH_ENABLED`, publication sociale réelle, déploiement, nouveau provider.
**Points de départ** :
- `apps/web/components/CreationDelivery.tsx` + `apps/web/components/CreativeEditor.tsx` (export existant) ; nouveau `apps/web/components/DeliveryStep.tsx`.
- `apps/api/src/routes/creative.ts` (`/:version/export`, `/api/campaigns/:id/creative-package`) ; `apps/api/src/routes/publishing.ts`.
- `apps/web/app/calendar/PublishingPanel.tsx` + `apps/web/app/calendar/SocialConnections.tsx` ; `apps/web/components/CampaignJourney.tsx`.
- `apps/api/src/infrastructure/publishing/service.ts` (états `PREPARED`/`SENDING`/`PUBLISHED` — ne pas modifier sans ADR).
**Acceptation manuelle (non certification)** : export refusé (409) si non approuvé ; téléchargement conforme après approbation ; ZIP carrousel/campagne contient manifest + checksums ; avec flags off, préparer publier renvoie `direct_disabled` et l'UI l'explique ; aucune requête réseau sociale émise ; `/results` journalise l'export.
**Dépendances / risques / statut** : P07. Risque : ne jamais présenter un transfert MOCK comme publication. Export IMPLEMENTED ; Postiz PROVIDER_DEPENDENT et désactivé, appel réel NOT_VERIFIED ; `BUILD_UNVERIFIED`.

## P09 — Boucle résultats → prochaine création

**Objectif / vision** : relier exports, approbations, publications et mesures à la campagne, puis proposer une reprise (étape 12 et retour à l'objectif).
**Inclus** : regroupement campagne/projet dans le rapport résultats ; liens vers la création et « reprendre » ; mesures manquantes explicites ; filtre par campagne dans `/campaigns`.
**Exclu** : conversion commerciale inventée, attribution multi-touch, activation analytics, nouveau modèle de données.
**Points de départ** :
- `apps/web/app/results/page.tsx` + `apps/api/src/routes/results.ts` + `apps/api/src/infrastructure/results/store.ts` (regroupement/lecture).
- `apps/web/app/campaigns/page.tsx` (résumé par campagne) ; `apps/web/lib/api.ts`.
- `apps/api/src/infrastructure/results/provider.ts` (mesures NOT_AVAILABLE) ; `packages/db/prisma/schema.prisma` (`ResultEvent`, `PostMeasure` — lecture seule attendue).
- `apps/web/components/CampaignJourney.tsx` (étape résultats).
**Acceptation manuelle (non certification)** : `/results` ne montre que les données du propriétaire ; une campagne affiche ses exports/approbations/publications ; sans mesures réelles, « non disponible » est explicite ; le bouton « reprendre » ramène au projet/campagne ; aucune valeur simulée n'est présentée comme mesure.
**Dépendances / risques / statut** : P08. Risque : ne pas transformer une publication déclarée en résultat vérifié. Rapports IMPLEMENTED ; analytics Postiz PROVIDER_DEPENDENT, NOT_VERIFIED ; `BUILD_UNVERIFIED`.

## P10 — Simplification UX et cohésion du parcours

**Objectif / vision** : une seule campagne/un seul parcours, moins d'écrans et de portes d'entrée ; onboarding incluant identité, offre, intention, assets (transversal, §4 de la vision).
**Inclus** : navigation principale/secondaire resserrée ; tableau de bord orienté campagne avec reprise ; onboarding 4 étapes ; surfaces assistant/experts repliées en détails ; tokens du design system ; une décision principale à la fois.
**Exclu** : nouvelle bibliothèque UI, nouveau thème, suppression des outils experts, refonte des pages admin.
**Points de départ** :
- `apps/web/components/StudioNav.tsx`, `apps/web/components/ProjectDashboard.tsx`, `apps/web/app/page.tsx`.
- `apps/web/app/contexts/new/page.tsx`, `apps/web/app/contexts/offers/new/page.tsx` (étapes onboarding) ; `apps/web/app/projects/new/page.tsx`.
- `apps/web/app/campaigns/page.tsx`, `apps/web/components/CampaignJourney.tsx`, `apps/web/components/CreativeEditor.tsx` (densité/« une action dominante »).
- `DESIGN.md` + `docs/design-system/README.md` et tokens (chemins **à confirmer en P10**) ; `apps/web/AGENTS.md`.
**Acceptation manuelle (non certification)** : depuis la connexion, on rejoint une campagne et sa prochaine étape en ≤2 clics ; aucun lien mort ; les outils experts restent accessibles ; textes FR/EN cohérents ; contrôle visuel 390/768/1024/1440 et clavier (constat manuel, non certification).
**Dépendances / risques / statut** : P01–P09 (intégration). Risque : régression visuelle → garder les anciens composants montés sous `<details>`. Aucun fournisseur ; `BUILD_UNVERIFIED`.

## P11 — Durcissement, observabilité, préparation P12

**Objectif / vision** : garantir les invariants sur tous les nouveaux chemins (RBAC/isolation, audit, idempotence, rate limits) et laisser P12 exécuter les gates réels (transversal).
**Inclus** : revue de sécurité des routes ajoutées ; rate limits sur mutations ; audit des décisions (confirmation assets, sélection direction, approbation) ; vérification `demoDisabled`/`VULULU_BETA_MODE` ; documentation des limites ; checklist P12 prête (commandes non exécutées).
**Exclu** : exécution de tests/gates (P12), activation de flags, déploiement/CI, changement de tarif.
**Points de départ** :
- `apps/api/src/routes/assets.ts`, `apps/api/src/routes/assistant.ts`, `apps/api/src/routes/creative.ts` — auth, rate limits, ownership, erreurs.
- `apps/api/src/infrastructure/security/rateLimiter.ts`, `apps/api/src/releaseMode.ts`, `apps/api/src/betaMode.ts`.
- `apps/api/src/routes/ops.ts` + `apps/api/src/infrastructure/operations/opsMetrics.ts` (santé existante) ; `apps/api/src/application/container.ts` (câblage).
- `docs/implementation/VULULU_FEATURE_INVENTORY.md` (statuts des lots) et fiches de lots de ce document (fait/reste) ; `docs/delivery/` (preuves manuelles datées, non certification).
**Acceptation manuelle (non certification)** : chaque mutation nouvelle exige une session et renvoie 404 pour une ressource d'autrui ; rate limit → 429 ; une ligne d'audit par décision sensible ; `/api/ready` et `/api/ops/health` inchangés ; aucun flag fournisseur activé ; diff sans secret (revue manuelle, `scripts/check-secrets.ps1` **non exécuté** en P00–P11).
**Dépendances / risques / statut** : P01–P10. Risque : oublier un contrôle sur une route ajoutée → checklist fichier par fichier. Aucun `PASS` déclaré ; `BUILD_UNVERIFIED` jusqu'à P12.

## Ordre et dépendances

| Lot | Objet court | Dépend de | Peut avancer en parallèle de |
|---|---|---|---|
| P01 | Parcours objectif→canal→format | — | — |
| P02 | Gate assets | P01 | P03 (préparation contrat) |
| P03 | Brainstorming ancré | P02 | P04 (presets/ADR) |
| P04 | Directions + comparaison | P03 | P05 (schéma sélection) |
| P05 | Choix humain | P04 | P06 (amorçage UI) |
| P06 | Création éditable | P05 | P07 (surface revue) |
| P07 | Revue + approbation | P06 | P08 (UI livraison) |
| P08 | Export + publication off | P07 | P09 (lecture résultats) |
| P09 | Boucle résultats | P08 | P10 (nav/dashboard) |
| P10 | Simplification UX | P01–P09 | P11 (checklist sécurité) |
| P11 | Durcissement / P12 | P01–P10 | — |

Chaque lot laisse l'application fonctionnelle et se termine par un commit unique réversible (`git revert` ; migration additive laissée en place, inerte).

## Ce que P01–P11 ne font pas

- Aucune réécriture, aucun changement de framework, aucun nouveau service/microservice.
- Aucune nouvelle dépendance, aucun nouveau package de composants UI.
- Aucune activation de fournisseur payant (Vertex, Replicate, Runway, Postiz, Stripe, Resend) ni appel IA/média payant.
- Aucune publication externe, aucun déploiement, aucun push/merge vers `main`, aucune CI.
- Aucun changement des offres commerciales, des tarifs ni du gel des paiements bêta gratuite (`VULULU_BETA_MODE`).
- Aucune migration destructive, aucun `DROP`/`RENAME`, aucune perte de données.
- Aucune suite de tests, Playwright, pytest, lint, typecheck global, build complet ou gate exécuté ; aucun `PASS` déclaré.
- Aucune fonctionnalité V2 (mémoire sémantique, préférences apprises, embeddings, marketplace, crédits).
- Aucune planification de P12–P13, aucune certification ; P12–P13 restent hors de ce document.

## État des lots

| Lot | État | Commit / date | Preuves |
|---|---|---|---|
| P01 | **BUILD_UNVERIFIED** | `feat(p01)` du 2026-11-20 | Aucun test exécuté. Vérification manuelle : lecture du diff, parse syntaxique des fichiers modifiés, parcours de code (objectif → canal → format → identité → vérification, campagne optionnelle, carte 12 étapes, ressources liées). Limites : E2E non réaligné (P12) ; gate assets en P02. |
| P02 | **BUILD_UNVERIFIED** | `feat(p02)` du 2026-11-20 | Aucun test exécuté. Migration additive `20261121100000_project_assets_confirmation` (3 colonnes nullables) ; décision explicite (sélection ou « aucune ressource ») ; digest SHA-256 de la sélection ; gate `assets_required`/`assets_confirmation_stale` sur l'assistant et le plan marketing ; snapshot d'assets dans `AssistantTurn.snapshot`. Limites : E2E/tests d'intégration non réalignés (P12) ; types Prisma à régénérer (`pnpm db:generate`) avant typecheck réel. |
| P03 | **BUILD_UNVERIFIED** | `feat(p03)` du 2026-11-20 (commité en début de P04) | Aucun test exécuté. Type de tour `brainstorm` (assistant), résultat structuré `brainstormOutput` (ack, questions, pistes motivées, décisions utilisateur), repli local déterministe étiqueté, Vertex étendu (schéma JSON, payload minimisé : identité, offre, noms de ressources, jamais d'URL/ID), UI `BrainstormPanel` multi-tours avec affiner/contester/rejeter/combiner, autorisation de budget ToolBroker. Limites : suites assistant existantes à réaligner (P12) ; aucun appel Vertex réel exécuté. |
| P07 | **BUILD_UNVERIFIED** | `feat(p07)` du 2026-11-20 | Aucun test complet. ADR-0038 ; contrat `imageEditRequest` (source, masque, prompt, ratios 1:1/4:5/9:16/16:9, préservation du sujet, droits) ; outil `media.image.edit@1` (broker P05, plafond 8 ¢, approbation humaine, non proposable par l’agent) ; adaptateur réel Gemini Image via Vertex (ADC, inlineData, repli sans imageConfig sur 400, issues ambiguës → UNKNOWN) ; sorties vérifiées et stockées en versions immuables ; routes image-edits + apply (nouvelle révision Studio) ; UI comparaison originale/éditée. **NOT_RUN** : appel fournisseur réel (aucun credential), build/typecheck/tests. |
| P06 | **BUILD_UNVERIFIED** | `feat(p06)` du 2026-11-20 | Aucun test complet. Service `services/python-tools/` (FastAPI + Pydantic, Python 3.12, `uv.lock` réel, Dockerfile non-root) ; registre `image.analyze@1` (READ auto) et `image.segment@1` (GENERATE, approbation humaine) ; client/adaptateur TS `infrastructure/python/` avec jeton, délais, vérification SHA-256 des sorties et stockage via `AssetUseCases.upload` ; Compose interne sans port publié (rootfs read-only, limites mémoire/CPU/PID). Smoke local Python : **16/16 PASS** (santé, jeton, analyse réelle, refus d'empreinte altérée, détourage PNG transparent + masque). **NOT_RUN** : build/run Docker, Compose, tests TS, typecheck. |
| P05 | **BUILD_UNVERIFIED** | `feat(p05)` du 2026-11-20 | Aucun test exécuté. ADR-0036 accepté ; migration additive `20261121130000_agentic_tool_proposals` (`params`, `result`, `agentTurnId`, `step`) ; registre v2 (action/scope/approval/schéma Zod) + outils lisibles avant révision (`project.summary@1`, `assets.list@1`, `assets.inspect@1`, `creative.direction@1`) ; tour d'assistant `agent` (≤4 recommandations, revalidation serveur, digest des paramètres, plafond de 6 étapes) ; broker : périmètres sans révision, échecs déterministes `FAILED` à coût nul, résultat structuré plafonné ; API `POST /api/projects/:id/execution/agent` et `GET /api/projects/:id/execution` ; UI `ProjectExecutionStatus` (autorisation, annulation, résultat, issue incertaine). Limites : aucun appel fournisseur réel ; outils Python P06 attendus sur ce contrat. |
| P04 | **BUILD_UNVERIFIED** | `feat(p04)` du 2026-11-20 | Aucun test exécuté. ADR-0035 accepté (directions = brouillons `CreativeRevision`, aucune entité) ; migration additive `20261121110000_creative_direction_metadata` (`label`, `origin`, `provenance` JSONB) ; service `CreativeDirections` (génération depuis brainstorming + ressources confirmées, affinage, alternatives, combinaison) ; API `GET/POST /api/projects/:id/creative/directions` et décision de direction auditée ; UI `ArtDirections` (comparaison, aperçu réel Sharp, retenir/écarter, reprise éditeur). Limites : le choix définitif (`Project.selectedCreativeVersion`) et l'approbation exacte restent P05/P07. |

*Disclaimer : aucun test n'a été exécuté en P00–P04 ; les statuts décrivent la présence de code à HEAD `f5d515b`, jamais une certification.*
