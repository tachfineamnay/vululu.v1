# P09A — Production vidéo multiscène éditable (rapport de lot)

- **Date** : 2026-11-21
- **Branche** : `campaign/vululu-completion` (base `a952216`, P08)
- **Commit** : `feat(p09a): complete video production [BUILD_UNVERIFIED]`
- **Statut de preuve** : **BUILD_UNVERIFIED**. Aucune suite de tests, aucun typecheck, aucun build, aucun E2E n'a été exécuté (contrat de finition §25). Les vérifications ci-dessous sont des contrôles manuels, jamais une certification.
- **ADR** : [ADR-0040](../adr/0040-production-video-multiscene.md)

## 1. Périmètre livré

1. **Vidéo multiscène réellement éditable** : `productionFormats.Video.studio = 'short'` ; type de sortie additif `landscape` (1920×1080) et preset de canal « LinkedIn · Vidéo paysage » ; prédicat unique `isVideoOutput` dans les contrats, le guide de composition, les directions, la génération média et l'atelier.
2. **Concept et storyboard depuis la direction retenue** : la direction artistique reste une `CreativeRevision` (ADR-0035) ; l'atelier reprend la révision retenue via la route existante `POST /:version/restore` (aucun second modèle de storyboard).
3. **Import et réutilisation** : les ressources confirmées (images et `video/mp4`) restent la source ; clips par scène, calques image, ressources IA/Python.
4. **Scènes éditables et ordre** : timeline (`StudioTimeline`) — sélection, réordonnancement accessible, ajout/duplication/retrait, durées 0,5–30 s, total borné à 180 s, badges transition/clip.
5. **Durées et timeline** : édition inline + contrôles de l'inspecteur ; toute mutation passe par le chemin `change()` → révision serveur + historique local.
6. **Remplacement de clip et régénération ciblée** : sélection du clip dans la scène (calque/« clip de la bibliothèque »), régénération d'une scène vidéo via le pipeline Runway existant (`media.video@1` : préparation → approbation humaine → worker → vérification stricte → placement en nouvelle révision) ; une scène photo renvoie à l'éditeur d'image P07.
7. **Transitions prises en charge** : `cut` et `dip` (par scène et par défaut de livraison), exposées dans l'inspecteur ; aucune autre transition annoncée.
8. **Recadrage** : calque image (`crop` zoom/point de mire, P08) et clip (`fit` cover/contain + `focusY`), rendu FFmpeg réel.
9. **Titres et textes à l'écran** : calques texte existants (rôle, taille, couleur, cartouche, alignement, interligne), composition Sharp.
10. **Aperçu de rendu** : `POST /api/projects/:id/creative/preview/video` — même compositeur que le master, **borné à 20 s**, preset `ultrafast`, aucune révision, aucun stockage, aucun manifeste.
11. **Historique d'édition persistant** : `CreativeRevision` append-only, concurrence `expectedVersion`, restauration en nouvelle révision, comparaison de révisions existante.
12. **Master H.264/MP4 correct** : encodage H.264 yuv420p + AAC, durée pilotée par les scènes, vérification `creative_master_integrity` (codecs, dimensions, durée), piste audio vérifiée par `ffprobe` (`media_audio_duration_mismatch` si dérive).
13. **Approbation et export d'une version exacte** : checksum du master, export refusé en 409 avant approbation, MP4 après approbation (extension vidéo).
14. **Progression, annulation, reprise** : colonnes additives `StudioRender.progress` et `cancelRequested` ; annulation immédiate en file, coopérative en fin de scène ; bail/lease, heartbeat, reprise ≤ 3 tentatives et motifs lisibles (existants) ; journal `StudioEvent` alimenté de façon atomique (le flux SSE existant devient réel).
15. **Contraintes fournisseur respectées** : Runway image→vidéo, 5 s, 1280:720 ou 720:1280 selon l'orientation du cadre ; aucune génération déclarée réussie sans artefact vérifié (décodage complet du flux).

## 2. Fichiers principaux

