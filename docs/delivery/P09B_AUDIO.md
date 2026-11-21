# P09B — Audio, sous-titres et voix off (rapport de lot)

- **Date** : 2026-11-21
- **Branche** : `campaign/vululu-completion` (base `5355378`, P09A)
- **Commit** : `feat(p09b): complete audio subtitles and voiceover [BUILD_UNVERIFIED]`
- **Statut de preuve** : **BUILD_UNVERIFIED** — aucune suite de tests, aucun typecheck, aucun build, aucun E2E (contrat §25). Les contrôles ci-dessous sont manuels, jamais une certification.
- **ADR** : [ADR-0041](../adr/0041-audio-sous-titres-voix.md)

## 1. Périmètre livré

1. **Import et inspection audio** : formats déjà acceptés (`audio/wav`, `audio/mpeg`), inspection bornée par `ffprobe` (existante) ; durée/format exposés dans l'atelier.
2. **Intelligence audio locale** : `audio.analyze@1` dans la boîte à outils Python (WAV/PCM, stdlib `wave` + numpy) — durée, fréquence, canaux, largeur d'échantillon, crête/RMS dBFS, écrêtage, silences. Bornée, sans dépendance ni modèle, soumise à la confirmation de ressources.
3. **Pistes audio et volume** : jusqu'à 4 pistes (`voiceover`/`music`/`sfx`) avec début, gain 0–1, fondus et ducking, dans `CreativeSpec.audio` (additif, révisions existantes inchangées).
4. **Mixage basique local** : `mixTracks` (FFmpeg) — trim borné, gain, fondus, décalage timeline, bus voix/musique, `sidechaincompress` pour le ducking, WAV PCM 48 kHz stéréo.
5. **Sous-titres éditables** : repères (début/fin/texte ≤ 200), langue, style (taille, couleur, cartouche, opacité, position, alignement, gras), validation stricte (pas d'accolades/barres inverses/contrôles → pas d'injection ASS).
6. **Rendu des sous-titres** : ASS généré par scène (temps local) et brûlé par libass dans le master ; SRT exporté depuis la révision approuvée.
7. **Transcription** : outil `audio.transcribe@1` (Vertex Gemini), préparation sans dépense, autorisation humaine du plafond (8 ¢), exécution worker, validation des segments (ordonnés, bornés), application en sous-titres d'une nouvelle révision.
8. **Voix off** : outil `audio.tts@1` (Vertex Gemini TTS, 12 ¢), texte fourni, langue et voix du catalogue (liste blanche), sortie PCM encapsulée en WAV puis vérifiée par `ffprobe` (0,4–60 s), stockée comme nouvelle version d'asset audio avec provenance, puis ajoutée comme piste.
9. **Langues et voix** : six langues fermées ; voix du catalogue fournisseur uniquement. **Aucun clonage de voix** (aucun endpoint, aucun paramètre, aucune référence audio).
10. **Synchronisation audio/vidéo** : mixage borné à la durée des scènes ; le master vérifie la durée réelle de la piste audio (`media_audio_duration_mismatch` sinon) ; sous-titres positionnés sur la même timeline.
11. **Export à codecs validés** : master H.264/AAC inchangé ; export M4A (AAC copié sans réencodage) réservé à une révision approuvée.
12. **Révisions et revue humaine** : toute application audio crée une nouvelle révision ; approbation liée à la version + checksum exact du master (tout changement audio invalide l'approbation précédente).
13. **Refus honnêtes** : fournisseur désactivé → 503 avec raison ; droits inconnus → 422 ; source absente → 404 ; aucun transcript ni voix simulés.

## 2. Fichiers principaux

- Contrats : `packages/contracts/src/audio.ts`, `creative.ts`, `index.ts`
- Média : `packages/media/src/audio.ts` (nouveau), `motion.ts` (ASS par scène), `index.ts` (exports, `mediaRun`)
- API : `apps/api/src/application/creative.ts` (mixage, sous-titres, exports), `routes/{creative,audio}.ts`, `server.ts`, `infrastructure/audio/{providers,vertex,service}.ts`, `infrastructure/execution/{registry,runtime}.ts`, `infrastructure/python/{client,adapter}.ts`
- Python : `services/python-tools/app/{audio.py,contracts.py,registry.py,main.py,__init__.py}`, `README.md`, `scripts/smoke.py`
- Web : `components/{StudioAudioPanel,StudioSubtitles,StudioTimeline,StudioInspector,CreativeEditor,StudioDelivery}.tsx`, `lib/{studioTypes,studioComponentTypes}.ts`, `app/atelier-blue.css`
- Docs : ADR-0041 + index, inventaire, carte des lots, ce rapport, `.env.example` (drapeaux vides)

## 3. Vérifications manuelles exécutées (contrôles, pas certification)

| Contrôle | Résultat | Détail |
|---|---|---|
| Graphe FFmpeg mixage + ducking + sous-titres | **OK (smoke manuel)** | `asplit` + `sidechaincompress` + `amix` + `adelay/afade` + concat + AAC : `ffprobe` renvoie h264 2,000 s et aac 2,000 s ; libass brûle un ASS par scène (test P09A). |
| Extraction M4A | **OK (smoke manuel)** | `-c:a copy` depuis le master : `audio.m4a` AAC, 2,000 s. |
| Parse syntaxique TypeScript (25 fichiers modifiés) | **OK (0 erreur)** | `transpileModule`, syntaxe seule — **pas** un typecheck, **pas** un build. |
| AST Python (6 fichiers) | **OK (0 erreur)** | Vérification de l'agent Python, sans exécution du service ni du smoke. |
| `pnpm exec prisma validate` | **OK (exit 0)** | Aucune migration en P09B. |
| `pwsh scripts/check-migrations.ps1` | **OK (exit 0)** | 38 migrations ; contrôle structurel. |
| `git diff --check` | **OK (exit 0)** | Aucun espace fautif. |
| `pwsh scripts/check-secrets.ps1` | **ÉCHEC (exit 1), faux positif préexistant** | Placeholder `PYTHON_TOOLS_TOKEN=CHANGE_ME…` dans `services/python-tools/.env.example` (P06, non modifié). Aucun secret introduit. |

## 4. Non exécuté (NOT_RUN) et limites

- **NOT_RUN** : suite Vitest, typecheck, lint, build, Playwright, rendu réel avec audio/sous-titres, smoke Python, appels fournisseur. Causes : campagne P00–P11, fournisseurs désactivés, worker/API non démarrés pour un rendu complet.
- **PROVIDER_DEPENDENT / NOT_VERIFIED** : `audio.transcribe@1` et `audio.tts@1` (Vertex Gemini) — `AUDIO_TRANSCRIBE_ENABLED=0`, `AUDIO_TTS_ENABLED=0`, aucun credential, aucun appel réel. Les modèles et voix déclarés sont ceux du catalogue par défaut ; à confirmer à l'activation humaine.
- Limites assumées : transcription horodatée par estimation du modèle (pas mot à mot) ; sous-titres dépendants de libass ; analyse Python dépendante du service interne ; mixage réencodé en AAC ; voix off limitée à 60 s par clip ; aucun clonage de voix ; les champs `accountAuthorized` dépendent de la politique d'exécution par compte (admin).

## 5. Rollback

`git revert <sha-p09b>` : aucun changement de schéma, aucune migration. Les révisions existantes restent lisibles (champs audio optionnels) ; les exports M4A/SRT disparaissent avec les routes. Aucun fournisseur n'a été activé.
