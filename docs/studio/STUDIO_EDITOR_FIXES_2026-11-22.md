# Studio — correctifs de l'éditeur (2026-11-22)

**Branche :** `arena/d493d520-vululu-v1` · **Base :** `ebb1d56` (main) + integration `46f8c1f`.
**Cible de fusion :** `integration/vululu-release-20261121`. **Mode :** `VULULU_BETA_MODE=1`, aucun paiement, aucune publication.

## 1. Défauts corrigés (mesurés, pas supposés)

| # | Défaut | Preuve | Correctif |
|---|---|---|---|
| 1 | `StudioCanvas` inversait l'ordre des calques (`.reverse()`) : le calque cliqué n'était pas celui qui est peint au-dessus. | `sharp` : deux calques pleins, rouge puis bleu → pixel central `0,0,255` = **dernier indice au-dessus** ; le DOM rendait l'ordre inverse. | Rendu dans l'ordre du tableau (`tests/studio-canvas-order.test.tsx`, échoue si inversé). |
| 2 | L'aperçu d'une scène envoyait la spec réduite **avec** l'audio : le serveur refusait dès qu'un sous-titre dépassait la durée de cette scène (`Un sous-titre dépasse la durée totale de la vidéo`). | `creativeSpec.safeParse({...spec, scenes:[scène1]})` → `success:false`, même spec sans audio → `success:true`. | `previewSpecForScene` (hook d'aperçu, comparaison, directions artistiques, panneau avancé). |
| 3 | `clampLayer` produisait `x = 0,049999…` pour `safeArea = 0,05` : un calque texte neuf sortait de la zone sûre et **invalidait toute la composition**. | `createTextLayer('body', 0.05)` → `x = 0.04999999999999993`, refus du contrat (`x < safeArea`). | Bornes arrondies au millième, maximum borné par la marge (`tests/studio-editor.test.ts`). |
| 4 | « Ajouter un sous-titre » créait un repère **vide** (`text: ''`) : contrat `min(1)` → sauvegarde et aperçu refusés. | `subtitleCue` refuse `''`. | Libellé neutre éditable + créneau libre sans chevauchement (`appendCue`). |
| 5 | Modifier le début/fin d'un sous-titre pouvait casser `end > start + 0,2`. | Contrat `subtitleCue.refine`. | Ajustement réciproque (`setCueTime`), borné par la durée réelle de la vidéo. |
| 6 | Raccourcir ou retirer une scène laissait pistes et sous-titres **au-delà de la fin** → composition invalide. | Contrat : « Une piste audio commence après la fin » / « Un sous-titre dépasse la durée totale ». | `withSceneDuration` / `withoutScene` ramènent l'audio et **annoncent** l'ajustement (aucune suppression silencieuse). |
| 7 | `applyChannelPreset` vers une sortie image conservait `audio` (pistes/sous-titres) → spec invalide. | `creativeSpec.safeParse` → `success:false` avant correctif, `true` après. | Audio retiré pour les cibles non vidéo, mention explicite dans la note. |
| 8 | Le panneau « Outils avancés » éditait X/Y/L/H **sans** borner à la zone sûre, et changeait durée/marge sans passer par les helpers. | Champs → `clampLayer` absent. | Éditions bornées, marge via `withSafeArea`, durée/retrait via les helpers audio. |
| 9 | Forme d'onde : décodage complet en mémoire sans borne. | Aucune limite dans `TrackWaveform`. | Au-delà de 12 Mio : métadonnées seules, message explicite. |
| 10 | `pointercancel` n'arrêtait pas un geste : l'historique restait « en attente ». | `endListeners` n'écoutait que `pointerup`. | `pointercancel` traité comme `pointerup` ; clic sur le canvas vide désélectionne. |

## 2. Fonctionnalités complétées

- **Calques texte** : ajout « + Titre / + Texte / + Bouton » (16 calques max, zone sûre, libellé neutre).
- **Ordre de peinture** aligné sur le compositeur serveur (`moveLayerOrder`), liste et boutons Monter/Descendre cohérents.
- **Sous-titres** : ajout non chevauchant, bornes mutuelles, placeholder non vide.
- **Timeline** : durée/retrait de scène gardent la composition valide et informent l'utilisateur.

## 3. Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `pnpm --filter @vululu/web typecheck` | **PASS** |
| `pnpm --filter @vululu/web build` (Next 16) | **PASS** (28 routes) |
| `npx vitest run tests/studio-editor.test.ts tests/studio-canvas-order.test.tsx` | **20 PASS** |
| `npx vitest run` (global) | 430 tests, **341 PASS**, 19 échecs **tous** préexistants et environnementaux |
| `eslint` sur les fichiers modifiés | **0 erreur** |
| `pnpm -r typecheck` (api) | **NOT_RUN** — client Prisma non générable (`binaries.prisma.sh` bloqué) |
| FFmpeg / FFprobe, PostgreSQL, Docker, E2E Playwright | **NOT_RUN** — binaires/services indisponibles dans ce sandbox |

Les échecs globaux restants sont identiques au relevé d'entrée (`4b19697`) : 36 fichiers bloqués par
l'absence du moteur Prisma, tests média nécessitant FFmpeg, 1 contrat python-tools. **Aucune nouvelle
défaillance** ; 20 tests ajoutés.

## 4. Limites assumées

- Aucune révision, approbation ou export n'a été rejoué contre une base réelle : le code serveur n'est pas modifié.
- L'aperçu vidéo (20 s) et les exports dépendent de FFmpeg : non exécutés ici.
- Les repères de canal restent des repères de composition, pas une garantie d'affichage réseau.
