---
project_name: 'Lavinia (Terra dashboard, apps/dashboard)'
user_name: 'Kamransalahuddin'
date: '2026-06-17'
sections_completed: ['technology_stack', 'language_specific', 'framework_specific', 'testing', 'code_quality', 'workflow', 'critical_dont_miss']
existing_patterns_found: 9
status: 'complete'
rule_count: 78
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

> Scope: this file is about **`apps/dashboard`** (Tool 1, the PG&E farmer dashboard) inside the
> **Lavinia monorepo**. Regenerated 2026-06-17 against the `ui/home-redesign` branch (commit
> `6f8212c`, money-first Home redesign). It supersedes the 2026-06-07 version, which still described
> the retired single-repo Terra (SQLite, port 3000, restraint-only aesthetics) — all of that is wrong now.

---

## Technology Stack & Versions

- **Monorepo:** npm **workspaces** + **Turborepo ^2**. Apps: `apps/dashboard`
  (`@lavinia/dashboard`, the product) and `apps/web` (`@lavinia/web`, marketing, a `git subtree`
  of `KamiRida/terra-website`). `packages/*` for shared code. **One root lockfile**; one
  `npm install` at the root installs every workspace.
- **Node pinned to 24** (`.nvmrc`); root `engines.node >= 20`. `packageManager` is `npm@11.6.2`.
  Use **npm** (not pnpm/yarn).
- **Next.js 16.2.7** (App Router) + **Turbopack**. Dashboard dev server runs on **port 3001**
  (`next dev -p 3001`), NOT 3000.
- **React 19.2.4** / react-dom 19.2.4. Server Components by default; Server Actions for mutations.
- **TypeScript ^5**, `strict: true` + `noUncheckedIndexedAccess: true`,
  `moduleResolution: "bundler"`, `target ES2017`. Path alias `@/* -> src/*`.
- **Prisma ^6.19.3** + @prisma/client on **Postgres (Neon)** — NOT SQLite. PINNED to v6; do not
  upgrade to v7. `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED` in `.env.local`.
- **Tailwind v4** via @tailwindcss/postcss (no `tailwind.config`; all tokens are CSS variables in
  `src/app/globals.css`). `tw-animate-css` for keyframe utilities.
- **Vitest ^4.1.8** (node env, `@` alias) — pure-function + Postgres DB-integration tests.
- **Playwright ^1.60** — e2e against a throwaway local Postgres via `next start`.
- **ESLint ^9.39** flat config + **typescript-eslint ^8.60**, hand-built in `eslint.config.mjs`
  from the plugins directly (`@next/eslint-plugin-next` recommended + core-web-vitals,
  `eslint-plugin-react-hooks`, tseslint recommended). It deliberately avoids `FlatCompat` +
  `eslint-config-next`, which crashes on ESLint 9 — even though `eslint-config-next` is still a dep.
- **tsx ^4.22** runs `prisma/seed.ts` and `scripts/*` (resolves the `@/` alias).
- **UI / data libs:** `motion ^12` (animation), `lucide-react` (icons), `maplibre-gl ^5` (the meter
  map), `@visx/scale` (chart scales), `nuqs ^2` (lens/filter state in the URL),
  `@base-ui-components/react` (headless UI primitives: card/button/input), `clsx` + `tailwind-merge`
  (the `cn` helper at `@/lib/cn`).
- **Agent / AI:** `ai ^6` + `@ai-sdk/react` power the agent rail. `next-auth ^5` (Auth.js v5) +
  `@auth/prisma-adapter` for auth. `zod ^4` for validation. `fast-xml-parser ^5` (Green Button/ESPI),
  `pdf-lib` (bill PDFs).

Layer cleanly (pure `/lib` logic · Prisma data · `/app` UI · `/copy` strings) so shared code can
move into `packages/*` mechanically.

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **No `any`.** `@typescript-eslint/no-explicit-any` is an ESLint **error**. tsconfig strict alone
  won't catch it. Type it, or use `unknown` + narrow.
- **`noUncheckedIndexedAccess` is on.** `arr[i]` / `obj[key]` are `T | undefined`. Guard before use;
  don't non-null-assert (`!`) to silence it.
