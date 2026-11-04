# V1-DEMO — Lots 0 à 2 : preuves et travail restant

- Date : 2026-11-04.
- Branche : codex/v1-demo-coolify ; base bb0bc3a.
- Objectif conservé : V1 démo complète déployable sur Coolify, sans connexion IA.
- Exigences : E00-01/03/04 ; PRD-01/11 ; CDC-F-001/002/003/060, CDC-N-001/002/007.

## Livré dans les sources

- Addendum V1-DEMO, matrice PRD/CDC et ADR-0016 ; statut courant README/roadmap réconcilié ; index ADR-0014/0015 complété. Sources verbatim préservées.
- Modèle Coolify renommé en infra/coolify/.env.example pour respecter la convention déjà appliquée par les contrôles.
- Bootstrap démo transactionnel : compte ordinaire, contexte fictif et révision checksummée, projet de départ, audit. Credentials injectés ; pas de valeur dans le code/frontend/logs.
- Replay sans doublon ni changement de mot de passe ou travail ; refus des collisions compte/ressource, du rôle admin et des configurations invalides.
- Service Compose demo-seed explicite et séparé du bootstrap super-admin. Pas d’initialisation automatique destructive au redéploiement.
- Web sans port hôte publié dans le Compose Coolify ; override local liant uniquement 127.0.0.1.
- Formulaire sans compte prérempli ; annonce démo lue côté serveur à l’exécution ; configuration Playwright pour une instance déjà démarrée.

Ces modifications ne clôturent pas les lots 1/2 complets : recette d’images, comptes/rôles de bout en bout et données additionnelles de bibliothèque/campagnes restent à livrer.

## Preuves exécutées

| Vérification | Résultat |
|---|---|
| Création de branche locale | PASS ; aucun changement distant |
| verify-foundation-docs.ps1 après renommage | PASS ; HASHES_OK=9 |
| check-tracked-files.ps1 | PASS ; 391 fichiers suivis au contrôle |
| check-secrets.ps1 après sources bootstrap | PASS ; 402 fichiers scannés |
| check-architecture-boundaries.ps1 | PASS ; 20 fichiers domaine, 17 application |
| Tests bootstrap avant implémentation | 14 FAIL attendus sur comportement non implémenté |
| Tests bootstrap après implémentation | 14 PASS |
| Tests bootstrap + login/CSRF/RBAC/logout | 15 PASS ; PostgreSQL réel isolé |
| Commande seed-demo.ts avec mode désactivé | Refus attendu : demo_mode_required, exit 1 |
| Commande seed-demo.ts et replay, mode activé | PASS deux fois, credentials éphémères non affichés |
| Typecheck API après bootstrap | PASS |
| Compose avec profil demo-bootstrap, config --quiet | PASS ; ne prouve pas le démarrage des conteneurs |
| E2E via serveurs démarrés automatiquement | BLOCKED : timeout démarrage 240000 ms, avant assertions |
| E2E sur Web isolé, avant correctif | FAIL attendu : email demo@vululu.local prérempli |
| E2E après correctif de formulaire/bannière | PASS : 1 test, 32,8 s ; clavier et mobile inclus |
| E2E sur next start après pnpm build | PASS : 1 test, 22,9 s ; DEMO_MODE injecté au runtime, serveur sur localhost |
| Contrôle visuel login | PASS : capture locale .v1/demo-login.png inspectée ; image de développement, pas une preuve production |
| Lint strict ciblé après correctif | PASS : code de sortie 0 |
| Typecheck monorepo | PASS : 7 workspaces, code de sortie 0 |
| Build source API + Web | PASS : pnpm build, code de sortie 0 ; routes rendues à la demande |
| Compose avec override local et profil demo-bootstrap | PASS : config --quiet, aucune connexion au moteur requise |
| Images Docker, reprise Linux, recette Coolify | NOT_RUN ; Docker Desktop ne peut pas démarrer |

Le premier échec de chargement du nouveau test (résolution de dépendance depuis la racine) a été corrigé avant le cycle de comportement 14 FAIL → 14 PASS. Les refus d’authentification 401/403 et CSRF 403 des tests sont attendus, pas des régressions.

## Environnement vérifié

Un nouveau cluster PostgreSQL de test a été initialisé sous .v1/demo-dev-pg, sur 127.0.0.1:55432, avec une base vululu_v1_00_test. Le cluster de démonstration historique n’a pas été modifié. Les connexions locales nécessitent une exécution hors des restrictions réseau du bac à sable ; les tests ont réellement été exécutés avec cette capacité.

Docker a été vérifié avec l’accès nécessaire : « Docker Desktop is unable to start ». Aucune réparation destructive n’a été tentée.

L’inventaire Coolify connecté a été lu : version 4.6.0, un serveur déclaré joignable/utilisable et aucun projet Vululu. Aucune ressource distante n’a été créée, démarrée, arrêtée ou modifiée. Les métriques Sentinel ne sont pas activées ; la capacité disponible du serveur reste à mesurer. L’inventaire ne vaut pas autorisation de perturber les autres projets.

## Limites et suite

- Le compte démo n’est pour l’instant créé que par la recette isolée ; aucun compte distant ni identifiant final n’est annoncé.
- Le jeu initial sera complété par les lots actifs/campagnes/formats ; il n’invente pas des modèles absents.
- IA, coûts et Postiz restent MOCK. MCP, audio et les autres exigences P0 ne sont pas reclassés hors périmètre.
- Builds/Linux et recette HTTPS obligatoires avant un GO d’usage interne ; pas de certification globale sur la base de ces tests ciblés.
- Le Web de test est suivi par un handle d’exécution ; les exécutions lentes sont observées jusqu’à leur état terminal, sans les relancer sur un simple timeout d’observation.

Rollback : revenir au code/config précédents, sans suppression de données ; le compte démo et ses exemples ne sont jamais effacés automatiquement. Aucun schéma DB n’a été changé dans ces sous-lots. Ne pas arrêter ni effacer le cluster historique ou les services d’autres projets.
