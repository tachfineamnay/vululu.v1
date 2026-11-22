# ADR-0042 — Administration des comptes : rôles, suspension et révocation immédiate

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P11-A)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), AGENTS.md §9 (sécurité), mission P11-A.

## Contexte

L'administration existante exposait une liste d'utilisateurs en lecture (recherche e-mail/nom, pagination), la révocation des sessions et les invitations. Elle ne permettait ni de consulter une fiche complète, ni de changer un rôle, ni de suspendre un compte : le modèle `User` n'avait aucun statut, et un compte compromis ne pouvait être neutralisé qu'en révoquant ses sessions — un utilisateur pouvait se reconnecter immédiatement.

La mission P11-A exige une administration complète : recherche/filtres/pagination serveur, statut et métadonnées opérationnelles, changement de rôle autorisé, suspension/réactivation sûre, fiche utilisateur fonctionnelle, révocation de session après changement sensible, confirmation/erreurs, isolation et absence de secret.

## Décision

1. **Statut de compte additif** : `User.status` (`active` par défaut) et `User.suspendedAt` nullable, plus un index sur `status`. Migration strictement additive ; les comptes existants restent actifs sans intervention.
2. **Suspension effective immédiatement** : la connexion vérifie le statut **après** la vérification du mot de passe, sous le même verrou que la réinitialisation (aucune énumération de comptes : un mot de passe faux renvoie toujours 401, un compte suspendu avec mot de passe correct renvoie 403 `account_suspended`, journalisé). Toutes les sessions actives sont révoquées dans la même transaction (`admin_suspend`), et la résolution de session refuse en profondeur tout compte suspendu.
3. **Rôles gérés** : `user`, `support`, `super_admin` (valeurs déjà utilisées par l'authentification). Le changement de rôle est audité (`user.role_changed`) et révoque les sessions actives (`admin_role_change`) pour forcer une réauthentification avec le nouveau privilège.
4. **Garde-fous d'administration** : seuls les `super_admin` agissent ; un administrateur ne peut pas modifier son propre rôle/statut ; le dernier `super_admin` actif ne peut être ni rétrogradé ni suspendu ; les mutations sont sérialisées par un verrou consultatif PostgreSQL pour éviter deux rétrogradations concurrentes.
5. **Fiche utilisateur sans secret** : compteurs bornés (contextes, projets, contenus, sessions totales/actives, demandes de publication par état) et 20 événements d'audit récents ; jamais de hash de mot de passe, de jeton de session, de secret fournisseur ou de contenu métier privé.
6. **Interface** : recherche et filtres rôle/statut côté serveur, pagination serveur, badge de statut, fiche détaillée avec actions de changement de rôle et de suspension/réactivation, confirmation explicite, messages de succès/erreur, actions désactivées pour son propre compte. Aucun contrôle factice.
7. **Aucune suppression de compte** : la suspension est réversible et préserve les données ; une suppression relèverait d'une décision distincte (rétention, obligations légales).

## Conséquences

- **Positives** : neutralisation immédiate d'un compte, administration complète et auditée, rôles cohérents avec l'authentification existante, aucune fuite de secret, migration sans rupture.
- **Négatives / coûts** : une colonne et un index supplémentaires ; le statut doit être maintenu par les futurs parcours de compte (suppression/érasure) ; la suspension coupe l'accès mais ne purge aucune donnée ; aucune notification automatique au compte suspendu.
- **Sécurité** : 403 uniquement après mot de passe correct, révocation transactionnelle, refus de session pour compte suspendu, audit systématique avec acteur, cible et métadonnées bornées, isolation `super_admin` sur toutes les routes.

## Alternatives envisagées

- **Supprimer le compte** : rejeté, destructif et contraire à la préservation des données ; la suspension suffit.
- **Bloquer uniquement les nouvelles connexions sans révoquer les sessions** : rejeté, un jeton existant resterait valide.
- **Statut dans une table séparée** : rejeté, une colonne additive suffit et évite une jointure systématique.
- **Renvoyer 401 pour un compte suspendu** : rejeté, l'utilisateur légitime ne comprendrait pas ; le 403 explicite n'est émis qu'après vérification du mot de passe.

## Références

- `packages/contracts/src/admin.ts`, `apps/api/src/routes/admin.ts`, `adminRead.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/security/session.ts`
- `packages/application/src/ports.ts`, `use-cases/admin.ts`, `apps/api/src/infrastructure/prisma/adminQuery.ts`
- `apps/web/app/admin/utilisateurs/`, `apps/web/lib/admin.ts`
- Migration `20261122140000_user_administration`
