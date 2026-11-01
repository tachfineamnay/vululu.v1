# ADR-0014 — Admin dans apps/web plutôt qu'une application séparée

- **Date** : 2026-11-01
- **Statut** : Accepté pour la V1
- **Décideurs** : Lead engineer (proposition), porteur du projet (validation à la revue)
- **Contexte** : Mission 03 — construire un véritable Vululu Admin connecté aux mêmes use cases/API que le Web, sans duplication métier.
- **Remplace** : aucun
- **Remplacé par** : aucun

## 1. Contexte

La V1 possède déjà :
- une API Fastify unique avec sessions serveur, CSRF double-submit, RBAC serveur et 20 routes /api/admin/* ;
- une application Next 16.4.2 (apps/web) qui proxy /api vers l'API et porte le studio V0 ;
- aucune UI d'administration : les routes admin existent mais ne sont pas exploitables sans SQL/terminal.

La Mission 03 exige une UI riche (overview, utilisateurs, invitations, agents, fournisseurs/modèles, jobs, audit, coûts, réglages) avec isolation super_admin, actions sensibles auditées et aucune fuite de clé.

Deux options étaient ouvertes :
- A. routes /admin isolées dans apps/web (même application Next, même origine) ;
- B. nouvelle application apps/admin séparée (déploiement et origine distincts).

## 2. Options évaluées

| Critère | A. /admin dans apps/web | B. apps/admin séparée |
|---|---|---|
| Session/CSRF | Cookie de session et CSRF existants, même origine | Second login ou cookie Domain + CORS/CSRF à étendre |
| Déploiement | 1 app Next | 2 apps, 2 DNS/TLS/healthchecks, +1 build CI, +1 secret |
| Isolation | RBAC API + garde serveur ; pas de frontière réseau | Frontière réseau possible (VPN/domaine dédié) |
| Coût initial | ~20 fichiers, 0 nouvelle unité | ~10 fichiers de config + duplication du client auth/UI |
| Risque | Code admin présent dans le bundle web (chunks chargés seulement sous /admin) | Surface d'exploitation et dette de déploiement supplémentaires |
| Évolution | Split possible plus tard sans réécrire l'API | Immédiat mais prématuré pour un outil interne mono-équipe |

## 3. Décision

**Option A retenue pour la V1** : l'administration est un groupe de routes /admin dans apps/web.

Justification :
1. La sécurité réelle est portée par l'API (requireSuperAdmin + assertAdmin), pas par le bundle. Une app séparée n'ajouterait pas de contrôle d'accès métier, seulement une isolation de déploiement.
2. Le cookie de session est HttpOnly SameSite=Lax, sans support CORS côté API ; une origine séparée imposerait un second login ou une configuration cookie/CORS/CSRF supplémentaire, pour un bénéfice nul à cette échelle.
3. Un seul déploiement Coolify/Next réduit les coûts d'exploitation, de CI et de secrets tant que l'admin reste un outil interne.
4. Next découpe les bundles par route : les composants /admin ne sont pas chargés par les pages studio.
5. La séparation pourra être faite sans toucher à l'API : apps/admin consommerait les mêmes routes via un proxy Next, avec un cookie partagé sur le domaine racine.

## 4. Conséquences

- apps/web/app/admin/** est protégé par un layout serveur qui vérifie la session et le rôle avant rendu.
- Toute route admin reste protégée côté API ; l'UI n'est pas une frontière de sécurité.
- Un ADR ultérieur sera nécessaire pour créer apps/admin.
- Les tests Playwright couvrent le parcours super_admin et le refus user.

## 5. Conditions de réévaluation (bascule vers apps/admin)

Créer apps/admin si au moins un critère devient vrai :
1. l'admin doit être exposé sur un domaine ou un VPN distinct du studio ;
2. l'admin doit être livré à une cadence indépendante du studio ;
3. une séparation réseau ou un contrôle d'accès périmétrique est imposé par l'exploitation ;
4. le bundle admin devient lourd au point de dégrader le build/déploiement du studio.

## 6. Références

- apps/api/src/routes/adminRead.ts, admin.ts, adminAgents.ts, ops.ts
- apps/web/app/admin/layout.tsx
- docs/admin/ADMIN_PARCOURS.md
- Mission 03 (prompt du 2026-11-01)
