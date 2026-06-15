---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/research-landscape.md
  - docs/product-ux-research.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md
  - _bmad-output/project-context.md
  - "Real Batth PG&E bill (account 4699664587-8, 101-page scan) — provided inline by user 2026-06-08"
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-06-08'
project_name: 'Terra'
user_name: 'Jaiyen'
date: '2026-06-08'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (22 FRs, five clusters):**

- **Cluster A — Data Foundation / the engine (FR-1–6).** Inventory import from the master
  spreadsheet (183 meters, day one); page-classified vision/LLM extraction of scanned,
  image-only PG&E PDFs to strict JSON; NEM reconciliation extraction (negative usage, monthly
  rows + annual true-up); a canonical multi-period billing shape; an identity-checked SA-ID
  join; a one-cent reconciliation guardrail; and partial-billing coverage tracking. This cluster
  is the architectural center of gravity and the product's trust surface.
- **Cluster B — Dashboard / the hero (FR-7–12, FR-22).** KPI strip with a billing-coverage
  indicator; TOU-stacked cost chart with YoY; the dense sortable/filterable meter table (P0);
  the shared meter drawer; rollup/filter by entity/ranch/rate; an inventory-driven map (co-equal
  lens); one-click CSV export honoring the active filter.
- **Cluster C — Recommendations & levers (FR-13–18).** The secondary recommendation feed in the
  grammar; rate optimization fully computed (dated tariff fixture + back-test gate, lead with the
  27 legacy meters); the solar/NEM demand insight (AG-C-family solar meters only); a pump-health
  flag; DR enrollment as info only. **Billing-cycle timing (FR-16) is elevated from "margin
  lever" to a real, client-demanded hook: the serial-code calendar.** Each meter's PG&E **serial
  letter** (Service Information block on the bill: R / M / X / W / N / K…) maps via the 2026
  meter-read schedule fixture to a scheduled cycle-close date. It surfaces as the **Calendar
  lens** (co-equal with Chart / Table / Map in the UX spine), not merely a feed item.
- **Cluster D — Close-the-loop (FR-19–20).** Bill-accuracy verification (independent recompute
  matches the posted bill — accuracy, not forecast); accepted-recommendation predicted-vs-realized
  result populated from the next posted bill.
- **Cluster E — Data-in (FR-21).** Operator-run import of inventory + billing; the dormant Bayou
  live-connect kept as the future adapter against the same canonical shape.

**Non-Functional Requirements (the bars that govern every feature):**

- **Correctness & trust.** No figure renders unless it reconciles to ground truth within
  tolerance, else "needs review." Pure energy math lives in tested `/lib/energy`. Never hardcode
  a rate or `$/kW`. No fabricated numbers (efficiency, coverage, projection) presented as measured.
- **Posture.** Planner, not live meter: PG&E data lags ~1 day; cycle-level demand only; no
  real-time, spike, or remote-control claims. (A major architectural simplifier — no streaming.)
- **Performance / form-factor / comprehension.** Sub-second navigation across cards/table/drawer/
  map; desktop/tablet primary with a clean responsive phone view; the <10s comprehension bar.
- **Design & voice.** Editorial agrarian-luxury; CSS-variable tokens (single source); Inter
  with tabular figures; one orchestrated motion moment honoring reduced-motion; plain operator
  English (never kW/jargon, no em dashes), all copy in `/copy`.
- **Security & privacy.** Grower utility credentials never touch the repo/client/agent-readable
  surface. Real financials never shown to investors; `isDemo` separation; real outranks the
  representative seed and they never merge.
- **Architecture for the monorepo move.** Clean boundaries (pure logic `/lib/energy`, ingestion
  `/lib`, DB edges, UI `/app`, strings `/copy`); the canonical billing shape isolates the source
  so the PDF→Bayou swap changes nothing downstream; single Next.js repo structured so Tool 2 is
  just moving files.

### Scale & Complexity

- **Primary domain:** full-stack web — server-heavy ingestion/derivation (Server Components +
  Server Actions) with a data-dense client surface.
- **Complexity level:** high — driven by correctness-criticality (the reconciliation gate), the
  undemonstrated vision-extraction pipeline, a relational + multi-period data model at Batth scale
  (183 meters / 57 accounts / 6 entities / NEM aggregation graph), and provable energy math.
  Not "enterprise" in the multi-tenancy/compliance sense.
- **Estimated architectural components (rough):** ingestion/extraction pipeline; canonical-shape
  normalizer + source adapters; reconciliation + SA-ID-join layer; the Prisma data model + DB
  edges; pure `/lib/energy` math + dated fixtures (tariff + meter-read schedule); geo (PLSS +
  address) layer; auth; the OS-shell UI (rail / lenses / drawer / findings rail) + responsive
  variants; demo-resolution layer.
- **Volume:** structurally rich, absolutely modest in v1 (one account proven; bulk across 57 ≈
  thousands of pages explicitly deferred).

### Technical Constraints & Dependencies

- **Stack is largely locked** by `project-context.md`: Next.js 16 (App Router, Turbopack, npm),
  React 19 (Server Components default), TypeScript strict + `noUncheckedIndexedAccess` + no-`any`,
  Prisma 6 (classic `url=env`, do NOT move to v7 pre-Postgres), SQLite (`prisma/dev.db`),
  Tailwind v4 (no config; CSS-variable tokens), Vitest (node env), Playwright (throwaway e2e db),
  tsx for seed/scripts, motion + lucide-react + fast-xml-parser. This is partly greenfield design,
  partly documenting/refining what exists.
- **Vercel runtime-fixture trap:** the new runtime-read fixtures (dated tariff, 2026 meter-read
  schedule) must be read via `process.cwd()` and added to `outputFileTracingIncludes`, or they
  break on `next start` / Vercel.
