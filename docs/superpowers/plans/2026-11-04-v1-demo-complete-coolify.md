# Vululu AI V1 démo complète sur Coolify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Note d’exécution : ces deux sous-compétences ne figurent pas dans le catalogue de cette session. Le plan reste exécutable lot par lot avec les outils disponibles ; leur absence ne doit pas conduire à inventer une compétence ou à lancer une délégation implicite.

**Goal:** Livrer une V1 complète en mode démonstration, installable sur Coolify depuis un checkout propre, avec compte démo, parcours fonctionnels persistants et aucun fournisseur IA connecté.

**Architecture:** Conserver le monolithe modulaire, les cas d’usage communs Web/MCP, PostgreSQL, les artefacts immuables sur stockage S3-compatible et un worker durable séparé. Fournir les capacités IA par des adaptateurs déterministes sans réseau ; rendre de vrais médias consultables. Garder les intégrations externes désactivées et explicitement simulées tant qu’elles ne sont pas qualifiées.

**Tech Stack:** TypeScript, Node 24, pnpm 10.6.1, Next.js/React, Fastify, Prisma/PostgreSQL, Sharp/FFmpeg, Hatchet derrière son port, stockage S3-compatible, Vitest/Playwright et Docker Compose/Coolify. Réutiliser les dépendances installées ; toute dépendance nouvelle est justifiée par le lot.

**Spec:** Instruction utilisateur du 2026-11-04 : « je veux une v1 complète avec un compte démo, sans avoir à connecter l’IA pour l’instant ». Sources : `docs/01_PRD_V1.md`, `docs/02_CAHIER_DES_CHARGES_V1.md`, `docs/03_ARCHITECTURE_V1.md`, `docs/reports/ANALYSE_EXISTANT_2026-11-04.md`. Le lot 0 formalise cette variante dans un addendum distinct.

## Contraintes globales

- V1 interne sur invitation ; aucun abonnement, crédit commercial, Memory Bank ou apprentissage des préférences.
- Domain Core sans SDK fournisseur, Prisma, Hatchet ou Postiz.
- PostgreSQL source de vérité ; binaires sur stockage S3-compatible pour la cible finale ; volumes de travail locaux seulement pour le rendu temporaire.
- Snapshots au lancement, IDs stables, versions immuables, checksum et provenance.
- Approbation de la version exacte avant transfert ; transfert simulé distinct d’une publication.
- Mêmes cas d’usage, RBAC et quotas via Web et MCP ; aucun accès MCP direct à PostgreSQL/Hatchet/Postiz.
- Aucun secret dans Git, le navigateur, les médias, les logs ou les preuves.
- Documentation en français ; identifiants de code en anglais ; imports verbatim et ADR acceptés préservés.
- Aucun compte payant ni appel IA ; aucune publication ni mise en ligne sans autorisation humaine explicite.
- `PASS`, `FAIL`, `MOCK`, `NOT_RUN` et `BLOCKED` gardent des sens distincts.
- Chaque lot : exigences, contrats, tests, preuves, limitations et rollback ; arrêt si un test obligatoire ne peut pas être exécuté.

## 1. Résultat attendu et définition de « complète »

La cible est une **V1-DEMO complète sur ses parcours**, utilisable sans clé IA. Les enregistrements, révisions, droits d’accès, validations, médias, versions, approbations, bibliothèque, campagnes, outils MCP et opérations sont réels. Les raisonnements et productions attribuables à l’IA sont simulés ; la remise Postiz est simulée en l’absence de connexion externe. Aucun résultat simulé n’est présenté comme une intégration réelle.

Ce jalon ne certifie pas la V1 avec fournisseurs IA/Postiz réels. Leur qualification ultérieure ne doit pas être nécessaire au démarrage de la démo. La demande utilisateur autorise la variante démo sans IA ; elle ne supprime pas silencieusement les exigences de qualification du corpus.

### Parcours de recette du compte démo

1. Connexion sécurisée comme utilisateur invité ; accès à des exemples fictifs prêts à explorer.
2. Création/validation d’un contexte ; ajout de logos, références et actifs autorisés.
3. Campagne simple, projet, réseau, format, ratio, durée, organique/sponsorisé et direction artistique.
4. Débrief déterministe, suggestions signalées comme simulations, validation d’une révision de brief et estimation MOCK.
5. Storyboard adapté aux choix, scènes et personnages stables ; lancement asynchrone avec suivi.
6. Créations image, carrousel, motion et vidéo effectivement lisibles ; audio optionnel avec échantillons licenciés et mix réel.
7. Commentaires par scène, correction ciblée, comparaison, QA bloquante et approbation exacte.
8. Transfert Postiz MOCK avec statut et historique, sans aucun appel de publication.
9. Réutilisation d’un actif validé, consultation des créations par contexte/campagne.
10. Même verticale accessible par MCP authentifié, sans privilège supplémentaire.

