# Terra: Project Context (Tool 1, single repo)

## What we're building
Terra is an operating system for California farmers. This repo is **Tool 1: the PG&E energy tool**. It makes a grower's PG&E account legible (all meters, rates, billing cycles, solar) and surfaces the money hiding in it. The headline value is rate optimization and billing clarity, not telling farmers when to run pumps.

This stays a single Next.js app for now. We move to a monorepo when Tool 2 starts, so keep code cleanly separated (pure logic in /lib, a clear data model, a UI layer) so that future move is mechanical.

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

## Structure (single repo)
Next.js (App Router) + TypeScript (strict) + Tailwind + Prisma + SQLite (swappable to Postgres).
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

## Frontend aesthetics (Magic UI is the bible)

The current UI is not good enough. We are leveling it up by adopting **Magic UI (https://magicui.design/docs/components) as the primary component and animation vocabulary for the whole app.** When you need a component or a moment of motion, reach for a Magic UI component FIRST and compose from it; only hand-roll when Magic UI has nothing that fits. Animated, polished, modern is the goal now, not restraint. Earlier versions of this file demoted effects (no gradients, one motion moment, etc.); that guidance is retired. Use Magic UI freely: animated text (Text Animate, Typing Animation, Animated Shiny Text), special effects (Border Beam, Shine Border, Magic Card, Animated Beam, Particles), buttons (Shimmer, Shiny, Ripple, Interactive Hover), backgrounds (Dot Pattern, Grid Pattern, Light Rays, Warp), Dock, Animated List, Bento Grid, and the rest of the catalog.

Install Magic UI components via the shadcn CLI (the repo is already configured: `components.json` present, Tailwind v4, `cn` at `@/lib/cn`). Components land under `src/components/magicui/`. Example: `npx shadcn@latest add "https://magicui.design/r/border-beam.json"`.

What still holds (these COMPOSE with Magic UI, they do not fight it):
- Typography: Inter throughout (loaded via next/font). Hierarchy from weight + size.
- Color: the warm agricultural palette is our brand — green #2fa84f dominant, warm cream/paper background (#faf9f4, never pure white), warm charcoal text (#16190f). Magic UI effects should be tinted into this palette (e.g. beams/gradients in greens/golds), not left as their default neon. Tokens live in `src/app/globals.css`.
- Money/usage values use tabular figures. Money is the story, not a lone screaming hero number; the data hero (chart, table, map) leads (north star: the farm, known at a glance).
- Mobile-first. The farmer is on a phone in a truck.
- Voice: plain operator English. No exclamation marks. Confident, never salesy.
- Honor prefers-reduced-motion (Magic UI components largely respect it; verify).

Taste bar: modern, animated, alive (Magic UI showcase, Linear, Vercel), tuned to the warm farm palette. Beat Wexus on polish and price.

## Conventions
- TS strict, no `any`. Calculations are pure, tested functions in /lib/energy.
- All user-facing copy in /copy. No em dashes in user-facing copy.
- Commit fixtures so the app runs with zero external calls.
- Never put a grower's utility credentials in the repo, in client code, or anywhere the agent can read. Use exports/fixtures for dev; real auth replaces credentials in prod.
- Plan before large changes; ask before deviating from this model.
- Keep boundaries clean (logic vs UI vs data) so the eventual monorepo move is just moving files.

## Commands
- `npm run dev` - start the app (Turbopack) at http://localhost:3000
- `npm run build` / `npm start` - production build / serve
- `npm run lint` - ESLint (flat config; enforces no `any`)
- `npm test` / `npm run test:watch` - Vitest (pure-function + db integration tests)
- `npm run test:e2e` - Playwright browser e2e (`next build` then `e2e/*.spec.ts`); runs the
  real app against a throwaway `prisma/e2e.db` via `next start` so it never touches `dev.db`
- `npm run db:generate` - regenerate the Prisma client after editing the schema
- `npm run db:migrate -- --name <name>` - create + apply a dev migration (auto-seeds)
- `npm run db:seed` - run `prisma/seed.ts`
- `npm run db:reset` - drop, re-migrate, and re-seed the dev db
- `npm run db:studio` - open Prisma Studio

Stack notes: Prisma is pinned to v6 (the classic `url = env(...)` SQLite flow; v7 now
requires driver adapters + a `prisma.config.ts`, which we'll adopt when we move to
Postgres). The dev db is `prisma/dev.db`, set by `DATABASE_URL` in `.env`. The shared
schema is `prisma/schema.prisma`; union fields are `String` (SQLite has no enums),
mirrored by TS types in `src/lib/recommendations/types.ts`. `action`/`result` on
`Recommendation` are `Json`.

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
- `src/copy/` - user-facing strings (localization-ready)
- `src/app/dashboard/pump-timing/` - Tool 1 screens: the tool index + `onboarding/` (connect -> auto-classify -> confirm -> done; server actions in `actions.ts`, client UI in `_components/`)
