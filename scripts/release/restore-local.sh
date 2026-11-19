#!/usr/bin/env bash
# Isolated rehearsal only; createdb must succeed (never restore over an existing DB).
set -euo pipefail
umask 077
src=$(realpath -e "${1:?trusted backup directory}"); dest=${2:?new media directory}
: "${RESTORE_DB:?new disposable database name required}"
[[ $RESTORE_DB =~ ^restore_[a-z0-9_]+$ ]]
(cd "$src" && sha256sum -c SHA256SUMS)
mkdir -- "$dest"
createdb "$RESTORE_DB"
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$RESTORE_DB" "$src/database.dump"
tar --no-same-owner -C "$dest" -xf "$src/media.tar"
psql -X -v ON_ERROR_STOP=1 -d "$RESTORE_DB" -c 'TABLE "BillingControl"'