- **Unused vars are errors** unless prefixed `_` (args, vars, and caught errors). Use `_arg` for
  fixed-arity callbacks (e.g. `useActionState`) and ignored stub params.
- **Imports use the `@/` alias** for src (`@/lib/...`, `@/copy/en`, `@/components/ui`), not deep
  relative chains. The alias is wired in tsconfig, Vitest, AND tsx.
- **Pure logic stays pure.** Functions in `src/lib/energy` (and most of `src/lib/dashboard`) take
  plain inputs and return plain values — no Prisma, no React, no I/O. This is the product's
  provably-correct trust surface; keep it that way.
- **DB edges/importers take a `PrismaClient` argument** rather than importing the singleton, so tests
  can pass a throwaway client (see `greenbutton/import.ts`, `onboarding/farm.ts`).
- Union/enum-like fields are TS string-literal unions mirrored in
  `src/lib/recommendations/types.ts` (Postgres model keeps these as `String`; see DB rules).

### Framework-Specific Rules

**Next.js (App Router)**
- Default to Server Components. Mutations go in Server Actions (`actions.ts`); client UI lives in
  `_components/`. The LIVE app is `src/app/(app)/` — `(dashboard)/` (home/energy/account) +
  `onboarding/`. The public `/tour` renders the full app shell in `demoOnly` mode.
- **Runtime fixture reads MUST use `process.cwd()`**, never `new URL(..., import.meta.url)` (the
  latter resolves inside `.next` once bundled and breaks in `next start` / Vercel). See
  `onboarding/source.ts`, `vision.ts`, the rate card, the meter-read schedule loader.
- **New runtime-read fixtures must be covered by `outputFileTracingIncludes`** in `next.config.ts`
  (currently `"/**": ["./fixtures/**/*"]`) or they won't ship in the server bundle on Vercel. The
  old `turbopack.root` pin is gone (the single root lockfile + `workspaces` lets Turbopack infer it).
- URL-as-state via **nuqs**: lens choice, filters, and drawer selection live in query params so views
  are shareable/back-button-correct. Don't reach for client state where a URL param fits.

**Prisma / data model (Postgres)**
- Pinned to **v6** on **Postgres/Neon**. Union fields are `String` with allowed values documented
  inline and mirrored in `src/lib/recommendations/types.ts`. `action`/`result` on `Recommendation`
  are `Json`.
- Use the singleton `src/lib/db.ts` in app code; pass an explicit client into library edges/importers
  for testability.
- **Schema changes use `prisma db push`, NOT migration files.** `db:migrate` is aliased to
  `prisma db push`; `db:reset` is `db push --force-reset --skip-generate` + seed. After editing
  `prisma/schema.prisma`, run `db:generate` (also runs on `postinstall`).
- Demo/seed farms carry `isDemo = true` and never present as the grower's live farm. **A real
  connected farm (`isDemo:false` + active PG&E connection) automatically supersedes the demo seed —
  they are separate Farm rows that never merge.** Real → `dataKind:"real"` (no badge); fallback seed
  → `dataKind:"representative"` (renders a "Representative data" badge).
- First-class shared entities (Farm, Entity, Account, Block, Pump/meter, Crop, Person, Connection,
  Recommendation) — built to survive extraction into `packages/*`.

**Recommendation / Findings grammar** — every finding is
  `{ situation + action + impactUsd?/impactNote? + severity(info|watch|act) +
  status(pending|done|dismissed|overridden) + result? }`. Shape `action` so it can later be EXECUTED
  (agentic), even though v1 only displays it. Findings live in the right rail/drawer and **must trace
  to data visible on the dashboard**.

**Auth (Auth.js v5)**
- Passwordless: **Google SSO + emailed magic link**, no passwords. **Sign-in is required each browser
  session** — the cookie clears on browser close and a 4h JWT cap applies (`src/lib/auth.config.ts`).
  The gate is route-based (no email allowlist yet).