- **Serial-code billing schedule.** The Calendar lens depends on a committed 2026 meter-read
  schedule fixture (serial letter → 12 monthly read/close dates), sourced from PG&E's published
  2026 schedule PDF (per the public meter-reading-schedule page; the table itself ships in the
  PDF). It is a runtime-read fixture → subject to the Vercel trap above. The cycle-close lookup is
  a pure tested function (`cycleClose(serialCode, month, year)`); a separate path reads the
  *actual* close from the posted bill's billing-period end date.
- **External boundaries:** PG&E PDFs (v1 source); Bayou / Green Button / Share My Data (dormant
  future adapter); a vision/LLM extraction provider (new); PLSS + street-address geocoding (new);
  an auth provider for Google SSO / magic link (new). All billing sources normalize to the
  canonical shape.

### Cross-Cutting Concerns Identified

- **Reconciliation / "needs review" propagation** through table, drawer, map, rollups, and CSV —
  a correctness layer, not a cell style.
- **Coverage honesty:** complete inventory day one; billing partial; the coverage indicator
  reflects the active filter and counts only reconciled meters in money rollups.
- **Source isolation** via the canonical billing shape (the PDF→Bayou adapter seam).
- **Demo/real separation** (`isDemo`, `dashboardFarm()` resolution; never merge; never show real
  financials to investors).
- **Layered boundaries** kept clean so the Tool-2 monorepo move is mechanical.
- **The Vercel runtime-fixture trap** for every new fixture read at runtime.
- **Single sources of truth:** design tokens (one CSS file), user-facing copy (`/copy`),
  union/enum-like fields mirrored in TS string-literal unions.
- **Serial vs. Rotating Outage Block.** The bill's Service Information block carries both a
  `Serial` letter (the billing cycle) and a `Rotating Outage Block` (a PSPS/outage code). Only the
  serial letter drives cycle-close; the data model and extractor must keep them distinct.
- **Predicted vs. actual cycle-close.** The serial+schedule fixture yields a *scheduled, may-shift*
  close date (forward Calendar lens); the posted bill yields the *actual* close. The model carries
  both, surfaced honestly per the planner-not-live-meter posture.
- **Accessibility & motion floor:** color never the only signal; `prefers-reduced-motion`
  fallback; tap targets ≥44pt; tabular figures legible at largest dynamic type.

### Open Architectural Tension (to resolve in decisions)

- **Operator-operable import vs. concierge/admin-only (FR-21 vs. EXPERIENCE.md).** The PRD scopes
  v1 to a dev/admin import path with "no grower-facing upload UI," while the binding UX spine
  describes an operator-operable connect-a-source flow (bill upload, source picker) plus returning
  Google SSO / magic-link auth. These reconcile as *operator-operable, not grower-self-serve*, but
  they imply real onboarding UI + an auth surface beyond a pure admin script. To be decided
  deliberately as an architecture decision, not assumed.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application — Next.js (App Router) with server-heavy ingestion/derivation and a
data-dense client surface. Not mobile-native, not a standalone API, not CLI/desktop.

### Decision: No new starter — existing codebase is the foundation (brownfield rebuild)

Terra Tool 1 is a **rebuild of an existing, running application**, not a greenfield start. The
foundation, toolchain, and conventions are already established and **deliberately locked** in
`project-context.md`. Adopting a starter template now would re-derive decisions that already
exist and risk overwriting intentional choices. The existing repo IS the starter.

### Starter Options Considered (and why not adopted)

- **`create-next-app` (fresh scaffold).** Would only reproduce the current Next.js 16 / TS /
  Tailwind baseline the repo already has. No benefit; discards existing `/lib/energy` math,
  fixtures, Prisma schema, and conventions.
- **T3 Stack (create-t3-app).** Bundles NextAuth, Drizzle-or-Prisma-v7, and tRPC by default —
  all of which *conflict* with deliberate project decisions (Prisma pinned to v6; Server Actions
  over tRPC; auth approach still to be decided here, not pre-chosen by the starter). Rejected.
- **RedwoodJS / Blitz.** Impose their own full-stack conventions (GraphQL/cells, "zero-API")
  that fight the App-Router + Server-Actions + pure-`/lib` architecture and the monorepo-move
  boundary discipline. Rejected.

### Foundation Already in Place (version-verified 2026-06-08)

**Language & Runtime**
- TypeScript `^5`, `strict: true` + `noUncheckedIndexedAccess` + `@typescript-eslint/no-explicit-any`
  as an error. `moduleResolution: bundler`; path alias `@/* → src/*` (wired in tsconfig, Vitest,
  and tsx).
- React 19.2.4 / react-dom 19.2.4 — Server Components by default, Server Actions for mutations.

