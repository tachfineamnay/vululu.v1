# ADR-0040 — Production vidéo multiscène éditable dans l'atelier

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P09, checkpoint A)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0026 (composition native et texte intégral), ADR-0035 (directions = brouillons `CreativeRevision`), ADR-0039 (atelier visuel), mission P09.

## Contexte

Le format `Video` (« Vidéo multiscène ») était déclaré mais non éditable : `productionFormats.Video.studio = null`, donc l'atelier ne s'ouvrait pas et le pipeline historique restait réservé à la démonstration (`requireDemo`). L'atelier P08 savait déjà composer une vidéo courte : scènes, calques image/texte, clip par scène, transitions `cut`/`dip`, piste audio unique, rendu FFmpeg H.264/AAC, file durable `StudioRender`, approbation version + checksum, export.

La mission P09A exige une production vidéo réelle : concept et storyboard issus de la direction artistique retenue, import de vidéos/photos, scènes éditables et réordonnables, timeline visuelle et durées, remplacement de clip et régénération ciblée, transitions prises en charge, recadrage, titres, aperçu de rendu, historique persistant, master H.264/MP4 correct, approbation/export d'une version exacte, progression/annulation/reprise claires.

## Décision

1. **Un seul atelier pour toutes les vidéos** : `productionFormats.Video.studio` passe à `'short'` (vertical 9:16 par défaut). Aucun second éditeur, aucun nouveau moteur : l'atelier P08 est réutilisé.
2. **Type de sortie paysage additif** : `outputKind` gagne `'landscape'` (1920×1080) et un preset de canal LinkedIn « Vidéo 16:9 ». `Reel` et `Video` restent 9:16 par défaut ; le paysage n'est pas imposé aux plateformes verticales.
3. **Un prédicat unique** : `isVideoOutput(kind)` (`@vululu/contracts`) remplace toutes les comparaisons `kind === 'short'` (contrats, guide de composition, directions, génération média, atelier). Les specs stockées sans `landscape` continuent de parser et de rendre à l'identique.
4. **Recadrage de clip additif** : `scene.clip.fit` (`cover`|`contain`) et `scene.clip.focusY` (0..1) sont optionnels ; l'absence reproduit exactement le cadrage centré historique. Aucun défaut n'est injecté dans les specs enregistrées, donc les empreintes de cache restent stables.
5. **Aperçu vidéo borné, même compositeur** : `POST /api/projects/:id/creative/preview/video` rend les 20 premières secondes avec le même compositeur (Sharp + FFmpeg, preset `ultrafast`). Aucune révision, aucun manifeste, aucun stockage : ce n'est pas un artefact livrable et l'interface l'indique.
6. **Progression et annulation observables** : deux colonnes additives `StudioRender.progress` et `StudioRender.cancelRequested` ; l'annulation est immédiate en file et coopérative en cours de rendu (fin de scène courante). Les transitions d'état alimentent le journal `StudioEvent` déjà lu par le flux SSE de l'atelier.
7. **Régénération ciblée = pipeline fournisseur existant** : la régénération d'une scène vidéo passe par Runway (`media.video@1`, image de référence obligatoire, 5 s, 1280:720 ou 720:1280) via préparation → approbation humaine → worker → vérification stricte de l'artefact → placement dans une nouvelle révision. Aucun nouveau fournisseur, aucune sortie déclarée sans artefact vérifié.
8. **Transitions prises en charge : `cut` et `dip`**, par scène et par défaut de livraison. Aucune autre transition n'est annoncée ; un fondu enchaîné `xfade` demanderait de réencoder la timeline entière et fera l'objet d'un lot séparé s'il est requis.
9. **Aucune nouvelle table** : une seule migration additive (deux colonnes `StudioRender`) ; l'historique, l'approbation et l'export restent ceux de P08.

## Conséquences

- **Positives** : la vidéo multiscène devient réellement éditable et exportable ; un seul modèle de composition ; l'aperçu reste fidèle au rendu final ; la progression et l'annulation sont visibles et honnêtes ; la régénération ciblée réutilise les garde-fous budget/approbation/vérification existants.
- **Négatives / coûts** : l'ajout de `landscape` traverse les contrats, les presets de canal et le guide de composition (suites existantes à réaligner en P12) ; l'aperçu est plafonné à 20 s et consomme un slot de rendu ; l'annulation ne coupe pas un encodage de scène déjà lancé ; le paysage n'est pas encore proposé par défaut par plateforme.
- **Sécurité** : toutes les routes nouvelles filtrent par propriétaire (404 pour autrui) et réutilisent le rate limit du rendu ; aucun chemin client, aucune URL fournisseur et aucun secret n'entrent dans les contrats ; l'aperçu ne crée aucune version approuvable ; la génération distante reste refusée sans crédential explicite.

## Alternatives envisagées

- **Un éditeur vidéo séparé (timeline dédiée hors atelier)** : rejeté, second moteur et duplication du modèle de composition.
- **Forcer `Video` en 16:9** : rejeté, incompatible avec TikTok/Reels verticaux ; le paysage est un preset, pas une obligation.
- **Aperçu côté navigateur** : rejeté pour la même raison qu'en ADR-0039 (fidélité) ; le lecteur lit le MP4 rendu par le serveur.
- **Transitions `xfade` immédiates** : reporté, coût de réencodage complet de la timeline.
- **Nouvelle table d'états de rendu** : rejeté, `StudioRender` et `StudioEvent` existent et suffisent.

## Références

- `packages/contracts/src/creative.ts`, `packages/contracts/src/productionFormats.ts`, `packages/contracts/src/compositionGuide.ts`
- `packages/media/src/motion.ts`, `packages/media/src/index.ts`
- `apps/api/src/application/creative.ts`, `apps/api/src/routes/creative.ts`
- `apps/api/src/infrastructure/creative/renderJobs.ts`, `studioEvents.ts`, `apps/api/src/infrastructure/mediaGeneration/service.ts`
- [Carte P01–P11](../implementation/VULULU_COMPLETION_PLAN.md), [inventaire courant](../implementation/VULULU_FEATURE_INVENTORY.md)
