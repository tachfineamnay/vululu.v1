# V1-01-F — AUTHENTIFICATION, SESSIONS ET RBAC

- **Date** : 2026-10-25
- **Commit code F** : c4b5ab2

## 1. Sessions persistantes

Modele Session :

- id, userId
- tokenHash SHA-256 unique
- csrfHash
- expiresAt, lastUsedAt
- revokedAt, revokedReason

Le token brut et le CSRF brut ne sont jamais stockes. La session est refusee si revoquee ou expiree. lastUsedAt est rafraichi au plus toutes les 5 minutes.

## 2. Operations

- POST /api/auth/logout : revocation de la session courante.
- POST /api/auth/logout-all : revocation de toutes les sessions actives de l utilisateur courant, audit, cookies effaces.
- POST /api/admin/users/:id/sessions/revoke : super_admin, revocation globale d un utilisateur, audit.
- POST /api/admin/sessions/purge : super_admin, retention 1..365 jours, dry-run par defaut, audit.
- Script scripts/purge-sessions.ts : dry-run par defaut, --apply explicite.

## 3. Rotation et concurrence

- Le login revoque toute session deja presentee sur la requete avant d en creer une nouvelle.
- Les sessions concurrentes sont autorisees mais toutes revocables globalement.
- Un ancien token revoque ou expire est refuse.
- Aucun token brut n est expose dans les reponses autres que les cookies de creation initiale.

## 4. RBAC et IDOR

- super_admin : routes admin, agents, providers, sessions, ops.
- user : ressources dont il est proprietaire.
- Les listes/lectures sensibles verifient owner.
- Les refus sont audites sans divulguer l existence d une ressource privee.
- Les tests auth-security 23 couvrent sessions, CSRF, invitations, RBAC, IDOR.

## 5. Preuves

- Test route logout-all : HTTP 200, session revoquee, reason logout_all.
- Test createSession : seul le hash 64 hex est stocke.
- Test purge : dry-run deleted=0, apply supprime la session ancienne, session recente conservee.
- Tests V1-00 auth : 23 PASS.

## 6. Limites

- Pas de MFA.
- Pas de gestion multi-appareils avancee (liste/nom des sessions).
- Pas de politique de mot de passe au-dela du schema existant.
- Purge automatique planifiee non activee par defaut ; operation explicite.
