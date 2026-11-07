# Admin Vululu — parcours et limites

- **Date** : 2026-11-01
- **Portée** : Mission 03, admin de la V1
- **Accès** : super_admin uniquement (session serveur + rôle vérifiés côté API et côté layout)
- **URL locale** : http://127.0.0.1:3100/admin (API 127.0.0.1:3101)

## 1. Connexion et garde d'accès

1. Ouvrir /login, se connecter avec un compte super_admin.
2. Ouvrir /admin. Le layout serveur appelle /api/auth/me et vérifie le rôle avant tout rendu.
3. Sans session : redirection vers /login?next=/admin.
4. Avec un compte user : écran « Accès refusé » ; toute route /api/admin/* renvoie 403 côté serveur.
5. Le lien Admin n'apparaît dans le studio que pour un super_admin.

## 2. Sections

| Section | Contenu | Sources API |
|---|---|---|
| Vue d'ensemble | compteurs, runs par statut, artefacts, santé DB/stockage/orchestrateur, flags, erreurs récentes | GET /api/admin/overview |
| Utilisateurs | liste, activité, révocation de sessions ; invitations (création, token affiché une fois, révocation) | GET /api/admin/users, GET/POST/DELETE /api/admin/invitations, POST /api/admin/users/:id/sessions/revoke |
| Agents | définitions, versions soul/instructions/guardrails, brouillon, promotion, rollback | GET/POST /api/admin/agents, GET/POST /api/admin/agents/:id/configs, POST .../promote, POST .../rollback |
| Fournisseurs | providers, modèles, activation, qualification, simulation de routage | GET/POST /api/admin/providers, /models, /routing/preview, /routing/execute |
| Jobs | runs, étapes, trace ID, workflow ID, erreurs, outbox, artefact ; santé ops ; réconciliation | GET /api/admin/runs, /runs/:id, GET /api/ops/health, /snapshot, POST /api/ops/reconcile |
| Audit | événements filtrés et paginés (action, acteur, cible, dates) | GET /api/admin/audit |
| Coûts | événements de coût, totaux, répartition par provider — **MOCK** | GET /api/admin/costs |
| Réglages | mode orchestrateur, backend stockage, TLS, budgets, flags, fonctions non connectées | GET /api/admin/runtime |

## 3. Actions sensibles

Toute action destructive ou structurante demande une confirmation explicite :
- révocation de sessions d'un utilisateur ;
- purge de sessions (dry-run par défaut, apply seulement après confirmation) ;
- révocation d'invitation ;
- promotion ou rollback d'une configuration d'agent ;
- activation/désactivation d'un provider ou modèle, retrait de qualification ;
- exécution de routage (simulation) et réconciliation apply.

Les mutations sont auditées par les use cases existants (AuditEvent) : actor_id, action, cible, horodatage.

## 4. Ce que l'admin ne fait pas (volontairement)

- Aucune clé fournisseur n'est stockée ni renvoyée : le registre est un catalogue de métadonnées, les providers sont MOCK.
- Aucun bouton retry/cancel Hatchet tant que ces actions ne sont pas exposées par une API sûre.
- Aucune édition de rôle utilisateur (non supportée par les use cases actuels).
- Aucun coût réel : CostEvent provient de providers mock, l'UI affiche MOCK.
- Aucun contrôle MCP/audio/campagne/assets : les flags les listent comme NOT_CONNECTED.

## 5. Limites connues

- L'admin dépend du mode local/Hatchet configuré : en mode local, la santé « durable » n'est pas représentative.
- Le stockage S3 n'est affiché CONNECTED que si le backend est S3 et que le head de santé réussit.
- Le layout serveur exige API_INTERNAL_URL (par défaut http://127.0.0.1:3101) ; en conteneur, le définir vers le service API.
- Le token d'invitation n'est affiché qu'une fois ; il n'est jamais relu depuis la base.

## 6. Vérifications

- tests/v1/admin-read.test.ts : 401/403/200, pagination, absence de secret, MOCK explicite.
- e2e/admin.spec.ts : parcours super_admin, refus user, navigation, invitation.
- pnpm typecheck / lint / build / tests.

## 7. Références

- docs/adr/0014-admin-dans-apps-web.md
- apps/api/src/routes/adminRead.ts
- packages/contracts/src/admin.ts