- Live PG&E connect is **UtilityAPI** hosted authorization (`UTILITYAPI_TOKEN` on the Vercel project),
  NOT Bayou. Bayou is retired — don't reintroduce its one-account-per-login assumption.

### Testing Rules

- **Two unit-test tiers, by filename:** `*.test.ts` = pure-function tests (no DB),
  `*.db.test.ts` = Prisma/Postgres integration tests. Colocate tests next to the code they cover.
- **`/lib/energy` and `/lib/dashboard` math ship with colocated tests** (calendar, chart, csv, derive,
  drawer, filters, findings, kpi, lens, map, table, results…). New logic ships with a test. This is
  the product's trust surface.
- **DB tests (`*.db.test.ts`) need a local Postgres** and an explicit `PrismaClient`; they must clean
  up after themselves. **CI does NOT run DB tests** — CI runs typecheck + lint + build only.
- **e2e (Playwright)** does `next build` then runs against a throwaway local Postgres via `next start`
  (not dev), so it never touches your dev db. Run single-worker.
- Vitest runs in the **node** environment (not jsdom) — logic/DB tests, not component renders. No DOM
  APIs in them.
- Run `npm test` before claiming logic works; `npm run test:e2e -w @lavinia/dashboard` for flows.

### Code Quality & Style Rules

**Layered boundaries (keep the `packages/*` extraction mechanical)**
- `src/lib/energy` — pure math (demand, billing, classify), no UI/DB. `src/lib/greenbutton` —
  ESPI/Green Button parse + meter-read schedule + DB importer. `src/lib/dashboard` — pure derivation
  (kpi, lens, chart, table, map, findings, refunds, bills) + `*.db.test.ts` DB edges.
  `src/lib/onboarding`, `src/lib/farm` — DB edges. `src/lib/weather/forecast.ts` — forecast edge.
  `src/app` — UI. `src/copy` — strings. Don't cross these wires (no DB in `/energy`, no UI in `/lib`).
- External boundaries are stubbed with a marked TODO (`onboarding/source.ts`, `vision.ts`,
  `geocode.ts`) so the app runs with **zero external calls** off committed fixtures.

**Copy & voice**
- **All user-facing strings live in `src/copy/en.ts`** (localization-ready), accessed via `en` +
  number helpers (`num`); money via `@/lib/format/money` (`formatUsdWhole`). No hardcoded UI text.
- **No em dashes in user-facing copy. No exclamation marks.** Plain operator English — confident,
  never salesy.
- Surface language is the grower's: blocks, sets, hours, acres, pumps, ranches, entities, accounts.
  **Never** kW, "15-minute interval", or AI/jargon on the surface.

**Design system — Magic UI is the bible (source of truth for all UI)**
- **Reach for a Magic UI component FIRST** and compose from it; only hand-roll when nothing fits.
  Animated, polished, modern is the goal now — the old "restraint / no gradients / one motion moment"
  guidance is RETIRED. Install via the shadcn CLI (`components.json`: new-york, rsc, cssVariables,
  `utils: @/lib/cn`); components land under `src/components/ui/`. Already present: `border-beam`,
  `shine-border`, `shimmer-button`, `animated-shiny-text`, `dot-pattern`, `number-ticker`, plus base
  `button`/`card`/`input`/`skeleton`/`severity-badge` (exported from `@/components/ui`).
- **Tint Magic UI effects into the warm-farm palette** (beams/gradients in greens/golds), never leave
  them as default neon.
- **Tokens are CSS variables in `src/app/globals.css`; reference them via Tailwind utilities** —
  never hardcode hex or pick fonts ad hoc. Current system (reference reskin 2026-06-17): a cool
  light-grey page canvas (`--surface`/`--bg` `#eef1f5`) with **white cards that float on shadow more
  than border**. Surfaces step `surface-container-lowest … highest`.
- **ONE green: `#2fa84f` (the aurora green, the marketing anchor).** It is the only accent and always
  means something positive — brand, primary action, active state, AND positive money
  (`--money-positive` is the same green). `--gold #f2c14e` + `--sky` are minor accents.
