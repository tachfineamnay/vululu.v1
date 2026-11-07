# V1-DEMO — Contrat bibliothèque d’actifs

- Date : 2026-11-04 ; lot 5 ; PRD-02/15, CDC-F-010/012/013, CDC-N-001/003/006/009.
- La bibliothèque persiste de vrais fichiers et des versions immuables ; aucune analyse IA ni ingestion distante implicite.

## Formats et limites

32 Mio maximum par fichier, images statiques 16 mégapixels maximum. Logos/images PNG, JPEG, WebP ; vidéo MP4/H.264 ; audio WAV/MP3 ; documents PDF et texte UTF-8 ; polices SFNT TTF/OTF conservées en pièces jointes. SVG utilisateur, HTML, exécutables, archives et documents Office ne sont pas annoncés disponibles. Les documents/polices ne sont pas interprétés par le serveur et sont téléchargés en pièces jointes avec protection de type et CSP.

Les images sont réellement décodées, les médias audio/vidéo sondés avec FFprobe borné ; les documents/polices ont des contrôles d’enveloppe sans promesse d’analyse de contenu. Toute provenance est déclarée par l’utilisateur, jamais inventée ou extraite d’une URL non consultée. Aucun fetch d’URL de provenance.

## Modèle et cycle

BrandAsset identifie propriétaire, contexte, type et date. BrandAssetVersion fige numéro, nom, MIME, taille, SHA-256, droits (internal/commercial/unknown), provenance et métadonnées techniques. Les versions précédentes restent disponibles. Les clés de stockage sont générées par le serveur ; aucun nom ou chemin utilisateur n’est utilisé comme chemin de fichier.

Une réservation transactionnelle produit une version staged ; l’écriture/lecture de contrôle du binaire précède le passage ready. Un échec devient failed et reste auditable, jamais listé comme une version utilisable. Le stockage peut être local en test ou S3 via le port existant ; aucun blob lourd en DB. Les orphelins éventuels restent à inventorier, sans suppression automatique.

La sélection d’un projet référence une version exacte par actif, appartenant au même propriétaire et au contexte du projet. Droits unknown : sélection refusée. Usage organic : internal ou commercial ; sponsored : commercial uniquement. L’usage est une intention de brief, jamais une campagne Ads. Le remplacement des sélections est atomique et refusé pendant une production ; le lancement capture IDs/versions/SHA/droits/provenance dans son snapshot. L’utilisation visuelle dans les nouveaux formats relève aussi du lot média ; ne pas annoncer un compositing qui n’a pas tourné.

## Transport

- GET /api/contexts/:id/assets : actifs et versions ready du propriétaire.
- POST /api/contexts/:id/assets : corps application/octet-stream borné ; header x-asset-metadata = JSON encodé avec encodeURIComponent, 8192 caractères maximum. Métadonnées : name, kind, mimeType, license, provenance, assetId optionnel pour nouvelle version.
- GET /api/assets/:id : versions ready, sans clé interne de stockage.
- GET /api/assets/:id/versions/:versionId/content : contenu authentifié, Range, Cache-Control private/no-store et nosniff ; correspondance actif/version vérifiée.
- GET /api/projects/:id/assets et PUT /api/projects/:id/assets { usage, versionIds } : sélection explicite, droits et propriétaires revalidés dans le cas d’usage et le repository. usage vaut organic par défaut ou sponsored.

Session/CSRF et limite de débit s’appliquent avant le décodage du corps. Les formats acceptés sont inspectés derrière un port ; Web et futur MCP partagent les cas d’usage. Aucune URL de stockage ou credential n’est imprimé dans les logs.

## Recette

Import réel, seconde version, relecture des deux fichiers, SHA inchangé de l’ancienne version, isolation entre utilisateurs et entre contextes, contrôle MIME/taille/dimensions, refus des noms de chemin et contenus actifs, sélection organique/sponsorisée, absence de fetch de provenance, erreur stockage sans succès fictif et snapshot figé après édition. Test navigateur avec données fictives et aperçu réel. Qualification S3/Linux distincte des preuves locales.
