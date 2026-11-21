# P11-D — Administration des coûts et budgets d'exécution (rapport de lot)

- **Date** : 2026-11-21
- **Branche** : campaign/vululu-completion (base 905efc4, P11-C)
- **Commit** : feat(p11d): complete execution cost administration [BUILD_UNVERIFIED]
- **Statut de preuve** : **BUILD_UNVERIFIED** — aucune suite, aucun typecheck/build/E2E (contrat §25).
- **ADR** : [ADR-0045](../adr/0045-administration-couts-budgets.md)

## 1. Périmètre livré

1. **Budgets réels par compte autorisé** : nouvelle route GET /api/admin/costs/execution — plafond, réservé, consommé, restant, pourcentage d'utilisation, outils autorisés, opérations incertaines du compte.
2. **Réservé / consommé / restant** : restant = plafond − (consommé + réservé), affiché même négatif en cas de dépassement ; cumuls de tous les comptes.
3. **Coûts par opération, outil et fournisseur** : agrégats par outil du registre (opérations, plafond cumulé, confirmé, incertain) et par fournisseur (avec disponibilité), dérivés des ExecutionOperation stockées.
4. **Estimation vs charge confirmée** : synthèse séparée ESTIMATED, RESERVED, REPORTED/RECONCILED, UNKNOWN, RELEASED ; aucune estimation calculée côté serveur.
5. **Opérations à coût incertain** : liste bornée (50) avec outil, états, plafond, compte, corrélation, âge, lien audit et action de résolution.
6. **Réconciliation existante** : réutilisation de POST /api/admin/execution/:id/resolve (coût constaté + preuve UUID) ; aucune libération silencieuse.
7. **Alertes** : coût incertain prioritaire, puis épuisé (restant <= 0), critique (>= 90 %), vigilance (>= 75 %), sinon OK.
8. **Disponibilité fournisseur et plafonds** : calcul partagé (extrait dans infrastructure/execution/availability.ts) et plafonds d'outils du registre ; jamais de sonde payante.
9. **Auditabilité** : journal CostEvent conservé et filtrable, corrélation des opérations, lien direct vers la page Audit.
10. **État commercial explicite** : bêta gratuite, gel des paiements, contrôle commercial, Stripe live et checkout exposés en lecture ; aucune activation, offre inchangée.

## 2. Fichiers principaux

- API : apps/api/src/routes/adminCosts.ts (nouveau), apps/api/src/infrastructure/execution/availability.ts (extrait partagé), apps/api/src/routes/adminAgents.ts (réutilise l'extrait), apps/api/src/server.ts (enregistrement).
- Web : apps/web/app/admin/couts/page.tsx (budgets, coûts par outil/fournisseur, incertains, mode commercial), apps/web/lib/admin.ts (types + client).
- Docs : ADR-0045 + index, inventaire, carte des lots, ce rapport.

## 3. Vérifications (statuts honnêtes)

| Contrôle | Résultat | Détail |
|---|---|---|
| git diff --check | **OK (exit 0)** | Aucun espace fautif. |
| Parse syntaxique TypeScript (6 fichiers) | **OK (0 erreur)** | transpileModule — syntaxe seule, pas un typecheck. |
| pnpm exec prisma validate | **OK (exit 0)** | Aucune migration en P11-D. |
| scripts/check-migrations.ps1 | **OK (exit 0)** | 39 migrations, contrôle structurel. |
| scripts/check-secrets.ps1 | **ÉCHEC (exit 1), faux positif préexistant** | Placeholder PYTHON_TOOLS_TOKEN=CHANGE_ME… dans services/python-tools/.env.example (P06). |

## 4. NOT_RUN et limites

- **NOT_RUN** : Vitest, typecheck, lint, build, Playwright, résolution réelle d'un incident, calcul sur une base peuplée.
- Limites : agrégation bornée (200 comptes, 500 dernières opérations) — ce n'est pas un grand livre comptable ; le journal CostEvent reste le routage MOCK ; la résolution d'incident est manuelle et exige une preuve ; la disponibilité fournisseur décrit la configuration ; aucune opération terminée n'est relancée depuis cette interface ; aucune donnée financière n'est écrite.

## 5. Rollback

git revert <sha-p11d> : aucune migration ni schéma modifié ; la route et les sections ajoutées disparaissent ; les budgets, réservations et journal de coûts existants restent inchangés.