- **Color discipline: three colors max on any screen** (green, clay-alert, charcoal-on-paper).
  `--alert #bd4b34` (warm clay/terracotta) is for `act` severity + high-dollar-at-risk only;
  `--risk #b3261e` is the one reserved red for money-at-risk-right-now. `watch` severity has **no
  color** — typography + label only.
- **Type:** Inter throughout (via next/font), hierarchy from weight + size, not mixed families.
  Use the `type-*` utilities (`type-headline`, `type-body-md`, …). All numeric/dollar/usage values
  use **tabular figures**.
- **Money is the story, not a lone screaming hero number.** The data hero (chart/table/map) leads;
  money reads as the story those visuals tell. North star: **"the farm, known at a glance."**
- **Elevation + motion are tokenized — use the tokens, don't invent values.** Cards rest at
  `--shadow-e1`, lift to `e2` on hover; `e3` = drawer/sheet/tooltip; `e4` tops the stack. Motion:
  `--ease-standard cubic-bezier(0.16,1,0.3,1)`; durations `--dur-instant 120 / fast 180 / base 240 /
  slow 420 / data 900`; `--stagger 60ms`. One orchestrated reveal per view (staggered), not scattered
  micro-interactions. **Honor `prefers-reduced-motion`** (a block at the bottom of globals.css
  neutralizes elevation/motion; Magic UI components mostly respect it — verify).
- Layout rails are tokens: `--agent-rail 240px`, `--findings-rail 320px`; radius `--radius-control`
  (controls/kpis/table) and `--radius-lg` (cards/drawer/sheet/map/modal).
- `globals.css` has `@source not "../../_bmad-output"` — never make Tailwind scan BMAD artifacts for
  class candidates (story prose quotes Tailwind-like tokens that emit invalid CSS).

**Information architecture (data screens)**
- A three-zone **OS shell**: agent rail (left / mobile bottom-tabs) · data hero (center) · persistent
  **findings rail** (right / mobile bottom-sheet). One lens at a time; default to the simplest view.
- **Energy hero = a Chart · Table · Map · Calendar lens toggle over one meter dataset**, with a KPI
  strip and a shared meter drawer drill-in.
- **Home (redesigned, commit `6f8212c`) is money-first:** the Rate Fix conversion hero leads (one
  named pump, one dollar, "nothing changes"), then the money-found band, the spend area-chart, and
  the live meter map; the right rail carries farm profile, remaining findings, spend-by-entity,
  solar, weather. Mobile-first (the grower is on a phone in a truck).

**Naming** — kebab-case file names; colocated `*.test.ts`. One primary decision per screen; hide
  depth behind a tap.

### Development Workflow Rules

**Commands** (run from the monorepo root; Turbo fans across apps, or scope with `-w @lavinia/dashboard`)
- `npm run dev` (both apps) / `npm run dev:dashboard` (this app, Turbopack, **:3001**).
  `npm run build` / `start` — prod. `npm run lint` (no-`any`). `npm test` (Vitest). `npm run typecheck`.
- `npm run test:e2e -w @lavinia/dashboard` — Playwright (`next build` then specs, throwaway Postgres).
- DB (scope to the app): `db:generate` (after schema edits), `db:migrate` (= `prisma db push`),
  `db:seed`, `db:reset` (force-reset + seed), `db:studio`.

**Deploy**
- Push `Lavinia` `main` → the **`lavinia`** Vercel project builds `apps/dashboard` → **app.tryterra.ai**.
  CI (`.github/workflows/ci.yml`) runs typecheck + lint + build (both apps) on every push + PR.
- The standalone **`Terra` repo is RETIRED** — develop directly in `apps/dashboard`, no sync step.
  Do not push the old Terra repo (its dead `terra` Vercel project auto-deploys).
- `apps/web` deploys from the co-founder's Vercel, NOT this repo. Pull his updates via
  `git subtree pull --prefix=apps/web https://github.com/KamiRida/terra-website main --squash`.

**Git**
- Branch off `main`; don't commit straight to it. Current work branch: `ui/home-redesign`.
- **Commit or push only when the user asks.** Match existing commit-message style (imperative,
  concise: "Redesign Home: money-first cards, unified green, new spend/map/weather").
