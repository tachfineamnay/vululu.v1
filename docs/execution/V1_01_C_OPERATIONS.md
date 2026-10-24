# V1-01-C — OPÉRATIONS DU POC

- **Date** : 2026-10-24
- **Engine** : Hatchet v0.110.5
- **SDK** : @hatchet-dev/typescript-sdk 1.43.0
- **Worker** : Node 24.21.0, TypeScript, séparé de l'API
- **Ledger** : PostgreSQL vululu_hatchet_poc (127.0.0.1:55432)
- **Aucun secret commité**

## 1. Versions et artefacts

| Artefact | Version / SHA |
|---|---|
| Hatchet embedded sidecar Linux amd64 | v0.110.5 |
| SHA-256 du sidecar | 18ddacae0005042bd982328bcb8d370cca6907352a1ab2a3c8406001d31e7dee |
| SDK TypeScript | 1.43.0 |
| CLI Hatchet | 0.110.5 (téléchargé, Docker non utilisé) |
| Node | 24.21.0 |

Le binaire sidecar n'est pas versionné : il est téléchargé dans .v1/hatchet-embedded.

## 2. Docker — NOT_RUN

Docker Desktop 29.8.1 a démarré puis échoué :

    write /var/lib/desktop-containerd/daemon/io.containerd.metadata.v1.bolt/meta.db:
    read-only file system

Le disque WSL /dev/sdd n'avait plus de système de fichiers. Aucun formatage n'a été exécuté afin de ne pas détruire les données Docker d'autres projets. Le fichier poc/hatchet/docker-compose.hatchet.yml est fourni, pinned v0.110.5, mais n'a pas été exécuté.

Alternative exécutée : sidecar embedded officiel Hatchet v0.110.5 sous WSL2. Même engine, worker séparé, ledger PostgreSQL.

## 3. Préparation WSL

    wsl -d docker-desktop -e sh -c 'adduser -D -h /mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-poc-home hatchet'
    wsl -d docker-desktop -e sh -c 'mkdir -p /mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-poc-pg'
    wsl -d docker-desktop -e sh -c 'chown -R hatchet:hatchet /mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-poc-home /mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-poc-pg'
    wsl -d docker-desktop -e sh -c 'apk add --no-cache socat'

## 4. Démarrage du sidecar

Le sidecar lit stdin et s'arrête si stdin est fermé. Le pipe sleep garde stdin ouvert.

    wsl -d docker-desktop -u hatchet -e sh -c 'sleep 2147483647 | /mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-embedded/hatchet-embedded-sidecar_v0.110.5_linux_amd64 -api-port 28243 -grpc-port 7077 -postgres-data-dir /mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-poc-pg -handshake-file /tmp/hatchet-poc-handshake.json -log-level info'

Le handshake contient token, tenant_id, adresse gRPC et URL API. Il ne doit jamais être commité.

## 5. Redirection réseau

Le sidecar écoute 127.0.0.1 dans WSL. Deux socat exposent 28244/7078, puis un proxy Node Windows expose 28243/7077.

    wsl -d docker-desktop -e sh -c 'socat TCP-LISTEN:28244,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:28243'
    wsl -d docker-desktop -e sh -c 'socat TCP-LISTEN:7078,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:7077'
    node poc/hatchet/scripts/tcp-proxy.cjs <WSL_IP>

Scripts : poc/hatchet/scripts/start-sidecar.ps1, stop-sidecar.ps1, start-proxy.ps1, stop-proxy.ps1.

## 6. Worker et driver

Le SDK utilise :

    HATCHET_CLIENT_TOKEN=<handshake.token>
    HATCHET_CLIENT_HOST_PORT=127.0.0.1:7077
    HATCHET_CLIENT_API_URL=http://127.0.0.1:28243
    HATCHET_CLIENT_TLS_STRATEGY=none
    POC_DATABASE_URL=postgresql://vululu@127.0.0.1:55432/vululu_hatchet_poc?sslmode=disable

Démarrage worker :

    cd poc/hatchet
    . ./scripts/harness.ps1
    Start-PocWorker

Arrêt brutal :

    Stop-PocWorker

Redémarrage :

    Start-PocWorker

Commandes driver :

    Invoke-PocDriver start --runId <runId> --projectId <projectId> [--crash] [--failMode transient|permanent] [--budget 1]
    Invoke-PocDriver approve --runId <runId>
    Invoke-PocDriver wait --runId <hatchetRunId>
    Invoke-PocDriver timeout --runId <runId>
    Invoke-PocDriver status --runId <hatchetRunId>

## 7. Ledger

Tables POC : poc_run, poc_step, poc_effect, poc_approval, poc_cost.

Contraintes principales :

- PK poc_run(id) ;
- index unique partiel poc_run_one_active_per_project sur status running/waiting_approval ;
- PK poc_effect(idempotency_key) ;
- PK poc_approval(run_id) ;
- PK poc_cost(idempotency_key).

Le schéma est créé automatiquement par seedSchema au démarrage du worker/driver.

## 8. Ressources mesurées

Mesure approximative pendant les expériences :

- worker Node : environ 164 MB RSS, quelques secondes CPU, 5 slots ;
- WSL2 : environ 604 MB utilisés, 4,9 GB disponibles sur 5,6 GB ;
- host Windows : 11,9 GB RAM, mémoire libre basse pendant les tests (~0,5 GB) ;
- sidecar + Postgres embedded : processus WSL hatchet/postgres.

Aucune mesure de coût fournisseur réelle : tout est mock.

## 9. Arrêt et nettoyage

    Stop-PocWorker
    ./scripts/stop-proxy.ps1
    ./scripts/stop-sidecar.ps1

Ne pas supprimer .v1/hatchet-poc-pg sans décision explicite : il contient les preuves. Ne pas formater le disque Docker WSL.

## 10. Limites opérationnelles

- L'environnement Windows/WSL est spécifique ; la reproduction sur Linux/macOS doit utiliser le Docker Compose fourni.
- Le sidecar embedded n'est pas un service système.
- Le proxy TCP est local, non authentifié au-delà du token Hatchet.
- Le worker n'est pas supervisé ; les expériences le tuent volontairement.
- Aucun secret n'est écrit dans les logs ou docs.
