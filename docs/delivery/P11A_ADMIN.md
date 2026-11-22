# P11-A — Administration complète des utilisateurs (rapport de lot)

- **Date** : 2026-11-21
- **Branche** : `campaign/vululu-completion` (base `85e712b`, P10)
- **Commit** : `feat(p11a): complete user administration [BUILD_UNVERIFIED]`
- **Statut de preuve** : **BUILD_UNVERIFIED** — aucune suite, aucun build, aucun E2E (contrat §25). Les contrôles ci-dessous sont manuels et partiellement rapportés par l'agent d'implémentation ; rien n'est une certification.
- **ADR** : [ADR-0042](../adr/0042-administration-comptes-et-suspension.md)

## 1. Périmètre livré

1. **Liste des utilisateurs** : recherche serveur `q` (e-mail/nom, ≤ 120 caractères), filtres `role` (`user`/`support`/`super_admin`) et `status` (`active`/`suspended`), pagination serveur, compteurs projets/sessions et statut de dernière session.
2. **Statut et métadonnées** : `User.status` + `User.suspendedAt` (migration additive, défaut `active`), index de statut, badge de statut et date de suspension.
3. **Changement autorisé de rôle/statut** : `PATCH /api/admin/users/:id` strict (`role`/`status` seulement), `super_admin` uniquement, auto-modification interdite, dernier `super_admin` actif préservé, verrou consultatif contre les mutations concurrentes, audit `user.role_changed` / `user.suspended` / `user.reactivated`.
4. **Suspension/réactivation sûres** : connexion refusée (403 `account_suspended`, journalisée) **uniquement après** vérification correcte du mot de passe ; sessions actives révoquées dans la même transaction (`admin_suspend` / `admin_role_change`) ; refus de session en profondeur pour un compte suspendu ; réactivation remet `suspendedAt` à `null`.
5. **Fiche utilisateur fonctionnelle** : `GET /api/admin/users/:id` — compteurs bornés (contextes, projets, contenus, sessions totales/actives, demandes de publication par état) et 20 événements d'audit récents ; aucun hash de mot de passe, jeton, secret fournisseur ou contenu métier privé.
6. **Actions UI reliées au serveur** : recherche/filtres/pagination, badge de statut, panneau de détail, changement de rôle et suspension/réactivation avec **confirmation explicite**, bannières de succès/erreur, actions désactivées pour son propre compte, aucun contrôle factice.
7. **Isolation et confidentialité** : toutes les routes restent réservées à `super_admin` ; les mutations sont auditées avec acteur et cible ; la réponse ne contient aucune donnée secrète.

## 2. Fichiers principaux

- Contrat : `packages/contracts/src/admin.ts` (`adminUserQuerySchema`, `adminUserUpdateSchema`, types rôle/statut/fiche).
- Application : `packages/application/src/ports.ts` (`AdminUserQuery`, `AdminUserDetailRecord`), `use-cases/admin.ts` (`getUserDetail`).
- Infrastructure : `apps/api/src/infrastructure/prisma/adminQuery.ts` (filtres, statut, fiche), migration `packages/db/prisma/migrations/20261122140000_user_administration`, `packages/db/prisma/schema.prisma`.
- API : `apps/api/src/routes/admin.ts` (`PATCH`), `apps/api/src/routes/adminRead.ts` (liste + fiche), `apps/api/src/routes/auth.ts` (refus 403), `apps/api/src/security/session.ts` (révocation transactionnelle + refus de session).
- Web : `apps/web/app/admin/utilisateurs/page.tsx`, `UserDetailPanel.tsx`, `apps/web/lib/admin.ts`.
- Docs : ADR-0042 + index, inventaire, carte des lots, ce rapport.

## 3. Vérifications (statuts honnêtes)

| Contrôle | Résultat | Détail |
|---|---|---|
| `pnpm exec prisma validate` | **OK (exit 0)** | Schéma valide avec `User.status`/`suspendedAt`. |
| `pnpm db:generate` | **OK (exit 0)** | Client Prisma régénéré (non versionné). |
| `scripts/check-migrations.ps1` | **OK (exit 0)** | **39** migrations ; nommage et `migration.sql` cohérents. |
| Parse syntaxique TypeScript | **OK (0 erreur sur 22 fichiers modifiés)** | Syntaxe seule, pas un typecheck. |
| `git diff --check` | **OK (exit 0)** | Aucun espace fautif. |
| Typecheck ciblé (contrats + application) rapporté par l'agent | **rapporté OK (exit 0), non rejoué par le Lead** | Non présenté comme certification ; le typecheck complet reste NOT_RUN. |
| Typecheck API/Web complet | **NOT_RUN** | Campagne P00–P11 ; l'agent signale uniquement des erreurs préexistantes hors de ses fichiers, non revérifiées ici. |
| `scripts/check-secrets.ps1` | **ÉCHEC (exit 1), faux positif préexistant** | Placeholder `PYTHON_TOOLS_TOKEN=CHANGE_ME…` dans `services/python-tools/.env.example` (P06, non modifié). |

## 4. NOT_RUN et limites

- **NOT_RUN** : Vitest, lint, build, Playwright, typecheck complet, connexion réelle d'un compte suspendu, parcours navigateur du panneau admin.
- Limites : pas de suppression de compte (décision distincte : rétention/légal) ; aucune notification envoyée au compte suspendu ; la suspension conserve toutes les données ; le statut doit être pris en compte par les futurs parcours de suppression/érasure ; les rôles restent ceux déjà acceptés par l'authentification.

## 5. Rollback

`git revert <sha-p11a>` : la migration additive reste en place et inerte (`status` par défaut `active`, `suspendedAt` nul) ; les routes et l'UI ajoutées disparaissent ; aucune donnée n'a été supprimée ni modifiée.
