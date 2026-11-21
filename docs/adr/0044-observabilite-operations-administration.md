# ADR-0044 — Observabilité des opérations et actions administratives sûres

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P11-C)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0036 (exécution outillée), ADR-0037 (boîte à outils Python), ADR-0043 (administration des outils), mission P11-C.

## Contexte

L'administration exposait déjà les runs de production (étapes, outbox, artefact), les workers (heartbeats), les incidents d'exécution UNKNOWN et une réconciliation runtime. Elle ne donnait ni vue consolidée des **opérations outillées** (ToolBroker), ni éligibilité explicite à l'annulation/à la résolution, ni état réel du **service Python interne**, ni liaison directe entre une opération et ses **événements d'audit**. Les durées et les runs bloqués n'étaient pas calculés.

La mission P11-C exige une observabilité et une gestion réelles : états queued/running/success/failed/uncertain, santé workers, disponibilité Python, détails, corrélation, raisons d'échec sans secret, durées, éligibilité, actions sûres, gestion des issues incertaines, audit relié — sans indicateur fictif, sans relance aveugle d'opération payante, sans accès direct aux internes worker, sans base de monitoring ni second moteur de workflow.

## Décision

1. **Une vue de lecture agrégée, pas une nouvelle base** : GET /api/admin/ops/execution lit ExecutionOperation (états et états de coût, 50 dernières) et expose cancelEligible (PROPOSED/QUEUED) et resolveEligible (UNKNOWN). Aucun stockage parallèle.
2. **Détail et corrélation** : GET /api/admin/ops/execution/:id renvoie l'opération (outil, état, coût, plafond, corrélation, projet, propriétaire) et les 20 événements d'audit portant le même traceId que la corrélation. GET /api/admin/audit accepte désormais un filtre traceId, et la page Audit pré-remplit ce filtre depuis ?traceId=.
3. **Actions limitées aux machines à états existantes** : seule l'annulation d'une opération encore PROPOSED/QUEUED est exposée (POST /api/admin/ops/execution/:id/cancel), rejouée via le broker avec le propriétaire du compte après vérification du rôle super-admin et journalisation de l'acteur réel (execution.admin_cancelled). La résolution d'une issue incertaine reste la route existante POST /api/admin/execution/:id/resolve (coût constaté + preuve). **Aucune relance automatique d'une opération payante.**
4. **Santé réelle, sans sonde payante** : les workers viennent des heartbeats existants ; GET /api/admin/ops/python interroge le service interne (/readyz, /v1/capabilities) avec un timeout court et renvoie configured/reachable/ready, dépendances, version et capacités déclarées. Aucun jeton ni URL interne n'est renvoyé ; une indisponibilité est affichée, jamais masquée.
5. **Durées et blocages calculés** : les runs exposent ageMs, sinceUpdateMs, stalled (seuil 300 s, aligné sur la réconciliation) et durationMs pour un état terminal — calculés, jamais inventés.
6. **Aucun second moteur** : la réconciliation runtime existante reste l'unique mécanisme de récupération (outbox orphelin, claims) ; Hatchet et le ToolBroker restent inchangés.
7. **Interface reliée** : page Jobs (opérations outillées, détail, audit, annulation confirmée, résolution d'incident, service Python) et page Audit (filtre de corrélation). Chaque action appelle une route réelle ; les erreurs sont affichées.

## Conséquences

- **Positives** : vue opérationnelle complète et honnête, éligibilités explicites, aucune reprise aveugle payante, audit relié aux opérations, disponibilité Python réelle, durées et blocages mesurés.
- **Négatives / coûts** : la vue Python est un appel réseau borné (5 s) ; la résolution d'incident reste manuelle et exige une preuve ; l'annulation n'est possible qu'avant envoi ; les opérations terminées ne sont pas relançables depuis l'admin (pas de nouveau moteur).
- **Sécurité** : routes super-admin, aucune valeur secrète, acteur audité, aucune action sur une opération déjà envoyée.

## Alternatives envisagées

- **Base de monitoring dédiée** : rejetée, duplication et dérive de la source de vérité.
- **Relance directe d'une opération échouée** : rejetée, risque de double dépense ; la relance passe par le parcours produit et le broker.
- **Sonde payante des fournisseurs** : rejetée, coût et appels non autorisés.
- **Accès navigateur aux internes worker** : rejeté, surface super-admin uniquement.

## Références

- apps/api/src/routes/ops.ts, apps/api/src/routes/execution.ts, apps/api/src/infrastructure/operations/*, apps/api/src/infrastructure/execution/broker.ts
- apps/web/app/admin/jobs/page.tsx, apps/web/app/admin/audit/page.tsx, apps/web/lib/admin.ts
