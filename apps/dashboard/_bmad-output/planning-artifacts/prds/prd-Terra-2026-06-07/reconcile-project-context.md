# Input Reconciliation — project-context.md vs. PRD + addendum

Source input (authoritative): `_bmad-output/project-context.md` (the BMAD agents load this on
activation; per its own rule and CLAUDE.md, **project-context.md wins on data-model conflicts**).
PRD under review: `prd-Terra-2026-06-07/prd.md`. Addendum: `prd-Terra-2026-06-07/addendum.md`.

Scope note: documented deferrals in PRD §5 Non-Goals and §6 MVP Scope are intentional and are
NOT reported as gaps. Only genuine drops, contradictions, or under-served material follows.

Legend: **COVERED** / **PARTIAL** (under-served) / **DROP** / **CONTRADICTION** / **CONFLICT
(source wins)**.

---

## Data model and Critical Rules

- **Source (project-context "Prisma / data model"):** "Shared entities are first-class (Farm,
  Entity, **Account**, Block, Pump, Crop, Person, **Connection**, Recommendation) — built to
  survive the monorepo move."
  - **PARTIAL.** PRD §3 Glossary names Farm, Entity, Account, Meter/Pump, Ranch, Block, Array,
    Recommendation, and addendum §A lists the spreadsheet columns. But **`Crop`, `Person`, and
    `Connection` as first-class entities are never named in the PRD.** Crop appears only as a
    per-meter field (PRD §3, FR-1, FR-10), not as an entity. `Person` (the grower/assistant/
    Kamran/Jorge actors) and `Connection` (the live-connect/Bayou link record) are absent from
    the data-model surface entirely. These are load-bearing for the eventual monorepo move and
    for the dormant-but-present Bayou flow (FR-21). Flag for the architecture step so the schema
    keeps them.

- **Source ("Prisma / data model"):** "Demo/seed farms (Batth) carry `isDemo = true` ... A real
  connected farm is `isDemo = false`," and `dashboardFarm()` returns the latest real farm
  (`dataKind:"real"`, no badge) else falls back to the latest `isDemo:true` seed
  (`dataKind:"representative"`, renders a **"Representative data" badge**). "Real-Batth supersedes
  demo-Batth automatically — they never merge ... separate Farm rows."
  - **COVERED (mechanism), PARTIAL (wording).** PRD §6 says the two demo surfaces are "already
    supported by the `isDemo` resolution, zero new build" and FR-7 references a "coverage
    indicator ... reads 100% on the fully-loaded representative seed." The supersede-not-merge
    rule and separate-Farm-rows invariant are not restated, and the exact badge label
    "Representative data" / the `dataKind` real|representative distinction is dropped. Minor, but
    the architect should preserve the never-merge invariant and the badge copy.

- **Source ("Prisma / data model"):** "**The current Batth/demo seed is synthetic placeholder** —
  fabricated well names ('Westside Pump 17', 'Dairy Field Pump 4') ... Treat it as DISPOSABLE:
  don't preserve these names/values or write logic that depends on them; the seed is replaced
  wholesale, not migrated."
  - **COVERED.** Addendum §A note 5 says surface `Existing descriptor` ("PUMP # 17"), "not the
    synthetic seed names ('Westside Pump 17'), which are disposable per project-context." Good.

- **Source ("Recommendation grammar"):** `{ situation + action + impactUsd?/impactNote? +
  severity(info|watch|act) + status(pending|done|dismissed|overridden) + result? }`, "Shape
  `action` so it can later be EXECUTED (agentic)."
  - **COVERED.** PRD §3 Glossary and FR-13 reproduce the grammar verbatim including all four
    status values and the "shaped to be executed later" note.

- **Source ("Prisma / data model"):** "union fields are `String` with allowed values documented
  inline and mirrored in `src/lib/recommendations/types.ts`. `action`/`result` on Recommendation
  are `Json`."
  - **N/A to PRD (implementation detail).** Correctly left to project-context; no conflict. Noted
    so the architect carries it.

- **Source ("Technical traps"):** "**Never hardcode a `$/kW` (or any rate).** Read dollars from
  the data." and "the tariff fixture is dated, versioned."
  - **COVERED.** PRD §7 Cross-Cutting NFRs and FR-14 both state "No rate is hardcoded in code"
    and require a dated/versioned tariff fixture. Strong match.

