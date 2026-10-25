# V1-01-E — SECURITE, ACCES ET CYCLE DE VIE

- **Date** : 2026-10-25
- **Commit code E** : 4595d03

## 1. Acces aux artefacts

- Toute lecture passe par ArtifactAccessPort.
- L adaptateur verifie le proprietaire du projet avant de retourner une version.
- Les routes API verifient la session, le proprietaire et servent un flux storage ; aucune URL de bucket n est exposee.
- Les ranges HTTP sont supportes pour le MP4 (test S3 : 206, Content-Range correct).
- Une URL S3 temporaire peut etre emise par l adaptateur avec duree 1..3600 s, mais l API E sert le flux cote serveur. Aucune liste publique de bucket n est activee.
- Les tests de securite V1-00 (23 tests) passent toujours ; l IDOR et le RBAC existants sont conserves.

## 2. Chemins et SSRF

- Les cles sont generees par le serveur a partir de projectId/sceneId/version/sha256.
- Les cles absolues, les .. et les separateurs Windows sont refuses par l adaptateur local.
- Aucun chemin fourni par l utilisateur n est transforme en requete reseau.
- Le publisher ne telecharge jamais une URL ; il lit un fichier local produit par le renderer.

## 3. Validation

- MIME explicite image/png ou video/mp4.
- Taille et SHA-256 verifies avant finalisation.
- Un checksum different pour une cle deja existante est refuse.
- Aucun upload arbitraire via API n est ouvert dans E.

## 4. Inventaire et cycle de vie

ArtifactInventoryService produit un rapport read-only :

- ready : objet reference et checksum coherent ;
- missing_object : reference DB sans objet ;
- orphan_object : objet storage sans reference DB ;
- checksum_mismatch ;
- legacy_present / legacy_missing ;
- duplicate_sha.

Le rapport contient cleanupCandidates avec une grace de 24 h, mais aucune suppression n est executee. Le mode est audit/dry-run par defaut.

Campagne S3 : 18 objets ready, 287 references legacy presentes, 0 manquant, 0 orphelin, 0 mismatch observes au moment du rapport. Les 32 objets (14 local, 18 S3) etaient ready apres les runs E. Ces chiffres sont historiques, pas un ordre de suppression.

## 5. Donnees historiques

- Aucune suppression des anciens artefacts.
- Aucune reecriture de checksum.
- Le rapport A.1 (207 chemins DB, 481 fichiers, 274 orphelins/intermediaires) reste une reference ; E ne supprime aucun de ces fichiers.
- Toute suppression future exigera une decision explicite et un dry-run.

## 6. Limites

- TLS S3, chiffrement SSE, policies IAM et bucket de production non valides.
- Pas de scan antivirus ni de validation de contenu media.
- Pas de quota de taille par projet.
- Le serveur S3-compatible de validation est local et experimental.
