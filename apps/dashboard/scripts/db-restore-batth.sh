#!/usr/bin/env bash
# Restore a `terra_batth` Postgres dump (produced by scripts/db-dump-batth.sh) into a local database.
#
# Why: the TURNKEY way for a collaborator to get the full Batth Farms dataset (~6.75M interval rows +
# bills) locally without the ~5-minute, 6GB-RAM run of scripts/load-batth-full.ts. Idempotent: safe to
# re-run (it cleans existing objects with --clean --if-exists before restoring).
#
# Run:   npm run db:restore:batth -w @lavinia/dashboard -- /path/to/terra_batth-YYYYMMDD-HHMMSS.dump
# or:    bash apps/dashboard/scripts/db-restore-batth.sh /path/to/terra_batth-YYYYMMDD-HHMMSS.dump
#
# DB connection: defaults to postgresql://$USER@127.0.0.1:5432/terra_batth.
# Override with: BATTH_DATABASE_URL=... bash scripts/db-restore-batth.sh <dump>
set -euo pipefail

DUMP_FILE="${1:-}"

if [[ -z "${DUMP_FILE}" ]]; then
  echo "ERROR: missing dump file argument." >&2
  echo "Usage: bash apps/dashboard/scripts/db-restore-batth.sh <path-to-dump-file>" >&2
  echo "   or: npm run db:restore:batth -w @lavinia/dashboard -- <path-to-dump-file>" >&2
  exit 1
fi

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "ERROR: dump file not found: ${DUMP_FILE}" >&2
  exit 1
fi

# Resolve the local terra_batth connection (overridable via env).
BATTH_DATABASE_URL="${BATTH_DATABASE_URL:-postgresql://${USER}@127.0.0.1:5432/terra_batth}"
DB_NAME="terra_batth"

# Fail fast if the Postgres client tools are missing.
for tool in pg_restore createdb psql; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: ${tool} not found on PATH. Install the Postgres client tools (e.g. 'brew install postgresql')." >&2
    exit 1
  fi
done

echo "Restoring ${DB_NAME} from: ${DUMP_FILE}"
echo "  target: ${BATTH_DATABASE_URL}"

# Create the database if it does not already exist. Derive an admin connection (to the default
# 'postgres' database) by swapping the db name in the URL, so createdb works even on a fresh machine.
ADMIN_URL="${BATTH_DATABASE_URL%/${DB_NAME}}/postgres"
if psql "${BATTH_DATABASE_URL}" -c '\q' >/dev/null 2>&1; then
  echo "  database ${DB_NAME} already exists; restoring into it (objects are cleaned first)."
else
  echo "  database ${DB_NAME} not found; creating it."
  # Ignore "already exists" in case of a race; surface other createdb failures.
  if ! createdb -d "${ADMIN_URL}" "${DB_NAME}" 2>/tmp/batth-createdb-err; then
    if grep -qi "already exists" /tmp/batth-createdb-err; then
      echo "  (createdb reported it already exists; continuing.)"
    else
      cat /tmp/batth-createdb-err >&2
      rm -f /tmp/batth-createdb-err
      echo "ERROR: could not create ${DB_NAME}." >&2
      exit 1
    fi
  fi
  rm -f /tmp/batth-createdb-err
fi

# Restore. --clean --if-exists makes this idempotent; --no-owner/--no-privileges keep it portable
# across collaborators' local roles. pg_restore can emit benign "does not exist, skipping" notices on
# the first restore into a fresh db (the --clean drops nothing yet); those are not fatal.
echo "  restoring (this can take a few minutes for the full dataset)..."
pg_restore --clean --if-exists --no-owner --no-privileges -d "${BATTH_DATABASE_URL}" "${DUMP_FILE}"

echo ""
echo "Done. ${DB_NAME} restored."
echo ""
echo "NEXT STEPS:"
echo "  1. Point apps/dashboard/.env.local at this local database, e.g.:"
echo "       DATABASE_URL=\"${BATTH_DATABASE_URL}\""
echo "       DATABASE_URL_UNPOOLED=\"${BATTH_DATABASE_URL}\""
echo "  2. Run the dashboard (npm run dev:dashboard) and sign in as jaiyen_shetty@berkeley.edu"
echo "     to see the Batth Farms data."