- **Source ("Data anti-patterns"):** "**Bayou returns ONE account per login** (verified).
  Multi-account farms ... need the master spreadsheet (`connectSpreadsheet`) or Green Button
  upload."
  - **COVERED / reframed (not a contradiction).** Addendum §B explicitly supersedes the
    Bayou-as-primary posture: "Bayou is PARKED, not primary," one-account-scope "moot for now."
    PRD §9 Open Q4 re-verifies it before building the adapter. The source's own text predates
    this pivot; the PRD's parking of Bayou is the newer decision and is internally consistent.
    No action.

---

## Product principles and honest lever priority

- **Source ("Product / domain anti-patterns"):** "**Lead with rate optimization, not pump
  staggering.** Honest lever priority: (1) rate optimization, (2) demand-response enrollment
  (PDP/CBP/BIP), (3) pump efficiency, (4) solar/NEM, (5) billing-cycle timing, (6) precision
  irrigation. Coincident-peak staggering is DEMOTED — keep the code, don't surface it."
  - **COVERED.** PRD §4.3 description and FR-14–18 follow this exact priority; FR-18 notes/§5
    Non-Goals keep staggering "in code, unsurfaced." Strong match.

- **Source:** "**Legible before predictive; retrospective before advice.** First win is 'here are
  all your meters/rates/cycles in one place,' then 'this meter looks mis-rated,' then a
  recommendation. **Close the loop after a bill posts (predicted vs actual).**"
  - **COVERED.** PRD §1 Vision, UJ-1/2/3, and §4.4 (FR-19/20) reproduce this sequence and the
    close-the-loop beat. Strong match.

- **Source:** "**Home/hero is a data dashboard.** Recommendations are secondary and must trace to
  data visible on it. Never make the main screen a to-do list."
  - **COVERED.** PRD §4.2 ("Home is a data dashboard: recommendations are secondary") and FR-13
    ("never as a home hero card," "Every finding traces to data visible on the dashboard"). Strong
    match.

- **Source:** "**Planner, not live meter.** PG&E data lags ~1 day. Never promise real-time spike
  detection."
  - **COVERED.** PRD §5 Non-Goals and §7 Posture state this almost verbatim. Strong match.

- **Source:** "**One recommendation = one situation + one concrete action + dollar impact + a
  one-tap response + an after-the-fact result.** Never 'consider load management.'"
  - **COVERED.** PRD FR-13 consequence: "one concrete action, the dollar impact, and a one-tap
    response ... shows the after-the-fact result." UJ-3 climax: "never 'consider load
    management.'" Strong match.