L’administration reste réservée à un compte super-admin séparé. Le compte démo n’a jamais de droit administrateur.

## 2. Jalons et ordre de travail

| Jalon | Lots | Résultat mesurable |
|---|---|---|
| J0 — Référence cohérente | 0 | Variante V1-DEMO, limites et couverture PRD/CDC explicites |
| J1 — Socle installable | 1–4 | Images reproductibles, démo initialisée, stockage et durabilité vérifiés sur Linux isolé |
| J2 — Produit démo complet | 5–10 | Tous les parcours ci-dessus fonctionnent sans clé IA |
| J3 — Exploitation vérifiée | 11 | Sauvegarde/restauration, reprise, alertes et rollback prouvés |
| J4 — Candidat prêt à déployer | 12 | Recette complète, manifeste de release et dossier Coolify prêts |
| J5 — Staging accepté | 13 | Tests sur la véritable URL HTTPS Coolify ; GO humain d’usage interne |

Une instance de staging technique peut être déployée après J1 pour faciliter les essais, sur autorisation. Elle ne doit pas être présentée comme la V1-DEMO finalisée. Le mode local in-process et les pages « NON CONNECTÉ » ne satisfont pas J4.

## 3. Écarts concrets à traiter

- Contrôle fondations en échec sur `infra/coolify/.env.coolify.example` ; le contrôle des fichiers suivis applique également cette convention.
- `web.ports` publie actuellement un port hôte ; configurer la route Coolify vers le port interne 3100 sans contournement du proxy HTTPS.
- Build Hatchet dépendant d’un binaire dans un dossier local ignoré ; un clone propre ne possède pas cette entrée.
- `test -f /data/handshake.json` ne démontre pas que Hatchet accepte encore des connexions.
- Mode par défaut local, profils worker/durable/S3 à rendre cohérents pour la cible démo finale.
- Scripts de backup/restore utilisant des exécutables Windows, un port et des dossiers de test locaux.
- Playwright lance des serveurs `dev`, utilise des URL locales et comporte une URL locale directement dans le test admin.
- Seed actuel limité au super-admin et mettant à jour son mot de passe à chaque exécution ; aucun bootstrap démo sûr et complet.
- Contrat de résultat fournisseur limité à `mock: true` ; garder une variante démo explicite et préparer la compatibilité sans connecter de fournisseur réel.

## Lot 0 — Fixer le contrat V1-DEMO et la traçabilité

**Exigences :** E00-01/03/04, PRD-01 à PRD-16, CDC-F et CDC-N P0.

**Fichiers :** créer `docs/releases/V1_DEMO_SCOPE_2026-11-04.md`, `docs/releases/V1_DEMO_TRACEABILITY.md` ; mettre à jour les statuts de `README.md`, `docs/backlog/ROADMAP_V1.md` et `docs/adr/README.md` après réconciliation explicite. Ne pas modifier les documents importés.

**Contrat :** chaque exigence reçoit un état `REAL`, `MOCK`, `NOT_RUN` ou `OUT_OF_SCOPE_V2`, avec test, preuve et jalon. MCP, audio, actifs et campagnes restent des exigences V1, même si d’anciens registres les classaient dans une dette secondaire.

- [ ] Documenter la demande utilisateur, le mode démo et la différence entre recette démo et qualification réelle.
- [ ] Lister pour chaque capacité ses entrées/sorties, validations, effets de bord, idempotence et droits ; compléter les contrats avant de coder le lot concerné.
- [ ] Réconcilier les anciens statuts sans effacer leur historique ; indexer ADR-0014/0015.
- [ ] Préparer les ADR nouveaux nécessaires : démo/seed, topologie déployable, authentification MCP et politiques d’exploitation. Aucun ADR accepté existant n’est réécrit.

**Acceptation :** aucune exigence P0 omise ; toute simulation visible ; aucune contradiction de statut non signalée. Relecture documentaire et intégrité des neuf sources.

## Lot 1 — Rendre la release et les images reproductibles

**Exigences :** E00-04, CDC-N-002/007.

**Fichiers :** `infra/coolify/Dockerfile.api`, `Dockerfile.web`, `docker-compose.yml`, `.dockerignore`, `scripts/check-tracked-files.ps1`, `scripts/verify-foundation-docs.ps1` ; prévoir le renommage du modèle Coolify en `infra/coolify/.env.example`, avec toutes ses références. Créer `scripts/coolify/verify-release.ps1`.