**Framework**
- **Next.js 16.2.7 LTS** (App Router, Turbopack) — confirmed the current stable release as of
  2026-06-08, so the pin is current, not lagging. `turbopack.root` pinned to `process.cwd()`
  (repo ships both package-lock and pnpm-lock, so the workspace root can't be inferred). Use npm.

**Styling**
- Tailwind v4 via `@tailwindcss/postcss` — no `tailwind.config`; design tokens are CSS variables
  in one tokens file (the DESIGN.md palette/type scale). Reference tokens, never hardcode hex or
  pick fonts ad hoc.

**Data**
- **Prisma `^6.19.3` + SQLite, pinned to v6 deliberately.** Prisma v7 is GA but requires driver
  adapters + `prisma.config.ts`; the project defers that to the Postgres move. Dev db
  `prisma/dev.db` via `DATABASE_URL`. Single shared `prisma/schema.prisma`; union/enum-like fields
  are `String` mirrored by TS string-literal unions; `action`/`result` on Recommendation are `Json`.

**Testing**
- Vitest `^4.1.8` (node env, `@` alias) — two tiers by filename: `*.test.ts` (pure) and
  `*.db.test.ts` (Prisma integration). Playwright `^1.60` e2e runs the real app via `next start`
  against a throwaway `prisma/e2e.db`.

**Linting / Build / Scripts**
- ESLint `^9.39` flat config + typescript-eslint `^8.60` (hand-built; bypasses eslint-config-next).
  tsx `^4.22` runs `prisma/seed.ts` and scripts (resolves `@/`). Other libs: motion `^12.40`,
  lucide-react, fast-xml-parser `^5.8`.

**Code Organization (the boundaries that keep the monorepo move mechanical)**
- `src/lib/energy` — pure tested math (no UI/DB). `src/lib/{greenbutton,pge,bayou,spreadsheet,
  normalize}` — ingestion/parsing. `src/lib/{onboarding,farm,dashboard}` — DB edges + derivation.
  `src/app` — UI (Server Components + Server Actions in `actions.ts`, client UI in `_components/`).
  `src/copy` — localization-ready strings. `prisma/` schema+migrations+seed; `fixtures/` committed.

**Deployment**
- Vercel target. Runtime-read fixtures use `process.cwd()` (never `import.meta.url`) and must be
  added to `outputFileTracingIncludes` in `next.config.ts`.

### Initialization Note

There is **no `create-*` initialization command** for this project — the repo already exists and
the dev loop is `npm run dev`. The brownfield equivalent of an "init story" is **scaffolding the
rebuild within the existing structure** (the new data model + canonical billing shape + OS-shell
UI), preserving the locked stack and boundaries above. No dependency churn beyond what the rebuild
genuinely requires (e.g. the new vision-extraction, geocoding, and auth dependencies decided in
the next step).

## Core Architectural Decisions

_Versions verified 2026-06-08: AI SDK v6 (`ai`), Auth.js v5 (`next-auth` + `@auth/prisma-adapter`),
MapLibre GL JS 5.24.x._

### Decision Priority Analysis

**Critical (block implementation):**
- Extraction pipeline client/model (AI Gateway + AI SDK v6, `generateObject` + Zod)
- Validation/schema library (Zod) as the single extraction + canonical-shape contract
- Data-model evolution (Ranch, solar Array/NEMA graph, serial code, billing line items, coverage)
- Auth (Auth.js v5, Prisma adapter, Google + magic link)

**Important (shape architecture):**
- Extraction execution substrate (bounded-concurrency fan-out via AI SDK; PDF split with pdf-lib)
- Map + geo stack (MapLibre GL 5.x + self-hosted PLSS/Census geocoding)
- Charting (custom SVG via visx)
- Client state (URL search params via nuqs); API surface (RSC + Server Actions)

**Deferred (post-MVP):**
- Native Anthropic Batches API (50% off) for the 57-account bulk pipeline — revisit if Gateway-path cost demands it
- Live Bayou / Green Button adapter (dormant; targets the same canonical shape)
- Production email sender for magic-link delivery (stub the boundary in v1)

### Data Architecture

**Billing ingestion / extraction pipeline (the trust spine).**
- **Client: Vercel AI Gateway + AI SDK v6** (`ai` package), calling Claude via `"anthropic/claude-*"`
  provider strings. Default model **`anthropic/claude-opus-4-8`** for accuracy on rough 200 DPI
  bilevel scans. Documented cost lever: run per-page extraction on `anthropic/claude-sonnet-4-6`
  and **escalate pages that fail the cent-reconciliation gate to Opus 4.8** — the gate makes a
  cheaper first pass safe.
- **Strict JSON via `generateObject` + a Zod schema** (AI SDK's structured-output mode; auto-retries
  with corrective prompting on validation failure). One Zod schema per page type.
- **PDF handling: `pdf-lib` (pure JS)** splits the 101-page PDF into per-page documents; each page is
  sent to Claude's native PDF/vision support (no rasterization, no native binaries — keeps the
  serverless build clean). **Page is classified before extraction** (payment-confirmation / account
  summary / per-SA summary list / per-SA charge detail / NEM reconciliation), then the type-specific
  schema is applied (FR-2).
- **Execution: bounded-concurrency fan-out** over a meter/page work-list, run from an admin/dev
  import action; results stream into the DB and the dashboard fills as SAs reconcile (FR-6). This
  replaces the native Batches API (not available through the Gateway); the Batches path is recorded
  as a deferred optimization for the bulk 57-account pipeline.
- **Honest trade recorded:** the Gateway gives provider-agnostic observability/fallback and matches
  the repo's `vision.ts` TODO, at the cost of the native Batches 50% discount and `messages.parse`.
  The Anthropic SDK can later be pointed at the Gateway `baseURL` if both are wanted.

**Validation / schema: Zod** — the single source of truth for extraction structured output, runtime
validation at every boundary, and the canonical-billing-shape contract. (Also the validator Auth.js
and any forms use.)

**Source isolation: the existing `/lib/normalize` canonical shape is the seam.** The PDF extractor
and the dormant Bayou/Green Button adapter both normalize to it; nothing downstream of the canonical
shape changes when the source swaps (FR-4). Reconciliation + the identity-checked SA-ID join sit
between extraction and the canonical shape.

**Data model (Prisma v6 / SQLite, evolved — additive to the existing schema):**
- Add **`Ranch`** as the rollup level (Entity → Account → Ranch → Meter).
- Add a solar **`Array`** model with an explicit **Array → benefiting-Meter (NEMA)** relation and a
  per-array `trueUpMonth`; do not model solar as flat meter flags.
- Add to `Pump`/Meter: **`serialCode`** (billing cycle letter) and **`rotatingOutageBlock`** — kept
  as distinct fields (the serial-vs-outage-block trap).
