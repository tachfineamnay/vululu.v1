# P11-C — Observabilité des opérations et monitoring des jobs (rapport de lot)

- **Date** : 2026-11-21
- **Branche** : campaign/vululu-completion (base faafe86, P11-B)
- **Commit** : feat(p11c): complete jobs and operations monitoring [BUILD_UNVERIFIED]
- **Statut de preuve** : **BUILD_UNVERIFIED** — aucune suite, aucun typecheck/build/E2E (contrat §25).
- **ADR** : [ADR-0044](../adr/0044-observabilite-operations-administration.md)

## 1. Périmètre livré

1. **États réels des jobs** : runs par état (existant, via /api/ops/snapshot et /api/admin/runs), étapes et outbox (existant), et nouvelle vue **opérations outillées** : compteurs par état (PROPOSED, QUEUED, CLAIMED, POLLING, SUCCEEDED, FAILED, CANCELLED, UNKNOWN) et par état de coût, 50 dernières opérations.
2. **Santé workers** : heartbeats existants (OpsMetricsService.snapshot), âge et stale (30 s), affichés dans Jobs ; /api/ops/health inchangé.
3. **Service Python** : GET /api/admin/ops/python — configured, reachable, ready, version, dépendances, modèles et **capacités déclarées** (/readyz, /v1/capabilities), timeout 5 s, aucun jeton renvoyé.
4. **Détails et corrélation** : GET /api/admin/ops/execution/:id — outil, état, coût constaté/plafond, corrélation, projet, propriétaire, paramètres, résultat, et **20 événements d'audit** liés par traceId. Runs : identifiants, trace, workflow, dates, durées.
5. **Raisons d'échec sans secret** : erreurs de run/étape/outbox déjà exposées ; résultat d'opération (code/message d'erreur borné) ; aucun jeton ou credential.
6. **Durées et métriques** : ageMs, sinceUpdateMs, stalled (seuil 300 s) et durationMs (états terminaux) calculés côté serveur ; affichage « Duree » et « Bloque » dans la table des runs.
7. **Éligibilité réelle** : cancelEligible (PROPOSED/QUEUED) et resolveEligible (UNKNOWN) exposés par le serveur ; aucune relance automatique d'opération payante.
8. **Actions sûres** : annulation d'une opération non envoyée (POST /api/admin/ops/execution/:id/cancel, broker + acteur audité execution.admin_cancelled) ; résolution d'incident via la route existante POST /api/admin/execution/:id/resolve (coût constaté + preuve UUID) ; réconciliation runtime existante conservée.
9. **Issues incertaines** : les opérations UNKNOWN sont isolées, expliquées et résolues manuellement avec preuve ; les runs non terminaux sans mise à jour depuis 300 s sont signalés « Bloque », jamais déclarés en échec.
10. **Audit relié** : filtre traceId sur GET /api/admin/audit, pré-remplissage de la page Audit depuis ?traceId=, lien « Audit » depuis chaque opération, audit affiché dans le détail de l'opération.

## 2. Fichiers principaux

- API : apps/api/src/routes/ops.ts (exécution, détail, annulation, Python), apps/api/src/infrastructure/prisma/adminQuery.ts (durées/blockages, filtre audit), packages/contracts/src/admin.ts, packages/application/src/ports.ts.
- Web : apps/web/app/admin/jobs/page.tsx, apps/web/app/admin/audit/page.tsx, apps/web/lib/admin.ts.
- Docs : ADR-0044 + index, inventaire, carte des lots, ce rapport.

## 3. Vérifications (statuts honnêtes)

| Contrôle | Résultat | Détail |
|---|---|---|
| git diff --check | **OK (exit 0)** | Aucun espace fautif. |
| Parse syntaxique TypeScript (7 fichiers) | **OK (0 erreur)** | transpileModule — syntaxe seule, pas un typecheck. |
| pnpm exec prisma validate | **OK (exit 0)** | Aucune migration en P11-C. |
| scripts/check-migrations.ps1 | **OK (exit 0)** | 39 migrations, contrôle structurel. |
| scripts/check-secrets.ps1 | **ÉCHEC (exit 1), faux positif préexistant** | Placeholder PYTHON_TOOLS_TOKEN=CHANGE_ME… dans services/python-tools/.env.example (P06). |

## 4. NOT_RUN et limites

- **NOT_RUN** : Vitest, typecheck, lint, build, Playwright, appel réel au service Python (non démarré ici), annulation/résolution réelles d'une opération, réconciliation appliquée.
- Limites : la vue Python n'est pas un monitoring continu (vérification à la demande) ; l'annulation n'est possible qu'avant envoi ; la résolution d'incident exige une preuve UUID et un coût constaté ; aucune relance d'opération terminée depuis l'admin ; la durée d'une opération outillée n'est pas stockée (seul l'âge depuis la création est exposé) ; les workers restent visibles uniquement par heartbeat.

## 5. Rollback

git revert <sha-p11c> : aucune migration ni schéma modifié ; les routes ajoutées et les panneaux disparaissent ; les états et l'audit existants restent inchangés.
