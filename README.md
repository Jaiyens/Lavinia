# Lavinia

The Terra monorepo. One repo, two deployed apps, shared packages.

## Layout

```
apps/
  web/         Marketing site (tryterra.ai). Next 15 + react-three-fiber + Resend.
               Imported via git subtree from github.com/KamiRida/terra-website
               (the co-founder's repo).
  dashboard/   Tool 1: the PG&E farmer dashboard (app.tryterra.ai). Next 16 + Prisma
               + Postgres. The product. Developed directly here — this is the source
               of truth (the old standalone Terra repo is retired).
packages/      Shared code (ui, config, types) — added as we extract common pieces.
```

## Develop

```bash
npm install            # one install for the whole workspace
npm run dev            # runs both apps (web :3000, dashboard :3001)
npm run dev:web        # just the marketing site
npm run dev:dashboard  # just the dashboard
```

`apps/dashboard` needs its own `.env.local`. Required keys:

```
DATABASE_URL            # Neon Postgres (use a per-dev branch, NOT prod)
DATABASE_URL_UNPOOLED   # Neon unpooled URL (migrations)
AUTH_SECRET             # any long random string locally
AUTH_GOOGLE_ID          # Google SSO
AUTH_GOOGLE_SECRET
ACCESS_ALLOWLIST        # who may sign in (see "Access" below)
UTILITYAPI_TOKEN        # live PG&E pull (optional locally; falls back to fixtures)
RESEND_API_KEY          # magic-link email (optional locally; logs the link to console)
AI_GATEWAY_API_KEY      # real bill extraction (optional; falls back to identity-only)
```

`apps/web` needs a Resend key for the Inquire form.

## How the two apps connect

The dashboard is its own Vercel project on its own subdomain, **app.tryterra.ai**. The
marketing site links to it directly — the "Farmer Login" button in the header points at
`https://app.tryterra.ai`. There are no cross-zone rewrites (the old `/dashboard`
Multi-Zones / basePath setup was removed).

## Access (pre-launch lockdown)

The product is not public. The dashboard is gated so a website visitor can see **nothing** —
no product UI, no data, no demo:

- **Email allowlist.** Only emails in `ACCESS_ALLOWLIST` (exact addresses and/or
  `@domain` entries) can sign in. Anyone else who clicks "Farmer Login" and authenticates
  with Google or a magic link is denied. Add a pilot farmer's or investor's email to let
  them in; remove it to revoke.
- **No public tour.** There is no public "Tour a sample" link. The badged sample
  dashboard at `/tour` is auth-gated; show it to an allowlisted person after they sign in.
- The whole dashboard is `noindex`, so it never appears in search.

Set `ACCESS_ALLOWLIST` in the dashboard's Vercel project env (and your local `.env.local`).

## Working on the dashboard

The dashboard is developed **directly in `apps/dashboard`** — it is the source of truth.
(There used to be a standalone `Terra` repo mirrored in via a sync script; that repo is
retired and the script is gone. Edit `apps/dashboard` like any other workspace.)

Before pushing, from the repo root:

```bash
npm run typecheck && npm run build && npm run test   # turbo, must be green
```

## Keeping the marketing site in sync with the co-founder's repo

`apps/web` was imported with `git subtree`. To pull upstream changes later:

```bash
git subtree pull --prefix=apps/web https://github.com/KamiRida/terra-website.git main --squash
```

## Deploy

Each app is its own Vercel project. Pushing `main` deploys:

- `apps/dashboard` → **app.tryterra.ai**
- `apps/web` → **tryterra.ai**

For the dashboard, confirm `typecheck`/`build`/`test` are green, then commit and push.