**Interfaces :** images API/worker et Web identifiées par commit et digest ; migration one-shot terminée avec succès avant API. Aucun outil ne reçoit de secret par argument imprimé.

- [ ] Faire échouer le contrôle sur un vrai fichier d’environnement interdit et le faire passer sur le modèle autorisé ; conserver le scan de contenu.
- [ ] Après validation du renommage, mettre à jour les références du runbook et vérifier les scripts fondations/fichiers suivis/secrets.
- [ ] Construire API et Web sur Linux depuis un checkout propre avec lockfile figé ; vérifier FFmpeg, Sharp et Prisma dans l’image API, pas seulement sur l’hôte.
- [ ] Exécuter les migrations sur une DB de test vierge puis sur une DB à la version précédente ; provoquer un échec de migration dans un environnement jetable et vérifier que l’API ne démarre pas.
- [ ] Identifier la release avec le SHA ; conserver les digests et commandes exactes. Ne pas dépendre d’un tag `latest` pour le rollback.

**Commandes du lot :** `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm typecheck`, `pnpm lint` avec `LINT_STRICT=1`, `pnpm test`, `pnpm build`, scripts d’intégrité/secrets/frontières/migrations/fichiers suivis, puis les deux builds Docker existants.

**Acceptation :** toutes les commandes requises PASS sur l’environnement cible de test ; aucun fichier `.v1`, secret ou binaire ignoré requis pour API/Web. L’optimisation standalone/prune n’est exigée que si les mesures de build ou de ressources la justifient.

## Lot 2 — Compte démo, données fictives et mode sans IA

**Exigences :** PRD-01/11, CDC-F-001/002/003/060, CDC-N-001/002.

**Fichiers :** conserver `packages/db/prisma/seed.ts` pour le bootstrap admin ; créer `scripts/coolify/seed-demo.ts` et `tests/v1/demo-bootstrap.test.ts` ; adapter `apps/api/src/env.ts`, `apps/api/src/application/container.ts`, `apps/web/app/login/page.tsx`, `apps/web/components/StudioNav.tsx` et les réglages admin.

**Contrat :** variables proposées `DEMO_MODE=1`, `DEMO_EMAIL`, `DEMO_PASSWORD`, lues côté serveur. Identifiants injectés dans Coolify, jamais en dur. L’interface expose un état démo sans recevoir ces secrets. L’adaptateur IA démo ne nécessite aucune clé et n’émet aucun appel externe.

- [ ] Créer un utilisateur `user`, un contexte fictif, une campagne après lot 5 et des exemples versionnés ; réexécuter le bootstrap sans doublon, promotion de rôle ni écrasement du travail.
- [ ] Refuser la collision avec un compte réel existant ; refuser l’exécution hors mode démo ; ne pas réinitialiser silencieusement les mots de passe.
- [ ] Utiliser un super-admin distinct, créé une fois ; retirer ses variables de bootstrap après usage.
- [ ] Afficher « MODE DÉMO — IA simulée » et distinguer Postiz/coûts MOCK sur tous les résultats concernés.
- [ ] Tester login/logout/révocation, CSRF, refus admin, IDOR avec un second utilisateur de test et absence de secrets dans le frontend.

**Acceptation :** accès démo utilisable sans clé IA ; données fictives ; serveur toujours responsable des autorisations. Démo privée par défaut, pas de compte administrateur partagé ni de bouton contournant l’authentification. Aucune purge/reset automatique ajouté sans politique validée.

## Lot 3 — Stockage S3 et configuration Coolify sécurisée

**Exigences :** CDC-F-041, CDC-N-003/006.

**Fichiers :** `infra/coolify/docker-compose.yml`, modèle d’environnement, `apps/api/src/infrastructure/storage/*`, `scripts/coolify/check-env.ts`, `tests/v1/v1-01-e-storage.test.ts`, `docs/coolify/COOLIFY_RUNBOOK.md`.

**Contrat :** PostgreSQL privé ; binaires persistants S3 ; Web seul routé via proxy HTTPS vers 3100 ; API sur 3101 interne. `APP_ORIGIN` et `WEB_ORIGIN` correspondent exactement à l’origine navigateur, sans port interne ajouté.

