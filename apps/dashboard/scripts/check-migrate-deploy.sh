#!/usr/bin/env bash
# Assert that `prisma migrate deploy` reproduces the schema EXACTLY on a fresh, empty Postgres.
#
# Why: this project ships schema with `prisma db push`, so it is easy for the migrations/ folder
# to drift from prisma/schema.prisma without anyone noticing - until a re-provision or disaster
# recovery runs `migrate deploy` against an empty DB and it fails or lands a stale schema. This
# spins up a throwaway local cluster, applies the migrations from empty, and diffs the result
# against the schema. Exit 0 = in sync. Non-zero = drift (add a migration for the schema change).
#
# Run locally: npm run db:migrate:check -w @lavinia/dashboard
# In CI: add a step that runs this after `npm ci` (needs the postgres client tools on PATH).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

PGDATA="$(mktemp -d "${TMPDIR:-/tmp}/terra-migcheck-XXXXXX")"
PORT="${MIGCHECK_PORT:-54399}"
cleanup() { pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT

echo "==> initdb ($PGDATA)"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null 2>&1
echo "==> start postgres on :$PORT"
pg_ctl -D "$PGDATA" -o "-p $PORT -k $PGDATA -c listen_addresses=''" -l "$PGDATA/server.log" start >/dev/null 2>&1
# Wait for readiness.
for _ in $(seq 1 30); do pg_isready -h "$PGDATA" -p "$PORT" >/dev/null 2>&1 && break; sleep 0.5; done

URL="postgresql://postgres@localhost:$PORT/postgres?host=$PGDATA"
export DATABASE_URL="$URL"
export DATABASE_URL_UNPOOLED="$URL"

echo "==> prisma migrate deploy (empty DB)"
npx prisma migrate deploy

echo "==> prisma migrate diff (deployed DB -> schema datamodel)"
if npx prisma migrate diff --from-url "$URL" --to-schema-datamodel prisma/schema.prisma --exit-code; then
  echo "✅ migrate deploy reproduces the schema exactly (no drift)."
else
  echo "❌ DRIFT: migrate deploy does not reproduce prisma/schema.prisma."
  echo "   Add a migration for the schema change (npm run db:migrate:dev -- --name <change>)."
  exit 1
fi

echo "==> assert raw-SQL indexes exist (migrate diff is BLIND to functional/partial indexes)"
# These two indexes cannot be expressed in Prisma's DSL, so the drift check above provably
# cannot see them - they have to be asserted directly against the deployed DB.
REQUIRED_INDEXES="User_email_lower_key FarmInvite_farmId_invitedEmail_pending_key"
missing=""
for idx in $REQUIRED_INDEXES; do
  found="$(psql "$URL" -tAc "SELECT 1 FROM pg_indexes WHERE indexname = '$idx'")"
  if [ "$found" != "1" ]; then missing="$missing $idx"; fi
done
if [ -n "$missing" ]; then
  echo "❌ MISSING raw-SQL index(es) after deploy:$missing"
  echo "   These are hand-authored in 0_init/migration.sql; migrate diff cannot detect them."
  exit 1
fi
echo "✅ raw-SQL indexes present: $REQUIRED_INDEXES"
