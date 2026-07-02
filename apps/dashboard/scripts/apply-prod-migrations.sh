#!/usr/bin/env bash
# One-shot prod migration applier for the Almond Logic worksheet build. Absolute paths throughout so
# it works from any directory. Usage:
#   bash /Users/kamransalahuddin/Lavinia/apps/dashboard/scripts/apply-prod-migrations.sh "$U"
# where $U is the prod Postgres URL (use the Supabase SESSION POOLER url, host *.pooler.supabase.com:5432).
set -euo pipefail

DIR="/Users/kamransalahuddin/Lavinia/apps/dashboard"
URL="${1:-${U:-}}"

if [ -z "$URL" ]; then
  echo "ERROR: no database URL. Run:  bash $DIR/scripts/apply-prod-migrations.sh \"\$U\""
  exit 1
fi
case "$URL" in
  postgres*://*) : ;;
  *) echo "ERROR: that does not look like a postgres URL: $URL"; exit 1 ;;
esac

cd "$DIR"

echo "==> [1/2] worksheet spine (Block.entityId, BlockPlanting, CropRun, TgmRecord + RLS + TGM CHECK)"
DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$URL" \
  npx --yes prisma db execute --url "$URL" \
  --file "$DIR/prisma/migrations/20260701140000_worksheet_spine/migration.sql"

echo "==> [2/2] inventory (InventoryItem + RLS + stage/source CHECKs)"
DATABASE_URL="$URL" DATABASE_URL_UNPOOLED="$URL" \
  npx --yes prisma db execute --url "$URL" \
  --file "$DIR/prisma/migrations/20260701160000_inventory/migration.sql"

echo "==> DONE. Both migrations applied to prod."