- [ ] Inventorier le stockage déjà disponible ; choisir sa topologie par ADR avant provisionnement. Aucun nouveau service payant présumé.
- [ ] Séparer les variables d’exécution et de build ; encodage correct des identifiants dans les URL de connexion ; erreurs de démarrage sans fuite de valeur.
- [ ] Supprimer la publication hôte Web dans le Compose de déploiement et conserver un override local si nécessaire ; vérifier le réseau proxy réellement généré par Coolify.
- [ ] Activer `ARTIFACT_STORAGE_BACKEND=s3` pour la cible finale ; qualifier TLS, credentials à privilèges limités, bucket privé et volumes temporaires partagés uniquement si le renderer les exige.
- [ ] Tester put/get/checksum, refus d’overwrite, Range 206/416, URL expirée, accès inter-user interdit, panne stockage et redémarrage sans perte.

**Acceptation :** lecture et production survivent au remplacement API/worker ; aucun port DB/API/S3 d’administration publié ; cookies Secure/HttpOnly et HTTPS vérifiés. Le profil MinIO `latest` et le repli rclone expérimental ne deviennent pas implicitement des choix certifiés.

## Lot 4 — Hatchet et reprise réellement déployables

**Exigences :** CDC-F-043, CDC-N-004/005/012.

**Fichiers :** `infra/coolify/docker-compose.yml`, `infra/preprod/Dockerfile.hatchet`, `hatchet-entrypoint.sh`, `scripts/preprod/fetch-hatchet.ps1`, `apps/api/src/worker/*`, `apps/api/src/infrastructure/durable/*`, `tests/v1/v1-01-d-durable.test.ts` ; créer `scripts/coolify/verify-recovery.ts`.

**Contrat :** moteur approuvé pour l’environnement cible, DB Hatchet dédiée, worker séparé, reprise fondée sur outbox/checkpoints. Pas de garantie « exactly once » pour un fournisseur qui ne la supporte pas.

- [ ] Décider par ADR si le sidecar actuel est qualifiable pour cette démo interne ; sinon retenir une distribution Hatchet adaptée. Ne pas promouvoir l’ADR préproduction en décision production silencieusement.
- [ ] Rendre le build autonome : source officielle épinglée et checksum vérifié, ou image officielle épinglée ; aucun téléchargement de binaire non vérifié et aucune dépendance à `.v1`.
- [ ] Rendre l’acquisition/injection du token opérable sans impression dans les logs ; protéger DB, fichier handshake et volumes.
- [ ] Ajouter un contrôle de disponibilité réelle du moteur ; conserver le heartbeat worker et la distinction liveness/readiness.
- [ ] Tester arrêt brutal du worker pendant rendu, arrêt moteur, crash après dispatch avant accusé outbox, approbation après redémarrage, annulation et timeout.
- [ ] Vérifier zéro doublon d’artefact/coût/transfert métier ; conserver les étapes valides et l’ancienne version pendant la correction.

**Acceptation :** campagne de crash exécutée sur Linux conteneurisé ; worker absent ne casse pas le Web ; l’UI indique attente/indisponibilité ; politique de redémarrage et procédure de réconciliation vérifiées.

## Lot 5 — Contextes, actifs et campagnes persistants

**Exigences :** PRD-02/15/16, CDC-F-010/011/012/013, CDC-N-001/003/009/011.

**Fichiers :** domaine/contextes, `packages/application/src/use-cases/contexts.ts`, `ports.ts`, schéma Prisma et migration additive ; créer modèles/use cases actifs et campagnes selon les contrats du lot 0 ; remplacer `apps/web/app/assets/page.tsx` et compléter les écrans contextes/projets. Créer `tests/v1/assets-campaigns.test.ts`.

**Interfaces à figer :** actif rattaché au propriétaire et contexte, version, SHA-256, MIME vérifié, taille, licence, source, clé S3 opaque ; campagne = regroupement explicite de projets du même propriétaire. L’actif de bibliothèque est distinct de l’objet binaire technique déjà existant.

- [ ] Réaliser uploads bornés avec vérification du contenu, noms non utilisés comme chemins et refus des fichiers actifs dangereux ; contrôler l’accès aux téléchargements.
- [ ] Prévisualiser et réutiliser un actif validé ; figer sa version dans le snapshot d’un run.
- [ ] Fournir l’analyse contextuelle MOCK depuis des exemples déterministes et distinguer faits saisis, exemples et hypothèses ; exiger validation humaine.
- [ ] Pour les URL : ne pas inventer de contenu distant ; ingestion réelle seulement avec limites, redirections contrôlées, protections SSRF et preuve de provenance. La simulation peut utiliser un jeu de sites fictifs clairement signalé.
- [ ] Ajouter campagnes et filtres ; tester isolation, révisions, snapshot inchangé après édition, upload malformé, SSRF et licence inconnue.

