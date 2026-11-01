#!/bin/bash
set -euo pipefail

# Le sidecar embedded ecoute uniquement sur 127.0.0.1 dans son conteneur.
# socat expose ses ports sur le reseau Docker (17077 gRPC, 18243 API) pour que
# l'API et le worker puissent s'y connecter sans partager son namespace.
mkdir -p /data/pg
chown -R hatchet:hatchet /data

socat TCP-LISTEN:17077,fork,reuseaddr TCP:127.0.0.1:7077 &
socat TCP-LISTEN:18243,fork,reuseaddr TCP:127.0.0.1:28243 &

ARGS="-api-port 28243 -grpc-port 7077 -postgres-data-dir /data/pg -handshake-file /data/handshake.json -log-level info"
if [ -n "${HATCHET_DATABASE_URL:-}" ]; then
  ARGS="$ARGS -database-url '${HATCHET_DATABASE_URL}'"
fi

exec su hatchet -s /bin/bash -c "sleep infinity | /usr/local/bin/hatchet-embedded-sidecar $ARGS"
