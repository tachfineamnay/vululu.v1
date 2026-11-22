# P12-07 — Validation du pipeline média réel du Studio

**Lot :** P12-07 · **Branche :** `campaign/vululu-completion` · **Base :** `83df5a5`.
**Date :** 2026-11-21. **Statut :** pipeline média **exécuté sur FFmpeg/FFprobe réels** (28 contrôles, 2 défauts corrigés).
Vitest, base de données et navigateur **NOT_RUN** (§5). Aucun fournisseur payant appelé.

---

## 1. Environnement réel vérifié

| Élément | Valeur |
|---|---|
| FFmpeg | `ffmpeg version 9.0.2-essentials_build` (`.v0/ffmpeg/…/bin/ffmpeg.exe`, `FFMPEG_PATH`) |
| FFprobe | `ffprobe version 9.0.2-essentials_build` (frère de FFmpeg) |
| Compositor | Sharp (PNG) + OpenCV/Pillow via médias générés ; aucun modèle |
| Sous-titres | documents ASS par scène + SRT absolu |

**Contrainte d'environnement :** le sandbox DSH refuse les spawns d'enfants avec pipes (`spawn EPERM`), or
`packages/media` lance FFmpeg avec `stdio: pipe`. Les preuves ci-dessous ont donc été produites avec un
**harnais local** qui remplace uniquement le transport stdio par des fichiers (binaire, arguments, environnement,
codes de sortie et code du package inchangés). Ce harnais n'est pas commité.

## 2. Défauts confirmés et corrigés

### 2.1 Mixage audio tronqué par le ducking (réel, mesuré)

