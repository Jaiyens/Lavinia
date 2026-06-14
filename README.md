# Lavinia

The Terra monorepo. One repo, two deployed apps, shared packages.

## Layout

```
apps/
  web/         Marketing site (tryterra.ai). Next 15 + react-three-fiber + Resend.
               Imported via git subtree from github.com/KamiRida/terra-website.
  dashboard/   Tool 1: the PG&E farmer dashboard. Next 16 + Prisma + Postgres.
               The product. Served at tryterra.ai/dashboard via Multi-Zones.
packages/      Shared code (ui, config, types) — added as we extract common pieces.
```

## Develop

```bash
npm install            # one install for the whole workspace
npm run dev            # runs both apps (web :3000, dashboard :3001)
npm run dev:web        # just the marketing site
npm run dev:dashboard  # just the dashboard
```

`apps/dashboard` needs its own `.env.local` (Postgres `DATABASE_URL`, etc.).
`apps/web` needs a Resend key for the Inquire form.

## How the two apps connect

The dashboard runs with `basePath: '/dashboard'`. The web app rewrites
`/dashboard/*` to the dashboard's deployment (Next.js Multi-Zones), so
`tryterra.ai/dashboard` serves the product while `tryterra.ai` serves marketing.
Each app deploys as its own Vercel project; `tryterra.ai` attaches to web.

## Keeping the marketing site in sync with the co-founder's repo

`apps/web` was imported with `git subtree`. To pull upstream changes later:

```bash
git subtree pull --prefix=apps/web https://github.com/KamiRida/terra-website.git main --squash
```
