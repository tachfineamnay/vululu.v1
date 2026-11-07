# MVP 02 — Gestion des clés IA

Date : 2026-11-05. Références : ADR 0027 ; PRD-01/07/11/13 ; CDC-F-031/060 ; CDC-N-001/002/003/005/007. Contrat : `docs/releases/MVP_PROVIDER_CREDENTIALS_CONTRACT.md`.

Le super-admin peut enregistrer, remplacer ou supprimer une clé par fournisseur. Le serveur conserve une enveloppe AES-256-GCM liée au fournisseur ; la clé maîtresse reste dans l'environnement API. Les réponses indiquent seulement la présence et la date. Sans clé maîtresse, la démo fonctionne et les écritures de credentials sont refusées. Aucun appel IA n'est déclenché. MCP est reporté après le MVP.

Le parcours Product Design réutilise la page Fournisseurs : champ masqué, confirmations de remplacement/suppression, saisie effacée après succès, état « connexion non testée ». Le bootstrap admin conserve un admin existant et refuse de promouvoir un compte ordinaire.

| Vérification | Preuve |
|---|---|
| Contrats API avant implémentation | 5 FAIL / 1 PASS |
| Credentials, chiffrement, auth et lecture admin | 46 PASS, 4 fichiers, 46,77 s |
| Sécurité | RBAC, CSRF, refus de clé invalide, absence de secret dans DB/réponse/audit, altération AES et zéro appel fournisseur vérifiés |
| Migration additive 19 | 1 PASS / 6 tests filtrés ; fournisseur existant conservé |
| Bootstrap admin avant correction | 2 FAIL / 1 PASS |
| Bootstrap après correction | 3 PASS, 6,12 s |
| Build API et Web de production | PASS |
| Recette navigateur et restauration Linux | EN COURS ; voir `docs/releases/MVP_COOLIFY_ACCEPTANCE.md` |

Les secrets utilisés par les tests sont synthétiques. Aucune clé réelle n'a été saisie et aucun fournisseur réel n'est qualifié. Les logs de preuve locaux sont ignorés par Git (`.v1/credentials-final.log`, `credentials-migration.log`, `admin-bootstrap-green.log`, `mvp-build.log`).

Rollback : conserver la migration et les enveloppes ; revenir à l'image précédente sans supprimer de table ni de volume. Rétablir le candidat corrigé pour administrer les credentials. Préserver séparément la clé maîtresse ; son remplacement sans migration n'est pas supporté.
