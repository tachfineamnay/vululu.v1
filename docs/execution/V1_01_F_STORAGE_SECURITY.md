# V1-01-F — SECURITE DU STOCKAGE ET DES MEDIAS

- **Date** : 2026-10-25
- **Commit code F** : c4b5ab2

## 1. Controle d acces

- ArtifactAccessPort verifie le proprietaire du projet.
- Aucun chemin de stockage brut n est accepte d un utilisateur.
- Les cles sont generees depuis projectId/sceneId/version/SHA-256.
- Les routes servent un flux via l adaptateur ; aucun bucket ou credential n est expose.
- Isolation inter-utilisateurs testee avec deux comptes.

## 2. Range et streaming

- Lecture complete en flux, sans charger la video en memoire.
- Range valide : HTTP 206, Content-Range correct, Content-Length partiel.
- Range invalide : HTTP 416 avec Content-Range bytes */taille.
- Preuve E : S3 image HTTP 200, master Range HTTP 206 10 octets, range hors limite HTTP 416.
- Les lectures passent par les memes permissions que les metadonnees.

## 3. Configuration S3

- Endpoint, region, bucket, credentials locaux, path-style, timeout, maxAttempts.
- S3_REQUIRE_TLS=1 refuse un endpoint http.
- ARTIFACT_STORAGE_BACKEND invalide echoue explicitement.
- S3Bucket absent fait echouer la construction.
- Erreurs structurees ArtifactStorageError.
- URL presignee 1..3600 s, emise uniquement apres autorisation applicative future ; actuellement l API sert le flux.

## 4. Uploads et ressources

- Pas de fonction d upload utilisateur dans le perimetre E/F.
- Le renderer ne fait aucune requete vers une URL utilisateur.
- Les fichiers temporaires sont dans le workspace du worker ; les outputs durables passent par ArtifactObject.
- Types MIME et tailles verifies sur les artefacts produits.
- Protection traversal dans l adaptateur local.

## 5. Inventaire

ArtifactInventoryService read-only :

- ready, missing, orphan, checksum mismatch, legacy present/missing, duplicate SHA.
- cleanupCandidates avec grace, aucune suppression.
- Aucune suppression des 274 fichiers historiques A.1.

## 6. Limites

- TLS/IAM/SSE/policies de production NON-RUN.
- Pas d antivirus ni de validation approfondie de media.
- Pas de quota de taille par projet.
- Le serveur S3 de validation E est experimental.
- Les URLs presignees ne sont pas encore exposees par une route controlee.