**Acceptation :** bibliothèque et campagnes réellement persistantes ; le compte démo ne rencontre plus une page de contrat sans backend. Rétention/destruction passent par la politique du lot 11.

## Lot 6 — Wizard, brief et agents en simulation complète

**Exigences :** PRD-03/06/07/11/13, CDC-F-020/024/030/031/032/033/061.

**Fichiers :** `apps/web/components/ProjectStudio.tsx`, `apps/web/lib/studio.ts`, `packages/application/src/use-cases/briefs.ts`, `messages.ts`, `storyboards.ts`, `routing.ts`, `ports.ts`, providers mock, registre et tests agentiques.

**Contrat :** profils plateforme versionnés ; brief structuré et validé ; plan de dépendances construit à partir du format et des options ; invocation MOCK avec coûts et latence simulés identifiables.

- [ ] Rendre réseau/format/ratio/durée/objectif/style/options audio cohérents et validés côté serveur ; désactiver les combinaisons non qualifiées.
- [ ] Remplacer les seules réponses d’état par des scénarios déterministes de clarification, correction de brief et confirmation ; toutes les propositions restent marquées simulation.
- [ ] Adapter le storyboard au brief et à la durée ; conserver des IDs stables et la validation humaine avant rendu.
- [ ] Construire un plan explicite de capacités et dépendances, sans inventer une orchestration autonome LLM ; capturer configs agents, politique providers et version du workflow.
- [ ] Qualifier les mocks de succès/panne/fallback, licences incompatibles, timeout, budget refusé et résultat invalide ; rendre visibles les coûts MOCK estimés et constatés.
- [ ] Vérifier promotion/rollback des configs admin et absence d’effet rétroactif sur un run.

**Acceptation :** tous les choix sont persistés et modifient la simulation ; aucun appel IA sortant ; révision et estimation confirmées avant lancement ; aucun succès de façade.

## Lot 7 — Formats média réellement exportables et audio démo

**Exigences :** PRD-04/05/14, CDC-F-021/022/023/040/041/042/050, CDC-N-009.

**Fichiers :** `packages/media/src/index.ts` et modules média spécialisés si nécessaires, `apps/api/src/infrastructure/media/mediaRendererAdapter.ts`, provider déterministe, cas d’usage production/durable, catalogue formats ; `tests/media.test.ts` et tests de contrat.

**Contrat :** les contenus IA sont simulés, mais les fichiers ne le sont pas : image PNG/JPEG, ensemble de carrousel consultable/exportable, MP4 motion/vidéo, preview/master avec métadonnées mesurées. Ratios et codecs proviennent du profil versionné.

- [ ] Ajouter rendu affiche, carrousel et motion déterministes en réutilisant Sharp/FFmpeg ; conserver vidéo multiscène et correction ciblée.
- [ ] Pour la voix, fournir des extraits préenregistrés dont les droits sont documentés ; annoncer la limitation à ces échantillons, sans prétendre synthétiser un texte libre.
- [ ] Pour la musique, utiliser un petit jeu autorisé et/ou upload utilisateur ; conserver licence et provenance ; bloquer l’usage sponsorisé incompatible.
- [ ] Réaliser mix, réglages voix/musique, ducking et mesure des crêtes ; tester les modes sans voix/sans musique.
- [ ] Faire vérifier par FFprobe dimensions, codec, durée, pistes audio, crêtes et checksums ; produire les rapports pass/fail avec raisons.

**Acceptation :** chaque format annoncé disponible donne un fichier ouvrable ; audio audible et réglable ; master QA bloqué si invalide. Si une voix correspondant à un texte libre est exigée, elle reste une qualification TTS ultérieure explicite, pas un résultat fictif.

## Lot 8 — Revue, commentaires et remise Postiz simulée

**Exigences :** PRD-08/09/10, CDC-F-044/050/051/052.

**Fichiers :** `ProjectStudio.tsx`, cas d’usage scènes/artefacts/production, schéma si commentaires dédiés requis, `postizMockAdapter.ts`, tests approbation/transfert et E2E Studio.

**Contrat :** commentaire lié à un `scene_id` et éventuellement une version ; approbation liée à `artifactVersionId + checksum` ; transfert idempotent et explicitement MOCK.

- [ ] Ajouter commentaires par scène et historique comparatif ; correction sans régénération des scènes indépendantes.
- [ ] Vérifier invalidation de l’approbation après nouvelle version, refus du checksum différent, QA FAIL et requêtes concurrentes.
- [ ] Rendre l’acquittement MOCK récupérable après restart ; ne pas dépendre seulement d’un timer en mémoire de 400 ms.
- [ ] Exposer payload de remise, état et erreur simulée ; fournir scénarios destination indisponible et replay sans deuxième transfert.

