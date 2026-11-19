#!/usr/bin/env bash
# Use PGHOST/PGPORT/PGUSER/PGDATABASE and a protected PGPASSFILE.
set -euo pipefail
umask 077
: "${PGDATABASE:?source database required}" "${MEDIA_DIR:?local artifact directory required}"
[[ ${WRITES_STOPPED:-} == yes && ${ARTIFACT_STORAGE_BACKEND:-local} == local ]] || { echo 'Stop all writers and select local storage first.' >&2; exit 2; }
media=$(realpath -e "$MEDIA_DIR"); out=$(realpath -m "${1:?new backup directory}")
[[ -d $media && $out != "$media" && $out != "$media/"* ]]
mkdir -- "$out" # never reuse or overwrite
pg_dump --format=custom --file="$out/database.dump"
tar -C "$media" -cf "$out/media.tar" .
(cd "$out" && sha256sum database.dump media.tar > SHA256SUMS)
