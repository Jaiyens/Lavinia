# Batth Farms demo dataset: collaborator setup

A practical, copy-paste guide for getting the "Batth Farms" demo dataset running on your
own machine. Read top to bottom the first time; after that you will mostly live in
the "Two ways to get it locally" section.

## What this is

"Batth Farms" is our real demo / dev dataset: a large PG&E dataset for one grower, loaded
into a local farm so we can build and demo against real-shaped data.

- Owner email: `jaiyen_shetty@berkeley.edu`
- Farm name: `Batth Farms`
- Scale: roughly 6.75M interval rows plus reconciled bills for the billed accounts.

It is a **local dev / demo fixture only**. It does **not** live on production (app.tryterra.ai,
the Neon database) and it should never be loaded there. Real customers self-onboard through the
live UtilityAPI connect flow in the app, so prod stays clean and small. This dataset exists only
so the two of us can develop and demo locally without each re-doing the original data collection.

## Prerequisites

Before you start, make sure you have:

- **Local Postgres running** (on `127.0.0.1:5432`). Any local Postgres is fine; the loader
  creates and writes a database named `terra_batth`.
- **Node** at the repo's pinned version. Run `nvm use` at the repo root (`.nvmrc` pins Node 24),
  then `npm install` at the root once so every workspace is installed.
- **A fresh `git pull`** of this repo. The pull gives you everything the loader needs that lives
  in git:
  - `BatthData/*.csv` (the raw PG&E interval exports), and
  - the small ingestion artifacts under `batth-ingestion/extracted/bills/*.json` (OCR'd bills) and
    `batth-ingestion/dist/interval_aggregates.json`.
- **About 6GB of free RAM** if you use the loader path (Path A). The restore path (Path B) does
  not need this.

## Two ways to get it locally

Pick one. Path B is faster if a teammate has already produced and shared a dump; Path A always
works from what is in git.

### Path A: run the loader (works from a fresh git pull)

Use this when you do **not** have a shared dump, or when the dataset has changed and you want to
rebuild from the committed CSVs plus artifacts.

```bash
npm run db:load:batth
```

This creates the local `terra_batth` database, applies the schema, and loads the farm from the
committed `BatthData/*.csv` plus the `batth-ingestion/extracted/bills/` and
`batth-ingestion/dist/interval_aggregates.json` artifacts. It also computes modeled cost and runs
the finding engines, so the farm is fully populated when it finishes.

- Takes roughly 5 minutes.
- Needs about 6GB RAM (the command sets `NODE_OPTIONS=--max-old-space-size=6144` for you).
- It is idempotent and safe to re-run; it refuses to run against anything other than the local
  `terra_batth` database, so it cannot touch a remote or prod database.

### Path B: restore a shared dump (fastest, low RAM)

Use this when a teammate has already run the dump command and shared the resulting file. This is
a plain Postgres dump/restore, so it is fast and does not need the 6GB of loader RAM.

A teammate produces the dump with:

```bash
npm run db:dump:batth
```

You restore it with the path to the dump file they shared:

```bash
npm run db:restore:batth <dumpfile>
```

The dump file is large, so it is **not** shared through git. Get the link from our shared blob
store (Vercel Blob / Google Drive / S3). Look in the team channel pinned messages for the current
"Batth dump" link, or ask whoever last ran `npm run db:dump:batth` to drop the file there and post
the link.

## Point the app at it

Once `terra_batth` exists locally (via Path A or Path B), tell the dashboard to use it. In
`apps/dashboard/.env.local`, set both URLs to the local database:

```bash
DATABASE_URL="postgresql://panda@127.0.0.1:5432/terra_batth"
DATABASE_URL_UNPOOLED="postgresql://panda@127.0.0.1:5432/terra_batth"
```

Replace `panda` with your local Postgres user if it differs. Both lines point at the same local
database (locally there is no separate pooled endpoint).

Then start the dashboard:

```bash
npm run dev:dashboard
```

Open http://localhost:3001, sign in as `jaiyen_shetty@berkeley.edu`, and you will land on
"Batth Farms" as the owner with the full dataset behind it.

## When the dataset grows (adding bills or new data)

The founder is about to add roughly 55 more bills (taking us from about 5 to about 60 billed
accounts), and more raw data may land over time. The workflow when that happens:

1. Drop the new extracted bill JSON files into `batth-ingestion/extracted/bills/`, and add any new
   interval CSVs to `BatthData/`.
2. Re-run the loader. It automatically picks up **all** bills and CSVs in those directories, so
   there is nothing to edit in the script:

   ```bash
   npm run db:load:batth
   ```

3. Re-share so the other collaborator gets the new data, by either:
   - **Commit the updated small artifacts** (the bill JSONs and `interval_aggregates.json` live in
     git now), so a `git pull` plus a re-run of `npm run db:load:batth` rebuilds the new state; or
   - **Re-dump and re-share**: run `npm run db:dump:batth` and post the new dump link to the shared
     blob store. Collaborators then restore it with `npm run db:restore:batth <dumpfile>`.

Collaborators only need to do one of: `git pull` + re-run the loader, or restore the new dump.

## Scaling and distribution strategy

A short note on what lives where, and where this is heading:

- **Small artifacts stay in git.** The bill JSONs and `interval_aggregates.json` are only a few MB
  total, so keeping them in git is fine and is what makes Path A work from a clean pull.
- **Bulk raw data should move out of git.** The raw `BatthData/*.csv` exports are already large
  (hundreds of MB committed, and GitHub warns about it). As the dataset grows, that bulk data
  should move out of git to a shared blob store (Vercel Blob / Google Drive / Git LFS) fronted by
  a small fetch script, instead of being committed.
- **Recommendation:** keep the loadable artifacts in git for now so setup stays one command, and
  plan to move the bulk raw data to a blob store as it keeps growing. This is a known follow-up,
  not done yet.