- Contrats : `packages/contracts/src/{creative,productionFormats,compositionGuide}.ts`
- Média : `packages/media/src/motion.ts` (recadrage clip, preset, ASS par scène), `packages/media/src/index.ts` (sonde audio ffprobe, vérification de durée)
- API : `apps/api/src/application/creative.ts` (`previewVideo`, hooks de rendu, recadrage), `apps/api/src/routes/creative.ts` (aperçu vidéo, annulation, progression), `apps/api/src/infrastructure/creative/{renderJobs,studioEvents}.ts`, `apps/api/src/infrastructure/mediaGeneration/service.ts` (orientation Runway), `apps/api/src/application/creativeDirections.ts`
- Base : `packages/db/prisma/schema.prisma`, migration additive `20261122100000_studio_render_progress`
- Web : `apps/web/components/{StudioTimeline,StudioRegenerate,StudioDelivery,StudioInspector,CreativeEditor,MediaGenerationPanel,FormatGuide}.tsx`, `apps/web/lib/{studioTypes,studioChannels,studioComponentTypes,useStudioVideoPreview}.ts`, `apps/web/app/atelier-blue.css` (le rail de scènes statique de P08 est remplacé par `StudioTimeline`, avec les libellés de scène conservés ; les sélecteurs E2E Playwright seront réalignés en P12)
- Docs : ADR-0040, index ADR, inventaire, carte des lots, ce rapport

## 3. Vérifications manuelles exécutées (contrôles, pas certification)

| Contrôle | Résultat | Détail |
|---|---|---|
| `ffmpeg` graphe de sous-titres + mixage | **OK (smoke manuel)** | ASS libass brûlé par scène depuis le dossier de travail, fades, `amix/adelay/afade` sur deux pistes, concat + AAC : `ffprobe` renvoie `h264` 2.000 s et `aac` 2.000 s. Binaire local `ffmpeg-9.0.2-essentials` (libass, freetype, fribidi, amix, sidechaincompress, adelay, afade présents). |
| Graphe FFmpeg concerné | **OK** | Les expressions `crop=w:h:(iw-w)/2:(ih-h)*focusY`, `ass=filename=part-N.ass` (cwd = dossier des parties) et `amix=inputs=2:normalize=0` sont celles du code livré. |
| `git diff --check` | **OK (exit 0)** | Aucun espace fautif dans le diff. |
| `scripts/check-secrets.ps1` (arbre) | **ÉCHEC (exit 1), faux positif préexistant** | 1 détection `assigned-secret` dans `services/python-tools/.env.example` (placeholder `PYTHON_TOOLS_TOKEN=CHANGE_ME…`, committé en P06, non modifié par ce lot). Aucun secret introduit par P09A ; non masqué, non modifié hors périmètre. |
| `pnpm exec prisma validate` | **OK (exit 0)** | Schéma valide, client régénéré ensuite (`pnpm db:generate`, exit 0) ; la migration additive est bien reflétée. |
| `scripts/check-migrations.ps1` | **OK (exit 0)** | 38 migrations, nommage et `migration.sql` cohérents ; contrôle structurel, pas la sémantique SQL. |
| Parse syntaxique TypeScript (transpileModule, 22 fichiers modifiés) | **OK (0 erreur)** | Contrôle de syntaxe uniquement, **pas** un typecheck, **pas** un build. |

## 4. Non exécuté (NOT_RUN) et limites

- **NOT_RUN** : suite Vitest, typecheck, lint, build, Playwright, rendu réel d'un master, aperçu vidéo réel, campagne de génération Runway. Cause : campagne P00–P11 (aucune suite) ; aucun fournisseur activé ; pas de crédential.
- **NOT_RUN environnemental** : le client Prisma doit être régénéré (`pnpm db:generate`) pour que `progress`/`cancelRequested` soient typés — obligatoire avant le typecheck P12.
- **PROVIDER_DEPENDENT / NOT_VERIFIED** : Runway (`MEDIA_GENERATION_ENABLED`, `MEDIA_VIDEO_ENABLED`, `RUNWAYML_API_SECRET`) reste désactivé ; aucun appel réel n'a été effectué.
- Limites assumées : aperçu plafonné à 20 s et consommateur d'un des deux slots de rendu ; l'annulation ne coupe pas une scène déjà en cours d'encodage ; transitions limitées à `cut`/`dip` ; le 16:9 est un preset (defaut 9:16) ; les specs E2E historiques ne connaissent pas `landscape` (réalignement P12) ; le pipeline historique démo existe toujours mais n'est plus le seul chemin vidéo.

## 5. Rollback

`git revert <sha-p09a>`. La migration additive reste en place et inerte (colonnes avec défaut). Le déverrouillage du format `Video` est une ligne (`productionFormats.ts`) réversible indépendamment. Aucune donnée existante n'est modifiée ou supprimée.