- Add **`BillingLineItem`** as a relational child of `BillingPeriod` so cent-reconciliation runs
  against captured line items vs. the printed total (FR-5), and add an actual `cycleClose` date on
  the billing period.
- Add **`coverageState`** per Meter/Account (no-bill / needs-review / reconciled) for FR-6.
- Union/enum-like fields stay `String` mirrored by TS literal unions; `action`/`result` on
  `Recommendation` stay `Json` (project-context lock). `isDemo` separation + `dashboardFarm()`
  resolution unchanged.

**Pure math + fixtures:** rate compare/back-test, solar-NEM, bill-audit, and the **serial-code
cycle-close lookup** stay pure tested functions in `/lib/energy` (+ `/lib/pge`). Two new
runtime-read fixtures — the dated tariff card and the 2026 meter-read schedule — read via
`process.cwd()` and ship via `outputFileTracingIncludes` (the Vercel trap).

### Authentication & Security

- **Auth.js v5 (next-auth v5)**, self-hosted, **`@auth/prisma-adapter`** on the existing
  Prisma/SQLite DB. Providers: **Google SSO + email magic link** (no passwords). Unified `auth()`
  in Server Components / Server Actions / middleware; `AUTH_*` env prefix. Adds User / Account /
  Session / VerificationToken tables to the schema.
- **Magic-link delivery is a new external boundary** — stub the email sender in v1 (marked TODO,
  like `source.ts`/`vision.ts`), wire a real sender (e.g. Resend/SMTP) for prod. Returning users
  land straight in their dashboard; logged-in-no-data routes to the connect-a-source picker.
- **Noted alternative (non-blocking):** Better Auth is the current "new project" recommendation in
  some 2026 surveys; Auth.js v5 chosen for its first-class Prisma adapter and self-hosted,
  no-vendor-holds-grower-data posture. Revisit only if Auth.js friction shows up.
- Security rules unchanged: grower utility credentials never touch repo/client/agent-readable
  surface; real financials never shown to investors; `isDemo` separation enforced at
  `dashboardFarm()`.

### API & Communication Patterns

- **Server Components for reads, Server Actions (`actions.ts`) for mutations.** No REST/GraphQL/tRPC
  layer (project-context lock). The extraction import + reconciliation run as server actions / route
  handlers, not a client-exposed API.
- **Error handling:** extraction/reconciliation failures surface as `needs-review` state, never as a
  thrown wrong number; AI SDK validation retries are bounded, then the SA is marked needs-review.

### Frontend Architecture

- **OS-shell composition** (agent rail · data-hero · findings rail) as Server Components with
  client islands for the lens toggle, drawer, map, and charts. Mobile collapses rail→bottom-tabs and
  findings→bottom-sheet (DESIGN/EXPERIENCE specs).
- **Charts: custom SVG built on `visx` primitives** (scales/shapes) — TOU-stacked bars, sparklines,
  YoY, tabular figures, the single orchestrated motion moment, exact design tokens.
- **Map: MapLibre GL JS 5.x**, read-only, custom agrarian-luxury style; pins colored by $-at-risk;
  tap → the shared drawer. **Geometry self-hosted:** PLSS Section-Township-Range → centroid via a
  committed BLM PLSS lookup; street addresses via the free US Census geocoder. Both resolve in
  `/lib` (geocode boundary already stubbed); meters without resolvable location go to a
  "no location yet" tray. No paid map key, no Bayou for geo.
- **Client state: URL search params via `nuqs`** — active lens, entity/ranch/rate filter, and open
  drawer are URL-encoded (shareable, RSC-friendly, survives refresh). Minimal local state otherwise.
- **Motion:** `motion` (already a dep); one staggered reveal per data-landing; honors
  `prefers-reduced-motion`.

### Infrastructure & Deployment

- **Vercel** (Fluid Compute; 300s function ceiling). Extraction runs as bounded-concurrency fan-out
  inside server actions/route handlers; long imports chunk work rather than one 101-page call.
- **Env/secrets:** `AI_GATEWAY_API_KEY` (or Vercel OIDC), `AUTH_SECRET` + Google OAuth creds, email
  sender creds — all via Vercel env, never committed. The dormant Bayou key stays env-only.
- **New runtime fixtures** (tariff card, 2026 meter-read schedule) added to
  `outputFileTracingIncludes` in `next.config.ts`.
- **CI:** lint + Vitest (pure + db tiers) + Playwright e2e against the throwaway `prisma/e2e.db`;
  deploy previews per branch.

### Decision Impact Analysis

**Implementation sequence (protects the PRD spine FR-1,2,4,5,7,9,14):**
1. Data-model migration (Ranch, Array/NEMA, serial code, BillingLineItem, coverage, Auth tables).
2. Zod canonical-shape + reconciliation/SA-ID-join in `/lib/normalize` + `/lib/energy`.
3. Extraction pipeline: pdf-lib split → classify → `generateObject` per page → normalize → reconcile.
4. Dashboard shell + table (P0) + KPI strip reading the canonical shape; coverage honesty.
5. Rate lever (tariff fixture + back-test) and the serial-code Calendar lens.
6. Map (MapLibre + geo) and charts (visx); findings rail; auth + connect-a-source onboarding.

**Cross-component dependencies:**
- Zod schema is shared by extraction, validation, and the canonical shape — change it in one place.
- Reconciliation/coverage state propagates to table, drawer, map, rollups, CSV (cross-cutting).
- The canonical shape decouples the PDF source from everything downstream (Bayou swap is mechanical).
- Auth tables + fixtures land in the same Prisma migration discipline (`db:migrate` → `db:generate`).

## Implementation Patterns & Consistency Rules

_These **extend** `project-context.md` (the authoritative rules file); they do not restate it.
They cover the surfaces this rebuild introduces. On any conflict, project-context wins, then this
section, for the new surfaces below._

