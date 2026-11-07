# Studio V1 — walkthrough et preuves

- Date : 2026-11-01
- Statut : **Studio V1 livré localement, testé E2E sur base isolée**. Aucun push, aucun déploiement.
- Limites assumées : rendu déterministe (Sharp/FFmpeg), aucune IA générative ; Postiz MOCK ; coûts MOCK ; actifs/audio/campagnes non connectés ; formats déclarés non implémentés.
- Preuve E2E : e2e/v0.spec.ts renommé « verticale Studio V1 complete (deterministe, correction ciblee, MOCK) » — PASS.

## 1. Navigation

| Entrée | URL | Contenu |
|---|---|---|
| Accueil | / | dashboard, contextes récents, créations récentes, accès admin si super_admin |
| Contextes | /contexts | gestion des contextes : liste, détail, création ; révisions et actifs marqués non connectés |
| Catalogue | /catalog | profils réseaux, formats réellement disponibles/déclarés, capacités (audio, MCP, campagnes, coûts, Postiz) |
| Actifs | /assets | contrat Asset explicite, état NON CONNECTÉ, aucun faux actif |
| Projet / Studio | /projects/[id] | conversation, brief versionné, storyboard, corrections, job, preview/comparaison, QA, approbation, historique |
| Admin | /admin | interface séparée super_admin (inchangée, testée séparément) |

La navigation est partagée (StudioNav) sur les pages studio ; elle est responsive (barre repliée sous 1000 px) et accessible (aria-current, labels).

## 2. Walkthrough manuel (aucune capture requise)

Pré-requis : PostgreSQL local sur 55432, API 3101, Web 3100, base de test isolée, FFMPEG_PATH défini, serveur seedé.

1. Ouvrir /login. Vérifier les champs accessibles « Email » et « Mot de passe » ; Tab passe de l un à l autre. Se connecter en super_admin.
2. / : vérifier la navigation Accueil/Contextes/Catalogue/Actifs et le lien Admin (super_admin uniquement).
3. /contexts : vérifier la liste des contextes, le détail (description, audience, ton, couleurs) et les bandeaux « révisions non exposées » et « actifs non connectés ». Créer un contexte via /contexts/new.
4. /catalog : vérifier que Video est DISPONIBLE, que Affiche/Carrousel/Reel/Motion sont DECLARE — NON IMPLEMENTE, que audio/MCP/campagnes sont NON CONNECTE et que Postiz/couts sont MOCK.
5. /assets : vérifier le contrat Asset (11 champs) et le badge NON CONNECTE ; aucun bouton d upload n est proposé.
6. /projects/new : créer un projet Video 2 s par scène. Vérifier que le Studio s ouvre.
7. Studio : remplir le brief ; un toast « Brief enregistre » confirme la nouvelle revision ; l historique des révisions est consultable.
8. Générer le storyboard : 5 scènes avec Scene ID stables, images d attente, durée éditable, bouton « Corriger cette scène » sur chaque carte.
9. Produire les 5 scènes : barre de progression, statut du job, timeline des étapes (rendu, assemblage, QA), trace et workflow.
10. Bandeaux : rendu déterministe (aucune IA), Postiz MOCK, coûts MOCK (cents simulés/événements).
11. QA : checks techniques (dimensions, codecs, durée, checksums) ; rappel que les droits/licences ne sont pas vérifiés.
12. Correction ciblée : choisir SCENE-002 (ou toute autre scène) dans le sélecteur, saisir une instruction, cliquer « Corriger SCENE-002 ». Le master v2 apparaît, la scène ciblée change, les autres checksums sont identiques, les versions précédentes sont conservées et l approbation antérieure est invalidée.
13. Comparaison : sélectionner v1 dans « Version de comparaison » ; deux lecteurs vidéo sont visibles côte à côte. Le checksum, la QA, la date et la provenance sont affichés.
14. Approuver la version exacte courante, puis transférer vers Postiz (mock) : statut acknowledged, provider postiz-mock ; rappel « transféré ne signifie pas publié ».
15. Historique des masters : v1 (approuvée invalidée), v2 (approuvée/transférée), actions Afficher/Comparer.
16. Recharger la page : les versions et le transfert MOCK restent visibles. Se déconnecter : /projects/[id] redirige vers /login (aucun accès anonyme).

## 3. Vérifications automatisées

| Contrôle | Commande | Résultat |
|---|---|---|
| Typecheck | pnpm typecheck | 7/7 workspaces PASS |
| Lint strict | LINT_STRICT=1 pnpm lint | 0 erreur |
| Build production | pnpm build | PASS ; routes /contexts, /catalog, /assets, /api/[...path] présentes |
| Tests unitaires/intégration | pnpm exec vitest run tests/domain tests/api.test.ts tests/v1 tests/media.test.ts | 188 PASS / 2 SKIP / 0 FAIL |
| E2E Studio V1 | pnpm exec playwright test e2e/v0.spec.ts | 1/1 PASS (1,5 min) |
| E2E Admin | pnpm exec playwright test e2e/admin.spec.ts | 2/2 PASS (super_admin + refus user + mobile) |

L E2E Studio couvre : login clavier/labels, catalogue et actifs, création contexte, gestion contextes, projet, brief + toast, storyboard, production MP4, timeline job, bannières MOCK/déterministe, correction de SCENE-002 (et non plus SCENE-003 codé en dur), conservation des autres checksums, invalidation d approbation, comparaison v1/v2, QA, approbation exacte, transfert mock, rechargement, déconnexion et refus d accès anonyme.

## 4. Accessibilité minimale

- Champs de login et de brief associés à des labels ; test clavier Tab email → mot de passe.
- Boutons avec libellés explicites ; sélecteurs de scène/version étiquetés.
- Messages d erreur et toasts en aria-live (role=status/alert).
- Tableaux avec caption sr-only et en-têtes scope=col/row.
- Navigation aria-current sur l entrée active ; contrastes conservés du design existant.
- Limites restantes : pas d audit clavier complet de chaque écran, pas de test lecteur d écran, focus initial non forcé sur les nouveaux panneaux.

## 5. Sécurité et ressources

- Toutes les routes projet/scène/master/QA restent filtrées par propriétaire côté API (tests IDOR existants) ; aucune ressource anonyme.
- Les images scènes et vidéos master passent par /api/projects/:id/... avec session et contrôle d accès.
- L admin est une interface séparée, inaccessible à un user (layout serveur + 403 API + test E2E dédié).
- Aucun secret affiché ; les bandeaux indiquent clairement MOCK.
- Aucune publication Postiz réelle, aucun fournisseur payant.

## 6. Limites et suites

- Aucune IA générative : le rendu est déterministe ; les visuels ne sont pas des créations de modèle.
- Actifs : contrat défini seulement (aucun backend upload/validation/licence).
- Audio, voix, musique, mix : non connectés.
- Formats Affiche/Carrousel/Reel/Motion : déclarés, pipeline dédié non implémenté ; seul Video est réellement produit.
- Pause/annulation/relance : non exposées, car l API ne garantit pas l arrêt sûr ni un coût nul.
- Coûts : MOCK ; aucune estimation fournisseur réelle.
- Contextes : révisions backend existantes mais non exposées par l API/UI.
- Comparaison : côte à côte visuel, sans diff image/audio automatisé.
