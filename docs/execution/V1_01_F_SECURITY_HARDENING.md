# V1-01-F — SECURITY HARDENING

- **Date** : 2026-10-25
- **Branche** : v1-01-f-hardening-observability
- **Base E** : d2446ca
- **Commit code F** : c4b5ab2
- **Verdict** : GO CONDITIONNEL
- **Portee** : consolidation locale, pas de production

## 1. Matrice des controles

| Controle | Implementation | Statut |
|---|---|---|
| Sessions revocables individuellement | Session.tokenHash + revokeSessionByToken | PASS |
| Revocation globale | revokeAllUserSessions + route logout-all + admin | PASS |
| Purge retention | purgeSessions, dry-run par defaut, routes admin | PASS |
| Rotation login | revocation session existante au login | PASS |
| Token brut jamais stocke | SHA-256 uniquement | PASS |
| CSRF mutations | cookie + header lies au hash de session | PASS |
| SameSite/Secure configurables | SESSION_SAMESITE, SESSION_COOKIE_SECURE, production | PASS |
| Origin allowlist | Origin valide sur mutations, defaut local | PASS |
| Rate limiting persistant | PostgreSQL RateLimitCounter | PASS |
| Rate limit login/activation fail-closed | policy failClosed | PASS |
| RBAC serveur | requireSuperAdmin et routes admin | PASS |
| IDOR projets/artefacts | filtrage proprietaire | PASS existant + tests |
| Secret logging | logger JSON + redaction | PASS |
| HTTPS/proxy | TRUST_PROXY, Secure production | Configure, TLS production NOT_RUN |
| Storage traversal | cle opaque + assertInsideRoot | PASS |
| Range invalide | HTTP 416 + Content-Range | PASS |
| Isolation media inter-users | ArtifactAccessPort + owner | PASS |

## 2. Couche

Les controles HTTP vivent dans apps/api. Les invariants metier restent dans Domain et Application. Aucun import Fastify, Prisma, S3, Hatchet ou OpenTelemetry n a ete ajoute au Domain.

## 3. Sessions

- Duree 24 h.
- Token aleatoire 32 octets, hash SHA-256 unique.
- Revocation globale par utilisateur et par admin.
- Purge des sessions expirees/revoguees apres retention configurable.
- Audit des revocations.
- Aucune suppression massive automatique : purge dry-run par defaut, operation admin explicite.

## 4. CSRF et origine

- Cookie CSRF non HttpOnly, header x-csrf-token obligatoire sur mutation.
- Cookie session HttpOnly.
- SameSite configurable, Secure impose en production.
- Origin presente doit appartenir a APP_ORIGIN/WEB_ORIGIN, ou au fallback local 127.0.0.1:3100/localhost:3100 hors production.
- Test API reel : POST /api/projects/:id/produce avec Origin https://evil.example -> HTTP 403 origin_invalid.

## 5. Rate limits

RateLimitCounter PostgreSQL, cle + fenetre + expiration. Politiques :

- login 100/min fail-closed ;
- activation 50/5 min fail-closed ;
- storyboard 20/min ;
- production start/correction 10/min ;
- approbation/transfert 20/min ;
- routing 60/min.

La limite est distincte de la concurrence metier (un seul JobRun actif par projet) et du budget.

## 6. IDOR

Les routes projets, scenes, artefacts, approvals et transferts passent par les use cases avec filtrage owner. Les tests de securite V1-00 (23) restent verts. Les acces storage sont testes avec deux utilisateurs dans le lot E.

## 7. Limites

- TLS/IAM/SSE/policies de production : NOT_RUN.
- Rate limiting multi-instance via PostgreSQL : oui, mais pas de test de charge distribue.
- Une panne PostgreSQL rend les limites fail-closed pour login/activation ; comportement documente.
- Le fallback local d origine ne doit pas etre utilise en production ; APP_ORIGIN est obligatoire en production.
