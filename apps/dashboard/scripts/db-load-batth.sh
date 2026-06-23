#!/usr/bin/env bash
# One-command, idempotent loader for the real "Batth Farms" demo/dev dataset into a
# LOCAL Postgres database (terra_batth). Safe to re-run: it drops the prior Batth farm
# and reloads. Run from apps/dashboard:
#
#   bash scripts/db-load-batth.sh
#
# Reads (all committed in git): BatthData/*.csv, batth-ingestion/extracted/bills/*.json,
# batth-ingestion/dist/interval_aggregates.json. No slow data-collection step required.
#
# Override the DB target if you need a different local Postgres:
#   TERRA_BATTH_DATABASE_URL=postgresql://me@127.0.0.1:5432/terra_batth bash scripts/db-load-batth.sh
#
# Needs ~6GB RAM (the loader lands ~6.75M interval rows).

set -euo pipefail

# Resolve a local terra_batth connection string. Default to the current user @ localhost;
# allow a single override env var. Never points at a remote/prod DB (the loader also guards).
DB_USER="${PGUSER:-${USER:-postgres}}"
DEFAULT_URL="postgresql://${DB_USER}@127.0.0.1:5432/terra_batth"
TERRA_BATTH_DATABASE_URL="${TERRA_BATTH_DATABASE_URL:-$DEFAULT_URL}"

export DATABASE_URL="$TERRA_BATTH_DATABASE_URL"
export DATABASE_URL_UNPOOLED="$TERRA_BATTH_DATABASE_URL"

echo "[db-load-batth] target DB     : $DATABASE_URL"

# Fail fast with a helpful message if local Postgres isn't reachable.
if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "" >&2
  echo "[db-load-batth] ERROR: local Postgres is not running on 127.0.0.1:5432." >&2
  echo "  Start it first, e.g.:" >&2
  echo "    macOS (Homebrew): brew services start postgresql@16" >&2
  echo "    Postgres.app    : open it" >&2
  echo "    Docker          : docker run -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16" >&2
  echo "" >&2
  exit 1
fi

# Create the database if it does not already exist (ignore "already exists").
echo "[db-load-batth] ensuring database terra_batth exists ..."
if createdb -h 127.0.0.1 -p 5432 terra_batth 2>/dev/null; then
  echo "[db-load-batth]   created terra_batth"
else
  echo "[db-load-batth]   terra_batth already exists (ok)"
fi

# Apply the schema. Prefer migrate deploy; fall back to db push when the migration history
# can't be applied cleanly to a fresh DB (e.g. a later migration re-CREATEs a table that
# 0_init already created). db push reconciles the schema straight from schema.prisma.
# --accept-data-loss is safe here: this script is guarded to the local, disposable terra_batth
# dev DB only, and on a fresh or already-in-sync DB there is nothing to lose.
echo "[db-load-batth] applying Prisma schema (migrate deploy) ..."
if ! npx prisma migrate deploy; then
  echo "[db-load-batth]   migrate deploy failed; falling back to prisma db push ..."
  npx prisma db push --skip-generate --accept-data-loss
fi

# Run the loader with enough heap for ~6.75M rows.
echo "[db-load-batth] loading the Batth dataset (this takes a few minutes) ..."
NODE_OPTIONS=--max-old-space-size=6144 npx tsx scripts/load-batth-full.ts

echo "[db-load-batth] DONE. Point your local app at: $DATABASE_URL"
