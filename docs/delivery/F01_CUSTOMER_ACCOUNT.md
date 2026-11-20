# F01 — Cycle de vie du compte client

**Date :** 2026-11-20 · [ADR 0033](../adr/0033-comptes-clients.md)

## Parcours

- Depuis `/login`, créer un compte et demander le lien, ou le renvoyer. Ouvrir le lien permet de choisir le nom et le mot de passe et de vérifier l’adresse. La connexion amène un nouveau compte sans profil vers son activité, son offre (facultative) puis son premier projet. L’assistant marketing peut reprendre l’offre du projet.
- **Mon compte → Profil et sécurité** : nom affiché, changement de mot de passe avec contrôle du mot de passe actuel, fermeture des autres sessions, de la session courante ou de toutes les sessions.
- **Mot de passe oublié** : demande générique, lien à usage unique, confirmation et retour à la connexion. Un mot de passe perdu pour un rôle privilégié reste hors récupération publique.

## Configuration et retour arrière

1. Appliquer la migration additive avec `pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma`. La colonne marque uniquement les nouvelles inscriptions ; aucun compte, rôle, invitation ou mot de passe historique n’est migré ou réécrit.
2. Côté **API uniquement**, renseigner `ACCOUNT_EMAIL_FROM` (expéditeur autorisé chez Resend), `ACCOUNT_EMAIL_RESEND_API_KEY` (clé d’envoi), et `ACCOUNT_EMAIL_ORIGIN` (origine canonique HTTPS, sans chemin, en production). Le domaine de l’expéditeur doit être vérifié chez le fournisseur. Configurer `APP_ORIGIN` pour la même origine navigateur. Le proxy de confiance doit écraser les en-têtes client d’IP transmis en amont si `TRUST_PROXY=true` ; sinon ne pas lui faire confiance pour les limites par IP.
3. Surveiller `auth.account_email_delivery_failed` et les taux de rejet/quotas du fournisseur. Aucun jeton ou contenu de mail ne doit être journalisé. Les liens expirés sont purgés par la réconciliation runtime appliquée (`POST /api/ops/reconcile` avec `dryRun: false`, super-administrateur et CSRF), indépendamment du dispatcher. Inclure cette opération dans la routine de rétention.
4. Pour suspendre seulement les demandes d’envoi, retirer ensemble la clé et l’expéditeur. Les routes d’envoi répondent `503` de façon uniforme et les liens encore valides restent consommables. Pour revenir au code précédent, laisser la migration additive en place : les comptes créés restent des utilisateurs ordinaires avec les mêmes sessions et identifiants. Ne pas supprimer la table ni la colonne lors d’un retour arrière applicatif.

## Recette ciblée

Sur une base PostgreSQL locale jetable `*_test`, migrée, avec client Prisma généré :

```sh
pnpm test tests/customer-account.test.ts tests/account-email-transport.test.ts
pnpm exec playwright test --config playwright.customer-account.config.ts
pnpm lint
pnpm --filter @vululu/api --filter @vululu/web --filter @vululu/db typecheck
```

L’intégration injecte un collecteur en mémoire. La recette navigateur démarre son propre serveur de test avec un collecteur temporaire local (pas de commutateur de production pour récupérer des liens). Le test de contrat HTTP intercepte `fetch`. Aucun email réel, coût fournisseur, déploiement ou publication n’a été tenté.

### Résultats Arena

| Contrôle | Résultat |
| --- | --- |
| Intégration PostgreSQL + contrat du transport HTTP | **PASS** — 6 tests : cycle client, CSRF/RBAC, invitation administrateur, concurrence/rejeu/expiration, limitation, purge et contrat Resend simulé. |
| Playwright, build web de production, API et collecteur locaux | **PASS** — 2 parcours complets, bureau 1440 px et mobile 390 px, vérification du débordement horizontal sur les écrans compte. |
| Lint, types API/Web/DB, build Web, validation du schéma et diff | **PASS**. |
| Migrations et exécution en sandbox | **PASS** — SQL des 29 migrations appliqué à PostgreSQL local. Le téléchargement des moteurs natifs Prisma était bloqué : client de test temporaire Prisma WASM + `@prisma/adapter-pg` dans les fichiers ignorés ; `prisma migrate deploy` natif **NOT_RUN**. Le code et les dépendances du dépôt conservent leur moteur habituel. |
| Secrets | Script PowerShell **NOT_RUN** (exécutable indisponible) ; contrôle équivalent des motifs du script sur l’arbre de travail : aucun résultat. |
| Envoi réel et déploiement | **NOT_RUN** — aucun identifiant fournisseur ni déploiement demandé. |
