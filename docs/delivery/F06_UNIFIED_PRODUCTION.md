# F06 — Production créative unifiée

## Du projet à la livraison

La liste du sélecteur et la validation de `POST /api/projects` proviennent du même contrat, exposé par `GET /api/production/formats`. Il s’agit des formats **à créer et télécharger**, pas d’une promesse de publication automatique sur un réseau.

| Choix | Destinations proposées | Composition initiale | Téléchargement approuvé |
| --- | --- | --- | --- |
| Post (clé historique `Affiche`) | Instagram, LinkedIn | 1080 × 1080, une image | PNG |
| Story | Instagram | 1080 × 1920, une image | PNG |
| Carrousel | Instagram, LinkedIn | 1080 × 1350, deux pages modifiables | ZIP ordonné avec manifest SHA-256 |
| Reel | Instagram, TikTok | 1080 × 1920, vidéo courte | MP4 H.264/AAC |
| Vidéo multiscène (`Video`) | Instagram, TikTok, LinkedIn | Composition multiscène (ou pipeline vidéo historique) | MP4 H.264/AAC |

Ouvrir **Composition et versions**, personnaliser, enregistrer une révision, demander le rendu, vérifier le résultat puis approuver cette version. L’export dédié demande l’approbation de la révision exacte. Le mode historique Video et les URLs existantes de scènes et de masters ne sont pas remplacés. Le cadrage et les variantes historiques restent consultables et restaurables. Les liens vers les révisions de calendrier et les projets ne changent pas. Les connecteurs IA et de publication gardent leurs propres indications de disponibilité ; ils ne sont pas nécessaires pour produire ces fichiers.

Les vidéos Studio utilisent la durée initiale choisie, puis les durées de la révision. Les masters Studio et historiques partagent les encodeurs/contrôles pertinents : dimensions, H.264/AAC, tolérance de deux images à 30 i/s, stockage vérifié par SHA-256. Les médias importés et les caches de rendu Studio sont vérifiés avant utilisation. Les durées de montage déjà acceptées par Studio restent lisibles ; le brief vidéo historique conserve ses propres limites. Les images ne demandent pas de durée à l’utilisateur.

## Exécution et mise à niveau

1. Arrêter les anciennes instances et laisser finir les rendus synchrones en cours avant d’appliquer la migration `20261121090000_durable_studio_render`. Les anciennes lignes `running` restantes sont classées comme interrompues ; les transactions existantes libèrent leurs réservations. Aucun projet, lien de calendrier, manifeste ou fichier approuvé n’est réécrit.
2. En mode `ORCHESTRATOR_MODE=hatchet`, démarrer le worker Vululu existant avec la même base et le même stockage d’artefacts que l’API. En mode `local`, le processus API exécute le même consommateur en arrière-plan. Aucun nouveau service d’orchestration. FFmpeg et les polices restent requis dans le processus consommateur.
3. `POST /api/projects/:id/creative/:version/render` renvoie `202` pour un rendu en file/en cours et `200` si le manifeste est déjà scellé. `GET` sur la même URL donne l’état et la raison d’un échec. Le flux Studio signale les changements ; l’éditeur peut suivre le rendu par lecture HTTP après un rechargement. L’aperçu d’une seule image reste synchrone et borné. Les gros rendus Sharp/FFmpeg sont hors requête HTTP.
4. Une seule tâche active par révision, avec verrou de soumission, index unique et revendication `SKIP LOCKED`. Le bail de deux minutes est renouvelé toutes les quinze secondes ; une interruption déclenche une reprise du même travail et de sa réservation, jusqu’à trois tentatives d’exécution. En cas d’échec définitif, une relance explicite crée une nouvelle tentative. Le bail protège le commit du manifeste et de l’état terminal dans la même transaction. Les objets sont adressés par digest ; un ancien worker ne peut pas remplacer les références d’une version scellée ou approuvée.

**Retour arrière :** ne pas retirer la migration ni effacer les artefacts. Arrêter les nouvelles soumissions, laisser les rendus en file et en cours atteindre un état terminal avec le consommateur F06, puis revenir à la version précédente si nécessaire. Les anciens chemins de lecture restent compatibles ; l’ancien client ne propose pas le nouvel export ZIP par révision. Ne pas faire tourner les anciens et nouveaux chemins de rendu simultanément.

## Recette locale

```sh
pnpm -r typecheck && pnpm lint && git diff --check
pnpm test tests/{production-formats,media-duration-integrity,creative-actions}.test.ts \
  tests/v1/{creative-core,multiformat,brief-profile,commercial,publishing,media-generation}.test.ts
pnpm exec playwright test --config playwright.production.config.ts
```

Utiliser les bases PostgreSQL locales jetables migrées (`DATABASE_URL_TEST`, `BILLING_DATABASE_URL_TEST`, `STUDIO_BROWSER_DATABASE_URL_TEST`) et de vrais binaires `FFMPEG_PATH` / `FFPROBE_PATH`. La recette navigateur crée le projet dans l’assistant, modifie le texte, rend et approuve la révision, puis télécharge le fichier sur ordinateur et mobile. Les tests SQL simulent un bail expiré, un échec de stockage et des soumissions concurrentes, sans utiliser de fournisseur externe. Déploiement et exécution contre un serveur Hatchet distant : **NOT_RUN**.

Résultats locaux (Node 24, PostgreSQL jetable, Sharp/FFmpeg natifs) : **58/58** sur la commande ciblée, puis **7/7** sur `pnpm test tests/v1/{studio-feed,results}.test.ts`. Typecheck des sept paquets, lint et `git diff --check` : OK. Chromium : **10/10** sur les cinq formats en bureau et mobile, puis **2/2** sur `pnpm exec playwright test --config playwright.media.config.ts` (génération distante simulée, placement et export réels en local). Aucun déploiement ni appel à un fournisseur réel.
