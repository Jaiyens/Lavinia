# Lavinia monorepo: Project Context

The Terra monorepo. Two deployable apps + shared packages, npm workspaces + Turborepo.
Both founders work this single repo in parallel; keep `main` green.

## Layout
- `apps/dashboard` (`@lavinia/dashboard`) - **Tool 1, the PG&E farmer dashboard** -> **app.tryterra.ai**.
  Next.js (App Router) + TypeScript strict + Tailwind + Prisma + Postgres. The product.
  See `apps/dashboard/CLAUDE.md` for its full context (data model, energy levers, aesthetics, the live PG&E connect).
- `apps/web` (`@lavinia/web`) - the marketing site -> **tryterra.ai**. Imported via `git subtree`
  from the co-founder's repo `KamiRida/terra-website`. NOTE: tryterra.ai deploys from HIS Vercel
  project, not from this repo - pushing Lavinia does NOT redeploy the marketing site. Pull his updates
  with `git subtree pull --prefix=apps/web https://github.com/KamiRida/terra-website main --squash`.
- `packages/*` - shared code (added as we extract common pieces).

## How it deploys
- Push `Lavinia` `main` -> the **`lavinia`** Vercel project builds `apps/dashboard` -> **app.tryterra.ai**.
- CI (`.github/workflows/ci.yml`) runs typecheck + lint + build (both apps) on every push + PR.
- The standalone **`Terra` repo is RETIRED** - develop directly in `apps/dashboard`, no sync step.
  Do not push the old Terra repo (its dead `terra` Vercel project auto-deploys).
- Real secrets live in the Vercel project env, never in git. `.env*` is gitignored; `.env.example` is the template.

## Working in it (both of us)
- Node is pinned: `.nvmrc` = 24, root `engines: node >=20`. `nvm use` then `npm install` at the root.
- One root lockfile (`package-lock.json`); one `npm install` installs every workspace.
- Run: `npm run dev` (both apps) or `npm run dev:dashboard` (port 3001) / `npm run dev:web`.
- Verify before pushing: `npm run typecheck && npm run lint && npm run build` (turbo, from root).
- Per-app commands: scope with `-w @lavinia/dashboard` (or `@lavinia/web`).

## Conventions
- TypeScript strict, no `any`. Pure tested logic in `apps/dashboard/src/lib`.
- User-facing copy in `src/copy` (localization-ready). No em dashes in user-facing copy.
- Never commit a grower's utility credentials or any secret.
- Plain operator English in the product UI; warm agricultural palette; mobile-first.