**Acceptation :** parcours approbation/transfert récupérable après redémarrage ; aucune publication externe ; toutes les simulations signalées. L’adaptateur Postiz réel reste désactivé et non qualifié.

## Lot 9 — MCP V1 utilisable sans IA connectée

**Exigences :** PRD-12, CDC-F-070/071, CDC-N-001/003/005.

**Fichiers :** nouveau transport `apps/api/src/mcp/` derrière les cas d’usage existants, intégration serveur, contrats tools, tests `tests/v1/mcp-security.test.ts` et `docs/mcp/V1_DEMO_MCP.md`.

**Contrat :** transport HTTPS authentifié, audience/expiration/révocation/scopes et identité utilisateur ; outils lecture et mutations ; longues opérations renvoient `run_id`. Aucun shell/SQL générique. Les noms et schémas des outils sont figés avant implémentation dans la spécification du lot.

- [ ] Choisir le mécanisme d’authentification compatible avec les clients IDE/cloud retenus, par ADR ; ne pas annoncer de compatibilité cloud sans client testé.
- [ ] Exposer contexte, actifs, projet, brief, run, scène, artefact, approbation et remise MOCK via les mêmes cas d’usage.
- [ ] Tester token expiré/révoqué, mauvaise audience, scope manquant, IDOR, quotas, approbation et replay.
- [ ] Démontrer la verticale depuis un client IDE et un client cloud autorisés ; l’appelant peut être un client de test, aucun fournisseur IA ne doit être activé pour exécuter les tools.

**Acceptation :** preuves des deux clients ou statut BLOCKED identifié ; absence de clients compatibles empêche de déclarer PRD-12 complètement validé, même si les tests du protocole passent.

## Lot 10 — Administration, erreurs et ergonomie de bout en bout

**Exigences :** PRD-11, CDC-F-003/060, CDC-N-008/010/012.

**Fichiers :** `apps/web/app/admin/**`, composants admin, routes admin existantes, Studio et tests `e2e/admin.spec.ts`.

- [ ] Relier tous les écrans aux données réelles de la démo : utilisateurs, invitations, agents/configs, catalogue mock, jobs, coûts MOCK, audit, santé et réglages.
- [ ] Vérifier états vide/chargement/panne, erreurs explicables, confirmations sensibles, rollback de configuration et journalisation.
- [ ] Tester navigation clavier, labels, focus, contraste, mobile, vidéo/audio et messages de progression ; corriger les défauts bloquant le parcours.
- [ ] Confirmer qu’aucune clé ni donnée d’un autre propriétaire n’est affichée ; aucun bouton fournisseur réel activé sans configuration et qualification.

**Acceptation :** aucune page factice présentée comme fonctionnelle ; tous les parcours démo accessibles avec des droits ordinaires, toute action admin vérifiée côté serveur.

## Lot 11 — Sauvegarde, supervision, rétention et rollback Linux

**Exigences :** CDC-N-004/005/011/012, E10.

**Fichiers :** nouveaux `scripts/coolify/backup.sh`, `restore-test.sh`, `verify-runtime.ts` ; réutiliser la logique des scripts de préproduction ; adapter ops, réconciliation, runbooks et tests de résilience.

**Contrat :** dump PostgreSQL applicatif et stratégie DB Hatchet cohérente, copie des objets, manifeste SHA/comptages ; restauration vers DB/bucket distincts. Backup hors hôte. Politique proposée à valider : RPO 24 h et RTO 2 h pour la démo, pas un engagement production tacite.

- [ ] Supprimer les dépendances aux chemins/exécutables Windows dans la procédure cible ; choisir les commandes de sauvegarde selon la ressource Coolify réellement créée.
- [ ] Geler les écritures pendant la sauvegarde cohérente ou documenter/prouver un mécanisme de cohérence ; éviter qu’un dump référence un objet absent de la copie.
- [ ] Planifier sauvegardes, surveiller leur âge/échec et conserver une copie chiffrée hors VPS ; décider durées de conservation et purge par propriétaire avant activation.
- [ ] Restaurer une copie isolée ; vérifier connexions, comptages, SHA, lecture réelle d’un master et cohérence des runs. Ne jamais relancer les effets externes d’un run restauré sans réconciliation.
- [ ] Détecter DB indisponible, worker stale, moteur inaccessible, stockage en panne, outbox bloquée, disque bas et backup manquant ; notifier via un canal explicitement autorisé.
- [ ] Tester retour à l’image précédente sur schéma compatible ; si restauration nécessaire, arrêter les écritures, préserver la source et mesurer la perte potentielle depuis le backup.

