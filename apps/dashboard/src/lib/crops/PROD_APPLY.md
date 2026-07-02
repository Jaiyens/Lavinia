# Prod apply runbook — Gagan's worksheet build (Kamran runs these)

Prod DB writes are gated to you. The assistant prepares + verifies; you run. `prisma migrate deploy`
would drift on prod (the pgvector / GenerationJob history), so apply the additive SQL **by hand** with
`prisma db execute` against the **unpooled** URL, exactly as the earlier crop migrations were applied.

Get the prod connection string from Supabase (the "Database URL unpooled" one). Then, from
`apps/dashboard`:

```bash
read -r "U?Paste prod DB URL (unpooled): "
```

## 1. Worksheet spine (Phase 2) — additive tables + RLS + TGM CHECK

Block.entityId, BlockPlanting, CropRun, TgmRecord (+ RLS on the three new tables + the
`TgmRecord_source_customer_sourced` CHECK). Idempotent (IF NOT EXISTS / DROP ... IF EXISTS).

```bash
DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" \
  npx prisma db execute --url "$U" \
  --file prisma/migrations/20260701140000_worksheet_spine/migration.sql
```

## 2. Inventory (Phase 6) — InventoryItem + RLS + stage/source CHECKs

```bash
DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" \
  npx prisma db execute --url "$U" \
  --file prisma/migrations/20260701160000_inventory/migration.sql
```

## 3. Seed the Batth spine from the master CSV

The committed fixture (`fixtures/batth-worksheet-2025.csv`) is a representative slice (7 blocks). For
the FULL spine, drop Gagan's real `CARUTHERS Almond Production(25).csv` somewhere and point the seed at
it with `BATTH_WORKSHEET_CSV`. The seed is idempotent and **find-or-create** for TGM (it never clobbers
a real statement figure that has superseded a seed row), and it backfills `Block.acreage`.

```bash
# full CSV:
BATTH_WORKSHEET_CSV=/path/to/CARUTHERS_Almond_Production_25.csv \
  DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" \
  npx tsx scripts/seed-batth-worksheet.ts
# or the committed slice: omit BATTH_WORKSHEET_CSV.
```

Expected: `seeded N entities, M blocks, K plantings, T TGM rows ... persisted R huller runs`.

## 4. Verify (as any signed-in Batth operator)

- `/almondlogic` renders the worksheet grouped Entity→Block→Variety; block 1 Nonpareil shows field
  weight 631,700, huller 109,388, turnout ~17.3%, good meats 108,652, Settled badge.
- `/almondlogic/{tgm,inventory,sales,yoy}` load; the manual forms save (manager role).

## Not done here — data onboarding (see README "Open data-onboarding items")

- Map the ~221 PG&E meters to worksheet blocks (pump↔block links) for per-block cost/lb.
- Confirm which crop year holds reconciled PG&E billing (energyCents is 0 for the 2025 window).

## Note

The 8-table crop RLS (`prod-rls.sql`) was applied in the earlier follow-ups work; steps 1–2 above add
RLS for the four NEW tables only. Nothing here deploys code — push `main` to redeploy the app.
