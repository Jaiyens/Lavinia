---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/research-landscape.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md
  - _bmad-output/project-context.md
  - docs/product-ux-research.md
---

# Terra Tool 1 (PG&E Energy Dashboard) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Terra Tool 1, decomposing the requirements from the PRD, the UX Design spec (DESIGN.md + EXPERIENCE.md), and the Architecture decision document into implementable stories.

Terra Tool 1 is a brownfield rebuild of an existing running Next.js app: it takes a large grower's sprawling PG&E footprint (customer zero, Batth Farms: 183 meters / 57 accounts / 6 entities / 2 solar arrays on NEM2) and makes it legible in one correct place, then surfaces where money is hiding. Legible before predictive; correctness is the trust surface (no figure renders unless it reconciles to ground truth, else "needs review").

## Requirements Inventory

### Functional Requirements

_Stable global IDs from the PRD (FR-1...FR-22), grouped by the PRD's five feature clusters. Each is testable; full consequences live in PRD section 4._

**Cluster A - Data Foundation (the engine):**

- **FR-1: Inventory import.** Load the master spreadsheet into the farm ontology so every Meter is legible before any billing. The 7 billing-name variants dedupe to 6 Entities; all 183 Meters load organized Entity -> Account -> Ranch -> Meter; each Meter carries real name (Existing descriptor), Pump ID, SA ID, Rate Schedule (stored as read), Legacy flag, lat/long, GPM, Crop, Solar flag, Status; each Array links to its Benefiting Meters (NEMA); Rate Schedule is never inferred at import.
- **FR-2: Scanned-bill extraction.** Extract an image-only PG&E bill PDF into structured JSON per Service Agreement via vision/LLM, classifying each page type first (payment-confirmation / account summary / per-SA summary list / per-SA charge detail / NEM reconciliation). Per SA, extract the printed rate name, meter #, Pump ID, TOU energy split with charges, demand charge, NBCs, and every other line item composing the SA's printed total. Handle two-tier and three-tier (legacy) TOU. One PDF fans out to many SAs. Out of scope: 15-minute interval data and the demand-peak timestamp (cycle-level only).
- **FR-3: NEM reconciliation extraction.** Extract NEM meters' monthly rows + the annual True-up, including negative usage (not floored at zero), each captured as a distinct period, linked to the generating Array via SA ID.
- **FR-4: Canonical billing model + SA-ID join.** Normalize all extracted billing into one canonical multi-period shape and attach it to inventory via SA ID; the dashboard/math/recs read only the canonical shape; the future Bayou adapter targets the same shape; the SA-ID join is identity-checked (extracted meter # + Pump ID must match the inventory row, else "needs review").
- **FR-5: Reconciliation guardrail.** A figure renders only if its full set of extracted line items reconciles to the printed total within $0.01 (at SA level vs the SA printed total, and at account level vs the account total); otherwise it is withheld and marked "needs review." OCR errors surface as "needs review," never as wrong numbers. Proven on one account before any bulk extraction.
- **FR-6: Partial-billing coverage.** Track Billing Coverage per Meter and Account; the full 183-meter inventory renders day one regardless of billing ingested; each Meter/Account shows an honest coverage state (no bill / needs review / reconciled). Bulk across 57 accounts is out of scope for v1.

**Cluster B - Dashboard (the hero, legibility):**

- **FR-7: Home summary cards (KPI strip).** Lead with a small set of KPI cards: hero = total PG&E spend scoped to covered period with a coverage indicator ("N of 183 meters loaded") beside it; a demand-charge exposure card; a biggest-cost-mover card (only when a meter has >=2 covered periods, else hidden gracefully). Each card pairs a number with a sparkline + vs-last-period delta when >=2 covered periods exist, degrading gracefully to number-only with one period. Tabular figures; no overpayment/savings/projection card.
- **FR-8: Spend and TOU chart.** One chart: energy split by TOU period (Peak / Part-Peak / Off-Peak; legacy three-tier renders Part-Peak, current two-tier omits it) with a year-over-year toggle drawn from the multi-period canonical shape.
- **FR-9: Meter table (P0).** A single dense sortable/filterable table of every meter. Columns: real name, ranch, entity, rate schedule, legacy flag, this-cycle cost, demand charge ($), status, coverage. Sortable by any column; filterable by entity / ranch / rate; concerning cells traffic-light tinted; a meter with no reconciled billing still shows its inventory row with a coverage state, never a blank or fabricated cost; mobile degrades to a simplified sortable list.
- **FR-10: Meter drawer.** Clicking a row / map pin / chart bar opens a side drawer with that meter's full detail without leaving context: canonical billing detail (rate, TOU split, demand) + inventory (pump name, ranch, crop, GPM, status). Solar meters additionally show Array linkage, NEM allocation, True-up. That meter's findings appear in the drawer, each tracing to visible data.
- **FR-11: Rollup and filter.** Filtering by entity / ranch / rate recomputes both the cards and the table to that subset; clearing returns to the whole farm; money rollups count only covered (reconciled) meters; the coverage indicator reflects the active filter.
- **FR-12: Map view (co-equal home lens).** A lightweight read-only map of geotagged meters; every meter with lat/long renders a pin colored by status/$-at-risk; tapping a pin opens the same drawer (FR-10); inventory-driven so it renders fully day one and on the partial-billing seed.
- **FR-22: CSV export.** One click exports the current meter view to CSV, respecting the active entity/ranch/rate filter; exported figures match the screen; "needs review" cells export as "needs review," never a fabricated number. (SGMA energy-to-water export is out of scope.)

**Cluster C - Recommendations and the energy levers (the money, secondary):**

- **FR-13: Recommendation feed.** Present Recommendations in the grammar (situation + action + impactUsd?/impactNote? + severity(info|watch|act) + status(pending|done|dismissed|overridden) + result?), secondary to the dashboard, in a feed and inside the relevant meter's drawer (never a home hero card). Each shows reasoning, one concrete action, the dollar impact, a one-tap response; v1 records status + after-the-fact result. Every finding traces to data visible on the dashboard; a finding with no $ impact and no impactNote is not shown.
- **FR-14: Rate optimization (lever 1, fully real).** Identify meters on a non-optimal/legacy schedule and quantify the dollar impact of switching to the cheapest eligible schedule, using a dated versioned PG&E ag tariff fixture + the meter's own usage. Fixture bounded to Batth's schedules + current-equivalents. Back-test gate: recompute the meter's current charges from the fixture and compare to billed within a calibrated small percentage band; on pass show savings as a labeled estimate with rates + effective date; on fail fall back to a qualitative legacy->current finding. Respect the 35 kW threshold and the once-per-12-months switch constraint; the 27 legacy meters are the lead. No rate hardcoded in code.
- **FR-15: Solar/NEM demand insight (lever 4).** For solar meters that are both NEM and on a demand-carrying schedule (AG-C family), surface the retrospective insight that solar does not offset the demand charge; never renders on a solar meter with no demand charge; states the meter's energy position (net-zero / net credit) alongside the demand charge still owed ($), tied to the 5-8pm peak; appears in the drawer's NEM section and as a feed item.
- **FR-16: Billing-cycle timing / Calendar lens (lever 5).** Derive each meter's cycle-close date from its serial code + the 2026 meter-read schedule fixture; present it as the Calendar lens (co-equal with Chart / Table / Map), kept lightweight. The serial letter is distinct from the rotating outage block; scheduled vs actual close are both carried and labeled honestly.
- **FR-17: Pump health flag (lever 3).** Show Status (GOOD / BAD / NEW WELL / OLD) from the master field in the table and drawer; flag BAD. No kWh-per-gallon or efficiency figure is computed or shown.
- **FR-18: Enrollment status (lever 2, info only).** Display DR/program enrollment (e.g. PDP) as legible info pulled from the bill; generate no DR recommendation or savings claim.

**Cluster D - Close-the-loop (accuracy and realized results):**

- **FR-19: Bill-accuracy verification (accuracy, not a forecast).** Independently recompute a posted bill from the tariff fixture + the meter's own TOU usage and billed demand, and show whether it matches the actual posted total; on match (within tolerance) show a verification badge worded as independent calculation matching the bill; copy never claims prediction/forecast. (This is what licenses the alternative-schedule numbers in FR-14.)
- **FR-20: Recommendation result (the close-the-loop).** On acceptance of a Recommendation, record the predicted impact; populate `result` with the realized number from the first bill that posts after acceptance; until then `result` reads "pending"; v1 shows the diff (predicted vs realized), not why it differed.

**Cluster E - Data-in (concierge import):**

- **FR-21: Concierge/admin import.** Ingest inventory (master spreadsheet) and billing (PG&E PDFs) via an admin/dev import path; one account proven before bulk; no grower-facing self-serve upload page in v1; the Bayou live-connect flow remains present but dormant, targeting the canonical billing shape. (Reconciled with the UX spine to operator-operable connect, not grower-self-serve - see AR-16 and UX-DR21.)

### NonFunctional Requirements

_Cross-cutting quality attributes from PRD section 7 + feature NFRs. The design system in project-context.md / DESIGN.md is the source of truth for visual detail._

- **NFR-1 (Reconciliation gate):** No figure renders unless it reconciles to ground truth within tolerance, else "needs review." Target: 100% of displayed figures tie to the cent on the proven account (SM-3).
- **NFR-2 (Provable math):** Pure energy math lives in tested `/lib/energy` functions; new energy logic ships with a colocated `*.test.ts`. This is the trust surface.
- **NFR-3 (No hardcoded rates):** Never hardcode a rate or `$/kW`; dollars are read from data; the tariff fixture is dated and versioned.
- **NFR-4 (No fabricated numbers):** Nothing inferred (efficiency, coverage, projection) is presented as measured; a missing value renders as `needs_review`, never 0/blank/guess.
- **NFR-5 (Planner posture):** Planner, not live meter - PG&E data lags ~1 day; demand analysis is cycle-level; no real-time, spike, or remote-control claims; no streaming.
- **NFR-6 (Performance):** Sub-second navigation across cards, table, drawer, and map.
- **NFR-7 (Form-factor):** Desktop/tablet is the primary build target (both six-week demos run on a laptop); a clean responsive phone view; mobile-first as a discipline so nothing breaks on a phone; the dense table is a tablet/desktop progressive enhancement over a mobile core of hero + KPIs + simplified list + drawer (+ map).
- **NFR-8 (Comprehension bar):** A non-technical grower answers the main question on each screen (which pump is costing me, and why) in under ~10 seconds from the home screen.
- **NFR-9 (Design system):** Editorial agrarian-luxury - warm paper background (never pure white), warm charcoal text (never pure black), one dominant green (`#2FA84F`) + one accent, traffic-light status (watch/act earn amber/clay-red); no glassmorphism or heavy gradients; all colors as CSS variables in one tokens file.
- **NFR-10 (Typography):** Inter across display, body, and data (loaded via `next/font`); hierarchy from weight + size, not mixing families; tabular figures everywhere a number appears. **Money is NOT the loudest thing on the page** and never a lone hero number - it reads clearly as the story the chart/table/map hero tells, in service of the north star (the farm, known at a glance / situational awareness), per EXPERIENCE.md. (Per Jaiyen 2026-06-08: (a) Inter is the main font, overriding the Helvetica Neue in DESIGN.md / project-context.md; (b) money is not the loudest element - EXPERIENCE.md governs. The PRD, DESIGN.md, project-context.md, and CLAUDE.md were all rewritten on 2026-06-08 to use Inter and to remove the money loudest/largest claim, so all four now agree.)
- **NFR-11 (Motion):** One orchestrated motion moment per view; easing `cubic-bezier(0.16, 1, 0.3, 1)`, 400-700ms, stagger 60-100ms, no bounce/overshoot; honor `prefers-reduced-motion` (instant fallback).
- **NFR-12 (Voice):** Plain operator English in the grower's words (blocks, sets, hours, acres, pumps, ranches); never kW, "15-minute interval," or AI jargon on the surface; no em dashes, no exclamation marks; all user-facing copy in `/copy` (localization-ready).
- **NFR-13 (Security):** Grower utility credentials never touch the repo, client code, or anything agent-readable; env-only secrets; exports/fixtures for dev, real auth in prod.
- **NFR-14 (Privacy / demo separation):** Real grower financials are never shown to investors; the badged "Representative data" seed is the investor surface; real and demo farms are separate rows that never merge; a connected real farm outranks the seed, which then stops rendering.
- **NFR-15 (Architecture for the monorepo move):** Clean boundaries (pure logic `/lib/energy`, ingestion `/lib`, DB edges, UI `/app`, strings `/copy`); the canonical billing shape isolates the source so the PDF->Bayou swap changes nothing downstream; single Next.js repo structured so the Tool 2 monorepo move is mechanical.
- **NFR-16 (Accessibility floor):** Color is never the only signal (pair $-at-risk and severity with value/label); tap targets >=44pt; tabular figures + type scale legible at the largest dynamic type with no truncated dollars; every interactive element labeled role + state for screen readers; focus traversal KPI strip -> lens -> findings rail (-> drawer when open).

### Additional Requirements

_Technical requirements from the Architecture decision document (and project-context.md) that shape epic/story creation. Labelled AR-N._

- **AR-1 (Foundation / no new starter):** Brownfield rebuild - the existing repo IS the foundation (Next.js 16.2.7 App Router + Turbopack + npm; React 19; TS strict + `noUncheckedIndexedAccess` + no-`any`; Prisma 6 pinned (do NOT move to v7); SQLite; Tailwind v4 CSS-variable tokens; Vitest node env; Playwright; tsx; motion; lucide-react; fast-xml-parser). The "init story" equivalent is scaffolding the rebuild within the existing structure (new data model + canonical shape + OS-shell UI), with no dependency churn beyond what the rebuild needs (vision/AI SDK, MapLibre, visx, nuqs, pdf-lib, Zod, Auth.js).
- **AR-2 (Data-model migration):** Evolve `prisma/schema.prisma` additively: add `Ranch` (rollup level); a solar `Array` model with an explicit Array -> benefiting-Meter (NEMA) relation + per-array `trueUpMonth`; `serialCode` + `rotatingOutageBlock` on Meter (kept distinct); `BillingLineItem` as a child of `BillingPeriod` + an actual `cycleClose` date; `coverageState` per Meter/Account; Auth tables (User/Account/Session/VerificationToken). Union/enum-like fields stay `String` mirrored by TS literal unions; `action`/`result` on Recommendation stay `Json`; `isDemo` + `dashboardFarm()` resolution unchanged. `db:migrate` -> `db:generate`.
- **AR-3 (Extraction pipeline substrate):** Vercel AI Gateway + AI SDK v6 (`ai`) via `"anthropic/claude-*"` provider strings; default model `anthropic/claude-opus-4-8`; documented cost lever - run per-page on `anthropic/claude-sonnet-4-6` and escalate pages that fail the cent gate to Opus. `pdf-lib` splits the PDF per page -> Claude native PDF/vision (no rasterization); page classified before extraction; bounded-concurrency fan-out from an admin/dev import action; results stream into the DB, the dashboard fills as SAs reconcile.
- **AR-4 (Validation / schema = Zod):** Zod is the single source of truth for extraction structured output, runtime boundary validation, and the canonical-shape contract; the TS type is `z.infer<typeof Schema>` - never a parallel hand-written interface.
- **AR-5 (Extraction -> canonical -> reconcile contract):** Three typed layers, one direction: `RawExtraction` (per page type) -> normalize -> canonical billing shape (`/lib/normalize/types.ts`) -> reconcile/coverage. `/app` and `/lib/recommendations` read only the canonical shape; `no-raw-source-in-ui.test.ts` stays green; the SA-ID join is normalized + identity-checked, mismatch -> `needs_review`.
- **AR-6 (Money representation):** Billed amounts are stored and compared as integer cents (reconciliation passes iff `abs(sumLineItemCents - printedTotalCents) <= 1`); rates/usage keep full precision (kWh 6dp, $/kWh 5dp, kW as printed); `formatUsd(cents)` lives in one place (`/lib/format`); all money/usage render with `tabular-nums`. Never store a billed amount as a float.
- **AR-7 (Auth):** Auth.js v5 (next-auth v5), self-hosted, `@auth/prisma-adapter` on the Prisma/SQLite DB; Google SSO + email magic link (no passwords); unified `auth()` in Server Components / Actions / middleware; `AUTH_*` env prefix; the magic-link email sender is a stubbed boundary in v1 (marked TODO), a real sender for prod; returning users land straight in the dashboard; logged-in-no-data routes to the connect-a-source picker.
- **AR-8 (Map / geo stack):** MapLibre GL JS 5.x, read-only, custom agrarian-luxury style; pins colored by $-at-risk; tap -> the shared drawer. Geometry self-hosted: PLSS Section-Township-Range -> centroid via a committed BLM PLSS lookup; street addresses via the free US Census geocoder (stubbed boundary). Unresolvable meters go to a "no location yet" tray. No paid map key, no Bayou for geo. (Confirm a committable BLM PLSS section-centroid table.)
- **AR-9 (Charts):** Custom SVG built on `visx` primitives (scales/shapes) - TOU-stacked bars, sparklines, YoY; read CSS-variable design tokens, never literal hex.
- **AR-10 (Client state / URL keys):** `nuqs` URL search params with fixed canonical keys: `lens` (`chart|table|map|calendar`), `entity`, `ranch`, `rate`, `meter` (open-drawer SA ID). Every component reads/writes these same keys; switching lens never drops the active filter or open `meter`.
- **AR-11 (API & data flow):** Server Components for reads, Server Actions (`actions.ts`) for mutations; no REST/GraphQL/tRPC. The only route handlers are `api/auth/[...nextauth]` (Auth.js) and `api/import` (admin/dev extraction kickoff). Actions return a discriminated `ActionResult<T> = {ok:true;data:T} | {ok:false;error:string}` (do not throw for expected failures); revalidate explicitly after mutations; DB edges take an explicit `PrismaClient`.
- **AR-12 (Infra / deploy):** Vercel (Fluid Compute, 300s ceiling); extraction runs as bounded-concurrency fan-out, long imports chunk work rather than one 101-page call; secrets (`AI_GATEWAY_API_KEY`/OIDC, `AUTH_SECRET` + Google creds, email sender creds, dormant Bayou key) via Vercel env, never committed; CI = lint + Vitest (pure + db) + Playwright e2e on the throwaway `prisma/e2e.db`, deploy previews per branch.
- **AR-13 (New runtime fixtures + the Vercel trap):** New runtime-read fixtures - `pge-ag-rate-card.json` (dated tariff values + effective dates, bounded to Batth schedules + current-equivalents), `pge-meter-read-schedule.json` (the real 2026 serial->close table from PG&E's PDF), and a committed reconciled extraction sample (`fixtures/extract/batth-account-*.json`) - must be read via `process.cwd()` (not `import.meta.url`) and added to `outputFileTracingIncludes`. Values must be sourced/dated; the back-test tolerance band is calibrated against real Batth bills during build.
- **AR-14 (Dates & the two TOU clocks):** Store dates as `DateTime` (period start/end, `cycleClose`, true-up), California/Pacific only; serial + schedule yields the scheduled close, the posted bill yields the actual close - carry both, label honestly. Two TOU clocks stay separate in code and copy: AG rate peak 5-8pm (demand math) vs PDP/DR event window 4-9pm (DR copy).
- **AR-15 (Tokens / unions / logging):** visx charts and the MapLibre style read CSS-variable tokens, never literal hex; `coverageState: 'no_bill' | 'needs_review' | 'reconciled'` is one union with one render treatment everywhere (table cell, drawer, map pin, rollup, CSV); the recommendation grammar is verbatim from `/lib/recommendations/types.ts` (no new severity colors: act=clay, watch=type-only, info=muted); pipeline logging never logs grower credentials, the Gateway key, full bill bytes, or PII (log SA ID + page type + reason).
- **AR-16 (Onboarding tension resolved):** FR-21 "concierge/admin-only, no grower-facing upload" reconciles with the binding UX spine as operator-operable connect (not grower-self-serve): a real connect-a-source onboarding UI (PG&E authorization / bill upload / spreadsheet, gate >=1) plus an auth surface (Google SSO / magic link). Decided deliberately as an architecture decision; still covers the on-site/concierge case.
- **AR-17 (Implementation sequence, protects the PRD spine FR-1,2,4,5,7,9,14):** (1) Prisma migration; (2) Zod canonical shape + reconciliation/SA-ID join; (3) extraction pipeline (pdf-lib split -> classify -> generateObject per page -> normalize -> reconcile); (4) dashboard shell + table (P0) + KPI strip reading the canonical shape + coverage honesty; (5) rate lever (tariff fixture + back-test) + the serial-code Calendar lens; (6) map (MapLibre + geo) + charts (visx) + findings rail + auth + connect-a-source onboarding. Prove cent-exact extraction early (~week 2) with a hand-verified fallback ready.

### UX Design Requirements

_First-class actionable work items from the binding UX spec (DESIGN.md visual identity + EXPERIENCE.md IA/behavior/flows). DESIGN.md/EXPERIENCE.md win on conflict. Labelled UX-DR-N._

**Design tokens & primitives:**

- **UX-DR1 (Color token system):** Implement the full DESIGN.md palette as CSS variables in one tokens file: surface tiers (`surface #FAF9F4`, surface-dim/bright, surface-container-lowest..highest), `on-surface #1A1A17`/`on-surface-variant #5A554C`, inverse-surface/on, `outline`/`outline-variant #D9D4C6`, `primary #2FA84F`/on-primary/primary-container/on, `money-positive #1FBF5A`/on, `alert #BD4B34`/on/alert-container/on, background/on-background. Three colors max per screen (green, clay, charcoal-on-paper); `watch` severity has no dedicated color.
- **UX-DR2 (Typography scale):** Implement the named type roles in **Inter** (loaded via `next/font`): `money-hero` (56/700), `display-lg` (40/700) + `display-lg-mobile` (30/700), `headline` (24/700), `title` (18/600), `body-lg` (17/400), `body-md` (15/400), `num-tabular` (15/400, tabular-nums), `label-caps` (12/600 uppercase tracked), `caption` (13/400). `tabular-nums` on all numeric/dollar/usage values. (Sizes/weights are from DESIGN.md; the family is overridden to Inter per Jaiyen.)
- **UX-DR3 (Spacing & shape tokens):** 8px spacing unit; gutter 24, margin-mobile 20, margin-desktop 48, agent-rail 240px, findings-rail 320px; rounded scale (sm .25rem, default .375rem, md .5rem, lg .75rem, full); larger objects (drawer, sheet, map frame, modals) use `lg`.
- **UX-DR4 (Elevation system):** Depth via tonal warm-paper layering (`surface-container-*`) + soft warm-tinted ambient shadow (`rgba(26,26,23,0.06)`, 20px+ blur, very low opacity); hairline 1px `outline-variant` borders before reaching for a shadow; only the meter drawer and the mobile bottom sheet lift meaningfully.

**Shell & navigation:**

- **UX-DR5 (Three-zone OS shell):** Build the inverted-L shell - agent-rail (240px, left) / data hero (fluid center) / findings-rail (320px, right). The center stacks KPI strip -> lens toggle -> active lens -> shared drawer overlay. Server Components with client islands (lens toggle, drawer, map, charts).
- **UX-DR6 (Agent rail):** Vertical list of agents (icon + label); active agent uses `primary`; live agents full-contrast; future agents (Water / Labor) render at reduced opacity with a "coming" tag and are non-interactive; lists agents, not features. Home = the Energy dashboard today, growing a thin cross-agent strip when a 2nd agent ships.
- **UX-DR7 (Mobile responsive shell):** Agent rail -> bottom tab bar; center full width; findings rail -> peeking bottom sheet; meter drawer -> full-height sheet; dense table -> simplified sortable list; side margins hold at 20px; map and drawer behave identically across surfaces (only the chrome changes).

**Hero components:**

- **UX-DR8 (KPI card / strip):** `kpi-card` = `label-caps` + a `num-tabular` value + a small sparkline + a vs-prior delta (green favorable, `alert` clay adverse); a strip of 3-4 sits above the lens; tapping a card filters/scrolls the lens to its driver; never a lone hero number.
- **UX-DR9 (Lens toggle):** Segmented control Chart / Table / Map / Calendar; Chart is the default face; one lens visible at a time; active tab uses `primary` underline/weight; switching lenses never loses the active entity/filter or the open drawer.
- **UX-DR10 (Cost chart - Chart lens):** TOU-stacked bars (peak / partial-peak / off-peak) over time with a year-over-year toggle; dollars on the axis; click a bar -> drawer for that meter/period; the default hero visual.
- **UX-DR11 (Meter table - Table lens):** Dense, sortable, filterable; every meter a row; tabular figures; concerning values tinted `alert`; sort by any column, filter by entity/ranch/rate; row click -> drawer; CSV export respects the active filter; mobile degrades to a simplified sortable list.
- **UX-DR12 (Meter drawer):** Right-side (desktop) / full-height sheet (mobile), opened from any chart bar, table row, or map pin; the single shared meter-detail surface across lenses; closes to the lens it came from with state intact.
- **UX-DR13 (Farm map - Map lens):** Zoomable, read-only; meter pins colored by $-at-risk (green -> clay); tap a pin -> drawer; renders fully from inventory on day one and on partial data; unlocated meters go to a "no location yet" tray.
- **UX-DR14 (Finding card - findings rail):** Situation line + one concrete action + dollar impact (`num-tabular`) + severity + a one-tap response; v1 displays/records, never executes; resolving a finding traces to data visible on the dashboard (highlights the meter's pin/row when focused); `act`=`alert` accent, `watch`=type-only, `info`=muted; the rail is calm by default, not a to-do list.
- **UX-DR15 (Bottom sheet - mobile findings):** A peeking summary ("N findings - ~$X up") that drags/taps to expand to the rail's full content.
- **UX-DR16 (Button):** Primary = solid `primary` fill, `on-primary` text, generous horizontal padding; secondary = 1px `outline-variant` + `on-surface` text; one primary per screen.
- **UX-DR17 (Input):** Minimalist; `label-caps` above; hairline underline/box `outline-variant` -> `primary` on focus.
- **UX-DR18 (Severity badge):** `info` / `watch` / `act`; `act`=`alert`, `watch`=charcoal weight + label (no fill), `info`=muted.

**Behavior, states & flows:**

- **UX-DR19 (State patterns):** Implement each EXPERIENCE.md state - cold open valid session -> straight to dashboard (no splash, no re-onboard); cold open no session -> login (Google SSO / magic link only); logged-in-no-data -> connect-source picker (not a dead end); partial import -> show what we have, unreadable fields flagged "Confirm it" not blank-faked, map known pins + tray; couldn't-read-a-bill -> confirm step lists the specific fields for inline correction; representative/demo -> persistent "Representative data" badge; empty findings -> "Nothing needs you right now"; filtered-to-zero -> "No meters match" + clear-filter affordance; live-pull-pending -> "PG&E is connecting. Your bills are already in."
- **UX-DR20 (Reveal motion):** One orchestrated staggered reveal on data landing (KPI strip, then chart, then map pins settle); fires once per data-landing, not per visit; honors reduced-motion (instant final state).
- **UX-DR21 (Onboarding / connect-a-source flow):** Identify (farm name + contact, operator-operable) -> connect a data source (Connect PG&E authorization / Upload bills / Upload meter-master spreadsheet; gate = >=1 real source; add accounts iteratively) -> confirm only what we could not read, inline -> land in the dashboard. The LOA is an upgrade after value, never the entry gate; never re-ask for address/city/zip/phone printed on an uploaded bill; "Tour a sample" opens the badged representative dashboard with zero commitment.
- **UX-DR22 (Interaction primitives & banned patterns):** Tap/click to act, one primary action per screen; the lens toggle + drawer are the two core moves; map pinch/scroll zoom + tap-pin, table tap-header sort / tap-row drill, chart tap-bar drill, mobile findings drag to expand/peek. Banned: carousels, autoplaying hero animations every open, badge-count anxiety, push re-engagement, real-time "spike now" alerts.
- **UX-DR23 (Accessibility floor):** Every interactive element labeled role + state (lens toggle announces the active lens; drawer announces its meter); color never the only signal ($-at-risk + severity pair color with value/label); tabular figures + type scale legible at the largest dynamic type with no truncated dollars; reduce-motion skips reveal + lens transitions; tap targets >=44pt; focus traversal KPI strip -> lens -> findings rail (-> drawer); plain-language microcopy as an accessibility floor.
- **UX-DR24 (Voice & microcopy):** Apply the EXPERIENCE.md do/don't microcopy table - the grower's words (blocks/sets/hours/acres/pumps/ranches), plain sentences, no em dashes, no exclamation marks, no kW / "15-minute interval" / tariff-schedule jargon on the surface; concrete dollar phrasings; all strings in `/copy`.

### FR Coverage Map

_All 22 FRs mapped to exactly one owning epic._

- **FR-1** inventory import -> Epic 1 (spreadsheet -> farm ontology, 183 meters day one)
- **FR-2** scanned-bill extraction -> Epic 1 (page-classified vision/LLM -> JSON)
- **FR-3** NEM reconciliation extraction -> Epic 1 (monthly rows + true-up, negative usage)
- **FR-4** canonical shape + SA-ID join -> Epic 1 (the source seam, identity-checked)
- **FR-5** reconciliation guardrail -> Epic 1 (one-cent gate, "needs review")
- **FR-6** partial-billing coverage -> Epic 1 (honest coverage state per meter/account)
- **FR-7** KPI strip -> Epic 2 (compact cards + coverage indicator, no lone hero number)
- **FR-8** TOU chart + YoY -> Epic 2 (Chart lens)
- **FR-9** meter table (P0) -> Epic 2 (Table lens, the spine)
- **FR-10** meter drawer -> Epic 2 (shared drill-in across lenses)
- **FR-11** rollup & filter -> Epic 2 (entity/ranch/rate)
- **FR-12** map lens -> Epic 2 (Map lens, inventory-driven)
- **FR-22** CSV export -> Epic 2 (respects active filter)
- **FR-13** recommendation feed -> Epic 3 (the grammar, secondary to the dashboard)
- **FR-14** rate optimization -> Epic 3 (the one fully-real lever, lead with 27 legacy meters)
- **FR-15** solar/NEM demand insight -> Epic 3 (AG-C-family solar meters)
- **FR-16** billing-cycle Calendar lens -> Epic 3 (serial-code -> cycle close)
- **FR-17** pump-health flag -> Epic 3 (Status field, no efficiency number)
- **FR-18** enrollment info -> Epic 3 (DR shown as info, no rec)
- **FR-19** bill-accuracy verification -> Epic 4 (independent recompute badge)
- **FR-20** recommendation result -> Epic 4 (predicted vs realized)
- **FR-21** concierge/admin import -> Epic 5 (operator-operable connect + auth; the import action it wraps is built in Epic 1)

## Epic List

### Epic 1: The Reconciled Data Engine
The grower's entire operation is loaded and every billing figure is proven correct. All 183 meters load from the master spreadsheet day one (organized Entity -> Account -> Ranch -> Meter, real pump names); scanned image-only PG&E bills are extracted by page-classified vision/LLM, normalized into one canonical multi-period shape, joined on SA ID (identity-checked), and gated by the one-cent reconciliation guardrail so a wrong number never reaches the screen; partial coverage is tracked honestly. This is the trust spine and the product's riskiest surface, so it owns its own epic boundary.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
**Carries:** AR-1 (brownfield foundation), AR-2 (Prisma migration - first story), AR-3 (AI Gateway + AI SDK v6 extraction), AR-4 (Zod owns the boundary), AR-5 (extraction -> canonical -> reconcile contract), AR-6 (integer-cents money), AR-13 (tariff/extraction fixtures), AR-12 (admin import kickoff). NFR-1/2/3/4 (reconciliation gate, provable math, no hardcoded rates, no fabricated numbers).
**Story ordering:** Prisma migration -> inventory import (low-risk, day-one legibility) -> page-classified extraction -> NEM extraction -> canonical shape + identity-checked join -> reconciliation guardrail + coverage. Prove cent-exact extraction on the real demo account early (~week 2), hand-verified fallback ready (PRD section 6.3).

### Epic 2: The Legible Dashboard (the farm, known at a glance)
The grower opens the app and sees his whole farm: the three-zone OS shell (agent rail / data hero / findings rail), a KPI strip with the honest coverage indicator (compact number+sparkline+delta cards, no lone hero number), the dense sortable/filterable meter table (P0), the TOU-stacked cost chart with year-over-year, the inventory-driven map, the shared meter drawer, rollup/filter by entity/ranch/rate, and one-click CSV export. The data hero is the story; money reads clearly within it but is never the loudest single element. Realizes UJ-1 and is the conversion surface.
**FRs covered:** FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-22
**Carries:** the design-token system + app shell + base UI primitives as first stories (UX-DR1-7, UX-DR16-18), then the lenses (UX-DR8-13). AR-8 (MapLibre + self-hosted PLSS/Census geo), AR-9 (visx charts), AR-10 (nuqs URL keys), AR-11 (RSC + Server Actions), AR-15 (tokens/unions/logging). NFR-6/7/8 (sub-second nav, desktop-primary/mobile-discipline, <10s comprehension), NFR-9/10/11 (design system, Inter + tabular figures, motion), NFR-16 (accessibility floor). Reads ONLY the canonical shape from Epic 1.
**Story ordering / risk:** protect the spine - shell + tokens -> KPI strip -> table (FR-9, P0) -> drawer -> rollup/filter -> CSV -> chart -> map. Per PRD section 6.3 cut-order, the map (FR-12) and the FR-8 YoY toggle are the first to defer if the parser overran.

### Epic 3: Find the Money (recommendations & levers)
Once the picture is trusted, the same data surfaces where money is hiding. The secondary findings rail/feed presents recommendations in the grammar; rate optimization is fully computed (dated tariff fixture + back-test gate, lead with the 27 legacy meters); the solar/NEM demand insight shows solar does not offset the demand charge (AG-C-family solar only); the serial-code Calendar lens shows each meter's cycle close; pump health is flagged from the Status field; DR enrollment is shown as info. Every finding traces to data visible on the dashboard. Realizes UJ-3.
**FRs covered:** FR-13, FR-14, FR-15, FR-16, FR-17, FR-18
**Carries:** AR-13 (dated tariff fixture + back-test tolerance band), AR-14 (the two TOU clocks: 5-8pm rate peak vs 4-9pm DR window), UX-DR14 (finding card), UX-DR24 (voice/microcopy). NFR-1/2/3 (reconciliation gate, provable rate math, no hardcoded rates). Builds on Epic 1 (canonical shape) + Epic 2 (the dashboard findings trace to).

### Epic 4: Close the Loop (accuracy & realized results)
Trust compounds across cycles. Bill-accuracy verification independently recomputes a posted bill from the tariff fixture + the meter's own usage and shows it matched (accuracy, not a forecast - copy never claims prediction); and for an accepted recommendation, the predicted impact is shown against the realized number from the next posted bill ("pending" until it posts). v1 shows the diff, not why. Realizes UJ-2.
**FRs covered:** FR-19, FR-20
**Carries:** NFR-1/2/5 (reconciliation, provable math, planner-not-live-meter posture). Builds on Epic 1 (reconcile) + Epic 3 (the recommendation grammar). Additively enhances the drawer/KPI (Epic 2) and recommendation `result` (Epic 3) - enhancement, not file churn.

### Epic 5: Get In (sign-in & connect a source)
A returning grower logs in (Google SSO / magic link, no passwords) straight to his dashboard; an operator sets up a new farm via the value-honest connect-a-source flow (Connect PG&E authorization / Upload bills / Upload meter-master spreadsheet; gate = at least one real source; add accounts iteratively; confirm only unreadable fields inline); "Tour a sample" opens the badged representative dashboard with zero commitment. The LOA is an upgrade after value, never the entry gate. Wraps the engine's import path in operator-operable UI + auth.
**FRs covered:** FR-21
**Carries:** AR-7 (Auth.js v5 + Prisma adapter + Google/magic-link, stubbed email sender), AR-16 (operator-operable onboarding resolution), UX-DR19 (state patterns), UX-DR20 (reveal motion), UX-DR21 (connect-a-source flow). NFR-13/14 (credentials never in repo, demo separation). Last per AR-17 (the demos run on the loaded dashboard without needing auth). Builds on Epic 1 (the importer it drives) + Epic 2 (lands in the dashboard).

---

## Epic 1: The Reconciled Data Engine

The grower's entire operation is loaded and every billing figure is proven correct. All 183 meters load from the master spreadsheet day one (Entity -> Account -> Ranch -> Meter, real pump names); scanned image-only PG&E bills are extracted by page-classified vision/LLM, normalized into one canonical multi-period shape, joined on SA ID (identity-checked), and gated by the one-cent reconciliation guardrail so a wrong number never reaches the screen; partial coverage is tracked honestly. This is the trust spine.

### Story 1.1: Evolve the Prisma data model for the farm inventory

As a Terra engineer,
I want the Prisma schema evolved to represent the full farm inventory ontology,
So that all 183 of the grower's meters can be stored faithfully with their real attributes before any billing exists.

**Acceptance Criteria:**

**Given** the existing Prisma v6 / SQLite schema, **When** the migration is applied, **Then** it adds `Ranch` (rollup level), a solar `Array` model with an explicit Array -> benefiting-Meter (NEMA) relation and a per-array `trueUpMonth`, and a `Crop` entity, **And** evolves `Entity` to carry both `billingName` and `actualOwner`.

**Given** the Meter/Pump model, **When** the migration is applied, **Then** each Meter carries SA ID, meter #, Pump ID, rate schedule (stored as-read), legacy flag, lat/long, GPM, crop, solar flag, status, **And** `serialCode` and `rotatingOutageBlock` as two distinct fields.

**Given** union/enum-like fields, **When** defined, **Then** they are Prisma `String` columns mirrored by TS string-literal unions, not enums.

**Given** the migration, **When** `db:migrate` then `db:generate` run, **Then** both succeed and the generated client type-checks under strict + `noUncheckedIndexedAccess` + no-`any`.

**Given** Auth and billing tables, **When** this story is implemented, **Then** they are NOT created here (deferred to the stories/epic that need them) - only inventory entities are added.

### Story 1.2: Import the master spreadsheet into the inventory

As a grower,
I want my master spreadsheet loaded so every meter I own appears, organized by my entities and ranches with my real pump names,
So that I see my whole operation in one correct place on day one, before any billing.

**Acceptance Criteria:**

**Given** a master spreadsheet with 7 billing-name variants, **When** imported, **Then** they dedupe to 6 Entities and typo'd duplicates collapse to the true Entity.

**Given** the 183 meter rows, **When** imported, **Then** all 183 load organized Entity -> Account -> Ranch -> Meter, each carrying real name (Existing descriptor), Pump ID, SA ID, rate schedule (as read), legacy flag, lat/long, GPM, crop, solar flag, status.

**Given** solar meters with NEMA codes, **When** imported, **Then** each Array links to its Benefiting Meters (not flat flags), with per-array true-up.

**Given** a meter's rate schedule, **When** imported, **Then** the value present in the sheet is stored verbatim and never inferred or computed.

**Given** the importer, **When** invoked, **Then** it takes an explicit `PrismaClient` argument and is covered by a `*.db.test.ts` that cleans up after itself.

### Story 1.3: Canonical billing shape, Zod extraction contract, and billing tables

As a Terra engineer,
I want one canonical multi-period billing shape, the Zod schemas for raw extraction, and the tables that persist them,
So that the dashboard, energy math, and recommendations read a single source-agnostic shape no matter where billing came from.

**Acceptance Criteria:**

**Given** `/lib/normalize/types.ts`, **When** defined, **Then** it expresses one canonical, multi-period billing shape that downstream code reads instead of any raw source format.

**Given** each PG&E bill page type, **When** its Zod schema is written in `/lib/extract/schema.ts`, **Then** the TS type is `z.infer` of the schema (no parallel hand-written interface).

**Given** billed dollar amounts, **When** modeled, **Then** they are integer cents (never floats); rates/usage keep full precision with documented units.

**Given** persistence, **When** the migration is applied, **Then** `BillingPeriod` and `BillingLineItem` (line-item child of period) tables exist with an actual `cycleClose` date field.

**Given** the source boundary, **When** code is added, **Then** no `/lib/<source>` raw type is importable into `/app`, and `no-raw-source-in-ui.test.ts` stays green.

### Story 1.4: Extract a scanned bill's charge pages

As a grower,
I want my scanned, image-only PG&E bill read into structured per-meter charges,
So that my real costs, rates, and demand show up against each meter without anyone re-typing a 101-page bill.

**Acceptance Criteria:**

**Given** a 101-page image-only PDF, **When** the pipeline runs, **Then** pdf-lib splits it per page and each page is classified (payment-confirmation / account summary / per-SA summary list / per-SA charge detail / NEM reconciliation) before any extraction schema is applied.

**Given** a per-SA charge-detail page, **When** extracted via `generateObject` + the page Zod schema, **Then** it yields the printed rate name, meter #, Pump ID, the TOU energy split with charges, the demand charge, NBCs, and every other line item composing the SA's printed total.

**Given** both two-tier and three-tier (legacy, e.g. AG5B Part-Peak) TOU, **When** extracted, **Then** both are handled correctly.

**Given** a single account PDF carrying dozens of meters, **When** extracted, **Then** it fans out to many Service Agreements.

**Given** a Zod validation failure, **When** `generateObject` retries are exhausted, **Then** the SA is marked `needs_review` rather than throwing a wrong number to the user.

### Story 1.5: Extract NEM reconciliation pages

As a grower with solar,
I want my NEM reconciliation tables read, including the months my panels over-produced,
So that my solar credits and annual true-up show up correctly against the right array.

**Acceptance Criteria:**

**Given** a per-SA NEM reconciliation page, **When** extracted, **Then** the bundled monthly rows are each captured as distinct periods and the annual True-up value and date are captured per Array.

**Given** generation exceeding consumption, **When** extracted, **Then** negative usage is captured, not dropped or floored at zero.

**Given** extracted NEM allocations, **When** normalized, **Then** they attach to the correct Benefiting Meters via SA ID and link to the generating Array.

### Story 1.6: Normalize and join extraction to inventory on SA ID, identity-checked

As a grower,
I want each bill's charges attached to the right meter,
So that what I see on a meter is genuinely that meter's money, never another meter's by mistake.

**Acceptance Criteria:**

**Given** RawExtraction objects, **When** normalized, **Then** they become the canonical billing shape and nothing downstream reads the raw source format.

**Given** the SA ID, **When** joining to inventory, **Then** it is normalized to a canonical form (trim; the `P0xx`/descriptor suffix preserved as a separate field).

**Given** a joined figure, **When** the extracted meter # and Pump ID do not match the inventory row joined on SA ID, **Then** the figure is flagged `needs_review` rather than attached to a possibly-wrong meter.

**Given** a future Bayou adapter targeting the same canonical shape, **When** swapped in, **Then** no code downstream of the canonical shape changes.

### Story 1.7: Reconciliation guardrail and honest coverage state

As a grower,
I want a number shown only when it has been proven against my printed bill total, and an honest label everywhere it has not,
So that I can trust every figure on the screen and never see a wrong one.

**Acceptance Criteria:**

**Given** an SA's extracted line items, **When** they sum to within $0.01 of the SA's printed total (compared in integer cents), **Then** the figure renders; outside $0.01 it is withheld and shown as `needs_review`, never as a number.

**Given** the account level, **When** line items are checked, **Then** reconciliation also runs against the account printed total, not a partial subtotal.

**Given** an OCR/extraction error, **When** it breaks the sum, **Then** it surfaces as `needs_review`, not a wrong dollar figure.

**Given** every Meter and Account, **When** billing is partial, **Then** each shows exactly one coverage state (`no_bill` / `needs_review` / `reconciled`), the full 183-meter inventory renders regardless, **And** the reconcile logic lives in a pure tested `/lib/energy` function.

### Story 1.8: Run the end-to-end import on the real demo account

As the Terra operator,
I want to run inventory + bill import end to end on the one real demo account from an admin/dev path,
So that the conversion demo shows real, reconciled numbers and proves the trust spine early.

**Acceptance Criteria:**

**Given** the demo account's spreadsheet + scanned PDF, **When** the admin/dev import runs, **Then** split -> classify -> extract -> normalize -> identity-checked join -> reconcile -> persist runs as a bounded-concurrency fan-out (not one 101-page call), and results stream into the DB as SAs reconcile.

**Given** the AI extraction, **When** configured, **Then** it calls Claude via the Vercel AI Gateway + AI SDK v6 (`"anthropic/claude-*"` strings) with the cost-lever escalation (cheaper model per page, gate-failing pages escalated to Opus 4.8).

**Given** the proven account, **When** import completes, **Then** 100% of displayed figures reconcile to the cent (else `needs_review`), realizing SM-3 on one account; bulk across 57 accounts stays out of scope.

**Given** a committed reconciled extraction sample (`fixtures/extract/batth-account-*.json`), **When** read at runtime, **Then** it uses `process.cwd()` and is listed in `outputFileTracingIncludes`, so the app runs with zero external calls in dev/CI.

**Given** pipeline logging, **When** it runs, **Then** it never logs grower credentials, the Gateway key, full bill bytes, or PII (only SA ID + page type + reason).

## Epic 2: The Legible Dashboard (the farm, known at a glance)

The grower opens the app and sees his whole farm: the three-zone OS shell, a KPI strip with the honest coverage indicator, the dense meter table (P0), the TOU chart, the inventory-driven map, the shared drawer, rollup/filter, and one-click CSV. The data hero is the story; money reads clearly within it but is never the loudest single element. Realizes UJ-1 and is the conversion surface.

### Story 2.1: Design-token system and base UI primitives

As a Terra engineer,
I want the DESIGN.md tokens and base components built once in one place,
So that every screen is visually consistent and no component hardcodes a color, font, or spacing.

**Acceptance Criteria:**

**Given** `globals.css`, **When** tokens are defined, **Then** the full DESIGN.md palette (surface tiers, on-surface/variant, outline/variant, `primary #2FA84F` + container, `money-positive #1FBF5A`, `alert #BD4B34` + container, inverse) exists as CSS variables in one file and no component hardcodes a hex.

**Given** typography, **When** set up, **Then** Inter loads via `next/font` and the named type roles (money-hero, display-lg + mobile, headline, title, body-lg/md, num-tabular, label-caps, caption) are available, with `tabular-nums` on all numeric/dollar/usage.

**Given** spacing and shape, **When** tokenized, **Then** the 8px scale, gutter/margins, agent-rail 240 / findings-rail 320, and the rounded scale (default .375rem, lg .75rem) exist; larger objects use `lg`.

**Given** elevation, **When** applied, **Then** depth is tonal warm-paper layering + soft warm shadow (`rgba(26,26,23,0.06)`, 20px+ blur) with hairline 1px `outline-variant` borders before shadows.

**Given** base components, **When** built, **Then** button (primary solid / secondary outline, one primary per screen), input (label-caps + hairline -> primary focus), and severity-badge (act=alert, watch=type-only, info=muted) match spec, with three colors max per screen (green, clay, charcoal-on-paper).

### Story 2.2: Three-zone OS shell, agent rail, lens toggle, and responsive collapse

As a grower,
I want a single calm shell that holds my farm with my agents on one side and findings on the other,
So that I always know where I am and the depth is one tap away on any device.

**Acceptance Criteria:**

**Given** the `(app)` layout on desktop/tablet, **When** rendered, **Then** the three-zone inverted-L shows agent-rail (240, left) / data hero (center) / findings-rail (320, right), the center stacking KPI strip -> lens toggle -> active lens -> drawer overlay.

**Given** the agent rail, **When** rendered, **Then** it lists agents (not features): Energy active (primary) and Home; future Water/Labor at reduced opacity with a "coming" tag, non-interactive; Home = the Energy dashboard today.

**Given** mobile, **When** rendered, **Then** the agent rail becomes a bottom tab bar, the center goes full width, the findings rail collapses to a peeking bottom sheet ("N findings - ~$X up"), and the drawer becomes a full-height sheet; side margins hold at 20px.

**Given** the lens toggle, **When** used, **Then** it is a segmented control (Chart / Table / Map / Calendar) reading/writing the nuqs `lens` key, one lens visible at a time, defaulting to the simplest available lens; switching lenses never drops the active filter or open `meter`.

**Given** data landing, **When** the hero renders, **Then** it performs one orchestrated staggered reveal, fires once per data-landing, honors `prefers-reduced-motion` (instant); carousels, autoplay-every-open, badge anxiety, push, and "spike now" alerts are banned.

**Given** accessibility, **When** built, **Then** every interactive element is labeled role + state (the lens toggle announces the active lens), focus traversal is KPI strip -> lens -> findings rail (-> drawer), tap targets are >=44pt, and all copy lives in `/copy` in plain operator English (no kW/jargon, no em dashes/exclamation).

### Story 2.3: KPI strip with honest coverage indicator

As a grower,
I want a few compact cards that tell me my spend and where the pressure is, with an honest count of how much is loaded,
So that I grasp my situation in seconds without trusting a number I cannot check.

**Acceptance Criteria:**

**Given** the strip, **When** rendered, **Then** it shows compact cards: total PG&E spend (covered period) with a coverage indicator ("N of 183 meters loaded") beside it, demand-charge exposure ($), and biggest cost mover; never a lone hero number.

**Given** a card with >=2 covered periods, **When** rendered, **Then** it pairs the number with a sparkline + vs-last-period delta (green favorable, alert clay adverse); with one covered period the sparkline/delta degrade gracefully (hidden, not faked).

**Given** a meter with <2 covered periods, **When** rendered, **Then** the biggest-mover card is hidden gracefully, never faked.

**Given** a card tap, **When** activated, **Then** it filters/scrolls the lens to its driver.

**Given** the cards, **When** rendered, **Then** none presents overpayment, savings, or a projected bill; all figures are tabular; the coverage indicator reads 100% on the fully-loaded representative seed.

### Story 2.4: Meter table - the P0 lens

As a grower,
I want a dense, sortable, filterable table of every meter,
So that I can live in the one Excel-style view I trust and find any pump fast.

**Acceptance Criteria:**

**Given** the Table lens, **When** rendered, **Then** it shows one dense row per meter with columns: real name, ranch, entity, rate schedule, legacy flag, this-cycle cost, demand charge ($), status, coverage.

**Given** any column header, **When** clicked, **Then** the table sorts by it; **Given** entity/ranch/rate, **When** applied, **Then** the table filters by them.

**Given** concerning cells, **When** rendered, **Then** they are traffic-light tinted (watch/act earn amber/clay) with the value/label also present (color never the only signal).

**Given** a meter with no reconciled billing, **When** rendered, **Then** its inventory row still shows with a coverage state, never blank or a fabricated cost.

**Given** a row click, **When** activated, **Then** the meter drawer opens; **Given** mobile, **When** rendered, **Then** the table degrades to a simplified sortable list; the table reads only the canonical shape.

### Story 2.5: Meter drawer - the shared drill-in

As a grower,
I want one place that shows a meter's full detail without leaving the screen I am on,
So that I can dig into any pump from the table, chart, or map and come right back.

**Acceptance Criteria:**

**Given** any table row (and later map pin / chart bar), **When** clicked, **Then** a side drawer (desktop) / full-height sheet (mobile) opens with that meter's canonical billing detail (rate, TOU split, demand) + inventory (pump name, ranch, crop, GPM, status), without leaving context.

**Given** a solar meter, **When** the drawer opens, **Then** it additionally shows Array linkage, NEM allocation, and True-up.

**Given** the nuqs `meter` key, **When** the drawer is open, **Then** it is URL-encoded and survives refresh and lens switches; closing returns to the lens it came from with state intact.

**Given** that meter's findings, **When** the drawer opens, **Then** a findings section exists in the drawer (populated by Epic 3), each tracing to data visible there.

### Story 2.6: Rollup and filter

As a grower,
I want to filter the whole dashboard down to an entity, ranch, or rate,
So that 183 meters stay usable and I can study one slice at a time.

**Acceptance Criteria:**

**Given** an entity/ranch/rate filter, **When** applied via nuqs, **Then** both the KPI cards and the table recompute to that subset; clearing returns to the whole farm.

**Given** money rollups, **When** computed, **Then** they count only covered (reconciled) meters, and the coverage indicator reflects the active filter.

**Given** a filter matching no meters, **When** applied, **Then** the lens shows "No meters match" with a clear-filter affordance.

### Story 2.7: CSV export

As a grower,
I want to export the current meter view to a spreadsheet in one click,
So that I can keep working in Excel, the way I always have.

**Acceptance Criteria:**

**Given** the current meter view, **When** the user clicks export, **Then** a CSV downloads respecting the active entity/ranch/rate filter.

**Given** exported figures, **When** the file opens, **Then** they match what is shown on screen; `needs_review` cells export as "needs review", never a fabricated number.

### Story 2.8: TOU cost chart - the Chart lens

As a grower,
I want to see my cost split by time-of-use period over time, with a year-over-year compare,
So that I can literally see where the expensive hours are and how this year compares.

**Acceptance Criteria:**

**Given** the Chart lens, **When** rendered, **Then** it shows TOU-stacked bars (Peak / Part-Peak / Off-Peak) over time built on visx, dollars on the axis, reading only the canonical shape and CSS-variable tokens (no hardcoded hex).

**Given** legacy three-tier meters, **When** rendered, **Then** Part-Peak renders; **Given** current two-tier meters, **Then** it is omitted.

**Given** the year-over-year toggle, **When** activated, **Then** it compares equivalent periods from the multi-period canonical shape.

**Given** a bar click, **When** activated, **Then** the meter drawer opens for that meter/period; Chart becomes the default lens face.

### Story 2.9: Farm map - the Map lens

As a grower,
I want a map of my pumps colored by what needs attention,
So that I can see my whole farm spatially and tap the one pin that matters.

**Acceptance Criteria:**

**Given** the Map lens, **When** rendered, **Then** a read-only MapLibre GL map renders with a custom agrarian-luxury style and a pin for every meter with a resolvable location.

**Given** geometry, **When** resolved, **Then** pins come from inventory: PLSS Section-Township-Range -> centroid via a committed BLM PLSS lookup, and street addresses via the free US Census geocoder (stubbed boundary); no paid key, no Bayou for geo.

**Given** a pin, **When** rendered, **Then** its color encodes $-at-risk / status (green -> clay) with the value/label also available (color never the only signal); tapping it opens the shared drawer.

**Given** a meter without resolvable location, **When** processed, **Then** it appears in a "no location yet" tray, never silently dropped or given a fake pin.

**Given** partial billing, **When** rendered, **Then** the map still renders fully from inventory on day one.

## Epic 3: Find the Money (recommendations & levers)

Once the picture is trusted, the same data surfaces where money is hiding: the secondary findings rail/feed, rate optimization fully computed (lead with the 27 legacy meters), the solar/NEM demand insight, the serial-code Calendar lens, the pump-health flag, and DR enrollment shown as info. Every finding traces to data visible on the dashboard. Realizes UJ-3.

### Story 3.1: Recommendation feed, findings rail, and finding card

As a grower,
I want findings shown calmly beside my data, each with a plain situation, one action, and a dollar number,
So that I can act on what is costing me without the screen turning into a to-do list.

**Acceptance Criteria:**

**Given** the findings rail (desktop) / bottom sheet (mobile), **When** rendered, **Then** recommendations render in the grammar (situation + action + impactUsd?/impactNote? + severity + status + result?), secondary to the dashboard, in the feed and the relevant meter's drawer, never as a home hero card.

**Given** a finding card, **When** rendered, **Then** it shows the situation, one concrete action, the dollar impact (num-tabular), severity, and a one-tap response; v1 records status and shows the after-the-fact result, never executing.

**Given** severity, **When** rendered, **Then** act = alert accent, watch = typography only, info = muted; no new severity color.

**Given** a finding focus, **When** activated, **Then** it highlights the meter's map pin / table row, tracing to data visible on the dashboard.

**Given** a finding with no dollar impact and no impactNote, **When** evaluated, **Then** it is not shown; **Given** no findings, **Then** the rail reads "Nothing needs you right now"; all copy lives in `/copy`.

### Story 3.2: Dated PG&E tariff fixture and the rate model

As a Terra engineer,
I want a dated, versioned PG&E ag tariff fixture and pure rate-compute functions,
So that rate findings and bill verification are computed from real, checkable rates and never a hardcoded number.

**Acceptance Criteria:**

**Given** `fixtures/pge-ag-rate-card.json`, **When** authored, **Then** it is a dated, versioned data file (per schedule: customer charge, TOU energy by season, demand charge, demand-charge limiter), bounded to Batth's schedules + current-equivalents, with no rate hardcoded in code.

**Given** the loader (`/lib/pge/rate-card.ts`), **When** it reads the fixture, **Then** it uses `process.cwd()`, and the fixture is added to `outputFileTracingIncludes`.

**Given** the rate compute, **When** implemented, **Then** it lives as pure functions in `/lib/energy` (rates / rate-compare) with colocated `*.test.ts`.

**Given** the two TOU clocks, **When** modeled, **Then** the rate peak (5-8pm) is kept separate in code from the DR window (4-9pm).

### Story 3.3: Rate optimization lever with back-test gate

As a grower,
I want to know which meters are on the wrong rate and what switching would save, with the math I can check,
So that I can capture savings with zero operational change and trust the number.

**Acceptance Criteria:**

**Given** a meter on a legacy/non-optimal schedule, **When** analyzed, **Then** the lever computes the dollar impact of switching to the cheapest eligible schedule using the dated fixture + the meter's own usage; the 27 legacy-flagged meters lead.

**Given** the back-test gate, **When** the meter's current charges are recomputed from the fixture + its TOU usage and billed demand and the result is within the calibrated percentage band, **Then** the finding shows savings as a labeled estimate ("estimated savings ~$X") with the rates used and the rate effective date.

**Given** a back-test outside the band, **When** evaluated, **Then** the meter falls back to a qualitative legacy -> current finding with no dollar number.

**Given** eligibility, **When** the finding is built, **Then** it respects the 35 kW threshold and notes the once-per-12-months switch constraint.

**Given** the savings number, **When** displayed, **Then** it is never presented as cent-exact; the rate math is pure and tested.

### Story 3.4: Solar/NEM demand insight

As a grower with solar,
I want to see that my solar does not cover the demand charge set in the evening,
So that I understand why a net-zero meter still owes money.

**Acceptance Criteria:**

**Given** a meter that is both NEM solar and on a demand-carrying schedule (AG-C family), **When** analyzed, **Then** the insight renders; it never renders on a solar meter with no demand charge.

**Given** the insight, **When** rendered, **Then** it states the meter's energy position (net-zero or net credit) alongside the demand charge still owed ($), tied to the 5-8pm peak.

**Given** placement, **When** rendered, **Then** it appears in the drawer's NEM section and as a feed item; the solar-nem math is pure and tested.

### Story 3.5: Billing-cycle Calendar lens

As a grower,
I want a calendar showing when each meter's billing cycle closes,
So that I have the timing hook I asked for, derived from the meter's own serial code.

**Acceptance Criteria:**

**Given** a meter's serial code + `fixtures/pge-meter-read-schedule.json` (the 2026 serial -> close table), **When** computed, **Then** a pure tested `cycleClose()` derives the scheduled cycle-close date; the fixture reads via `process.cwd()` and is in `outputFileTracingIncludes`.

**Given** the Calendar lens, **When** selected, **Then** it registers in the lens toggle and presents each meter's cycle close as a small lightweight calendar, not the home surface.

**Given** the serial letter vs the rotating outage block, **When** modeled, **Then** only the serial letter drives cycle-close and the two stay distinct.

**Given** scheduled vs actual, **When** displayed, **Then** the scheduled (may-shift) close from the fixture and the actual close from the posted bill are both carried and labeled honestly.

### Story 3.6: Pump health flag

As a grower,
I want my BAD-status pumps flagged in the table and drawer,
So that I can see equipment health without the tool inventing an efficiency number it cannot know.

**Acceptance Criteria:**

**Given** a meter's Status (GOOD / BAD / NEW WELL / OLD), **When** rendered, **Then** it is shown in the table and the drawer, and BAD is flagged as a health signal.

**Given** GPM is present but runtime/volume are not, **When** rendered, **Then** no kWh-per-gallon or efficiency figure is computed or shown.

### Story 3.7: DR enrollment info

As a grower,
I want my demand-response enrollment shown as plain information,
So that I see my program status without a misleading savings claim.

**Acceptance Criteria:**

**Given** the bill shows program enrollment (e.g. PDP), **When** rendered, **Then** it is displayed as legible info pulled from the bill.

**Given** DR, **When** rendered, **Then** no recommendation or savings claim is generated; DR copy uses the 4-9pm event window, kept distinct from the 5-8pm rate peak.

## Epic 4: Close the Loop (accuracy & realized results)

Trust compounds across cycles: bill-accuracy verification independently recomputes a posted bill and shows it matched (accuracy, not a forecast), and an accepted recommendation's predicted impact is shown against the realized number from the next posted bill. v1 shows the diff, not why. Realizes UJ-2.

### Story 4.1: Bill-accuracy verification badge

As a grower,
I want Terra to independently recompute a posted bill and show it matched mine,
So that I trust the tool has been right, not just a one-time snapshot.

**Acceptance Criteria:**

**Given** a posted bill, **When** the system recomputes its charges from the tariff fixture + the meter's own TOU usage and billed demand, **Then** it compares to the actual posted total.

**Given** a match within tolerance, **When** rendered, **Then** it shows a verification badge worded as an independent calculation matching the bill (e.g. "Terra independently calculated this bill from the rates and your usage and matched it to the cent").

**Given** the copy, **When** rendered, **Then** it never claims prediction or forecast.

**Given** the recompute, **When** implemented, **Then** it is a pure tested `/lib/energy` (bill-audit) function and licenses the alternative-schedule numbers in FR-14.

### Story 4.2: Recommendation predicted-vs-realized result

As a grower,
I want an accepted recommendation to show its predicted impact against what actually happened on the next bill,
So that I can see whether the tool's advice paid off.

**Acceptance Criteria:**

**Given** an accepted recommendation, **When** accepted, **Then** the predicted impact is recorded at acceptance.

**Given** the first bill that posts after acceptance, **When** it posts, **Then** `result` populates with the realized number via the recommendation grammar's `result`; until then `result` reads "pending".

**Given** the result, **When** rendered, **Then** v1 shows the diff (predicted vs realized) and does not explain the variance.

## Epic 5: Get In (sign-in & connect a source)

A returning grower logs in (Google SSO / magic link, no passwords) straight to his dashboard; an operator sets up a new farm via the value-honest connect-a-source flow; "Tour a sample" opens the badged representative dashboard. The LOA is an upgrade after value, never the entry gate. Wraps the engine's import path in operator-operable UI + auth.

### Story 5.1: Sign in with Google SSO or magic link

As a returning grower,
I want to log in without a password and land straight on my dashboard,
So that checking my farm takes seconds, not a login ritual.

**Acceptance Criteria:**

**Given** Auth.js v5 + `@auth/prisma-adapter`, **When** the migration is applied, **Then** User / Account / Session / VerificationToken tables are added (created here, where first needed) and `db:generate` succeeds.

**Given** providers, **When** configured, **Then** Google SSO and email magic link (no passwords) work; the magic-link email sender is a stubbed boundary (marked TODO) with a real sender deferred to prod.

**Given** a unified `auth()`, **When** used, **Then** it gates the `(app)` group in Server Components, Server Actions, and middleware, while the `(auth)` group is public.

**Given** a returning user with a valid session, **When** they open the app, **Then** they land straight in the dashboard (no splash); **Given** a logged-in user with no data, **Then** they route to the connect-a-source picker, not a dead end.

**Given** secrets, **When** deployed, **Then** AUTH_SECRET, Google creds, and email creds are env-only, never committed.

### Story 5.2: Connect a data source (operator-operable onboarding)

As an operator setting up a grower,
I want to identify the farm and connect at least one real data source, correcting only what we could not read,
So that the grower lands in a dashboard of his own real farm, not a form.

**Acceptance Criteria:**

**Given** onboarding, **When** run, **Then** it is operator-operable: identify (farm name + contact) -> connect a source -> confirm -> land in the dashboard.

**Given** the source picker, **When** shown, **Then** it offers Connect PG&E authorization, Upload bills, and Upload meter-master spreadsheet, gating on at least one real source (PG&E auth or billing), with accounts addable iteratively; the admin import action (Epic 1) runs the ingest via `api/import`.

**Given** fields printed on an uploaded bill (address/city/zip/phone), **When** onboarding, **Then** the grower is never asked to type them.

**Given** the confirm step, **When** shown, **Then** only fields we could not read are surfaced for inline correction, never blank-faked.

**Given** the LOA, **When** offered, **Then** it is framed as an upgrade after value ("so you never upload a bill again"), never the entry gate; the Bayou live-connect stays dormant, targeting the canonical shape.

### Story 5.3: Tour a sample, demo separation, and connection states

As a prospective grower or investor,
I want to tour a representative dashboard and, once connected, see honest connection states,
So that I can judge the product immediately and never see a blank or a faked screen.

**Acceptance Criteria:**

**Given** "Tour a sample", **When** selected, **Then** it opens the badged representative dashboard with zero commitment.

**Given** representative/demo data, **When** rendered, **Then** a persistent "Representative data" badge shows; a connected real farm outranks the seed (`dashboardFarm` resolution) and the two never merge; real financials are never shown to investors.

**Given** a live pull pending, **When** rendered, **Then** the header/findings show "PG&E is connecting. Your bills are already in." and the dashboard keeps working on uploaded bills (never blocked on the LOA).

**Given** a partial import, **When** rendered, **Then** the dashboard shows what we have, unreadable fields are flagged "Confirm it", the map renders known pins, and unlocated meters list in the "no location yet" tray.

## Epic 6: Ask Almond (the farm assistant)

A persistent, Notion-AI-style chat assistant named **Almond** (an almond-character persona) that the grower can open from anywhere in the app and ask anything about their own farm in plain language. Almond answers by calling read-only tools over the grower's own data (meters, rates, billing, reconciliation, findings, rollups), so its answers are grounded and specific to that farmer, never generic. The UI replicates the Notion-agent feel: a small launcher in the corner that opens a slide-out chat panel, built in the Magic UI vocabulary (CLAUDE.md: Magic UI is the design bible). The model boundary is INJECTED exactly like the bill-extraction reader (`reader.ts`): a deterministic stub responder in dev/test/CI (zero external calls), the live Vercel AI Gateway model (`anthropic/claude-opus-4-8`, key already in `.env.local`) only when the key is present. Almond is strictly farm-scoped (owner-scoped to `dashboardFarm`); it can never read another grower's data and never executes anything (read-only tools only, mirroring the v1 "display, never execute" recommendation law).

### Story 6.1: Almond backend — farm-scoped tool-calling chat API

As a grower,
I want an assistant that answers questions using my own farm's real data,
So that what it tells me is specific and true to my farm, never a generic guess.

**Acceptance Criteria:**

**Given** a POST to the chat endpoint, **When** received, **Then** it is auth-gated (session required) and owner-scoped to the caller's `dashboardFarm`; an unauthenticated or farm-less caller gets a clean refusal, never another farm's data.

**Given** the model, **When** it answers, **Then** it can call read-only tools that reuse existing load functions (meters, KPI rollup, findings, rates, billing/reconciliation), every tool closed over the resolved `farmId` so cross-farm reads are impossible.

**Given** dev/test/CI, **When** the chat runs, **Then** it uses an injected deterministic stub responder (zero external calls); the live Vercel AI Gateway model is constructed only when the key is present, mirroring `createGatewayReader` / `stubPageReader`.

**Given** a question whose answer is not in the data, **When** Almond responds, **Then** it says it does not have that, and never fabricates a number (tools are the only source of farm facts).

### Story 6.2: Almond chat UI — Notion-style launcher and panel (Magic UI)

As a grower on my phone or laptop,
I want to open Almond from anywhere and chat with it in a clean panel,
So that help is one tap away on every screen, like the Notion agent.

**Acceptance Criteria:**

**Given** any `(app)` screen, **When** rendered, **Then** a persistent Almond launcher sits in the corner (bottom-right desktop, above the tab bar on mobile) and opens a slide-out chat panel; closing returns to the dashboard with state intact.

**Given** the chat panel, **When** used, **Then** it streams Almond's answers token-by-token via `useChat` against the 6.1 endpoint, with visible thinking/streaming and error states, all built from Magic UI components tinted to the warm palette.

**Given** the launcher and panel, **When** rendered, **Then** they carry the Almond persona (almond avatar/character) and all copy lives in `/copy`, plain operator English, no exclamation marks.

**Given** a mobile viewport, **When** opened, **Then** the panel is usable one-handed and never collides with the existing findings sheet or agent tab bar.

### Story 6.3: Almond polish — grounded result rendering, starters, and e2e

As a grower,
I want Almond to feel alive and trustworthy and to suggest what I can ask,
So that I actually use it and believe its answers.

**Acceptance Criteria:**

**Given** an empty chat, **When** opened, **Then** Almond shows a short greeting and tappable starter questions drawn from the farm (e.g. "What is my biggest energy opportunity?"), so the grower is never staring at a blank box.

**Given** Almond pulls farm data to answer, **When** rendered, **Then** the relevant facts (a meter, a finding, a dollar figure) render clearly and tie back to data visible on the dashboard, money in tabular figures, never a lone screaming number.

**Given** the feature, **When** validated, **Then** a Playwright e2e opens the launcher, asks a starter question against the injected stub responder, and asserts a streamed answer appears; lint, tsc, unit tests, and production build are green.

**Given** reduced-motion, **When** set, **Then** Magic UI animations fall back gracefully and the panel stays fully usable.
