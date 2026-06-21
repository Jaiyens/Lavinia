# Render the real Batth data on the dashboard

This wires the real Batth export (`fixtures/batth-real-meters.json`, 186 meters across
57 PG&E accounts / 7 billing-entity owners) into a farm the dashboard can render, using
the SAME `importMeters` ingestion path the live PG&E connect uses. Nothing here is
committed; it lives in the worktree.

## What was wired

- **`prisma/batth-real-farm.ts`** — `seedBatthRealFarm(prisma)`:
  1. Creates a farm (`isDemo: true`, name `Batth Farms`) with an active `pge_smd` connection.
  2. Lands the 186 meters / 57 accounts / 46 billed cycles through **`importMeters`**
     (`src/lib/greenbutton/import.ts`) — the exact path Green Button / UtilityAPI use.
     `importMeters` consumes only `serviceId / tariff / summaries / intervals`.
  3. Applies the per-meter non-`NormalizedMeter` `meta` block (map pins lat/long, ranch,
     entity, crop, status, GPM, NEM type, true-up month + amount, solar) onto the landed
     pumps, and builds the two real `SolarArray` rows so the Map / Table / Solar lenses render.
- **`prisma/seed.ts`** — hooked behind `SEED_BATTH_REAL=1`. With the flag set, the runnable
  seed lands the real farm instead of the synthetic representative demo, then runs the
  recommendation engine over it.
- **`fixtures/batth-real-meters.json`** — copied into the worktree (this worktree's HEAD
  predates the fixture; it is present in the main tree).

### Ground truth honored
- Solar arrays total **1,932 kW (840 + 1,092)** — built from the two `840kw` / `1092kw`
  labels, NOT 12,180 kW.
- The 46 billed meters (account `4699664587-8`) carry real printed dollars; the rest are
  map/metadata-only (empty `summaries`) until their billing lands.
- `intervals` are empty everywhere, so the interval-driven rate-optimization levers honestly
  no-op; only the bill-level signals (demand exposure, bill anomaly) are provable today.

## Render steps (DB was DOWN when this was wired — run these in order)

All commands from the repo root unless noted. The dashboard runs on **port 3001**.

1. **Start the database** (local Postgres on `localhost:5432`). Verify it is up:
   ```sh
   (exec 3<>/dev/tcp/localhost/5432) 2>/dev/null && echo DB_UP || echo DB_DOWN
   ```
   Ensure `apps/dashboard/.env.local` has `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED`) pointing
   at it. If the schema has never been pushed to this DB, push it first:
   ```sh
   npm run db:push -w @lavinia/dashboard
   ```

2. **Seed the real Batth farm** (the env flag selects the real path over the synthetic demo):
   ```sh
   SEED_BATTH_REAL=1 npm run db:seed -w @lavinia/dashboard
   ```
   Expected log: `Seeded REAL Batth Farms (account 4699664587-8): 186 meters, 7 entities,
   57 accounts, 36 ranches, 2 solar arrays, 46 billing periods (...) .`

3. **Start the dashboard**:
   ```sh
   npm run dev:dashboard
   ```

4. **Open the farm.** It is seeded as the badged representative-data farm, so it resolves
   through `demoFarm` (newest `isDemo` farm). Open the public tour, which pins to it with no
   auth:
   - Home (calendar / map / meters at a glance): **http://localhost:3001/tour**
   - Energy (table + chart + meter drawer): **http://localhost:3001/tour/energy**
   - Solar (the two arrays, NEM, true-ups): **http://localhost:3001/tour/solar**

## Verify it seeded (DB up)

Count landed rows for the seeded farm (a quick Prisma count):

```sh
cd apps/dashboard && npx tsx -e '
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const farm = await p.farm.findFirst({ where: { isDemo: true, name: "Batth Farms" }, orderBy: { createdAt: "desc" } });
if (!farm) { console.log("no Batth Farms seeded"); process.exit(1); }
const [pumps, accounts, entities, ranches, arrays, periods, billed] = await Promise.all([
  p.pump.count({ where: { farmId: farm.id } }),
  p.account.count({ where: { farmId: farm.id } }),
  p.entity.count({ where: { farmId: farm.id } }),
  p.ranch.count({ where: { farmId: farm.id } }),
  p.solarArray.count({ where: { farmId: farm.id } }),
  p.billingPeriod.count({ where: { pump: { farmId: farm.id } } }),
  p.pump.count({ where: { farmId: farm.id, coverageState: "reconciled" } }),
]);
console.log({ farm: farm.id, pumps, accounts, entities, ranches, arrays, periods, billed });
await p.$disconnect();
'
```

Expected (matches the fixture): `pumps: 186, accounts: 57, entities: 7, ranches: 36,
arrays: 2, periods: 46, billed (reconciled): 46`.

## Render it as a REAL connected farm (optional, not the demo badge)

To show it on the authenticated dashboard (`/`, no representative badge) instead of `/tour`,
edit `seedBatthRealFarm` in `prisma/batth-real-farm.ts`: set `isDemo: false` on the
`farm.create`, and set `userId` to the signed-in user's id (resolve it by email from the
`User` table). `dashboardFarm` then resolves it for that owner via `Farm.userId`. Left as
`isDemo: true` by default so it is click-testable at `/tour` with zero auth.

## Status when wired
- DB: **DOWN** (`localhost:5432` not listening) — seed NOT run; wiring + typecheck only.
- `npm run typecheck -w @lavinia/dashboard`: **clean** (exit 0).
