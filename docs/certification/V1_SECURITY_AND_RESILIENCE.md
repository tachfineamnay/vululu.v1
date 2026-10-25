# V1 — SECURITE ET RESILIENCE

- **Date** : 2026-10-25
- **Commit code G** : 0e79c08

## 1. Authentification et sessions

- Sessions serveur persistantes, token brut jamais stocke.
- Expiration 24 h, revocation individuelle, logout, logout global, revocation admin.
- Purge des sessions expirees/revoguees, dry-run par defaut, route admin et script.
- Rotation au login, cookies HttpOnly, CSRF cookie/header, SameSite et Secure configurables.
- Allowlist d origine sur les mutations ; test API 403 sur origine inconnue.
- Invitations hachees, RBAC serveur.

## 2. Autorisations

- Owner filtering sur projects, contexts, briefs, scenes, bundles, JobRun evidence.
- Artifacts via ArtifactAccessPort et proprietaire.
- Approvals et transferts exacts.
- Providers, agents, routing, invitations, sessions, ops : super_admin.
- Routes de diagnostic detaille (/api/ops/health, /api/ops/metrics, /api/ops/snapshot, /api/ops/reconcile) reservees a super_admin.
- Aucune URL bucket ou credential exposee par l API.
- Rate limits PostgreSQL par identite/IP/projet/operation.

## 3. Surface operationnelle

| Endpoint | Controle |
|---|---|
| /api/health | public minimal, aucune donnee sensible |
| /api/ops/health | super_admin |
| /api/ops/metrics | super_admin |
| /api/ops/snapshot | super_admin |
| /api/ops/reconcile | super_admin, dry-run par defaut |
| /api/admin/* | super_admin |
| /api/admin/routing/* | super_admin + rate limit |
| /api/projects/:id/master | owner, Range/416 |
| /api/projects/:id/runs/:id/evidence | owner projet + coherence projectId |

## 4. Resilience

### Fenetres de panne

| Fenetre | Etat actuel |
|---|---|
| Apres commit DB avant dispatch | outbox pending, dispatcher reprend |
| Apres dispatch avant confirmation | outbox dispatching, reconciliation ; au moins une fois |
| Apres generation avant DB | fichiers temporaires/orphelins, aucune version metier |
| Apres finalisation avant ack | RunArtifact unique, rejeu retourne la version |
| Pendant signal approval | outbox approval idempotente + pre-check approval |
| Pendant outbox indisponible | retry backoff, max 10, audit |
| Worker absent | heartbeat stale, health degraded, reconciliation diagnostic |
| Storage indisponible | erreur storage, pas de version ready |
| DB indisponible | erreur, limites login fail-closed, health degraded sans crash ops |

### Points importants

- La detection de worker n est pas un redemarrage automatique.
- La reconciliation est read-only par defaut ; seules les actions admin explicites modifient outbox/approvals/rate counters.
- Aucune seconde production n est lancee pour reparer un run.
- Le dispatch Hatchet est au moins une fois : une panne entre l acceptation Hatchet et l update outbox peut rejouer un workflow. Les effets metier sont proteges par idempotence cote DB (RunArtifact unique, CostEvent unique, approval unique, artefacts a cle SHA) mais un doublon de workflow reste possible. Dette P1.
- Backup/restore : PostgreSQL metadonnees valide par dump/restore jetable et empreinte checksum identique. Restauration des binaires S3 non executee.
- Aucun secret dans les logs : redaction logger + scan secrets.

## 5. Limites operationnelles

- Pas de MFA.
- Pas de supervision systemd/service automatique.
- Pas de TLS/IAM/SSE/policies S3 production.
- Pas de rotation de secrets outillee.
- Pas de tests de charge multi-instance.
- Pas de plan de restauration binaire S3.
- Runtime local Windows/WSL non cible production.
