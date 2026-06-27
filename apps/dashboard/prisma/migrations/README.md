# Prisma migrations

This project ships day-to-day schema with **`prisma db push`** (see `db:migrate` / `db:reset` in
`package.json`, and the test harness in `src/test/pg-harness.ts`, which pushes the schema into each
throwaway test database). Push is fast and fine for local dev and tests.

The `migrations/` folder exists for the path push cannot serve: **`prisma migrate deploy` against a
fresh, empty database** (a re-provision, a region failover, disaster recovery, a brand-new
preview/prod DB). Before this baseline, `migrate deploy` on an empty DB **failed** — the only
migrations were incremental ones that referenced `Farm` / `User` before any migration created them.

## `0_init` (the baseline)

`0_init/migration.sql` is the **entire current schema as one `CREATE`**, generated with:

```bash
prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

It subsumes the three earlier incremental migrations (Almond reports, farm membership, Almond
conversation), whose tables are all in the baseline. A fresh DB only needs the final schema, so
those were removed.

Verify it still reproduces the schema exactly (CI-friendly; spins up a throwaway cluster):

```bash
npm run db:migrate:check -w @lavinia/dashboard   # ✅ "no drift" or ❌ exits non-zero
```

## Adopting this on the EXISTING prod / preview database (one-time)

The live Neon database already has every table (it was built with `db push`). Do **not** run
`migrate deploy` against it blindly — `0_init` would try to `CREATE` tables that already exist.
Instead, mark the baseline as already applied so Prisma's history matches reality:

```bash
# Against the live DATABASE_URL_UNPOOLED (direct endpoint, not the pooler):
prisma migrate resolve --applied 0_init
```

First confirm the live schema already matches `prisma/schema.prisma` (push the latest schema if
not — e.g. the new `Pump.confidence` column reaches prod the same way every column does, via
`npm run db:push`). After `migrate resolve`, future `migrate deploy` runs apply only NEW
migrations. If the live DB has no `_prisma_migrations` table yet (likely, since it used push),
`resolve` creates it.

### Also create the two raw-SQL indexes on prod (one-time)

`db push` only ever created the indexes expressible in `schema.prisma`. The two indexes that
must be **functional** / **partial** — and so live only as raw SQL in `0_init` — were therefore
**never created on the db-push'd prod DB**. `migrate resolve --applied 0_init` marks the baseline
applied without running it, so it will **not** create them either. Add them once, against the
direct (unpooled) endpoint, after checking nothing already collides:

```sql
-- Pre-checks (these must return no rows, or fix the data first):
SELECT lower(email), count(*) FROM "User" WHERE email IS NOT NULL
  GROUP BY lower(email) HAVING count(*) > 1;                       -- case-colliding emails
SELECT "farmId", "invitedEmail", count(*) FROM "FarmInvite" WHERE status = 'pending'
  GROUP BY "farmId", "invitedEmail" HAVING count(*) > 1;           -- duplicate pending invites

-- Then create the guards (idempotent):
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS "FarmInvite_farmId_invitedEmail_pending_key"
  ON "FarmInvite"("farmId", "invitedEmail") WHERE "status" = 'pending';
```

Until these exist on prod, the team-invite concurrency guard (`team-ops.ts`) and the
case-insensitive email-uniqueness guard are unenforced there.

### Also enable crop-ledger Row Level Security on prod (one-time)

`20260626120000_crop_ledger_rls/migration.sql` ends with an RLS block (`ENABLE`/`FORCE ROW LEVEL
SECURITY` + `CREATE POLICY`) on `ProductionRecord` / `CommitmentRecord` / `PoolRecord`. Like the
functional indexes above, **`db push` does NOT emit it**, so after the columns reach prod via push,
apply that block once against the direct (unpooled) endpoint. The app sets `app.current_farm_id`
per transaction via `withFarmTenant` (`src/lib/crops/tenant-db.ts`); confirm the app's DB role is
NOT a superuser and lacks `BYPASSRLS` (else the policy is silently bypassed). Until applied, these
tables fall back to the same application-level `farmId` scoping the rest of the app uses, so there
is no regression. Verified by `src/lib/crops/crop-rls.db.test.ts`.

## Going forward

- **New schema change:** edit `schema.prisma`, then either keep using `db push` (current norm) or
  create a migration with `npm run db:migrate:dev -- --name <change>` so the `migrate deploy` path
  stays complete. Run `npm run db:migrate:check` to confirm no drift.
- **Recovery / fresh DB:** `npm run db:migrate:deploy`.
