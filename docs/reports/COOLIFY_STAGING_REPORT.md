# VULULU V1 — Rapport de staging Coolify

- Date : 2026-11-01
- Statut : BLOCKED_PENDING_AUTHORIZATION
- Portée : planification et prérequis uniquement ; aucune action distante exécutée
- Autorisation de déploiement : NON ACCORDÉE par ce document. Une autorisation humaine explicite et séparée est requise.

## 1. Pourquoi BLOCKED

1. Aucun VPS, accès Coolify, version, ressource, DNS ni topologie existante n'a été fourni dans le dépôt ou la session.
2. La Mission 05 n'est pas complète : S3/backup/restore PASS, mais le chemin Hatchet/worker/crash reste BLOCKED par Docker Desktop et n'a pas été validé sur Linux.
3. Le prompt de la mission autorise uniquement la planification ; toute intervention distante exige une autorisation distincte.
4. Les secrets doivent être injectés par Coolify/coffre, jamais dans le chat ou le dépôt.

## 2. Entrées requises avant toute action

| Élément | Fourni par l'utilisateur | Remarque |
|---|---|---|
| Hôte/VPS | nom, fournisseur, accès (méthode), OS | Ne pas demander de mot de passe en clair |
| Coolify | URL, version, compte autorisé | Lecture avant modification |
| Ressources | CPU, RAM, disque, espaces libres | Mesurer avant toute installation |
| Services existants | projets, réseaux, volumes, ports, sauvegardes | Ne modifier aucun service non Vululu |
| DNS de test | nom réellement fourni | Ne rien inventer |
| Autorisation | ex. AUTORISATION_STAGING_VULULU_<date> | Distincte de l'approbation du plan |
| Secrets | injectés dans Coolify | noms seulement dans les rapports |

## 3. Inventaire à exécuter après autorisation (read-only)

    coolify version (ou UI/API)
    uname -a; nproc; free -h; df -h; docker version; docker info
    docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
    docker network ls; docker volume ls
    ls -la /data /var/lib/docker 2>/dev/null
    vérifier les sauvegardes existantes et leur date
    ne rien modifier avant le rapport d'inventaire

## 4. Ordre de déploiement

1. Projet/environnement Vululu / staging, réseau interne, TLS et restriction d'accès.
2. PostgreSQL 17 + volume persistant + migrations non destructives (prisma migrate deploy/status).
3. S3-compatible (MinIO si disponible, sinon rclone TLS selon ADR-0015) : bucket privé, credentials restreints, volumes persistants.
4. Hatchet engine + PostgreSQL dédié + worker(s), token injecté par coffre, healthchecks.
5. API Fastify (images Dockerfile.api), variables serveur, healthcheck /api/health.
6. Web/Admin (Dockerfile.web), API_INTERNAL_URL, sessions derrière reverse proxy.
7. Seed super_admin via secret, puis smoke tests.

## 5. Matrice des secrets (noms uniquement)

SESSION_SECRET ≥ 32, POSTGRES_PASSWORD, HATCHET_PG_PASSWORD, HATCHET_CLIENT_TOKEN (handshake), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, V1_BOOTSTRAP_PASSWORD (usage unique), éventuel token MCP. Aucune valeur dans Git, les logs, les rapports ou le chat.

## 6. Healthchecks et sessions

- API : GET /api/health = 200 ; démarrage API_HOST=0.0.0.0, APP_ENV=production, APP_ORIGIN/WEB_ORIGIN.
- Web : GET / = 200 ; rewrite /api vers API_INTERNAL_URL ; cookie de session SameSite=Lax/Secure derrière TLS.
- PostgreSQL : pg_isready ; Hatchet : handshake + gRPC/API ; S3 : healthcheck interne ; worker : heartbeat WorkerHeartbeat + restart policy.
- Reverse proxy : trust proxy, HTTPS, restriction d'accès admin.

## 7. Smoke tests de staging

1. 200 frontend, login sécurisé, cookie Secure.
2. Admin super_admin : overview, utilisateurs, agents, fournisseurs, jobs, audit, coûts, réglages.
3. Refus user sur /admin et sur /api/admin/* (403).
4. Persistance DB après redémarrage du conteneur PostgreSQL.
5. Création contexte/projet, storyboard, rendu MP4, correction, QA, approbation exacte.
6. Restauration de test DB+S3 sans perte.
7. Logs propres : traces, job_id, run_id, mock explicite, aucun secret.
8. Aucune API S3 publique ; aucun déploiement public production.

## 8. Preuves à capturer

URLs masquées si privées, versions d'images et digests, SHA des commits, statuts des conteneurs, dates ISO, résultats des tests (PASS/FAIL/BLOCKED), tailles/volumes, captures non sensibles. Aucun secret.

## 9. Rollback

1. Arrêter Web/Admin puis API puis worker.
2. Restaurer PostgreSQL et objets S3 depuis le dernier backup (base/bucket neufs).
3. Revenir aux images/digests précédents.
4. Vérifier healthchecks et smoke tests minimaux avant réouverture.
5. Ne supprimer aucun volume avant vérification du backup.

## 10. Corrections exactes avant STAGING_READY

1. Fournir les accès, ressources, DNS et l'autorisation distincte.
2. Rétablir un runtime Docker/Linux sain (le disque WSL local est read-only).
3. Valider la topologie Hatchet/worker et les crash tests de la Mission 05.
4. Décider le stockage de production (MinIO auto-hébergé ou S3 managé) ; rclone est un repli expérimental.
5. Décider la politique de rétention/RPO/RTO de production.
6. Exécuter l'inventaire, le déploiement et les smoke tests, puis mettre à jour ce rapport en STAGING_READY ou BLOCKED avec preuves.

## 11. Décision attendue

Fournir les entrées de la section 2 et l'autorisation explicite de staging. Aucune action distante ne sera lancée sans ces éléments.
