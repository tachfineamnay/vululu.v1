#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vululu — recette PostgreSQL 16 reproductible en sandbox Linux
#
# Pourquoi ce script existe :
#   aucune distribution ne fournit PostgreSQL dans la sandbox Arena (apt
#   inutilisable, pas de Docker). Le wheel PyPI `pgserver` embarque une
#   installation PostgreSQL complète et portable. On monte un cluster local
#   sur le port 55432, EXACTEMENT celui qu'attendent package.json, ci.yml et
#   envPolicy.
#
# Garanties :
#   - aucune base de production n'est contactée (bind 127.0.0.1 uniquement) ;
#   - SQLite n'est jamais utilisé comme substitut (provider = postgresql) ;
#   - idempotent : ne recrée pas un cluster déjà initialisé ;
#   - le cluster vit hors du dépôt (~/.local/pgdata) : rien n'est versionné.
#
# Usage :
#   scripts/arena/pg16-local.sh start     # démarre le cluster (défaut)
#   scripts/arena/pg16-local.sh stop
#   scripts/arena/pg16-local.sh status
#   scripts/arena/pg16-local.sh migrate   # applique les 19 migrations SQL
#   scripts/arena/pg16-local.sh psql      # ouvre psql sur vululu_v1_00_test
# ---------------------------------------------------------------------------
set -euo pipefail

PG_PORT="${PG_PORT:-55432}"
PG_USER="${PG_USER:-vululu}"
PGDATA="${HOME}/.local/pgdata"
PGRUN="${HOME}/.local/pgrun"
PGLOG="${HOME}/.local/pg.log"
VENV="${HOME}/.venv-pg"
DATABASES=(vululu_v1_00 vululu_v1_00_test)

log() { printf '[pg16] %s\n' "$*"; }

ensure_pgserver() {
  if [ -x "${VENV}/bin/python" ] && "${VENV}/bin/python" -c 'import pgserver' >/dev/null 2>&1; then
    return 0
  fi
  log "installation de pgserver dans ${VENV} (PyPI)"
  python3 -m venv "${VENV}"
  "${VENV}/bin/pip" install --quiet --no-cache-dir pgserver
}

PGBIN_PATH() {
  local base
  base="$("${VENV}/bin/python" -c 'import pgserver, os; print(os.path.dirname(pgserver.__file__))')"
  printf '%s/pginstall/bin' "${base}"
}

case "${1:-start}" in
  start)
    ensure_pgserver
    PGBIN="$(PGBIN_PATH)"
    mkdir -p "${PGRUN}"
    if [ ! -s "${PGDATA}/PG_VERSION" ]; then
      log "initdb dans ${PGDATA}"
      mkdir -p "${PGDATA}"
      "${PGBIN}/initdb" -D "${PGDATA}" -U "${PG_USER}" --auth=trust -E UTF8 >/dev/null
    fi
    if "${PGBIN}/pg_isready" -h 127.0.0.1 -p "${PG_PORT}" >/dev/null 2>&1; then
      log "cluster déjà démarré sur 127.0.0.1:${PG_PORT}"
    else
      "${PGBIN}/pg_ctl" -D "${PGDATA}" -l "${PGLOG}" \
        -o "-p ${PG_PORT} -k ${PGRUN} -h 127.0.0.1" start >/dev/null
      for _ in $(seq 1 40); do
        "${PGBIN}/pg_isready" -h 127.0.0.1 -p "${PG_PORT}" >/dev/null 2>&1 && break
        sleep 0.25
      done
    fi
    for db in "${DATABASES[@]}"; do
      if ! "${PGBIN}/psql" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d postgres -tAc \
           "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
        "${PGBIN}/createdb" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" "${db}"
        log "base créée : ${db}"
      fi
    done
    log "prêt : postgresql://${PG_USER}@127.0.0.1:${PG_PORT}/vululu_v1_00_test?schema=public"
    ;;
  stop)
    PGBIN="$(PGBIN_PATH)"
    "${PGBIN}/pg_ctl" -D "${PGDATA}" stop -m fast >/dev/null 2>&1 || log "cluster déjà arrêté"
    log "arrêté"
    ;;
  status)
    PGBIN="$(PGBIN_PATH)"
    "${PGBIN}/pg_isready" -h 127.0.0.1 -p "${PG_PORT}" || exit 1
    "${PGBIN}/psql" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d vululu_v1_00_test \
      -tAc "SELECT 'tables=' || count(*) FROM information_schema.tables WHERE table_schema='public'"
    ;;
  migrate)
    PGBIN="$(PGBIN_PATH)"
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    # Les migrations sont rejouées dans l'ordre lexicographique, comme le fait
    # `prisma migrate deploy`. ON_ERROR_STOP rend l'échec bloquant.
    applied=0
    for dir in $(ls -d "${root}"/packages/db/prisma/migrations/*/ | sort); do
      name="$(basename "${dir}")"
      if "${PGBIN}/psql" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" \
           -d vululu_v1_00_test -v ON_ERROR_STOP=1 -q -f "${dir}/migration.sql" >/dev/null 2>&1; then
        applied=$((applied + 1))
      else
        log "ÉCHEC migration ${name}"
        exit 1
      fi
    done
    log "migrations appliquées : ${applied}"
    log "tables : $("${PGBIN}/psql" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d vululu_v1_00_test -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
    ;;
  psql)
    PGBIN="$(PGBIN_PATH)"
    exec "${PGBIN}/psql" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d vululu_v1_00_test
    ;;
  *)
    log "action inconnue : $1 (start|stop|status|migrate|psql)"
    exit 1
    ;;
esac
