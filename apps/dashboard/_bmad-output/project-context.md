---
project_name: 'Terra'
user_name: 'Jaiyen'
date: '2026-06-07'
sections_completed: ['technology_stack', 'language_specific', 'framework_specific', 'testing', 'code_quality', 'workflow', 'critical_dont_miss']
existing_patterns_found: 7
status: 'complete'
rule_count: 70
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Next.js 16.2.7** (App Router) + **Turbopack**. `turbopack.root` is pinned to
  `process.cwd()` in next.config.ts (repo ships both package-lock.json AND
  pnpm-lock.yaml, so the workspace root can't be inferred). Use **npm**.
- **React 19.2.4** / react-dom 19.2.4. Server Components by default; Server Actions
  for mutations.
- **TypeScript ^5**, `strict: true` + `noUncheckedIndexedAccess: true`,
  `moduleResolution: "bundler"`. Path alias `@/* -> src/*`.
- **Prisma ^6.19.3** + @prisma/client, **SQLite**. PINNED to v6 (classic
  `url = env(...)` flow). Do NOT migrate to v7 (driver adapters + prisma.config.ts)
  until the Postgres move. Dev db: prisma/dev.db via DATABASE_URL in .env.
- **Tailwind v4** via @tailwindcss/postcss (no tailwind.config; tokens live in CSS).
- **Vitest ^4.1.8** (node env, `@` alias) — unit + db-integration tests.
- **Playwright ^1.60** — browser e2e against a throwaway prisma/e2e.db.
- **ESLint ^9.39** flat config + typescript-eslint ^8.60 (hand-built; bypasses
  eslint-config-next, which crashes on ESLint 9).
- **tsx ^4.22** runs prisma/seed.ts and scripts (resolves the `@/` alias).
- Other: motion ^12.40 (animation), lucide-react (icons), fast-xml-parser ^5.8
  (Green Button/ESPI parsing).

Stack note: this is a single Next.js repo (Tool 1). It becomes a monorepo when
Tool 2 starts, so keep logic (/lib) / data (Prisma) / UI (app) cleanly separated
so the move is mechanical.

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **No `any`.** `@typescript-eslint/no-explicit-any` is an ESLint *error*, not a
  warning. tsconfig strict alone won't catch it. Type it or use `unknown` + narrow.
- **`noUncheckedIndexedAccess` is on.** `arr[i]` / `obj[key]` are `T | undefined`.
  Guard before use; don't non-null-assert (`!`) to silence it.
- **Unused vars are errors** unless prefixed `_`. Use `_arg` for fixed-arity callback
  signatures (e.g. useActionState) and ignored interface params in stubs.
- **Imports use the `@/` alias** for src (`@/lib/...`, `@/copy/en`), not deep
  relative chains. The alias is wired in tsconfig, vitest, AND tsx (so seed/scripts
  can use it too).
- **Pure logic stays pure.** Functions in `src/lib/energy` take plain inputs and
  return plain values — no Prisma, no React, no I/O. This is what makes them
  provably testable; keep it that way.
- **DB importers/edges take a `PrismaClient` argument** rather than importing the
  singleton, so tests can pass a throwaway client (see import.ts, farm.ts).
- Union/enum-like fields are TS string-literal unions mirrored in
  `src/lib/recommendations/types.ts` (SQLite has no enums — see DB rules).

### Framework-Specific Rules

**Next.js (App Router)**
- Default to Server Components. Use Server Actions in `actions.ts` for mutations;
  keep client UI in `_components/`. Tool 1 screens live under
  `src/app/dashboard/pump-timing/`.
- **Runtime fixture reads MUST use `process.cwd()`**, never
  `new URL(..., import.meta.url)`. The latter resolves inside `.next` once bundled
  and breaks in `next start` / Vercel. See onboarding/source.ts, vision.ts.
- **New runtime-read fixtures must be added to `outputFileTracingIncludes`** in
  next.config.ts, or they won't ship in the server bundle on Vercel.

**Prisma / data model**
- Pinned to **v6**; SQLite has no enums, so union fields are `String` with allowed
  values documented inline and mirrored in `src/lib/recommendations/types.ts`.
  `action`/`result` on Recommendation are `Json`.
- Use the singleton `src/lib/db.ts` in app code; pass an explicit client into
  library importers/edges for testability.
- Demo/seed farms (Batth) carry `isDemo = true` so they never present as the
  grower's live farm. A real connected farm is `isDemo = false`.
- **The current Batth/demo seed is synthetic placeholder** — fabricated well names
  (e.g. "Westside Pump 17", "Dairy Field Pump 4") and made-up numbers, standing in
  until the real Batth export is rebuilt. Treat it as DISPOSABLE: don't preserve
  these names/values or write logic that depends on them; the seed is replaced
  wholesale, not migrated.
- **Real-Batth supersedes demo-Batth automatically — they never merge.** They are
  separate Farm rows. `dashboardFarm()` returns the latest real farm (`isDemo:false`
  + active PG&E SMD connection → `dataKind:"real"`, no badge) when one exists, else
  falls back to the latest `isDemo:true` seed (`dataKind:"representative"`, renders a
  "Representative data" badge). Connecting a real account just outranks the seed,
  which stops rendering.
- Shared entities are first-class (Farm, Entity, Account, Block, Pump, Crop,
  Person, Connection, Recommendation) — built to survive the monorepo move.

**Recommendation grammar** — every recommendation is
  `{ situation + action + impactUsd?/impactNote? + severity(info|watch|act) +
  status(pending|done|dismissed|overridden) + result? }`. Shape `action` so it can
  later be EXECUTED (agentic), even though v1 only displays it.

**Tailwind v4** — no config file; design tokens are CSS variables in one tokens
  file. Reference tokens, never hardcode hex or pick fonts ad hoc.

### Testing Rules

- **Two unit-test tiers, by filename:** `*.test.ts` = pure-function tests (no DB),
  `*.db.test.ts` = Prisma DB-integration tests. Vitest `include` is
  `src/**/*.test.ts`, so colocate tests next to the code they cover.
- **`/lib/energy` math must be provably correct** — every calculation file has a
  colocated test (demand, billing, classify, rates, rate-compare, retrospective,
  solar-nem, bill-audit, coincident, off-peak, reconcile). New energy logic ships
  with tests. This is the product's trust surface.
- **DB tests get an explicit PrismaClient** (importers/edges take it as an arg) and
  must clean up after themselves — never assume empty/shared state.
- **e2e (Playwright) runs the REAL app against a throwaway `prisma/e2e.db`** via
  `next start` (not dev), so it never touches dev.db. `test:e2e` does `next build`
  first; the fresh empty db sends the app into onboarding. Run e2e single-worker.
- Vitest runs in the **node** environment (not jsdom) — these are logic/DB tests,
  not component-render tests. Don't reach for DOM APIs in them.
- Run `npm test` (vitest run) before claiming logic works; `npm run test:e2e` for
  the onboarding flow.

### Code Quality & Style Rules

**Layered boundaries (keep the monorepo move mechanical)**
- `src/lib/energy` — pure math, no UI/DB. `src/lib/{greenbutton,pge,bayou,
  spreadsheet,normalize}` — ingestion/parsing. `src/lib/onboarding`,
  `src/lib/farm`, `src/lib/dashboard` — DB edges + derivation. `src/app` — UI.
  `src/copy` — strings. Don't cross these wires (no DB in /energy, no UI in /lib).
- External boundaries are stubbed with a marked TODO for real wiring
  (source.ts, vision.ts, geocode.ts) so the app runs with **zero external calls**.

**Copy & voice**
- **All user-facing strings live in `src/copy/en.ts`** (localization-ready). No
  hardcoded UI text in components.
- **No em dashes in user-facing copy.** No exclamation marks. Plain operator
  English — confident, never salesy.
- Surface language is the grower's: blocks, sets, hours, acres, pumps, ranches.
  **Never** kW, "15-minute interval", or AI/jargon on the surface.

**Design system (source of truth for all UI)**
- **Binding UX spec (2026-06-08):** `_bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/`
  (`DESIGN.md` = visual identity/tokens; `EXPERIENCE.md` = IA/behavior/flows). It is the source of
  truth for UX and wins on conflict with this file and the PRD.
- Editorial agrarian-luxury: calm, confident, expensive. NOT a SaaS template. No
  glassmorphism, liquid glass, or heavy gradients.
- **Comprehension bar:** a non-technical grower answers the main question on each
  screen (which pump is costing me, and why) in seconds. Legibility first, luxury
  second.
- Color direction: warm paper background (never pure white); warm charcoal text
  (never pure black); one dominant green with ONE brighter-green accent for positive
  money; all colors as CSS variables in one tokens file. Exact hexes are unsettled —
  see "Open visual-system decision" below.
- **Typeface: Inter across display, body, and data** (loaded via next/font), with Arial as the
  system fallback. Hierarchy comes from weight and size, not from mixing families. (Standard per
  Jaiyen 2026-06-08, which reverses the earlier "Standardize typeface to Helvetica" commit and
  restores Inter; this matches CLAUDE.md, which still reads Inter, and supersedes the older
  Fraunces / Hanken Grotesk / JetBrains Mono systems. EXPERIENCE.md governs the surface.)
- All numeric/dollar/usage values use **tabular figures**. Money is **not** the loudest thing on
  the screen and never a lone hero number; the data hero (chart/table/map) is the loudest, and money
  reads clearly as the story those visuals tell (north star: the farm, known at a glance, per
  EXPERIENCE.md). 8px spacing scale;
  hairline 1px low-opacity borders over filled boxes; soft diffuse shadows only. Mobile-first
  (grower on a phone).
- **Information hierarchy on data screens:** a three-zone OS shell — agent rail (left rail /
  mobile bottom-tabs) · data hero (center) · persistent findings rail (right / mobile bottom-sheet).
  The hero is a **Chart · Table · Map · Calendar lens toggle over one meter dataset** (Chart default),
  with a compact KPI strip above and a shared meter drawer drill-in. One lens at a time; default to
  the simplest view. Home = the Energy agent today; it grows a cross-agent strip when a 2nd agent ships.

**Open visual-system decision** (settle during the Tool 1 rebuild architecture with
the Architect):
- **(a) Palette — RESOLVED (2026-06-08):** the dominant brand green is **`#2fa84f`**
  on warm paper (`#FAF9F4`). This supersedes the earlier deep-forest `#1F3D2B`–`#2D4A2D`
  and the marketing `#1C7A2B`. The live token is `--green` in `src/app/globals.css`.
- **(b) Status color — RESOLVED (2026-06-08):** keep the green-dominant palette and add ONE warm
  **clay/terracotta alert tone** for `act` severity and high-dollar-at-risk map pins; `watch` is
  carried by typography + label only (no third color). Three colors max per screen: green, clay,
  charcoal-on-paper. Tokens `alert` and money-positive `money` sit alongside `--green` (see DESIGN.md).

**Motion** — one orchestrated moment per view (staggered reveal), not scattered
  micro-interactions. Easing `cubic-bezier(0.16, 1, 0.3, 1)`, 400–700ms, stagger
  60–100ms, no bounce/overshoot. Honor `prefers-reduced-motion` (instant fallback).

**Naming** — kebab-case file names; colocated `*.test.ts`. One primary decision /
  action per screen; hide depth behind a tap.

### Development Workflow Rules

**Commands**
- `npm run dev` — Turbopack dev at :3000. `npm run build` / `npm start` — prod.
- `npm run lint` — ESLint (enforces no-`any`). `npm test` / `test:watch` — Vitest.
  `npm run test:e2e` — Playwright (builds first, uses throwaway e2e.db).
- DB: `db:generate` (after schema edits), `db:migrate -- --name <name>` (create +
  apply dev migration, auto-seeds), `db:seed`, `db:reset` (drop/re-migrate/re-seed),
  `db:studio`.
- **After editing `prisma/schema.prisma`, run `db:generate`** so the client matches.

**Migrations & seed**
- Dev db is `prisma/dev.db` (DATABASE_URL in .env). Seed is `prisma/seed.ts`, run
  via **tsx** (which resolves `@/`). Keep fixtures committed so the app runs with
  zero external calls.

**Git**
- Branch off `main`; don't commit straight to it. Current work branch: `batth-update`.
- **Commit or push only when the user asks.** Match existing commit-message style
  (imperative, concise: "Rebuild dashboard with drill-down navigation").
- **Never commit grower utility credentials** — not in repo, client code, or any
  agent-readable file. Use exports/fixtures for dev; real auth replaces credentials
  in prod. Bayou needs `NEXT_PUBLIC_BAYOU_COMPANY_ID` (env, not committed secrets).

**Process**
- Plan before large changes; ask before deviating from the data model documented in
  this file (project-context.md). If CLAUDE.md and project-context.md ever disagree
  on the data model, **project-context.md wins**, since that is the file the BMAD
  agents load on activation.
- Deploys target Vercel — remember `outputFileTracingIncludes` for any runtime
  fixture reads (see Framework rules).

### Critical Don't-Miss Rules

**Product / domain anti-patterns**
- **Lead with rate optimization, not pump staggering.** Honest lever priority:
  (1) rate optimization, (2) demand-response enrollment (PDP/CBP/BIP), (3) pump
  efficiency, (4) solar/NEM, (5) billing-cycle timing, (6) precision irrigation.
  Coincident-peak staggering is DEMOTED — keep the code, don't surface it (it doesn't
  help peak-season almonds running flat-out off-peak).
