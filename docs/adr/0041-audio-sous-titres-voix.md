# ADR-0041 — Audio : pistes, mixage, sous-titres et voix off fournisseur

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P09, checkpoint B)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0026 (composition native), ADR-0036 (exécution outillée), ADR-0037 (boîte à outils Python), ADR-0038 (édition d'image IA), ADR-0040 (vidéo multiscène), mission P09.

## Contexte

Avant P09B, l'audio n'existait que comme ressource importée (`audio/wav`, `audio/mpeg`) et comme **une** piste optionnelle du format vidéo courte (`delivery.audio`), mixée en `volume`+AAC. Il n'y avait ni pistes multiples, ni sous-titres, ni transcription, ni synthèse vocale : l'inventaire P00 le documentait comme `MISSING`. La mission P09B exige l'import audio, l'inspection réelle, la transcription, des sous-titres éditables et stylés, une voix off fournisseur, le choix de langue/voix, des pistes avec volume, un mixage basique, la synchronisation audio/vidéo, un export à codecs validés, des révisions et une revue humaine.

La contrainte locale est réelle : le binaire FFmpeg de l'environnement expose libass, freetype, fribidi, amix, adelay, afade, sidechaincompress et loudnorm (vérifié dans la session P09A). Aucun modèle de reconnaissance vocale n'est installé et aucun n'est téléchargé.

## Décision

1. **L'audio est une donnée de composition, pas une nouvelle entité** : `CreativeSpec.audio` (additif) porte jusqu'à 4 pistes (`voiceover`/`music`/`sfx`, `versionId`, `start`, `gain`, fondus, `ducking`) et des sous-titres (langue, ≤ 200 repères, style). Les pistes et sous-titres ne sont valides que pour une sortie vidéo. L'ancienne piste `delivery.audio` reste acceptée et devient une musique de la timeline : les révisions existantes parsent et rendent sans migration.
2. **Mixage local déterministe** : `mixTracks` construit un filtre FFmpeg explicite (trim borné à la durée, gain, fondus, `adelay`, bus voix et bus musique, `sidechaincompress` quand une voix off et le ducking coexistent) et produit un WAV PCM 48 kHz stéréo. Le master reste H.264/AAC ; sa piste audio est vérifiée par `ffprobe` (durée = durée vidéo à la tolérance de frames près, sinon `media_audio_duration_mismatch`).
3. **Sous-titres ASS générés par scène** : le document ASS est calculé pour chaque partie vidéo avec des repères ramenés au temps local de la scène, puis brûlé par libass (`ass=filename=part-N.ass` depuis le dossier de travail). Les marges respectent la zone sûre. Le contrat refuse accolades, barres obliques inverses et caractères de contrôle : aucune injection de balises ASS. Un export SRT accompagne le master pour la revue et les plateformes.
4. **Intelligence audio locale via la boîte à outils Python** : nouvelle capacité `audio.analyze@1` (WAV/PCM uniquement, stdlib `wave` + numpy) — durée, fréquence, canaux, largeur d'échantillon, crête/ RMS dBFS, écrêtage, silences. Bornée (≤ 300 s, ≤ 16 Mio), aucune dépendance ajoutée, aucun modèle. Elle passe par le registre d'outils P05 et exige une ressource audio confirmée.
5. **Transcription et voix off = fournisseurs derrière drapeaux, jamais simulées** : Vertex Gemini (même ADC que l'image), outils `audio.transcribe@1` (plafond 8 ¢) et `audio.tts@1` (12 ¢), approbation humaine obligatoire, non proposables par l'agent. Flux identique à P07 : préparation sans dépense → autorisation du coût → worker → vérification stricte (transcription : segments ordonnés et bornés ; voix : WAV décodé, 0,4–60 s) → application à une **nouvelle révision**. `AUDIO_TRANSCRIBE_ENABLED`/`AUDIO_TTS_ENABLED` valent `0` par défaut ; sans activation, la route renvoie 503 avec la raison, jamais un faux résultat.
6. **Voix : catalogue fournisseur uniquement, aucun clonage** : la liste des voix est une liste blanche d'identifiants déclarés, la voix est vérifiée côté serveur, et chaque demande exige une attestation de droits (`rightsConfirmed`). Aucun endpoint, paramètre ou chemin de clonage de voix n'existe ; un clonage exigerait un ADR, un consentement vérifiable et une autorisation explicite.
7. **Immutabilité et revue** : la voix off est stockée comme nouvelle version d'asset audio (provenance fournisseur/modèle/voix/requête) ; la transcription devient des repères dans une nouvelle révision ; le manifeste conserve la provenance du mixage et des sous-titres ; l'approbation reste liée à la version + checksum exact du master, donc tout changement audio invalide l'approbation précédente.
8. **Aucune nouvelle table ni migration** : une seule colonne ajoutée en P09A (`StudioRender.progress`), rien en P09B.

## Conséquences

- **Positives** : chaîne audio complète et observable, mixage et sous-titres locaux gratuits, transcription/voix off cadrées par le broker (budget, approbation, vérification), révisions et approbation inchangées, aucune voix clonée.
- **Négatives / coûts** : le rendu vidéo avec audio dépend de FFmpeg et de libass (un binaire sans libass échoue explicitement) ; le mixage réencode l'audio en AAC ; les fournisseurs audio restent `PROVIDER_DEPENDENT` et leurs appels `NOT_VERIFIED` (aucun credential, drapeaux off) ; l'analyse Python exige le service interne et une ressource confirmée ; les horodatages de transcription sont estimés par le modèle, pas mot à mot.
- **Sécurité** : aucune clé fournisseur dans le navigateur ; source audio limitée au propriétaire et à la marque ; droits connus requis ; texte de sous-titre assaini ; aucune URL/chemin client ; coût réservé avant appel et issue incertaine jamais rejouée.

## Alternatives envisagées

- **Modèle ASR local (Whisper ou équivalent)** : rejeté par défaut — modèle lourd, matériel non qualifié, aucun téléchargement automatique ; possible plus tard derrière `PYTHON_TOOLS_MODELS_DIR` avec ADR et contrôle matériel.
- **Nouveau fournisseur TTS dédié (compte et clé séparés)** : rejeté, Vertex est déjà intégré et suffit au contrat ; un autre fournisseur serait une nouvelle décision.
- **Table `AudioTrack`/`Transcript`** : rejetée, la composition versionnée couvre les pistes et repères, et l'asset audio porte déjà la provenance.
- **Sous-titres dessinés dans le navigateur** : rejetés, le rendu doit rester celui du serveur (fidélité).
- **Clonage de voix** : refusé sans consentement, droits vérifiables et autorisation humaine explicite (ADR séparé).

## Références

- `packages/contracts/src/audio.ts`, `packages/contracts/src/creative.ts`
- `packages/media/src/audio.ts`, `packages/media/src/motion.ts`, `packages/media/src/index.ts`
- `apps/api/src/application/creative.ts`, `apps/api/src/routes/{creative,audio}.ts`
- `apps/api/src/infrastructure/audio/{providers,vertex,service}.ts`, `apps/api/src/infrastructure/execution/{registry,runtime}.ts`
- `services/python-tools/app/{audio,contracts,registry,main}.py`
- [Carte P01–P11](../implementation/VULULU_COMPLETION_PLAN.md), [inventaire courant](../implementation/VULULU_FEATURE_INVENTORY.md)