### Money & Numbers (the reconciliation surface — highest-conflict)

- **Billed dollar amounts are stored and compared as integer cents** (`number`, e.g. `1172733` =
  $11,727.33). Never store a billed amount as a float dollar. This makes the FR-5 guardrail exact:
  reconciliation passes iff `abs(sumLineItemCents − printedTotalCents) <= 1`.
- **Rates and usage keep full precision** as `number` with documented units: kWh to 6 decimals,
  $/kWh to 5 decimals, kW (demand) to the value printed. These are *inputs to math*, not the
  reconciliation surface — never round them to cents.
- **Formatting lives in one place** (`/lib/format` or `/copy`): `formatUsd(cents)` →
  tabular `$X,XXX.XX`; never hand-format money in a component. All money/usage render with
  `tabular-nums` per DESIGN.md.
- **Never invent a number.** A value that is not reconciled renders via the `needs-review`
  treatment, never `0`, blank, or a guess (SM-C1/SM-C3).

### Extraction → Canonical → Reconciliation contract

- **Three typed layers, one direction:** `RawExtraction` (per page type, what Claude returns) →
  normalize → **canonical billing shape** (`/lib/normalize/types.ts`) → reconcile/coverage. UI and
  recommendations read **only** the canonical shape (the existing `no-raw-source-in-ui.test.ts` is
  the guard — keep it green). A `/lib/<source>` raw type must never be imported into `/app`.
- **Zod owns the boundary.** Each page-type schema is a Zod schema in `/lib/<source>/schema.ts`; the
  TS type is `z.infer<typeof Schema>` (schema is the source of truth, no parallel hand-written
  interface). `generateObject` validates against it; on failure the SA is marked `needs_review`,
  not thrown to the user.
- **The SA-ID join is identity-checked, not assumed.** Normalize the SA ID to a canonical form
  (trim, preserve the `P0xx`/descriptor suffix as a separate field) and require the extracted
  meter # + Pump ID to match the inventory row joined on SA ID; mismatch → `needs_review` (FR-4).

### State unions (single definition, consistent render)

- **`coverageState: 'no_bill' | 'needs_review' | 'reconciled'`** — one TS literal union, one render
  treatment everywhere (table cell, drawer, map pin, rollup, CSV). Defined once; mirrored as a
  Prisma `String` (v6/SQLite rule).
- **Recommendation grammar is verbatim** from `/lib/recommendations/types.ts`:
  `severity: 'info' | 'watch' | 'act'`, `status: 'pending' | 'done' | 'dismissed' | 'overridden'`.
  No new severity colors — `act` = clay, `watch` = type-only, `info` = muted (DESIGN.md).

### Server Actions & data flow

- **Mutations are Server Actions in `actions.ts`; reads are Server Components reading Prisma.** No
  REST/GraphQL/tRPC.
- **Actions return a discriminated result, they do not throw for expected failures:**
  `type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`. Unexpected errors
  still throw to the error boundary; expected ones (bad upload, unreconciled) return `ok:false` with
  a `/copy` string. `useActionState` callbacks use the `_prev` unused-arg convention.
- **Revalidate explicitly** after a mutation (`revalidatePath`/`revalidateTag`); never rely on a
  client refetch.
- **DB edges take an explicit `PrismaClient`** (importers/edges), per the existing testability rule.

### URL state (nuqs) — canonical query keys

- Dashboard view state is URL-encoded with **fixed keys**: `lens` (`chart|table|map|calendar`),
  `entity`, `ranch`, `rate`, `meter` (open-drawer SA ID). Every component reads/writes these same
  keys via nuqs — no component invents its own param name. Switching lens never drops the active
  filter or open `meter` (EXPERIENCE.md).

### Dates, time, and the two TOU clocks

- **Store dates as `DateTime`** (billing period start/end, `cycleClose`, true-up). Bills are
  California/Pacific; do not introduce a second timezone. Cycle-close from the serial-code fixture is
  the **scheduled** date; the posted bill's period-end is the **actual** date — carry both, label
  honestly (planner-not-live-meter).
- **Two TOU clocks stay separate in code and copy:** AG rate peak **5–8pm** (drives demand math);
  PDP/DR event window **4–9pm** (drives DR copy). Never conflate.

### Geo / PLSS

- One PLSS parser produces a canonical `{ section, township, range, aliquots[] }`; one deterministic
  centroid function (committed BLM PLSS lookup). Address geocoding via the Census boundary, stubbed
  like `geocode.ts`. A meter without resolvable location is added to the **"no location yet" tray**,
  never silently dropped and never given a fake pin.

### Tokens in charts & map (no hardcoded color)

- visx charts and the MapLibre style read **CSS-variable design tokens** (green / clay / charcoal /
  paper, `money-positive`), never literal hex. $-at-risk uses the same green→clay scale as table
  cells and map pins; color is never the only signal (pair with value/label — accessibility floor).

### Logging & secrets

- Pipeline logging is structured and **never logs grower credentials, the AI Gateway key, full bill
  bytes, or PII**. Extraction failures log the SA ID + page type + reason, not the raw image.

### Enforcement

**All agents MUST:**
- Gate every displayed figure through reconciliation; render `needs_review` rather than a guess.
- Read only the canonical shape in `/app` and `/lib/recommendations`; keep `no-raw-source-in-ui`
  green.
- Put user-facing strings in `/copy`, money/usage through the shared formatter with tabular figures,
  and colors via tokens.
- Ship new `/lib/energy` math with a colocated `*.test.ts`; new DB edges with a `*.db.test.ts`.
- Use the canonical nuqs keys and the discriminated `ActionResult` shape.