**Acceptation :** restauration et rollback réellement exécutés ; durée mesurée ; aucune suppression de volume ni réparation destructive d’autres projets. Une politique `restart` ne suffit pas à redémarrer un processus encore vivant mais bloqué : traiter et tester ce cas.

## Lot 12 — Recette conteneurisée et dossier prêt à déployer

**Exigences :** CDC-N-007, section E du CDC, E10-03/04.

**Fichiers :** `playwright.config.ts`, `e2e/admin.spec.ts`, `e2e/v0.spec.ts`, nouveaux scénarios actifs/formats/audio/MCP ; `scripts/coolify/verify-release.ps1`, `scripts/v1-acceptance.ps1` ; créer `docs/releases/V1_DEMO_RELEASE_MANIFEST.md` et `docs/reports/V1_DEMO_COOLIFY_ACCEPTANCE.md`.

- [ ] Ajouter une configuration E2E « cible déjà démarrée » : origine injectée, pas de `webServer` dev ni d’URL localhost cachée ; rendre le test admin compatible avec le proxy Web public.
- [ ] Séparer les tests MOCK historiques des tests de complétude démo : leurs attentes « NON CONNECTÉ » ne prouvent pas la nouvelle bibliothèque fonctionnelle.
- [ ] Rejouer unitaires/contrats/intégration/E2E/sécurité contre les images de release, une DB isolée et le stockage qualifié.
- [ ] Tester création vierge puis mise à jour conservant données/versions ; crash/reprise pendant production et attente d’approbation.
- [ ] Vérifier absence d’appels IA/Postiz sortants par instrumentation réseau du test ; trafic infra autorisé explicitement et distinct.
- [ ] Constituer le manifeste : SHA, digests, migrations, variables par nom, versions, ressources mesurées, résultats, limites, backup/restore et rollback.

**Acceptation J4 :** zéro test P0 démo en échec ; zéro « non exécuté » masqué ; aucune connexion IA requise ; compte démo prêt. Les tests live volontairement exclus sont identifiés MOCK/NOT_RUN ; les exigences nécessitant une décision manquante restent BLOCKED et empêchent une prétention de complétude générale.

## Lot 13 — Déploiement Coolify et validation sur HTTPS

**Exigences :** CDC-N-003/007/011/012, décision de release.

**Entrées nécessaires :** instance Coolify/version, serveur autorisé et inventaire des services existants, domaine/DNS, accès par connexion sécurisée, capacité disponible, stockage retenu, destinataires de la démo et autorisation explicite de déploiement. Ne pas demander de mot de passe dans le chat.

- [ ] Après autorisation, inventorier l’hôte et isoler projet/environnement/réseaux/volumes Vululu ; ne pas toucher aux autres projets.
- [ ] Créer une Application Docker Compose depuis Git : base à la racine et chemin `infra/coolify/docker-compose.yml`. Recharger et vérifier le Compose réellement déployable avant exécution.
- [ ] Injecter secrets et variables dans Coolify ; domaine HTTPS sur Web, port conteneur 3100 ; aucun port hôte de contournement. Activer moteur, stockage et worker selon les ADR qualifiés.
- [ ] Construire/déployer le commit qualifié, attendre migrations puis santé des services ; bootstrap admin séparé puis démo ; retirer les secrets de bootstrap devenus inutiles.
- [ ] Exécuter la recette externe sur cette URL, y compris cookies Secure, IDOR, deux rôles, médias/Range, MCP, redémarrage, backup/restauration et rollback.
- [ ] Mettre à jour uniquement le nouveau rapport avec URL autorisée, SHA/digests, preuves et verdict ; demander le GO d’ouverture à l’audience prévue après résultats concrets.

**Acceptation J5 :** GO humain pour usage interne de V1-DEMO ; aucune ouverture publique implicite. Si la configuration ne démarre que sans worker ou avec stockage local non qualifié, conserver NO-GO de la cible complète et nommer précisément le jalon partiel.

## 4. Vérifications communes et gestion de chaque lot

- [ ] Branche `codex/…`, diff limité au lot ; lire les instructions locales applicables.
- [ ] Pour chaque comportement ajouté : test de contrat/sécurité approprié avant implémentation ; démontrer son échec puis sa réussite. Pas de tests artificiels pour une simple correction documentaire.
- [ ] Exécuter les contrôles pertinents ; enregistrer commandes, codes de sortie et ressources ciblées, sans secret.
- [ ] Relire le diff, lancer `scripts/check-secrets.ps1` et `git diff --check` avant commit ; ne jamais utiliser `push --force`.
- [ ] Rapport de lot en français et matrice de traçabilité mis à jour ; commit court et réversible, sans publication automatique.
- [ ] Rollback : code/config précédent si compatible ; migrations additives, pas d’effacement d’historique ; toute action destructive réclame sa décision explicite.