- **Legible before predictive; retrospective before advice.** First win is "here are
  all your meters/rates/cycles in one place," then "this meter looks mis-rated," then
  a recommendation. Close the loop after a bill posts (predicted vs actual).
- **Home/hero is a data dashboard.** The hero is the **chart + table + map** (a Chart · Table · Map ·
  Calendar lens toggle over one meter dataset) inside a three-zone OS shell with a persistent findings
  rail; money is the story those visuals tell, not a lone hero number. North star: **"the farm, known
  at a glance"** — the grower feels he can see his whole farm and knows what is happening on it.
  Recommendations are secondary, live in the findings rail/drawer, and must trace to data visible on
  the dashboard. Never make the main screen a to-do list.
- **Onboarding & auth (see UX spec, binding).** Value-honest and operator-operable: identify → connect
  a data source (PG&E Share-My-Data authorization OR bill upload; meter-master spreadsheet optional;
  need ≥1) → land in the dashboard. No scripted reveal; the dashboard is the pitch; the LOA is an
  upgrade, not the entry toll. Returning users log in via **Google SSO / magic link (no passwords)**
  straight to their dashboard. Map geometry comes from the bill's PLSS land descriptions + street
  addresses (no Bayou needed for geo).
- **Planner, not live meter.** PG&E data lags ~1 day. Never promise real-time spike
  detection.