**Anti-patterns (do not):**
- Store billed dollars as floats, or reconcile in dollars instead of integer cents.
- Import a `/lib/<source>` raw extraction type into `/app`, or hand-write a type that duplicates a
  Zod-inferred one.
- Hardcode a hex, a `$/kW`, a font, or a TOU window; surface kW or "15-minute interval" in UI copy.
- Render a fabricated/zero number where billing is missing instead of `needs_review`.
- Invent a new severity color or a new query-param name for an existing piece of view state.

## Project Structure & Boundaries

### Complete Project Directory Structure

_Legend: (existing) keep · (evolves) reshaped by the rebuild · **(new)** added by the rebuild._

```
terra/
├── package.json · next.config.ts · tsconfig.json · postcss.config.mjs        (existing)
├── eslint.config.mjs · vitest.config.ts · playwright.config.ts               (existing)
├── CLAUDE.md · AGENTS.md · README.md · spec.md                               (existing)
├── .env  /  .env.example  (AI_GATEWAY_API_KEY, AUTH_SECRET, GOOGLE_*, EMAIL_*) (evolves)
├── prisma/
│   ├── schema.prisma          (evolves: +Ranch +Array +serialCode/rotatingOutageBlock
│   │                                    +BillingLineItem +coverageState +Auth tables)
│   ├── migrations/                                                            (evolves)
│   ├── seed.ts · batth-farm.ts · sample-farm.ts                              (evolves: badged seeds)
├── fixtures/                  (committed — zero external calls)
│   ├── pge-ag-rate-card.json            (existing → bounded to Batth schedules + equivalents)
│   ├── pge-meter-read-schedule.json     (existing → the 2026 serial→close table; runtime-read)
│   ├── batth-farm.json · sample-farm.json · onboarding/sample-bill.json      (existing)
│   ├── greenbutton/*.xml · bayou/*.json · spreadsheet/*.csv                  (existing, dormant src)
│   └── extract/batth-account-*.json     (new: reconciled extraction of the real account)
├── e2e/onboarding.spec.ts → e2e/{connect,dashboard}.spec.ts                  (evolves)
├── public/                                                                    (existing)
└── src/
    ├── app/
    │   ├── layout.tsx · globals.css (CSS-variable design tokens)             (existing/evolves)
    │   ├── page.tsx               (entry → redirect to (app) or login)        (evolves)
    │   ├── (auth)/
    │   │   ├── login/page.tsx                                                (new: Google/magic-link)
    │   │   └── api/auth/[...nextauth]/route.ts                               (new: Auth.js handler)
    │   ├── (app)/                 (authed OS shell — replaces dashboard/pump-timing)
    │   │   ├── layout.tsx         (three-zone shell: agent rail·hero·findings rail) (new)
    │   │   ├── page.tsx           (Home = Energy dashboard today)            (new)
    │   │   ├── energy/
    │   │   │   ├── page.tsx       (KPI strip + lens toggle + active lens)    (new)
    │   │   │   ├── actions.ts     (resolve finding, filters)                 (new)
    │   │   │   └── _components/
    │   │   │       ├── shell/ {agent-rail, findings-rail, bottom-sheet}      (new)
    │   │   │       ├── kpi-strip.tsx · lens-toggle.tsx                       (new)
    │   │   │       ├── lens-chart.tsx · lens-table.tsx · lens-map.tsx · lens-calendar.tsx (new)
    │   │   │       ├── meter-drawer.tsx · finding-card.tsx                   (new)
    │   │   │       └── meter-table/ {columns, row, filters}                  (new)
    │   │   ├── onboarding/        (connect-a-source — replaces the reveal flow)
    │   │   │   ├── page.tsx (identify) · connect/page.tsx (source picker)    (new)
    │   │   │   ├── confirm/page.tsx · actions.ts                             (new)
    │   │   │   └── _components/ {connect-paths, bill-upload, spreadsheet-upload, confirm-client} (evolves)
    │   │   └── settings/page.tsx                                             (evolves)
    │   └── api/import/route.ts    (admin/dev extraction kickoff)             (new)
    ├── components/               (cross-agent primitives)
    │   ├── charts/ {tou-bars, sparkline, yoy} (visx)                         (evolves: visx rebuild)
    │   ├── ui/ {button, input, severity-badge, drawer}                       (new: per DESIGN.md)
    │   ├── nav.tsx · logo.tsx                                                (existing)
    │   └── map/ {map-canvas, pin}                                            (new: MapLibre)
    ├── copy/en.ts               (all user-facing strings; localization-ready) (existing/evolves)
    └── lib/
        ├── db.ts · cn.ts · format.ts (formatUsd/usage — money in one place)  (existing / new format.ts)
        ├── auth.ts              (Auth.js config: providers, Prisma adapter)  (new)
        ├── email.ts             (magic-link sender — stubbed boundary)       (new)
        ├── energy/             (pure tested math — keep)                     (existing)
        │   ├── rates.ts · rate-compare.ts · reconcile.ts · solar-nem.ts      (existing)
        │   ├── billing.ts · cycle-edge.ts · demand.ts · bill-audit.ts …      (existing)
        │   └── *.test.ts (colocated, every math file)                        (existing)
        ├── pge/
        │   ├── rate-card.ts     (dated tariff fixture loader)                (existing)
        │   └── schedule.ts      (serial-code → cycle-close lookup)           (evolves: from greenbutton)
        ├── extract/            (new: the PDF→JSON trust spine)
        │   ├── client.ts        (AI SDK v6 + Gateway model config)          (new)
        │   ├── pdf.ts           (pdf-lib page split)                         (new)
        │   ├── classify.ts      (page-type classifier)                      (new)
        │   ├── schema.ts        (Zod per page type; z.infer = the type)     (new)
        │   ├── extract.ts       (generateObject per page)                   (new)
        │   ├── pipeline.ts      (bounded-concurrency fan-out + coverage)    (new)
        │   └── *.test.ts                                                     (new)
        ├── normalize/          (canonical billing shape — the source seam)   (existing/evolves)
        │   ├── types.ts (canonical shape) · index.ts                        (existing)
        │   ├── pdf.ts (RawExtraction → canonical)                           (new)
        │   ├── espi.ts · bayou.ts (dormant adapters → same shape)           (existing)
        │   └── no-raw-source-in-ui.test.ts (guard — keep green)             (existing)
        ├── geo/                (new: map geometry)
        │   ├── plss.ts (parse Section-Township-Range-aliquot)               (new)
        │   ├── centroid.ts (BLM PLSS → lat/long)                            (new)
        │   ├── geocode.ts (address → lat/long via Census; stubbed)          (evolves from onboarding/geocode)
        │   └── *.test.ts                                                     (new)
        ├── spreadsheet/        (inventory import — keep)                     (existing)
        ├── onboarding/         (DB edges: farm.ts, source.ts; reveal removed)(evolves)
        ├── farm/  · dashboard/ (derive/aggregate over canonical shape)       (existing/evolves)
        ├── recommendations/    (grammar types, build, run)                   (existing)
        └── bayou/              (dormant client)                              (existing)
```

