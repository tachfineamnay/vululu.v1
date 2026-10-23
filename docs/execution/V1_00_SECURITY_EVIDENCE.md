# V1-00 SECURITY EVIDENCE — SESSIONS, CSRF, RBAC

- **Date** : 2026-10-23
- **Branche** : v1-00-foundation
- **Base V1** : vululu_v1_00 (copie V0), test vululu_v1_00_test
- **Code** : a7f4b8d + corrections locales V1-00
- **Périmètre** : sessions serveur, CSRF, invitations, RBAC, isolation, audit, secrets

## 1. Modèle de session

| Propriété | Valeur |
|---|---|
| Token | 32 octets aléatoires base64url |
| Stockage | SHA-256(token) uniquement dans Session.tokenHash |
| CSRF | token aléatoire clair dans cookie + SHA-256 dans Session.csrfHash |
| Durée | 24 h (expiresAt explicite) |
| Révocation | revokedAt au logout ; rejet immédiat |
| Usage | rechargement de la session depuis PostgreSQL à chaque requête |
| Cookie session | HttpOnly, SameSite=Lax, Secure si APP_ENV=production |
| Cookie CSRF | vululu_csrf, lisible par le client, SameSite=Lax |
| Rotation | login avec ancien cookie révoque l'ancienne session |
| Purge | non implémentée en V1-00 (sessions expirées conservées) |

Aucun token brut n'est stocké en base. Aucun secret de session n'est requis pour vérifier un token : le hash est recherché en base.

## 2. CSRF

- Toutes les méthodes POST/PATCH/PUT/DELETE exigent x-csrf-token, sauf /api/auth/login et /api/auth/activate.
- Validation : header présent, header == cookie vululu_csrf, SHA256(header) == Session.csrfHash.
- Échec : HTTP 403 code csrf_invalid.
- Web : apps/web/lib/api.ts lit le cookie et ajoute le header sur toute mutation.
- Login/activation sont publics ; le logout exige le CSRF et la session.

## 3. Preuves automatisées

Commande :

    pnpm exec vitest run tests/v1/auth-security.test.ts

Résultat réel : **23 tests PASS**.

Couverture :

- login + csrfToken ;
- session valide et rechargement utilisateur ;
- logout révoque la session et vide les cookies ;
- ancien cookie rejoué après logout -> 401 ;
- cookie expiré -> 401 ;
- cookie falsifié -> 401 ;
- autres sessions du même utilisateur préservées ;
- rotation de session au login ;
- accès protégé sans session -> 401 ;
- CSRF absent/mismatch/hash d'une autre session -> 403 ;
- cookie Secure uniquement si APP_ENV=production ;
- invitation créée hashée, TTL 72 h, token visible une seule fois ;
- activation one-shot, rejeu/expiration/révocation refusés ;
- RBAC super_admin : 403 pour user ;
- audit sans secret ;
- IDOR sur contexte, projet, brief, scène, image, master, QA, status, produce, messages, storyboard, approbation, transfert -> 404 ;
- admin interdit à user -> 403.

## 4. Preuves manuelles sur l'instance V1

Services : API 3101, Web 3100, PostgreSQL 55432.

| Contrôle | Résultat |
|---|---|
| Login demo | 200, rôle super_admin, csrfToken 43 caractères |
| Cookie session | HttpOnly=True, SameSite=Lax |
| Cookie CSRF | lisible, double-submit identique au csrfToken |
| GET /api/auth/me sans session | 401 |
| POST mutation sans CSRF | 403 csrf_invalid |
| Logout avec CSRF | 200 |
| Replay ancien cookie après logout | 401 |
| Invitation super_admin | 201, token affiché une fois, hash en base |
| Activation invitation | 201, rôle user |
| Rejeu activation | 400 invitation_used |
| Login utilisateur invité | 200, rôle user |
| Admin invitations avec user | 403 |
| Admin invitations sans session | 401 |
| AuditEvent | login, logout, activation, refus RBAC sans secret |

Commande :

    pwsh -NoProfile -File scripts/v1-acceptance.ps1

Résultat : **ACCEPTANCE_PASS 19/19**, E2E NOT_RUN sans option.

## 5. RBAC et isolation

- super_admin : invitations, liste et révocation, bootstrap.
- user : ses contextes et projets uniquement.
- Les routes métier filtrent par propriétaire via les services/repositories ; les lectures et écritures inter-utilisateurs renvoient 404.
- L'interface ne protège pas les données : le contrôle est serveur.
- Les refus RBAC 403 sont audités ; les 404 IDOR restent souvent silencieux (pas de journalisation systématique en V1-00).

## 6. Audit et secrets

- AuditEvent : id, actorId, action, targetType, targetId, metadata JSON, createdAt.
- Actions journalisées : auth.login, auth.login_failed, auth.logout, auth.activate, auth.activation_rejected, invitation.created, invitation.revoked, rbac.denied.
- Aucun mot de passe, token de session, token CSRF ou token d'invitation n'est écrit en metadata.
- Bootstrap super_admin : seed via V1_BOOTSTRAP_EMAIL/V1_BOOTSTRAP_PASSWORD, jamais de mot de passe par défaut dans le code de seed.
- SESSION_SECRET obligatoire, aucune valeur par défaut.
- Scan de secrets : 157 fichiers, 0 secret.
- .env, data, .v0, .v1, node_modules et artefacts ne sont pas versionnés.

## 7. Risques résiduels

| ID | Risque | Statut V1-00 |
|---|---|---|
| S-01 | Pas de rate limiting sur login | Ouvert, V1-01 |
| S-02 | Pas de purge périodique des sessions expirées | Ouvert, V1-01 |
| S-03 | Pas de protection CSRF sur GET (aucun effet de bord attendu) | Accepté |
| S-04 | Secure cookie désactivé en local HTTP | Accepté local ; HTTPS requis en préproduction |
| S-05 | Pas de révocation globale de toutes les sessions d'un utilisateur | Ouvert, V1-01 |
| S-06 | IDOR 404 non journalisés | Ouvert, V1-01 |
| S-07 | Pas de MFA, SSO, rotation de mot de passe avancée | Hors périmètre V1-00 |
| S-08 | Pas de test E2E GitHub réel | NOT_RUN |

## 8. Conclusion

Les sessions stateless non révocables de la V0 sont remplacées par des sessions serveur révocables. Le CSRF, les invitations one-shot, le RBAC super_admin/user et l'audit sont implémentés et prouvés par 23 tests dédiés. Les risques restants sont documentés et n'autorisent pas un déploiement public en l'état.
