# Terra dashboard: Project Context (Tool 1, `apps/dashboard`)

## What we're building
Terra is an operating system for California farmers. This is **Tool 1: the PG&E energy tool** (the `apps/dashboard` workspace of the Lavinia monorepo). It makes a grower's PG&E account legible (all meters, rates, billing cycles, solar) and surfaces the money hiding in it. The headline value is rate optimization and billing clarity, not telling farmers when to run pumps.

## Monorepo, deploy & operational state (current as of 2026-06-16)
This app lives in the **Lavinia monorepo** (`/Users/panda/Lavinia`, github `Jaiyens/Lavinia`):
- `apps/dashboard` = this app (app.tryterra.ai). `apps/web` = the marketing site (subtree of the co-founder's `KamiRida/terra-website`; tryterra.ai deploys from HIS Vercel, not this repo). `packages/*` = shared code.
- **The standalone `Terra` repo is RETIRED.** Develop directly here; there is no sync step. Do not push the old Terra repo (its dead `terra` Vercel project auto-deploys and confuses things).
- **Deploy:** push `Lavinia` `main` -> the `lavinia` Vercel project builds `apps/dashboard` -> **app.tryterra.ai**. CI (`.github/workflows/ci.yml`) runs typecheck + lint + build on every push/PR.
- **Run locally:** `npm install` at the monorepo root, then `npm run dev` (both apps) or `npm run dev:dashboard` (this app on **port 3001**). Copy `.env.example` -> `.env.local`.
- **Database:** Postgres (Neon in prod/dev; local Postgres for tests). NOT SQLite anymore.
- **Auth:** passwordless - Google SSO + emailed magic link. Sign-in is required **each browser session** (the session cookie is cleared on browser close + a 4h JWT cap; see `src/lib/auth.config.ts`). No email allowlist yet (gate is route-based).
- **Live PG&E connect is REAL:** the onboarding "Connect PG&E" opens a UtilityAPI hosted authorization (`UTILITYAPI_TOKEN`, set on the lavinia Vercel project). See the onboarding note in Layout below.

## Who uses it
The farm owner / decision-maker. Plain-spoken, low software and AI literacy, skeptical, "learns line by line in Excel." Two real growers independently demanded the same thing: an insanely simple home screen, depth only one tap away. Treat that as law. Talk in their language (blocks, sets, hours, acres, pumps, ranches), never kW or "15-minute interval" jargon on the surface.

## Ground truth: what a real customer looks like (Batth Farms)
Build for this scale. Batth runs ~183 meters across ~57 PG&E account numbers and 6 legal entities, with two solar arrays (840 kW, 1,092 kW) on NEM2 aggregation and multiple true-up dates, on a sprawl of rate schedules (legacy AG-4/AG-5 mixed with current AG-A1/A2/B/C, plus non-ag rates). Most meters have lat/long and GPM in their records. The product's job is to make that mess legible and find savings in it.

## Product principles
- Legible first. The first win is "here are all your meters, rates, and cycles in one clear place," not advice.
- Retrospective before predictive. Show their own numbers (this meter looks mis-rated; these months hit a demand charge) before suggesting changes.
- One recommendation = one situation + one concrete action + the dollar impact + a one-tap response + an after-the-fact result. Never "consider load management."
- Close the loop. After a bill posts, show predicted vs actual.
- Planner, not live meter. PG&E data lags ~1 day. No real-time spike promises.

## The energy levers, in honest priority
1. Rate optimization. 183 meters on mixed legacy/current rates almost guarantees some are wrong. Zero operational change. The headline (Wexus reports up to ~40% on one pump from rate analysis).
2. Demand-response enrollment (PDP / CBP / BIP). Growers already curtail 4-9pm; programs pay for that.
3. Pump efficiency. Flagged-BAD pumps draw more kW per gallon.
4. Solar / NEM. Aggregation allocation, true-up tracking, and the fact that solar often does NOT cover the demand-charge peak (set in the evening).
5. Billing-cycle timing (the serial-code calendar). Real at the margins; the visible hook Batth asked for.
6. Precision / deficit irrigation (future tool). Modest and seasonal for almonds.
Do NOT lead with coincident-peak staggering. It only helps operations with slack in their schedule, not peak-season almonds running flat-out off-peak. Keep any staggering code but demote it.

## Structure
Next.js (App Router) + TypeScript (strict) + Tailwind + Prisma + Postgres (Neon).
- /lib/energy: pure, unit-tested calculation functions (rate comparison, retrospective, solar checks, cycle timing, reconciliation). No UI/DB coupling. This must be provably correct.
- /lib/pge: Green Button/ESPI parser, the meter-read schedule table, rate logic.
- /fixtures: sample Green Button XML, the 2026 meter-read schedule table, and the Batth-shaped seed. App runs with zero external calls.
- /copy: all user-facing strings (for later English/Spanish localization).
- Prisma schema: the shared data model below.

## Shared data model (first-class; keeps the future monorepo move easy)
- Farm, Entity (legal billing entity; a Farm has several), Ranch/Block, Pump (meter), Crop, Person, Connection, Recommendation.
- Pump maps to a PG&E SA ID / meter; carries account #, entity, rate schedule, serial code, lat/long, GPM, NEM type, true-up month, status, served Block(s).
- Recommendation grammar: `{ id, farmId, tool, situation, action, impactUsd?, impactNote?, severity: info|watch|act, status: pending|done|dismissed|overridden, createdAt, resolvedAt?, result? }`. Shape `action` so it can later be EXECUTED (agentic), even though v1 only displays it.

## PG&E data (de-risked)
Integrate Share My Data (Green Button / ESPI), but do NOT require a live account to build or test; build to the published XML standard and test against fixtures. We now have a real Batth export and account for real testing. Bill PDFs aren't in the feed, so a bill-photo scan (vision -> serial, rate, cycle) is the onboarding fallback, plus importing the grower's master spreadsheet.
- Billing cycle close comes from the serial code via PG&E's 2026 meter-reading schedule. Ingest that table as a fixture.
- Never hardcode a $/kW; read dollars from the data.

## The three views (same data, simplest first)
- Calendar (home): each meter's billing-cycle close on a month grid, color-coded, with one plain-language action line. The hook Batth asked for. Graspable in seconds.
- Table (Excel-style): meters down, months across, charges/peak/usage in cells, one-click CSV export. The bridge for Excel-brained growers. Auto-filled, never stale. Filter by entity/ranch/rate so 180+ meters stay usable.
- Chart: trends, peak history, year-over-year. Behind a tap.

## Frontend aesthetics (shadcn/ui is the bible)

**shadcn/ui (the `radix-nova` registry) is the primary component vocabulary for the whole app.** When you need a component, reach for a shadcn primitive FIRST and compose from it; only hand-roll when shadcn has nothing that fits. The repo is already configured: `components.json` (style `radix-nova`, Tailwind v4, `cn` at `@/lib/cn`), primitives under `src/components/ui/` (Button, Card, DropdownMenu, Input, Select, Tabs, Calendar, Drawer, Chart, Sidebar, Sheet, Tooltip, ...). Add more with the CLI: `npx shadcn@latest add <name>`. Charts are recharts via the shadcn `chart` wrapper; the meter drawer is the shadcn `drawer` (bottom); the left nav is the shadcn `sidebar` (dark-green themed). Note: the CLI sometimes overwrites already-customized primitives (e.g. `button.tsx`'s `primary` variant + `ButtonProps`, `input.tsx`'s `label` prop) - re-check `git diff` after `add` and restore those.

Magic UI is NO LONGER the default (this reverses earlier guidance). Existing Magic UI flourishes already in the tree (Border Beam, Shine Border, Dot Pattern, etc. under `src/components/ui/` + `ai-elements/`) may stay where they live, but new work should be shadcn-first; do not reach for Magic UI by default.

What still holds:
- Typography: Inter throughout (loaded via next/font). Hierarchy from weight + size.
- Color: green #2fa84f is the dominant brand color, on a cool light-grey paper background (#eef1f5, never pure white) with near-black charcoal text (#16181d) and a gold #f2c14e accent. The left sidebar is a dark forest green (`--ds-green-100`). DESIGN.md `colors:` and `src/app/globals.css` are the source of truth; tokens live in `src/app/globals.css`. Tint any effect into this palette (greens/golds), not default neon.
- Money/usage values use tabular figures. Money is the story, not a lone screaming hero number; the data hero (chart, table, map) leads (north star: the farm, known at a glance).
- Mobile-first. The farmer is on a phone in a truck.
- Voice: plain operator English. No exclamation marks. Confident, never salesy.
- Honor prefers-reduced-motion (verify any animated component).

Taste bar: modern, clean, alive (shadcn showcase, Linear, Vercel), tuned to the farm palette. Beat Wexus on polish and price.

## Conventions
- TS strict, no `any`. Calculations are pure, tested functions in /lib/energy.
- All user-facing copy in /copy. No em dashes in user-facing copy.
- Commit fixtures so the app runs with zero external calls.
- Never put a grower's utility credentials in the repo, in client code, or anywhere the agent can read. Use exports/fixtures for dev; real auth replaces credentials in prod.
- Plan before large changes; ask before deviating from this model.
- Keep boundaries clean (pure logic in `/lib` vs UI vs data) so shared logic can move into `packages/*` cleanly.

## Commands
Run these from the **monorepo root** (turbo fans them across apps), or scope to this app
with `-w @lavinia/dashboard`. Turbo: `npm run dev | build | lint | typecheck | test`.
- `npm run dev:dashboard` - start this app (Turbopack) at **http://localhost:3001**
- `npm run build` - production build (both apps)
- `npm run lint` - ESLint (flat config; enforces no `any`)
- `npm test` - Vitest (pure-function + db integration tests; the `*.db.test.ts` ones need a
  local Postgres - CI runs typecheck+lint+build, not the db tests)
- `npm run test:e2e -w @lavinia/dashboard` - Playwright e2e (`next build` then `e2e/*.spec.ts`)
  against a throwaway local Postgres via `next start`, so it never touches your dev db
- `npm run db:generate -w @lavinia/dashboard` - regenerate the Prisma client after a schema edit
- `npm run db:migrate -w @lavinia/dashboard -- --name <name>` - create + apply a dev migration
- `npm run db:seed -w @lavinia/dashboard` / `db:reset` / `db:studio`

Stack notes: Prisma v6 on **Postgres** (Neon). `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED`
in `.env.local`. The schema is `prisma/schema.prisma`; union fields are `String` (mirrored by
TS types in `src/lib/recommendations/types.ts`); `action`/`result` on `Recommendation` are `Json`.

Server-runtime code that reads committed fixtures (e.g. `src/lib/onboarding/source.ts`,
`vision.ts`) resolves them from `process.cwd()`, NOT `new URL(..., import.meta.url)`: the
latter points inside `.next` once bundled and breaks in `next start`/Vercel. Fixtures read at
runtime are shipped on Vercel via `outputFileTracingIncludes` in `next.config.ts`.

## Layout
- `prisma/` - schema, migrations, seed (repo root)
- `fixtures/` - committed Green Button XML + meter-read schedule (repo root, zero external calls)
- `src/lib/energy/` - pure math (no UI/DB), colocated `*.test.ts`: `demand.ts` (max-demand peak kW), `billing.ts` (billing-cycle-close math), `classify.ts` (meter pump-vs-non_pump from the usage signature)
- `src/lib/greenbutton/` - PG&E ingestion: `parse.ts` (pure ESPI XML parser), `schedule.ts` (meter-read schedule loader + cycle-close lookup), `import.ts` (DB importer: UsagePoints -> Pumps with usage)
- `src/lib/onboarding/` - onboarding DB edge + stubbed external boundaries (zero external calls; each leaves a marked TODO for the real wiring): `farm.ts` (create the farm, classify imported meters, persist the confirm step; takes a PrismaClient like the importer), `source.ts` (Green Button pull stand-in -> committed sample feed), `vision.ts` (bill-photo read -> committed sample), `geocode.ts` (address -> deterministic pin)
- `src/lib/recommendations/` - Recommendation grammar types
- `src/lib/db.ts` - Prisma client singleton
- `src/lib/auth.ts` + `src/lib/auth.config.ts` - Auth.js v5 (Google + magic link; session policy)
- `src/copy/` - user-facing strings (localization-ready)
- `src/app/(app)/` - **the LIVE app**: auth-gated shell + `(dashboard)/` (home/energy/account) and
  `onboarding/` (identify -> connect -> connecting -> confirm). The source picker (`_components/source-picker.tsx`)
  offers real PG&E (UtilityAPI hosted auth via `pge-card.tsx` -> `connecting/` poller), one-click bill/CSV/
  Green Button uploads (`upload-card.tsx`), and "load sample data". Server actions in `onboarding/actions.ts`.
- `src/app/dashboard/pump-timing/` - **DEAD legacy tree** (the pre-rebuild onboarding/dashboard). Kept only
  so its e2e stays green; do NOT build on it. The live home is `(app)/(dashboard)`.
- `src/app/(auth)/login/` - the sign-in page (Google + magic link + a "see the demo" -> `/tour` button)