### Architectural Boundaries

- **API boundary:** no public REST/GraphQL. Server Components read Prisma; Server Actions mutate.
  The only route handlers are `api/auth/[...nextauth]` (Auth.js) and `api/import` (admin/dev
  extraction kickoff). External calls (AI Gateway, Census geocode, email) are server-only, behind
  `/lib` modules with stubbed boundaries.
- **Source boundary (the seam):** `extract/` and the dormant `normalize/{espi,bayou}` adapters all
  produce the **canonical shape** in `normalize/types.ts`. `/app` and `/lib/recommendations` import
  only the canonical shape — never a raw extraction type (`no-raw-source-in-ui.test.ts` enforces).
- **Math boundary:** `/lib/energy` + `/lib/pge` are pure (no DB/UI/network); every file colocates a
  `*.test.ts`. DB edges (`onboarding`, `farm`, `dashboard`) take an explicit `PrismaClient`.
- **UI boundary:** Server Components by default; client islands only for the lens toggle, drawer,
  map, charts, and forms. Tokens/copy never inlined — `globals.css` + `/copy/en.ts`.
- **Auth boundary:** `lib/auth.ts` is the single `auth()` source; the `(app)` group is gated;
  `(auth)` is public. User → Farm linkage lives in the schema.

### Requirements → Structure Mapping

| FR cluster | Lands in |
|---|---|
| A — Data foundation (FR-1–6) | `lib/extract/*`, `lib/normalize/{types,pdf}`, `lib/spreadsheet/*`, `lib/energy/reconcile.ts`, `prisma/schema.prisma`, `api/import` |
| B — Dashboard hero (FR-7–12, 22) | `app/(app)/energy/*`, `components/{charts,map,ui}`, `lib/dashboard/*` |
| C — Recs & levers (FR-13–18) | `lib/recommendations/*`, `lib/energy/{rate-compare,solar-nem,bill-audit}`, `lib/pge/{rate-card,schedule}`, findings rail + Calendar lens |
| D — Close-the-loop (FR-19–20) | `lib/energy/{reconcile,bill-audit}`, `lib/recommendations/run.ts`, drawer + KPI |
| E — Data-in (FR-21) | `app/(app)/onboarding/*`, `lib/onboarding/*`, `api/import` |
| Auth / returning user | `lib/auth.ts`, `lib/email.ts`, `app/(auth)/*`, `app/(app)/layout.tsx` |
| Map geometry | `lib/geo/*`, `components/map/*`, `lens-map.tsx` |

### Integration Points & Data Flow

- **Ingest:** admin import (`api/import`/action) → `extract/pipeline` (pdf-lib split → classify →
  `generateObject` per page, bounded concurrency) → `normalize/pdf` → `energy/reconcile` (cent gate
  + SA-ID identity) → Prisma (canonical shape + `coverageState`).
- **Render:** Server Components read Prisma → `lib/dashboard` derives → `app/(app)/energy` renders
  KPI/lens/drawer/findings; nuqs keys (`lens/entity/ranch/rate/meter`) drive view state.
- **External (server-only):** AI Gateway (extraction), US Census (geocode), email sender (magic
  link) — each a `/lib` module with a marked stub so the app runs with zero external calls in dev.
- **Demo resolution:** `dashboardFarm()` returns the latest real farm else the badged seed; real
  outranks demo, never merges.

### Development Workflow Integration

- **Dev:** `npm run dev` (Turbopack). Seeds (`db:seed`) load the badged Batth + sample farms so the
  app runs offline; the real account loads via `api/import` against the committed extraction fixture.
- **Build/deploy:** Vercel; new runtime fixtures (rate card, meter-read schedule, extraction sample)
  in `outputFileTracingIncludes`. `db:migrate` → `db:generate` after schema edits.
- **Test:** Vitest pure (`*.test.ts`) + db (`*.db.test.ts`); Playwright e2e on the throwaway
  `prisma/e2e.db` for the connect-source and dashboard flows.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All choices interoperate. Auth.js v5 and AI SDK v6 both support
Next.js 16 App Router; nuqs, visx, MapLibre GL 5.x, pdf-lib, and Zod are App-Router/server-safe;
Prisma stays pinned to v6 (no driver-adapter migration). No version or pattern conflict found.

**Pattern Consistency:** Patterns reinforce decisions — integer-cents money ↔ the FR-5 cent gate;
Zod-owns-the-boundary ↔ `generateObject` structured output ↔ the canonical seam; nuqs canonical keys
↔ lens/drawer/filter state; tokens-in-charts/map ↔ DESIGN.md. `needs_review`/coverage is one union
rendered one way everywhere.