`buildMixArgs` découpait chaque piste à la longueur de son créneau **sans la compléter** : avec une voix de
1,2 s et une musique de 4 s pour un master de 3,5 s, `sidechaincompress` terminait avec la voix (le sidechain
s'arrête avec lui) et le mix final faisait **2,600 s au lieu de 3,500 s** (mesuré par FFprobe).

**Correction** (`packages/media/src/audio.ts`) : `apad=whole_dur=<longueur>` sur chaque piste, puis
`apad=whole_dur=<durée>` sur le bus final. Le mix a désormais exactement la durée demandée, et le ducking ne
coupe plus la musique quand la voix est plus courte.

### 2.2 Géométrie de montage vidéo non validée

Une hauteur de clip nulle/impaire (ou un canvas impair) partait directement dans `crop` et produisait un échec
FFmpeg cryptique (`Invalid too big or non positive size for width '1080' or height '0'`) sans message métier.

**Correction** (`packages/media/src/motion.ts`) : validation avant FFmpeg — canvas et hauteur de clip entiers,
pairs, entre 2 et 4096 ; point de départ fini et positif. Erreur explicite `media_motion_geometry_invalid`.

## 3. Preuves exécutées (sorties réelles)

### 3.1 Images fixes, master et QA (probe 1 : 14 contrôles)

| Contrôle | Résultat mesuré |
|---|---|
| `renderScene` PNG réel | 152 037 octets, `textLayout.complete=true`, checksum lié |
| Master 2 scènes fixes | **2 flux**, h264 / **yuv420p**, aac, **1080x1920**, durée **2.500000 s** |
| `audioDuration` d'un master muet | **0** (aucune piste inventée) |
| `runQa` | **PASS** (0 contrôle en échec) |
| Mixage voix+musique (fondus, ducking) | pcm_s16le / **48000 Hz** / stéréo, durée **3.500000 s** |
| ASS scène 1 | `Dialogue: 0,0:00:00.30,0:00:01.40` |
| ASS scène 2 | temps ramené au local de la scène (0:00:00.30) |
| SRT | `00:00:01,750 --> 00:00:02,400` |

### 3.2 Montage vidéo réel, transitions, sous-titres, intégrité (probe 2 : 14 contrôles)

| Contrôle | Résultat mesuré |
|---|---|
| Clip réel + image fixe, transitions dip | **2 flux**, h264/yuv420p, aac/**48000**, **1080x1920** |
| Durée | **3.500000 s**, **105 images** (30 fps, écart 0) |
| `audioDuration` (FFprobe sur le fichier) | **3.5 s** |
| `runQa` | **PASS** |
| Incrustation des sous-titres | empreintes différentes avec/sans ASS (pixels réellement modifiés) |
| Master tronqué (40 % des octets) | `runQa` **FAIL** (`master checksum`) |
| Hauteur de clip invalide | `media_motion_geometry_invalid` (message explicite) |
| Canvas impair | `media_motion_geometry_invalid` |
| Audio plus court que le master | complété en silence : audio **3.500000 s** = vidéo **3.500000 s** |

### 3.3 Commandes

| Commande | Exit | Résultat |
|---|---|---|
| `tsc packages/media/src/index.ts --outDir …` (harnais) | 0 | émission CJS, exécution via Node |
| Probe 1 (scènes, master fixes, mix, ASS/SRT, QA) | 0 | `PROBE1=PASS checks=14` |
| Probe 2 (clip, transitions, audio, sous-titres, intégrité, refus) | 0 | `PROBE2=PASS checks=14` |
| `eslint packages/media/src tests/media-p12-07-regressions.test.ts` | 0 | 0 erreur |
| `tsc --noEmit -p packages/media/tsconfig.json` | 0 | 0 erreur |
| `tsc --noEmit -p apps/api/tsconfig.json` | 0 | 0 erreur |

## 4. Couverture des exigences

| # | Exigence | Preuve | Statut |
|---|---|---|---|
| 1 | Scènes : création, duplication, ordre, suppression, durée | opérations du store Studio lues ; aucune exécution navigateur | **PARTIEL** (lecture de code) |
| 2 | Géométrie, recadrage, texte, safe area, ratios | `renderScene` 1080x1920 + textLayout ; ratios testés par `tests/responsive-layout.test.ts` (NOT_RUN) | **PARTIEL** (1 ratio exécuté) |
| 3 | Aperçu fidèle au rendu final | même compositeur (`creativeFrame`) et mêmes dimensions ; pas de comparaison pixel | **PARTIEL** |
| 4 | Clips multiples, transitions, H.264 | probe 2 (clip + fixe, dip, h264/yuv420p) | **PASS** |
| 5 | Mixage, fondus, ducking, voix off, sous-titres | probe 1 (mix 3,5 s, ducking corrigé) + probe 2 (ASS incrusté) | **PASS** |
| 6 | Codecs, durée, dimensions, intégrité | FFprobe : h264/aac, 3,5 s, 1080x1920, 105 images ; QA PASS ; troncature détectée | **PASS** |
| 7 | Progression, annulation, bail, reprise, limite d'essais | `renderJobs.ts` lu (bail 2 min, `SKIP LOCKED`, `maxAttempts=3`, heartbeat) ; non exécuté (base absente) | **PARTIEL** |
| 8 | Révisions immuables, undo/redo, restauration, checksum d'approbation, export | code lu ; tests base existants NOT_RUN | **NOT_RUN** |
| 9 | Mobile/desktop sans reconstruire l'UI | non exécuté (Playwright indisponible) | **NOT_RUN** |
| 10 | Échecs explicites, jamais de succès factice | `media_motion_geometry_invalid`, `audio_tracks_required`, `audio_duration_invalid`, QA FAIL sur master tronqué | **PASS** |

## 5. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| `vitest run tests/media-p12-07-regressions.test.ts` (nouveaux cas) | `esbuild` → `spawn EPERM` dans cette session | NOT_RUN |
| Suites média existantes (`media.test.ts`, `media-duration-integrity.test.ts`, `responsive-layout.test.ts`) | idem | NOT_RUN |
| `renderJobs` (progression/annulation/bail/reprise) | PostgreSQL `127.0.0.1:55432` absent | NOT_RUN |
| Scènes : duplication/ordre/suppression, undo/redo, export ZIP | navigateur + base requis | NOT_RUN |
| E2E mobile/desktop | Playwright indisponible | NOT_RUN |

**graphify : NOT_RUN** — le graphe n'a pas été construit ni interrogé dans cette session (l'extraction exige
une escalade `danger-full-access` que le sandbox refuse ici) ; le travail a été mené par lecture directe du
code (`read`/`grep`), chaque affirmation vérifiée sur le fichier réel ou par une exécution FFmpeg/FFprobe.

**Limites assumées :** l'aperçu et le master partagent le compositeur et les dimensions, mais aucune comparaison
pixel à pixel n'a été faite ; les transitions supportées restent `cut`/`dip` (le contrat refuse les autres) ;
un audio plus court que la vidéo est complété en silence (comportement déterministe, vérifié) et non refusé ;
le harnais stdio local n'est pas une modification du produit.

## 6. Rollback

`git revert <sha>` : retour à `83df5a5`. Aucune migration, aucune donnée modifiée ; les deux corrections sont
locales à `packages/media` et à leurs tests.
