#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# BETA01 — vérification du fondement du gel commercial
#
# Prouve, sur la base PostgreSQL locale jetable, que :
#   1. commerce actif  -> un rendu sans pass est refusé (billing_plan_required) ;
#   2. commerce gelé   -> le même rendu passe et ne consomme aucun droit.
#
# Tout se déroule dans des transactions ANNULÉES : aucune ligne n'est laissée.
# Aucune base distante, aucun secret, aucun appel fournisseur.
#
# Usage :
#   bash scripts/arena/beta01-freeze-check.sh
# Variables optionnelles : PG_PORT (55432), PG_USER (vululu), PG_DB (vululu_v1_00_test)
# ---------------------------------------------------------------------------
set -euo pipefail

PG_PORT="${PG_PORT:-55432}"
PG_USER="${PG_USER:-vululu}"
PG_DB="${PG_DB:-vululu_v1_00_test}"

psql_bin() {
  if [ -x "${HOME}/.venv-pg/bin/python" ]; then
    local base
    base="$("${HOME}/.venv-pg/bin/python" -c 'import pgserver, os; print(os.path.dirname(pgserver.__file__))' 2>/dev/null)"
    if [ -n "${base}" ] && [ -x "${base}/pginstall/bin/psql" ]; then
      printf '%s/pginstall/bin/psql' "${base}"
      return 0
    fi
  fi
  command -v psql
}

PSQL="$(psql_bin)"
run() { "${PSQL}" -q -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" -tA "$@"; }

failures=0
check() {
  local label="$1" expected="$2" actual="$3"
  if printf '%s' "${actual}" | grep -q "${expected}"; then
    printf 'PASS  %s\n' "${label}"
  else
    printf 'FAIL  %s (attendu: %s / obtenu: %s)\n' "${label}" "${expected}" "${actual}"
    failures=$((failures + 1))
  fi
}

# --- Cas 1 : commerce actif, rendu refusé ----------------------------------
case1="$(
  "${PSQL}" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" 2>&1 <<'SQL'
BEGIN;
INSERT INTO "User"(id,email,"passwordHash",name,role) VALUES ('beta01-sql-user','beta01-sql@fixture.test','x','SQL fixture','user');
INSERT INTO "BrandContext"(id,"userId",name,description,"updatedAt") VALUES ('beta01-sql-ctx','beta01-sql-user','SQL','fixture',now());
INSERT INTO "Project"(id,"userId","contextId",title,platform,format,objective,"updatedAt") VALUES ('beta01-sql-proj','beta01-sql-user','beta01-sql-ctx','SQL','Instagram','Affiche','fixture',now());
INSERT INTO "CreativeRevision"("projectId",version,spec) VALUES ('beta01-sql-proj',1,'{}');
UPDATE "BillingControl" SET enabled=true WHERE id='commercial';
INSERT INTO "StudioRender"(id,"projectId",revision,state) VALUES ('beta01-sql-render-1','beta01-sql-proj',1,'running');
ROLLBACK;
SQL
)" || true
check "commerce actif : rendu refusé sans pass" "billing_plan_required" "${case1}"

# --- Cas 2 : commerce gelé, rendu accepté, aucun droit consommé ------------
case2="$(
  "${PSQL}" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" -tA 2>&1 <<'SQL'
BEGIN;
INSERT INTO "User"(id,email,"passwordHash",name,role) VALUES ('beta01-sql-user','beta01-sql@fixture.test','x','SQL fixture','user');
INSERT INTO "BrandContext"(id,"userId",name,description,"updatedAt") VALUES ('beta01-sql-ctx','beta01-sql-user','SQL','fixture',now());
INSERT INTO "Project"(id,"userId","contextId",title,platform,format,objective,"updatedAt") VALUES ('beta01-sql-proj','beta01-sql-user','beta01-sql-ctx','SQL','Instagram','Affiche','fixture',now());
INSERT INTO "CreativeRevision"("projectId",version,spec) VALUES ('beta01-sql-proj',1,'{}');
UPDATE "BillingControl" SET enabled=false WHERE id='commercial';
INSERT INTO "StudioRender"(id,"projectId",revision,state) VALUES ('beta01-sql-render-2','beta01-sql-proj',1,'running');
UPDATE "StudioRender" SET state='succeeded' WHERE id='beta01-sql-render-2';
SELECT 'uses='||count(*)::text FROM "BillingUse" WHERE key='creative.render:beta01-sql-render-2';
ROLLBACK;
SQL
)" || true
check "commerce gelé : rendu accepté" "uses=0" "${case2}"

# --- Cas 3 : forme de l'audit de gel --------------------------------------
case3="$(
  "${PSQL}" -h 127.0.0.1 -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" -tA 2>&1 <<'SQL'
BEGIN;
INSERT INTO "AuditEvent"(id,action,"targetType","targetId",metadata)
VALUES ('beta01-audit-check','commerce.beta.frozen','commercial','commercial','{"source":"VULULU_BETA_MODE","beta":true}'::jsonb);
SELECT action||'|'||coalesce("targetId",'') FROM "AuditEvent" WHERE id='beta01-audit-check';
ROLLBACK;
SQL
)" || true
check "audit commerce.beta.frozen enregistrable" "commerce.beta.frozen|commercial" "${case3}"

if [ "${failures}" -ne 0 ]; then
  printf '\n%d vérification(s) en échec.\n' "${failures}"
  exit 1
fi
printf '\nBETA01 : gel commercial vérifié sur %s (transactions annulées).\n' "${PG_DB}"