## 5. Estimation et décisions

Estimation de cadrage, **non contractuelle**, pour un développeur connaissant la stack :

| Bloc | Ordre de grandeur en jours de travail |
|---|---|
| Lots 0–4 : socle et infrastructure | 5–10 |
| Lots 5–8 : parcours démo, actifs et médias | 10–18 |
| Lots 9–10 : MCP et administration/ergonomie | 5–10 |
| Lots 11–13 : exploitation, recette et Coolify | 5–10 |
| Total indicatif | **25–48 jours**, à réestimer après lots 0/4 |

Cette fourchette n’est ni une échéance calendaire ni une garantie. Elle suppose un Linux/Docker sain, un accès Coolify, les décisions de stockage/authentification disponibles et des médias de démonstration réutilisables légalement. Aucun coût fournisseur IA n’est prévu. VPS/stockage existants et éventuels besoins supplémentaires doivent être inventoriés avant tout engagement.

Décisions bloquantes au lot concerné : topologie Hatchet qualifiée ; backend S3 disponible ; clients/authentification MCP ; droits des échantillons ; règles de rétention ; accès/DNS et autorisation Coolify. Aucune ne bloque la préparation locale des lots indépendants.

## 6. Sources Coolify vérifiées le 2026-11-04

- [Docker Compose](https://coolify.io/docs/applications/builds/docker-compose) : ressource Git, base directory, emplacement Compose, routage au port interne et configuration par service.
- [Stockage persistant](https://coolify.io/docs/services/configuration/persistent-storage) : montage dans Compose, persistance distincte d’une sauvegarde, copie hors hôte.
- [Sauvegardes](https://coolify.io/docs/databases/backups) : vérifier les possibilités de la ressource réellement créée et tester une restauration ; la création d’une archive ne suffit pas.

Ces références ne certifient pas la version de Coolify de l’utilisateur, qui reste à inventorier. L’état actuel du VPS et des services distants n’a pas été consulté pour rédiger ce plan.

## 7. Statut de livraison du plan

Plan proposé sur la base de la demande clarifiée. Aucune tâche d’implémentation n’est déclarée terminée ; cases non cochées volontairement. Aucun test applicatif, déploiement, compte ou appel externe n’a été exécuté par ce plan. Les preuves de l’analyse précédente restent dans son rapport daté.

La première action d’exécution est le **lot 0**, puis les corrections de release et le bootstrap démo du lot 1/2. La mise en ligne intervient après préparation du candidat et autorisation explicite, sans requalifier le mode démo en certification live.

### Suivi d’exécution du 2026-11-04

Le paragraphe ci-dessus décrit la proposition initiale. L’exécution autorisée est suivie dans `docs/releases/V1_DEMO_TRACEABILITY.md` : bootstrap privé, campagnes, bibliothèque et relecture des contextes disposent de preuves locales ; la tranche 6A ajoute profils, confirmation du brief et provenance des dépendances (rapport `docs/execution/V1_DEMO_06A_BRIEF_PROFILES.md`). Le lot 6 complet et les lots suivants restent ouverts. Les cases initiales ne valent pas certification de release. L’utilisateur déploiera directement sur son serveur ; les images Linux et la recette HTTPS restent à exécuter, sans déploiement public implicite.

La tranche 6B fige agents, catalogue, plafond, droits et workflow au lancement ; promotion et modification du catalogue ne changent plus le run en file. Preuve : `docs/execution/V1_DEMO_06B_FROZEN_POLICY.md` (345 tests PASS / 2 S3 SKIP et 2 E2E production PASS). Prochaine tranche : plan/estimation et refus de dépassement avant la mise en file, puis conversation et adaptation du storyboard. Le lot 6 reste partiel.

Suivi du 2026-11-05 : la tranche 6C expose le plan et l’estimation indicative, fixe le plafond confirmé et refuse les dépassements avant JobRun/outbox. Preuve ciblée : `docs/execution/V1_DEMO_06C_PRODUCTION_PLAN.md` (204 PASS / 2 S3 SKIP, 2 E2E production PASS). La suite du lot 6 porte sur la conversation, le storyboard et les scénarios MOCK restants ; les lots média, MCP et exploitation restent ouverts.
