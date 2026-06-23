#!/usr/bin/env bash
# Dump the loaded local `terra_batth` database to a single compressed, custom-format file.
#
# Why: the Batth Farms dataset (~6.75M interval rows + bills) takes a ~5-minute, 6GB-RAM run of
# scripts/load-batth-full.ts to build. This is the TURNKEY alternative: dump it once, share the file,
# and collaborators restore it in one step (scripts/db-restore-batth.sh) with no loader run. Re-dumping
# as the dataset grows (e.g. when more bills land) is just re-running this script.
#
# Run:   npm run db:dump:batth -w @lavinia/dashboard
# or:    bash apps/dashboard/scripts/db-dump-batth.sh
#
# DB connection: defaults to postgresql://$USER@127.0.0.1:5432/terra_batth.
# Override with: BATTH_DATABASE_URL=... bash scripts/db-dump-batth.sh
set -euo pipefail

# Resolve the local terra_batth connection (overridable via env).
BATTH_DATABASE_URL="${BATTH_DATABASE_URL:-postgresql://${USER}@127.0.0.1:5432/terra_batth}"

# Resolve repo root portably from this script's location (scripts/ -> apps/dashboard -> repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DUMP_DIR="${REPO_ROOT}/dumps"

# Fail fast if pg_dump is missing.
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found on PATH. Install the Postgres client tools (e.g. 'brew install postgresql')." >&2
  exit 1
fi

# Verify the source database is reachable before we start.
if ! psql "${BATTH_DATABASE_URL}" -c '\q' >/dev/null 2>&1; then
  echo "ERROR: cannot connect to terra_batth." >&2
  echo "  Tried: ${BATTH_DATABASE_URL}" >&2
  echo "  Is local Postgres running and does the terra_batth database exist?" >&2
  echo "  Override the connection with BATTH_DATABASE_URL=... if it differs." >&2
  exit 1
fi

mkdir -p "${DUMP_DIR}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${DUMP_DIR}/terra_batth-${TIMESTAMP}.dump"

echo "Dumping terra_batth -> ${DUMP_FILE}"
echo "  source: ${BATTH_DATABASE_URL}"
echo "  This can take a few minutes for the full dataset..."

# Custom format (-Fc) is compressed and restores with pg_restore. --no-owner/--no-privileges keep it
# portable across collaborators' local roles.
pg_dump -Fc --no-owner --no-privileges -f "${DUMP_FILE}" "${BATTH_DATABASE_URL}"

# Human-readable size (BSD/macOS and GNU du both support -h).
DUMP_SIZE="$(du -h "${DUMP_FILE}" | cut -f1)"

echo ""
echo "Done. Wrote dump:"
echo "  path: ${DUMP_FILE}"
echo "  size: ${DUMP_SIZE}"
echo ""
echo "NEXT STEP: Upload this file to the shared store (Vercel Blob / Google Drive / S3) and share the"
echo "link with collaborators. Do NOT commit it to git (too large). Collaborators restore it with:"
echo "  npm run db:restore:batth -w @lavinia/dashboard -- '${DUMP_FILE}'"