- **One recommendation = one situation + one concrete action + dollar impact + a
  one-tap response + an after-the-fact result.** Never "consider load management."

**Data anti-patterns**
- **Never hardcode a `$/kW` (or any rate).** Read dollars from the data.
- **Bayou returns ONE account per login** (verified). Multi-account farms (Batth has
  ~57 accounts) need the master spreadsheet (`connectSpreadsheet`) or Green Button
  upload — don't assume one connect covers the farm.
- **Prefer real grower data via live connect; sample/fixture data is a demoted
  fallback only.** Don't present the representative seed as the grower's own.
- Build to the published Green Button/ESPI XML standard and test against committed
  fixtures — do NOT require a live PG&E account to build or test.

**Technical traps (highest-severity)**
- `process.cwd()` for runtime fixture reads (not `import.meta.url`) — breaks on
  Vercel otherwise.
- Don't upgrade Prisma past v6 until the Postgres move.
- `noUncheckedIndexedAccess` + no-`any` are hard ESLint/TS errors, not suggestions.

**Security**
- Grower utility credentials never touch the repo, client code, or anything the agent
  can read. Exports/fixtures for dev; real auth in prod only.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code.
- Follow ALL rules exactly as documented. When in doubt, prefer the more restrictive
  option.
- On any data-model disagreement between this file and CLAUDE.md, this file wins.
- Update this file when a new durable pattern emerges.

**For Humans:**

- Keep this file lean and focused on what agents would otherwise miss.
- Update when the stack or patterns change; close out the open visual-system decision
  here once settled with the Architect.
- Review periodically and remove rules that become obvious over time.

Last Updated: 2026-06-07