- **Never commit grower utility credentials or any secret.** Real secrets live in Vercel env;
  `.env*` is gitignored, `.env.example` is the template.

**Process**
- Plan before large changes; ask before deviating from the data model documented here. If `CLAUDE.md`
  and this file ever disagree on the data model, **this file wins** (BMAD agents load it on activation).
- Verify before pushing: `npm run typecheck && npm run lint && npm run build` (turbo, from root).
  Remember `outputFileTracingIncludes` for any new runtime fixture read.

### Critical Don't-Miss Rules

**Product / domain anti-patterns**
- **Lead with rate optimization, not pump staggering.** Honest lever priority: (1) rate optimization,
  (2) demand-response enrollment (PDP/CBP/BIP), (3) pump efficiency, (4) solar/NEM, (5) billing-cycle
  timing, (6) precision irrigation. Coincident-peak staggering is DEMOTED — keep the code, don't
  surface it (it doesn't help peak-season almonds running flat-out off-peak).
- **Legible before predictive; retrospective before advice.** First win is "here are all your
  meters/rates/cycles in one place," then "this meter looks mis-rated," then a recommendation. Close
  the loop after a bill posts (predicted vs actual).
- **Home/hero is a data dashboard, not a to-do list.** Money is the story the chart/table/map tell,
  not a lone hero number. Recommendations are secondary (findings rail/drawer) and trace to visible
  data. North star: **"the farm, known at a glance."**
- **Build for Batth scale:** ~183 meters across ~57 PG&E accounts, 6 legal entities, two solar arrays
  on NEM2 aggregation with multiple true-up dates, mixed legacy/current rate schedules. Make that mess
  legible. Filter by entity/ranch/rate so 180+ meters stay usable.
- **Onboarding (value-honest):** identify → connect a data source (PG&E UtilityAPI authorization OR
  bill upload; meter-master spreadsheet optional; need ≥1) → land in the dashboard. The dashboard is
  the pitch; no scripted reveal. Returning users log in via Google SSO / magic link.
- **Planner, not live meter.** PG&E data lags ~1 day. Never promise real-time spike detection.
- **One recommendation = one situation + one concrete action + dollar impact + a one-tap response +
  an after-the-fact result.** Never "consider load management."

**Data anti-patterns**
- **Never hardcode a `$/kW` (or any rate).** Read dollars from the data.
- **Prefer real grower data via live connect; the representative seed is a demoted fallback** — never
  present it as the grower's own farm.
- Build to the published Green Button/ESPI XML standard and test against committed fixtures — do NOT
  require a live PG&E account to build or test. A bill-photo scan (vision) and master-spreadsheet
  import are the non-feed fallbacks.

**Technical traps (highest-severity)**
- `process.cwd()` for runtime fixture reads (not `import.meta.url`) — breaks on Vercel otherwise;
  new fixtures need `outputFileTracingIncludes`.
- Don't upgrade Prisma past v6. Schema changes go through `prisma db push`, not migration files.
- `noUncheckedIndexedAccess` + no-`any` are hard ESLint/TS errors, not suggestions.
- Dashboard dev/prod port is **3001**, not 3000.

**Security**
- Grower utility credentials never touch the repo, client code, or anything the agent can read.
  Exports/fixtures for dev; real auth (UtilityAPI / Auth.js) in prod only.

**Legacy**
- `src/app/dashboard/pump-timing/` is a **DEAD legacy tree** kept only so its e2e stays green. Do NOT
  build on it. The live home is `src/app/(app)/(dashboard)`.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code in `apps/dashboard`.
- Follow ALL rules exactly. When in doubt, prefer the more restrictive option.
- On any data-model disagreement between this file and CLAUDE.md, this file wins.
- Update this file when a new durable pattern emerges.

**For Humans:**

- Keep this file lean and focused on what agents would otherwise miss.
- Update when the stack, palette, or patterns change. The aesthetic direction (Magic UI as the
  vocabulary, tinted into the warm-farm palette) and the Postgres/monorepo infra are the two areas
  that drift fastest — keep them honest.

Last Updated: 2026-06-17
