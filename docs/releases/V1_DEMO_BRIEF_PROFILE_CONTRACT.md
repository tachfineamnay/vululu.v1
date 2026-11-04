# V1-DEMO — Profils et confirmation du brief

- Date : 2026-11-04 ; lot 6, avec qualification média au lot 7 ; ADR 0019.
- Exigences : PRD-03/05/06/07/13, CDC-F-020/024/030/031/032/033/061, CDC-N-001/005/009.

Les paramètres canoniques portent schemaVersion=1 et profileVersion=v1-demo-2026-11-04. Ratios internes : TikTok 9:16 (Video/Reel/Motion), Instagram 9:16/4:5/1:1 (Affiche/Carrousel/Video/Reel), LinkedIn 1:1/16:9 (Affiche/Carrousel/Video). Les contrôles constituent une politique interne, sans prétendre représenter toutes les possibilités actuelles des plateformes.

Champs : ratio, defaultSceneDurationSeconds (1–15), visualStyle (editorial/minimal/bold), direction (1000 caractères), maxMockCents (entier 0–100000), audio.voiceVersionId/musicVersionId (versions exactes de bibliothèque ou null), spokenText (description déclarée de l’enregistrement, 2000 caractères), voiceGainDb (-24 à +6), musicGainDb (-36 à 0), ducking (booléen). Valeurs par défaut : 2 s, editorial, sans audio, gains -3/-18 dB, ducking actif, plafond 1000 centimes MOCK. Les formats statiques ne portent pas d’audio. Le texte déclaré ne déclenche aucune TTS.

Décision utilisateur du 2026-11-04 : échantillons de voix sous licence libre. Leur choix, leur licence, la provenance et les attributions doivent être vérifiés avant intégration au lot média ; aucun fichier encore absent n’est présenté comme livré.

Le choix d’usage organic/sponsored reste porté par le projet et revalidé avec les droits. Le brief et sa révision figent les paramètres ; les vieux checksums sans paramètres restent inchangés. Le lancement requiert une confirmation exacte de version+checksum, révoquée par toute nouvelle révision. Le plan et l’estimation sont exposés avant la confirmation ; les montants MOCK ne sont jamais facturés.

Le storyboard conserve des Scene ID stables ; affiche : un visuel, autres formats : cinq scènes/planches pour la démo. La durée indiquée est celle par défaut des scènes : les éditions de scènes restent explicites et le plan recalcule les durées réelles. Les fichiers, gains et ratios seront mesurés au lot média ; aucune option non qualifiée ne devient disponible par ce seul contrat.

Recette : configurations permises/interdites, contrôles dans les cas d’usage et transactions, isolation, droits audio, brouillon/confirmation/version obsolète, mutation d’agent après lancement, budget refusé sans run factice, snapshots et anciennes empreintes conservés, conversation déterministe identifiable comme simulation, navigateur et médias réels.

Complément d’implémentation ADR 0020 : le manifeste conserve aussi sourceInputChecksum, empreinte des entrées communes (contexte, brief exact, sélection d’actifs, profil de rendu, personnages). Une correction refuse un changement global ou une provenance absente. Les horodatages, instructions de correction et versions locales des scènes sont exclus de cette empreinte pour permettre les corrections successives. Le snapshot complet et son propre checksum restent conservés séparément.

État intermédiaire du lot 6A : seuls les rendus Video sans fichier audio sont qualifiés à ce stade. Les autres formats et les références audio peuvent être validés/enregistrés dans un brouillon, mais leur lancement est refusé explicitement jusqu’au lot média. L’estimation avant confirmation, les agents figés et la conversation structurée restent à livrer ; les paragraphes ci-dessus définissent la cible et ne valent pas preuve de livraison.
