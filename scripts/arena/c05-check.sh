#!/usr/bin/env bash
# Native PostgreSQL/Prisma qualification on a disposable, already-created local database.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL_TEST:?Set a disposable localhost PostgreSQL URL ending in _test}"
node -e 'const u=new URL(process.env.DATABASE_URL_TEST);if(!["postgres:","postgresql:"].includes(u.protocol)||!["localhost","127.0.0.1"].includes(u.hostname)||!/^\/[A-Za-z0-9_]+_test$/.test(u.pathname)||[...u.searchParams].length)process.exit(1)'
export DATABASE_URL="$DATABASE_URL_TEST" APP_ENV=test V0_TEST_DB=1 ARTIFACT_STORAGE_BACKEND=local DURABLE_SEED_AGENT=0
export SESSION_SECRET="$(node -e 'console.log(require("crypto").randomUUID())')"
work=$(mktemp -d); export ARTIFACT_DIR="$work/artifacts"; worker=''
cleanup(){ if [[ -n "$worker" ]]; then kill "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true; fi; rm -rf "$work"; }; trap cleanup EXIT
pnpm --filter @vululu/db exec prisma generate
pnpm --filter @vululu/db exec prisma migrate deploy
C05_HATCHET_TEST=0 pnpm exec vitest run tests/v1/execution-broker.test.ts
if [[ "${1:-}" == --hatchet ]]; then
  : "${HATCHET_CLIENT_TOKEN:?Supply the token from your disposable local Hatchet engine, never print it}"
  export HATCHET_CLIENT_HOST_PORT=127.0.0.1:7077 HATCHET_CLIENT_API_URL=http://127.0.0.1:28243 HATCHET_CLIENT_TLS_STRATEGY=none
  node --import tsx apps/api/src/worker/main.ts >"$work/worker.log" 2>&1 & worker=$!
  C05_HATCHET_TEST=1 pnpm exec vitest run tests/v1/execution-broker.test.ts -t 'real Hatchet'
fi
