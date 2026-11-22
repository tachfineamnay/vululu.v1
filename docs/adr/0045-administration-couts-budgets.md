# ADR-0045 — Administration des coûts et budgets d'exécution

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P11-D)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0036 (exécution outillée), ADR-0044 (observabilité des opérations), mission P11-D.

## Contexte

L'administration exposait un journal de coûts de routage (CostEvent, libellé MOCK), les budgets bruts des comptes d'exécution (plafond, réservé, consommé) via la politique P11-B, et la réconciliation manuelle des incidents. Il manquait une vue consolidée des budgets par compte avec restant et alertes, des coûts par outil et fournisseur, la distinction explicite entre estimation et charge confirmée, la liste des opérations à coût incertain et un affichage clair de l'état commercial gelé.

La mission P11-D exige une gestion opérationnelle des coûts sans modifier le produit commercial : conserver VULULU_BETA_MODE=1, ne pas activer Stripe live, ne pas modifier les offres, ne jamais émettre de remboursement, débit ou paiement, ne pas libérer silencieusement une réservation incertaine, ne pas inventer de métrique financière et n'appliquer aucune migration destructive.

## Décision

1. **Lecture seule sur les sources existantes** : GET /api/admin/costs/execution agrège ExecutionAccount, ExecutionOperation et CostEvent. Aucune nouvelle table, aucun nouveau registre financier, aucune écriture.
2. **Budget réel par compte** : plafond, réservé, consommé, restant = plafond − (consommé + réservé) — negatif possible et affiché tel quel, utilisation en pourcentage du plafond, nombre d'outils autorisés, opérations incertaines du compte.
3. **Alertes calculées, jamais inventées** : priorité au coût incertain, puis épuisé (restant <= 0), critique (>= 90 %), vigilance (>= 75 %), sinon OK. Le calcul est déterministe à partir des montants stockés.
4. **Estimation vs confirmation** : les états de coût existants sont exposés séparément — ESTIMATED (proposition sans réservation), RESERVED (réservation engagée), REPORTED/RECONCILED (charge confirmée), UNKNOWN (issue incertaine), RELEASED (réservation libérée) — et cumulés dans la synthèse.
5. **Coûts par opération, outil et fournisseur** : le fournisseur est dérivé du registre fermé des outils ; les montants par outil et par fournisseur distinguent plafond cumulé, confirmé et incertain. Aucun coût n'est estimé par le serveur.
6. **Réservations incertaines jamais libérées en silence** : elles sont listées, expliquées et résolues uniquement par la route existante POST /api/admin/execution/:id/resolve, avec coût constaté et preuve UUID ; la réconciliation existante reste le seul mécanisme.
7. **Disponibilité fournisseur et plafonds** : réutilisation du calcul de disponibilité configuré (P11-B, extrait dans un module partagé) et des plafonds d'outils du registre ; ce n'est jamais une sonde payante.
8. **État commercial explicite** : VULULU_BETA_MODE (bêta gratuite), gel des paiements, mode du contrôle commercial, Stripe live et checkout sont exposés en lecture. Aucune activation n'est possible depuis cette interface ; les offres ne sont pas modifiées.
9. **Auditabilité** : le journal CostEvent reste consultable et filtrable ; les opérations financières renvoient à leur corrélation et à l'audit ; aucune métrique n'est dérivée d'autre chose que des données stockées.
10. **Aucune migration** : la mission n'ajoute aucune table ni colonne ; elle ne modifie pas le schéma.

## Conséquences

- **Positives** : budgets opérationnels lisibles, alertes fiables, distinction estimation/confirmation, exposition incertaine isolée, état commercial honnête, aucun risque financier ajouté.
- **Négatives / coûts** : l'agrégation est bornée (200 comptes, 500 opérations) et ne remplace pas un grand livre comptable ; la résolution d'incident reste manuelle ; la disponibilité fournisseur décrit une configuration, pas un appel.
- **Sécurité** : routes super-admin, aucune valeur secrète, aucune écriture financière, aucune libération automatique de réservation, aucun remboursement ni débit.

## Alternatives envisagées

- **Nouveau registre de coûts** : rejeté, duplication et risque de divergence.
- **Libération automatique des réservations UNKNOWN** : rejetée, masquerait une dépense potentielle.
- **Activation Stripe ou modification d'offres** : refusées par la mission et par le gel bêta.
- **Calcul de coûts estimés par le serveur** : rejeté, toute valeur doit venir d'une opération ou d'un événement stocké.

## Références

- apps/api/src/routes/adminCosts.ts, apps/api/src/infrastructure/execution/{availability,registry,broker}.ts, apps/api/src/infrastructure/billing/config.ts, apps/api/src/betaMode.ts
- apps/web/app/admin/couts/page.tsx, apps/web/lib/admin.ts
- ExecutionAccount, ExecutionOperation, CostEvent, BillingControl
