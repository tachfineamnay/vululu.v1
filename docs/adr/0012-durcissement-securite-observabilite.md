# ADR-0012 — Durcissement de securite, observabilite et exploitation

- **Statut** : Acceptee sous condition
- **Date** : 2026-10-25
- **Sources** : ADR-0004, ADR-0010, ADR-0011, V1-01-F

## Contexte

Les lots A.1 a E ont livre les fondations metier, durables et de stockage. Il restait a consolider les sessions, les controles d acces, le rate limiting, les traces, la supervision des workers, la reconciliation et la qualite lint avant une certification finale.

## Decision

1. Revocation globale et purge de sessions explicites, avec audit et dry-run de purge.
2. Rate limiting persistant dans PostgreSQL, avec politiques par operation, dimensions identite/IP/projet et comportement de panne configure.
3. Validation d origine sur mutations, SameSite/Secure configurables, conservation du CSRF existant.
4. TraceId et requestId propages de Fastify jusqu au worker, avec logs JSON rediges et metriques ops.
5. WorkerHeartbeat et healthcheck operations ; RuntimeReconciliationService read-only par defaut, sans relance de production.
6. Acces media via ArtifactAccessPort uniquement, avec Range 416 et absence d exposition bucket/credentials.
7. Regle lint no-explicit-any maintenue sur le code source ; tests/e2e ont une exemption documentee pour payloads JSON ; LINT_STRICT=1 passe.
8. Aucune dependance OpenTelemetry/SaaS imposee ; instrumentation portable via logs, IDs et metriques.

## Consequences

Positives : sessions revocables globalement, rate limits multi-instances via PostgreSQL, traces continues, sante worker observable, reconciliation diagnosticable, lint zero warning.

Negatives : CI distante non executee, redemarrage moteur non teste, TLS/IAM/SSE production non valides, purge planifiee non activee, pas de MFA, charge multi-instance non testee.

## Alternatives

- Rate limiter memoire uniquement : rejete pour multi-instances.
- OpenTelemetry SaaS : rejete, non impose.
- Relance automatique des runs bloques : rejetee, risque de double production.
- Suppression des fichiers orphelins : rejetee sans decision explicite.

## References

- docs/execution/V1_01_F_SECURITY_HARDENING.md
- docs/execution/V1_01_F_AUTH_SESSIONS_RBAC.md
- docs/execution/V1_01_F_OBSERVABILITY_TRACING.md
- docs/execution/V1_01_F_WORKER_SUPERVISION_RECOVERY.md
- docs/execution/V1_01_F_FINAL_AUDIT.md