- **Source ("Data anti-patterns"):** "**Prefer real grower data via live connect; sample/fixture
  data is a demoted fallback only.** Don't present the representative seed as the grower's own."
  - **COVERED with a noted nuance.** PRD §7 ("Real grower financials are never shown to
    investors; the badged representative seed is the investor surface") and the badge honor the
    "don't present seed as grower's own" rule. NUANCE: the source assumes **live connect** is the
    real-data channel; the addendum/PRD have pivoted the v1 real-data channel to **PDF + master
    spreadsheet concierge import** (Bayou parked). The *principle* (prefer real, badge the seed)
    is preserved; the *channel* changed deliberately. No conflict, but the architect should read
    "live connect" in project-context as "real-data ingest path" generally.

---

## Design system, voice, and copy (the qualitative guidance most at risk)

- **Source ("Copy & voice"):** "**All user-facing strings live in `src/copy/en.ts`**
  (localization-ready). No hardcoded UI text in components."
  - **COVERED.** PRD §7: "All copy lives in `/copy` (localization-ready)." Match.

- **Source:** "**No em dashes in user-facing copy.** No exclamation marks. Plain operator English
  — confident, never salesy."
  - **COVERED (as a rule), with an IRONY flag.** PRD §7 states "no em dashes, no exclamation
    marks." NOTE: the PRD/addendum/glossary bodies themselves use em dashes heavily — that is
    fine (they are internal docs, not user-facing copy), but any copy author lifting phrasing
    straight from the PRD (e.g. the FR-19 badge string "Terra independently calculated this bill
    from the rates and your usage and matched it to the cent") must keep it em-dash- and
    exclamation-free. Rule is captured; just a drafting caution.

- **Source:** "Surface language is the grower's: blocks, sets, hours, acres, pumps, ranches.
  **Never** kW, '15-minute interval', or AI/jargon on the surface."
  - **PARTIAL / minor tension.** PRD §7 reproduces "never kW, '15-minute interval,' or AI jargon
    on the surface" and uses grower words. BUT FR-9 specifies a table column "**demand $ / peak
    kW**" and FR-7 references demand-charge $ — surfacing **kW** on the primary table directly
    against "never kW ... on the surface." This is a real surface-copy tension to resolve: either
    label it in grower terms or accept kW only inside the demand context. Flag for UX. (The
    glossary also defines TOU/NBC/kW as internal terms, which is correct; the issue is only the
    user-facing table label.)

- **Source ("Design system"):** "Editorial agrarian-luxury ... No glassmorphism, liquid glass, or
  heavy gradients." Fonts: **Fraunces** (display) / **Hanken Grotesk** (body) / **JetBrains Mono**
  (data); never Inter/Roboto/Open Sans/Lato/Arial/system. Tabular figures; money is the largest
  element; 8px scale; hairline 1px borders; soft diffuse shadows; mobile-first.
  - **COVERED.** PRD §6 craft list and §7 Design-and-voice reproduce the fonts, tabular figures,
    money-largest, 8px scale, hairline borders, soft shadows, no-glassmorphism. Strong match.

- **Source ("Design system"):** "**Comprehension bar:** a non-technical grower answers the main
  question on each screen (which pump is costing me, and why) in seconds. Legibility first, luxury
  second."
  - **PARTIAL.** The PRD captures legibility-first throughout (UJ-1, §4.2) but **does not name the
    explicit per-screen comprehension test** ("answers the main question in seconds, legibility
    first / luxury second") as a cross-cutting bar in §7. It is implied by FR speed/legibility but
    the crisp acceptance phrasing is dropped. Worth restoring as a UX acceptance bar.

- **Source ("Design system"):** "**Information hierarchy on data screens:** summary cards, then
  chart, then sortable table, then a row drill-in drawer. Progressive disclosure; default to the
  simplest view."
  - **COVERED.** PRD §4.2: "card -> chart -> table -> drawer hierarchy." Match.

- **Source ("Motion"):** "one orchestrated moment per view (staggered reveal) ... Easing
  `cubic-bezier(0.16, 1, 0.3, 1)`, 400–700ms, stagger 60–100ms, no bounce/overshoot. Honor
  `prefers-reduced-motion`."
  - **PARTIAL.** PRD §7 keeps easing, 400–700ms, prefers-reduced-motion, and "one orchestrated
    moment per view." It **drops the stagger interval (60–100ms) and the explicit "no
    bounce/overshoot"** constraint. Minor; restore for the UX spec.

- **Source ("Open visual-system decision"):** two unsettled decisions — **(a) palette**
  (deep-forest `#1F3D2B`–`#2D4A2D` on warm paper vs. brighter marketing `#1C7A2B` on `#FAF9F4`;
  "Do not treat deep-forest as final brand truth; reconcile the two surfaces") and **(b) status
  color** (severity info/watch/act has no agreed visual; decide amber/red vs. typography-carried).
  - **COVERED.** PRD §9 Open Q6 names both ("exact severity palette (watch/act amber/red), and
    reconciling deep-forest brand green vs. the brighter marketing green") and routes to the
    Architect. Good. (Note: PRD §7 and FR-9 already *assume* "watch/act earn amber/red," which
    slightly pre-empts decision (b) — keep it framed as proposed, not settled.)

---

## Technical / architecture rules

- **Source ("Framework rules" + "Technical traps"):** "**Runtime fixture reads MUST use
  `process.cwd()`**, never `import.meta.url`" and "**New runtime-read fixtures must be added to
  `outputFileTracingIncludes`** in next.config.ts."
  - **PARTIAL.** PRD §7 Architecture/Posture do not restate the `process.cwd()` rule or
    `outputFileTracingIncludes`, but project-context is explicitly cited as "the authoritative
    implementation rules," so deferral is appropriate. NOTE: FR-14/16/19 introduce **new runtime
    fixtures** (the dated tariff fixture, the 2026 meter-read schedule) that are read at runtime —
    these specifically trip the `outputFileTracingIncludes` + `process.cwd()` traps on Vercel.
    Flag for the architect so the new fixtures are wired for the server bundle.

- **Source ("Pure logic stays pure" / Testing):** "Functions in `src/lib/energy` take plain
  inputs and return plain values — no Prisma, no React, no I/O ... `/lib/energy` math must be
  provably correct — every calculation file has a colocated test."
  - **COVERED.** PRD §7 Correctness: "Pure energy math lives in tested `/lib/energy` functions;
    new energy logic ships with colocated tests." §7 Architecture restates the clean boundaries.
    Strong match.

- **Source ("Layered boundaries"):** lists `src/lib/{greenbutton,pge,bayou,spreadsheet,normalize}`
  for ingestion/parsing and `src/lib/{onboarding,farm,dashboard}` for DB edges.
  - **COVERED at principle level.** PRD §7 Architecture preserves "pure logic in /lib/energy,
    ingestion/parsing in /lib, DB edges and derivation in their modules, UI in /app." The specific
    module names are implementation detail correctly left to project-context. NOTE: the v1 PDF
    extractor implies a **new** ingestion module (e.g. a vision/PDF parser) that the source's list
    predates; the canonical-shape seam (FR-4) is the right place for it. No conflict.

- **Source ("Don't upgrade Prisma past v6"; Tailwind v4 no-config; npm only).**
  - **N/A to PRD.** Correctly left to project-context. No conflict.

---

## Security

- **Source ("Security"):** "Grower utility credentials never touch the repo, client code, or
  anything the agent can read. Exports/fixtures for dev; real auth in prod only," and Bayou needs
  `NEXT_PUBLIC_BAYOU_COMPANY_ID` (env, not committed).
  - **COVERED.** PRD §7 Security-and-privacy reproduces the credentials rule and adds the
    investor-financials rule. Match. (The Bayou env-var specific is implementation detail, fine in
    project-context only.)

---

## Domain specifics the source treats as load-bearing

- **Source (implied across product principles) — the two TOU clocks:** the source repeatedly cites
  the 5–8pm rate peak vs. the 4–9pm DR window split.
  - **COVERED.** PRD §3 Glossary, FR-15, and addendum §B all keep "AG rate TOU peak 5–8pm
    year-round" distinct from "DR event window 4–9pm." Strong match.

- **Source:** "solar often does NOT cover the demand-charge peak (set in the evening)."
  - **COVERED.** PRD FR-15 and addendum §B carry the "net-zero on energy yet still owe full
    demand charge" insight. Match.

---

## Summary of genuine action items (non-deferral)

1. **DROP/PARTIAL — first-class entities `Crop`, `Person`, `Connection`** are named in the source
   data model but absent from the PRD's. Preserve in schema (load-bearing for monorepo move and
   the dormant Bayou/`Connection` flow).
2. **PARTIAL/tension — "never kW on the surface"** vs. FR-9's user-facing "peak kW" table column.
   Resolve the surface label in UX.
3. **PARTIAL — design-system specifics dropped:** the per-screen **comprehension bar** phrasing,
   the motion **stagger 60–100ms / no-bounce** constraint, and the "Representative data" **badge
   label** + never-merge invariant. Restore for the UX/architecture specs.
4. **PARTIAL — new runtime fixtures (tariff, meter-read schedule)** introduced by FR-14/16/19 trip
   the source's `process.cwd()` + `outputFileTracingIncludes` Vercel traps. Flag for the
   architect.
5. **NUANCE (not a conflict) — "prefer real data via live connect"**: the source's live-connect
   channel is superseded by the deliberate PDF-first/concierge pivot (addendum §B/§C); the
   *principle* survives, the *channel* changed. No fix needed; read "live connect" as "real-data
   ingest path."

No hard contradictions where project-context's Critical Rules are violated by the PRD. The gaps
above are drops/under-serving of qualitative and data-model detail, not conflicts.
