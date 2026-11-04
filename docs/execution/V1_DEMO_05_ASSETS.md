# V1-DEMO — Bibliothèque d’actifs

- Date : 2026-11-04 ; branche : codex/v1-demo-coolify ; lot 5 du plan démo.
- Exigences : PRD-02/15, CDC-F-010/012/013, CDC-N-001/003/006/009.
- Contrat : [bibliothèque](../releases/V1_DEMO_ASSETS_CONTRACT.md) ; décision : [ADR 0018](../adr/0018-bibliotheque-actifs-versionnes.md).

## Livré

Bibliothèque persistante par propriétaire/contexte, upload réel borné à 32 Mio, versions immuables avec SHA-256 et provenance déclarée. PostgreSQL garde les métadonnées ; ArtifactStoragePort garde les octets. Réservation staged, vérification du stockage puis ready ou failed. Un fichier en échec ne devient jamais utilisable.

Les images PNG/JPEG/WebP sont décodées avec limite 16 mégapixels. FFprobe inspecte WAV/MP3 et MP4/H.264 avec limites de temps/durée/flux. Les documents PDF/TXT et polices TTF/OTF sont des pièces jointes avec contrôles d’enveloppe ; aucune analyse sémantique ni garantie antivirus n’est revendiquée. Aucune URL de provenance n’est téléchargée.

Lecture authentifiée, contrôle actif/version, Range 206/416, nosniff et cache privé désactivé. Session/CSRF et débit sont contrôlés avant lecture du binaire ; deux uploads simultanés par instance API bornent la mémoire. Le proxy Next transmet un flux au lieu de charger le fichier entier avant l’authentification API.

Une sélection référence une version exacte, du même propriétaire et contexte. Les droits unknown sont refusés ; sponsored exige commercial. Contrôles dans les cas d’usage et le repository, sans bypass super-admin. Verrou du projet partagé avec le lancement d’un run. Le snapshot conserve IDs, versions, checksums, droits, provenance et usage ; ajouter un fichier ou sélectionner une autre version ne réécrit aucun snapshot existant. Les nouveaux champs sont additifs ; les anciens snapshots restent intacts.

L’écran /assets remplace le contrat non connecté : import, nouvelles versions, aperçu image/audio/vidéo, téléchargement, droits/provenance, sélection de projet. Les libellés et la largeur mobile sont vérifiés. La composition des actifs dans les sorties est encore à qualifier au lot média ; l’écran le précise.

## Preuves d’exécution

- Domaine : 15 échecs observés avec le contrat sans comportement, puis 15 PASS.
- Inspection initiale : deux cas positifs échouaient avec le stub ; tous les cas d’inspection réels passent après implémentation. Les refus avec stub ne sont pas comptés comme preuve de sécurité.
- Intégration initiale : 15 PASS sur PostgreSQL et stockage local réels, dont panne de stockage explicitement MOCK. Complément : 16 PASS avec concurrence et absence de bypass administrateur.
- Migration : 14 migrations appliquées ; mises à jour depuis les 12 et 13 migrations antérieures PASS, projet et snapshot préexistants conservés. Les bases et fichiers de preuve sont gardés dans le cluster isolé, sans effacement.
- E2E développement : premier échec sur recherche exacte du label natif du sélecteur ; aria-label explicite ajouté. Rejeu PASS, 13,6 s, aperçu réel, seconde version, sélection de l’ancienne version et mobile.
- Build API/Web PASS ; E2E sur next start : actifs, campagnes et verticale vidéo/correction/approbation/transfert Postiz MOCK, 3 PASS en 1,2 minute.
- Capture .v1/assets.png inspectée ; uniquement données fictives.
- Typecheck complet PASS ; lint strict PASS au contrôle intermédiaire.
- Frontières PASS (22 fichiers domaine, 20 application), migrations minimum 14 PASS, 9 empreintes fondatrices intactes, contrôle des fichiers suivis PASS.

- Régression complète sur sources stabilisées : `pnpm exec vitest run tests --reporter=dot`, 31 fichiers PASS, **271 PASS / 2 SKIP**, 234,06 s. Les deux SKIP nécessitent un service S3 configuré. Un premier passage effectué pendant l’ajout du contrôle FFprobe manquant échouait sur ce nouveau cas ; rejeu ciblé puis campagne complète stabilisée PASS. Ce premier passage n’est pas compté vert.
- Mode démo sur build production : formulaire vide, clavier et mobile, PASS en 11 s. Le premier lancement du test omettait DEMO_MODE côté runner et attendait à tort l’absence de bannière ; rejeu avec la configuration du serveur PASS, sans modification applicative.
- Scan de contenu final : 431 fichiers, PASS. Aucun secret ni trace réseau de session ajouté au dépôt.

- Garde-fous unitaires applicatifs supplémentaires : 2 PASS, sans infrastructure, propriétaire super-admin et refus sponsorisé avant écriture. Ils ont été ajoutés après la campagne complète ci-dessus.
- Lint strict final PASS, après conservation de la cause interne des erreurs d’inspection ; aucun diagnostic brut n’est envoyé au client par les cas d’usage. Rejeu ciblé inspection + cas d’usage : 17 PASS, avec typecheck média PASS.
- Build API/Web final PASS ; fichier next-env généré restauré, aucune dépendance ajoutée.
- Reprise après interruption de session : cluster local arrêté, premier rejeu impossible ; redémarrage du même cluster isolé puis migration depuis les 12 et 13 versions antérieures : 2 PASS, 52,48 s. Le SQL final a uniquement reçu une normalisation de fin de fichier avant son premier commit.

Les fichiers locaux de preuve ne sont pas livrés comme des sources. Les chemins d’outils FFmpeg/FFprobe sont désormais fixés dans l’image API/worker ; leur exécution Linux reste à vérifier sur le serveur cible.

## Limites et suite

- Docker Linux/Coolify/S3 : NOT_RUN pour cette tranche. L’utilisateur déploie sur son serveur ; aucun déploiement distant ni modification d’une autre application n’a été effectué.
- Stockage réel local utilisé pour ces preuves ; le port S3 existant est réutilisé mais ses tests sans service S3 configuré restent SKIP. Aucun succès S3 déduit du stockage local.
- URLs présignées S3, expiration et permissions du bucket restent à qualifier au lot 3. Les URLs de contenu livrées ici exigent une session et ne révèlent pas les clés internes.
- Staged après crash et objets orphelins restent à inventorier au lot exploitation ; aucune purge automatique.
- Formats de sortie, compositing des actifs, audio, interactions démo enrichies, MCP et exploitation restent ouverts dans le plan complet.
- L’observation historique de logs Zod/domaine classés 500 avant réponse 400 reste à corriger au lot observabilité.
- Aucun fournisseur IA, Postiz réel ou compte payant appelé. Coût fournisseur réel : zéro ; aucune sortie générative revendiquée.

## Rollback

Redéployer le code précédent en conservant cette migration additive et les binaires. Les anciennes versions ignorent les tables ajoutées et la colonne usage. Ne supprimer ni tables, ni colonnes, ni objets, ni historique Prisma. Vérifier login, projets et lecture des masters conservés après rollback.
