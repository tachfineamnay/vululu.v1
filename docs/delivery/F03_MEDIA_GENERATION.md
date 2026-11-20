# F03 — Génération d’images et vidéo dans le Studio

Date : 2026-11-20 · suite de [C09](C09.md) · contrats et adaptateurs existants conservés.

## Parcours et périmètre

1. Enregistrer une composition organique, choisir une scène et ouvrir **Générer un média**. Pour une image : PNG carré, un seul résultat. Pour un clip : composition vidéo courte, scène de 5 s maximum, clip de 5 s en paysage ou portrait et référence PNG/JPEG autorisée de la bibliothèque (3 Mio max, dimensions et proportions contrôlées).
2. Décrire le visuel et confirmer les droits d’utilisation et l’envoi externe. **Préparer sans facturer** fige la demande. **Autoriser jusqu’à …** réserve dans ToolBroker 1 cent USD par image ou 25 par clip ; aucune génération avant autorisation. La limite repose sur le tarif et les paramètres du modèle autorisé, pas sur un verrou de facturation chez le fournisseur.
3. Le panneau ouvert actualise les états actifs toutes les dix secondes. Une annulation avant envoi libère le budget. Après envoi elle reste une demande : vérifier l’état avant l’annulation évite de supprimer un résultat déjà terminé. Un changement concurrent peut malgré tout donner lieu à une facturation ou à l’impossibilité de récupérer la sortie.
4. Chaque sortie doit passer les vérifications d’origine, taille, format, dimensions, décodage (et durée pour la vidéo) avant stockage vérifié dans la bibliothèque de marque. Les URL temporaires ne sont pas exposées au navigateur. L’application dans la scène constitue une décision distincte et crée une nouvelle révision. Après un changement de la scène source, choisir l’actif depuis la bibliothèque plutôt qu’écraser la composition. On peut choisir ou retirer un clip de bibliothèque dans une scène courte, puis rendre et exporter le master. Rien n’est publié.

## Validation des contrats fournisseurs

- **Replicate** : [création asynchrone](https://replicate.com/docs/topics/predictions/create-a-prediction), [API HTTP](https://replicate.com/docs/reference/http), [schéma et prix FLUX Schnell](https://replicate.com/black-forest-labs/flux-schnell/api/schema). `POST /v1/models/black-forest-labs/flux-schnell/predictions`, puis `GET /v1/predictions/{id}` ou `POST …/cancel`. Un résultat PNG carré, environ 1 mégapixel, quatre étapes, modération non désactivée. Tarif public consulté : 3 USD / 1 000 images. Un résultat valide ne prouve pas la dépense par prédiction : sans reçu, le budget reste réservé jusqu’au rapprochement manuel.
- **Runway** : [API et version](https://docs.dev.runwayml.com/api/), [tarifs](https://docs.dev.runwayml.com/guides/pricing/), [sorties temporaires](https://docs.dev.runwayml.com/assets/outputs/), complétés par les types officiels `@runwayml/sdk@4.28.0` (aucune dépendance runtime ajoutée). `POST /v1/image_to_video`, `gen4_turbo`, `X-Runway-Version: 2024-11-06`, `promptImage` en URI de données, 5 s, ratio 1280:720 ou 720:1280. `GET /v1/tasks/{id}` lit le résultat, `DELETE /v1/tasks/{id}` demande l’annulation et peut supprimer une tâche déjà terminée. Le tarif public est 5 crédits/s, à 1 cent USD/crédit. Utiliser `cost.credits` terminal, jamais `estimatedCost`, pour rapprocher l’opération. Seuls les MP4/H.264 vérifiés sont acceptés.

Les rejets explicites de paramètres ou de quota à la création sont distingués des réponses ambiguës. Une création sans identifiant durable n’est jamais rejouée. Un claim expiré avec un identifiant durable et `PENDING` reprend en lecture seule, sans nouvelle création. Les erreurs HTTP temporaires sont retentées dans la fenêtre de suivi de 30 minutes ; un échec de téléchargement temporaire relit d’abord le statut pour retrouver une URL valide. Une interruption au moment de l’import est une exception : le worker n’importe pas une deuxième fois automatiquement ; l’opérateur vérifie la bibliothèque et la facture. Un coût hors plafond ou inconnu est traité par les incidents ToolBroker, pas par un remboursement implicite. La vérification d’un média ne certifie ni sa qualité éditoriale ni ses droits pour une campagne sponsorisée.

## Activation opérateur

- Configurer `MEDIA_GENERATION_ENABLED=1` côté API **et** worker Hatchet. `MEDIA_IMAGE_ENABLED=0` ou `MEDIA_VIDEO_ENABLED=0` permet de désactiver un fournisseur indépendamment. Dans Coolify, le worker seul reçoit `REPLICATE_API_TOKEN` et `RUNWAYML_API_SECRET` ; l’API reçoit des indicateurs de présence **non probants**. Ne pas exposer ces secrets au client ni lancer un essai facturé pour détecter une capacité.
- Vérifier les tarifs, les droits d’usage et la disponibilité du compte avant activation. Autoriser `media.image@1` / `media.video@1` et un plafond fini sur le compte ToolBroker ; si le mode commercial est actif, configurer aussi les droits adéquats. Utiliser le worker et le stockage d’artefacts déjà configurés et FFmpeg/ffprobe. Autoriser les sorties HTTPS vers les API et CDN documentés, sans élargir les règles aux URL client ou aux redirections.
- Pour arrêter proprement, ne plus autoriser de nouvelles opérations et laisser les opérations en cours atteindre leur état terminal avant de désactiver le fournisseur, si possible. Couper les identifiants en cours de suivi empêche de confirmer le résultat et ne libère pas automatiquement les réservations ambiguës.

## Recette

```sh
pnpm test tests/media-providers.test.ts tests/v1/media-generation.test.ts tests/v1/execution-broker.test.ts
pnpm exec playwright test --config playwright.media.config.ts
pnpm lint
pnpm --filter @vululu/api --filter @vululu/web typecheck
```

Base locale jetable avec migrations appliquées et FFmpeg/ffprobe. HTTP Replicate/Runway **MOCK** ; stockage local, révisions et exports réels. Identifiants fournisseur, génération et facturation externes, transport Hatchet réel et déploiement : **NOT_RUN**.

Résultats Arena : 23 tests ciblés réussis (1 scénario existant de transport ignoré), parcours Playwright bureau et mobile réussis (2/2, image et vidéo), lint et vérifications TypeScript API/Web réussis. Les migrations existantes ont été appliquées à PostgreSQL local ; F03 ne requiert pas de nouvelle migration.
