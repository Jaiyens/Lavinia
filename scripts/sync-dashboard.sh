#!/usr/bin/env bash
#
# Sync the Terra dashboard (the source of truth) into apps/dashboard for deploy.
#
# The dashboard is developed in the standalone Terra repo. This mirrors its app code into
# the monorepo's apps/dashboard (which Vercel builds and deploys to app.tryterra.ai),
# PRESERVING the few Lavinia-specific files:
#   - package.json        (name "@lavinia/dashboard", dev/start on port 3001)
#   - next.config.ts      (monorepo Turbopack root; no turbopack.root pin)
#   - .env / .env.* / .env.example   (Lavinia env, incl. ACCESS_ALLOWLIST)
#   - skills-lock.json    (local agent tooling)
# and skipping build artifacts (.next, .turbo, *.tsbuildinfo, *.db) and the repo's docs/meta
# (Terra is the source of truth for those; do not clobber the monorepo copies).
#
# Dry-run by DEFAULT: it prints what WOULD change. Pass --apply to actually write.
#
# Usage:
#   scripts/sync-dashboard.sh                 # dry run against ../Terra
#   scripts/sync-dashboard.sh --apply         # write the sync
#   scripts/sync-dashboard.sh --apply /path/to/Terra
#   TERRA_DIR=/path/to/Terra scripts/sync-dashboard.sh --apply
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$REPO_ROOT/apps/dashboard"

APPLY=0
TERRA_ARG="${TERRA_DIR:-}"
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 2 ;;
    *) TERRA_ARG="$arg" ;;
  esac
done
TERRA_ARG="${TERRA_ARG:-$REPO_ROOT/../Terra}"

SRC="$(cd "$TERRA_ARG" 2>/dev/null && pwd || true)"
if [ -z "$SRC" ] || [ ! -d "$SRC/src" ] || [ ! -f "$SRC/prisma/schema.prisma" ]; then
  echo "ERROR: Terra source not found at '$TERRA_ARG'." >&2
  echo "       Pass the path: scripts/sync-dashboard.sh --apply /path/to/Terra" >&2
  exit 1
fi

echo "Source (Terra):    $SRC"
echo "Dest (dashboard):  $DEST"
echo

# Syncing a dirty Terra tree is allowed (handy mid-work) but usually you want committed code.
if git -C "$SRC" rev-parse --git-dir >/dev/null 2>&1 && [ -n "$(git -C "$SRC" status --porcelain)" ]; then
  echo "WARNING: Terra has uncommitted changes; the working tree is synced as-is."
  echo
fi

EXCLUDES=(
  # version control + dependencies + build output
  --exclude '.git/'
  --exclude 'node_modules/'
  --exclude '.next/'
  --exclude '.turbo/'
  --exclude '.vercel/'
  --exclude '*.tsbuildinfo'
  --exclude '*.db'
  # Lavinia-specific files to PRESERVE (never overwrite or delete)
  --exclude '.env'
  --exclude '.env.*'
  --exclude 'package.json'
  --exclude 'package-lock.json'
  --exclude 'next.config.ts'
  --exclude 'skills-lock.json'
  # repo docs / agent meta (Terra owns these; do not clobber the monorepo copies)
  --exclude '.claude/'
  --exclude '.agents/'
  --exclude '_bmad/'
  --exclude '_bmad-output/'
  --exclude 'docs/'
  --exclude 'README.md'
  --exclude 'AGENTS.md'
  --exclude 'CLAUDE.md'
  --exclude 'spec.md'
  --exclude '*.pdf'
)

FLAGS=(-a --delete --human-readable --itemize-changes)
if [ "$APPLY" -eq 0 ]; then
  FLAGS+=(--dry-run)
  echo ">>> DRY RUN - no files written. Re-run with --apply to sync."
  echo "    (lines starting with > are copies, *deleting are removals)"
  echo
fi

rsync "${FLAGS[@]}" "${EXCLUDES[@]}" "$SRC"/ "$DEST"/

echo
# package.json is preserved, so a new/changed Terra dependency will NOT reach apps/dashboard
# automatically. Flag any drift so it can be reconciled by hand (rare).
node - "$SRC/package.json" "$DEST/package.json" <<'NODE'
const fs = require("fs");
const [,, a, b] = process.argv;
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } };
const merge = (o) => ({ ...(o.dependencies || {}), ...(o.devDependencies || {}) });
const T = merge(read(a)), D = merge(read(b));
const lines = [];
for (const k of Object.keys(T)) {
  if (!(k in D)) lines.push(`  + ${k}@${T[k]}  (Terra adds this; MISSING in apps/dashboard)`);
  else if (D[k] !== T[k]) lines.push(`  ~ ${k}: Terra ${T[k]} vs dashboard ${D[k]}`);
}
for (const k of Object.keys(D)) if (!(k in T)) lines.push(`  - ${k}@${D[k]}  (only in apps/dashboard)`);
if (lines.length) {
  console.log("DEPENDENCY DRIFT (package.json is preserved - reconcile apps/dashboard/package.json by hand):");
  console.log(lines.join("\n"));
} else {
  console.log("Dependencies match between Terra and apps/dashboard.");
}
NODE

echo
if [ "$APPLY" -eq 1 ]; then
  cat <<'EOF'
Synced. Next, from the Lavinia root:
  npm install                                          # if deps changed
  npm run typecheck && npm run build && npm run test   # turbo, must be green
  git add -A apps/dashboard && git commit -m "Sync dashboard from Terra"
  git push                                             # Vercel deploys app.tryterra.ai
EOF
else
  echo "Dry run complete. Re-run with --apply to write the changes."
fi