**Structure Alignment:** The `(app)` shell, the `extract → normalize → reconcile` flow, and the
pure-math/UI/source boundaries all map onto the directory tree. `no-raw-source-in-ui.test.ts`
mechanically enforces the source boundary.

### Requirements Coverage Validation ✅

**Functional Requirements (22/22 supported):**
- A — FR-1 `spreadsheet/*`+schema · FR-2 `extract/{pdf,classify,schema,extract}` · FR-3 NEM page
  schema+`normalize` · FR-4 `normalize/types`+identity-checked join · FR-5 `energy/reconcile`
  (integer cents ±1) · FR-6 `coverageState`+`extract/pipeline`.
- B — FR-7 `kpi-strip` · FR-8 visx `tou-bars`+yoy · FR-9 `meter-table` (P0) · FR-10 `meter-drawer`
  · FR-11 nuqs filters+`dashboard` derive · FR-12 `geo/*`+`map`+`lens-map` · FR-22 CSV via the
  table view action (respects the active filter).
- C — FR-13 `recommendations`+`finding-card` · FR-14 `energy/rate-compare`+`pge/rate-card`+back-test
  · FR-15 `energy/solar-nem` · FR-16 `pge/schedule`+`lens-calendar` (serial-code) · FR-17 Status
  flag in table/drawer · FR-18 enrollment shown from extracted bill.
- D — FR-19 `energy/bill-audit`+`reconcile` (verification badge) · FR-20 `recommendations/run` result.
- E — FR-21 `api/import`+`onboarding`.

**Non-Functional Requirements:** correctness gate + pure tested math + no-hardcoded-rate +
no-fabricated-numbers (✓); planner-not-live posture, no streaming, honest predicted-vs-actual close
(✓); sub-second RSC+nuqs nav, desktop-primary responsive, extraction off the render path (✓); tokens
/ Inter / tabular / motion / copy-in-`/copy` (✓); credentials never in repo, env-only secrets,
`isDemo` separation (✓); clean boundaries for the monorepo move (✓).

### Implementation Readiness Validation ✅

**Decision Completeness:** all critical decisions documented with verified versions (Next 16.2.7,
Prisma 6, AI SDK v6, Auth.js v5, MapLibre 5.x).
**Structure Completeness:** complete annotated tree (existing/evolves/new), boundaries, FR→location
map, integration/data-flow.
**Pattern Completeness:** money, extraction contract, state unions, action shape, URL keys, dates/TOU
clocks, geo, tokens, logging, plus enforcement + anti-patterns.

### Gap Analysis Results

**Critical (block implementation):** none. No missing architectural decision blocks starting the
build.

**Important (build-time dependencies — not architectural holes):**
- **Extraction accuracy unproven** — the trust spine rides on a never-demonstrated cent-exact vision
  step. *Mitigation in the architecture:* the reconciliation gate withholds wrong numbers, and the
  PRD's week-2 milestone falls back to hand-verified extraction of the demo account. Prove early.
- **Fixture values must be sourced:** `pge-ag-rate-card.json` (dated tariff values + effective dates,
  PRD Open Q3) and `pge-meter-read-schedule.json` (the real 2026 serial→close table from PG&E's PDF).
  The loaders/fixtures exist; the values need populating + dating.
- **Rate back-test tolerance band** must be calibrated against real Batth bills during build
  (PRD Open Q2) — the one open item with real build consequences.
- **PLSS centroid source** — confirm a committable BLM PLSS section-centroid table (vs. an API) for
  `geo/centroid.ts`.

**Nice-to-have:**
- Magic-link email sender (Google SSO covers v1 login; email is the prod follow-up).
- A dedicated structured logger module for the extraction pipeline.
- Native Anthropic Batches API (50% off) for the deferred 57-account bulk pipeline.

### Validation Issues Addressed

The gaps above are data-sourcing/calibration tasks and one mitigated risk, not missing decisions.
They are tracked in the PRD's Open Questions and do not block standing up the data model, extraction
pipeline, canonical shape, dashboard shell, or auth. The extraction-accuracy risk is explicitly
de-risked by the reconciliation gate and the hand-verified fallback.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY WITH MINOR GAPS — the architecture is coherent and covers all 22 FRs and
the NFRs; the open items are build-time data-sourcing/calibration tasks and one mitigated risk, not
architectural holes.

**Confidence Level:** high.

**Key Strengths:**
- A correctness-gated pipeline: nothing renders unless it reconciles to the cent; `needs_review`
  propagates as one typed state.
- A clean source seam (canonical shape) that makes the PDF→Bayou swap and the Tool-2 monorepo move
  mechanical.
- Provable math isolated in tested `/lib/energy`; no hardcoded rates; dated/versioned fixtures.
- Largely brownfield-faithful: keeps the existing math, fixtures, and boundaries; adds only what the
  rebuild needs.

**Areas for Future Enhancement:**
- Native Batches API + bulk 57-account pipeline; live Bayou/Green Button adapter; production email +
  observability; richer DR/efficiency levers once interval/runtime data exists.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow the decisions and patterns exactly; read only the canonical shape in `/app`; gate every
  figure through reconciliation; keep `no-raw-source-in-ui` green; strings in `/copy`, money via the
  shared formatter, colors via tokens.

**First Implementation Priority:**
1. Prisma migration (Ranch, Array/NEMA, serialCode/rotatingOutageBlock, BillingLineItem,
   coverageState, Auth tables) → `db:migrate` → `db:generate`.
2. Zod canonical shape + reconciliation/SA-ID join in `/lib/{extract,normalize,energy}`.
3. Prove cent-exact extraction on the real demo account early (week-2 milestone), with the
   hand-verified fallback ready.
