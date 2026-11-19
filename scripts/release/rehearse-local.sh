#!/usr/bin/env bash
# Run against a DISPOSABLE local PostgreSQL cluster, as a role with CREATEDB.
set -euo pipefail
umask 077
case ${PGHOST:-} in 127.0.0.1|localhost|/tmp) ;; *) echo 'Local disposable cluster required' >&2; exit 2;; esac
unset PGSERVICE PGSERVICEFILE
root=$(cd -- "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d); suffix="$(date +%s)_$$"; export PGDATABASE="c13_test_$suffix" RESTORE_DB="restore_$suffix"
createdb "$PGDATABASE"
trap 'rm -rf -- "$work"; dropdb --if-exists "$PGDATABASE"' EXIT
for f in "$root"/packages/db/prisma/migrations/*/migration.sql; do
  psql -Xq -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
mkdir "$work/media"; printf 'offline-media-canary\n' >"$work/media/canary"
WRITES_STOPPED=yes MEDIA_DIR="$work/media" "$root/scripts/release/backup-local.sh" "$work/archive"
"$root/scripts/release/restore-local.sh" "$work/archive" "$work/restored"
cmp "$work/media/canary" "$work/restored/canary"
dropdb "$RESTORE_DB"
