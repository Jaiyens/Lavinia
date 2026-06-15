---
title: Terra Tool 1 — PG&E Energy Dashboard
status: final
created: 2026-06-07
updated: 2026-06-08
---

# PRD: Terra Tool 1 — PG&E Energy Dashboard
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the PM, the engineers building the Tool 1 rebuild, and the downstream UX and
architecture work. It is **Glossary-anchored** (§3 terms are used verbatim), features are
**grouped with FRs nested** under stable global IDs (FR-1…FR-22), and **assumptions are tagged
inline and indexed** (§9). It governs alongside `_bmad-output/project-context.md`, which holds
the authoritative implementation rules and the design system; on any data-model conflict,
project-context wins. Two companion files carry depth this PRD does not duplicate: **`addendum.md`**
(the Batth real-data shape §A, resolved corrections §B, the PDF-first ingestion path and bill
mechanics §C) and **`research-landscape.md`** (PG&E rate/DR/NEM and competitive grounding). The
build is scoped to a **~6-week runway to ~July 20** and serves two audiences — converting Batth
on his real screen and standing up as investor proof on the badged representative seed.

## 1. Vision

Terra Tool 1 is a PG&E energy dashboard for large California growers. It takes a grower's
sprawling, messy utility footprint — for customer zero, Batth Farms: 183 meters across 57
PG&E accounts and six legal entities, on a mix of legacy and current rate schedules, with
two solar arrays on NEM2 aggregation — and makes it legible in one correct place. The first
job is not advice. It is showing the grower his own operation, accurately, in a way he can
grasp in seconds on a phone.

The moment of truth is the first ten seconds. When Gagan opens the dashboard he sees every
one of his meters, organized by his own entities and ranches, labeled with his own pump
names, with his **whole operation laid out as a chart, table, and map he can read at a
glance**. That is the win that converts him: not a savings claim from a tool he just
opened, but proof that, for the first time, someone has put his entire energy picture in
front of him correctly. Legible before predictive. He believes the picture first.

Overpayment is the second beat. Once the picture is trusted, the same data surfaces where
money is hiding: meters on the wrong rate schedule (27 are flagged legacy), demand charges
that solar never offsets because solar collapses before the 5–8pm peak, and bills worth
auditing. This is where Terra beats the incumbent (Wexus) — same core analysis, radically
simpler surface, and an AI layer that runs it across all 183 meters at zero marginal cost.
v1 displays the findings; the agent acts on them later.

> **UX Reconciliation (2026-06-08 — supersedes conflicting passages below).** A UX design
> session resolved the surface into a binding spec at
> `_bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/` (`DESIGN.md` +
> `EXPERIENCE.md`), which is the source of truth for UX and wins on conflict with this PRD.
> Five overrides:
> 1. **North star: "the farm, known at a glance."** The home makes the grower *feel he can see
>    his whole farm and knows what is happening on it* (situational awareness), with a light
>    ambient weather strip. Planner-not-live-meter still holds.
> 2. **Hero is the chart + table + map, not a lone money number.** Money is the story those
>    visuals tell; the KPI strip carries compact number+sparkline+delta cards, no giant hero
>    spend figure. This **removes** the earlier "money is the largest element / loudest thing
>    on the screen" rule (it conflicted with EXPERIENCE.md, which governs): money is never the
>    loudest single element and never a lone hero number; it is the story the chart/table/map
>    hero tells, in service of the north star (the farm, known at a glance). (Revises §1, the
>    UJ-1 path, §4.2, §7, FR-7.)
> 3. **Map promoted** from P1-first-cut to a **co-equal home lens** (Chart · Table · Map ·
>    Calendar over one meter dataset, Chart default). Geometry comes from the bill — PLSS land
>    descriptions + street addresses — so no Bayou is needed for the map. (Revises FR-12.)
> 4. **An OS shell + a persistent findings rail.** Three-zone inverted-L: agent rail (Home +
>    Energy live, future agents "coming") · data hero · persistent findings rail (collapses to a
>    bottom sheet on mobile). Home = Energy today, grows a cross-agent strip when a 2nd agent ships.
> 5. **Onboarding is value-honest and operator-operable:** identify → connect a source (PG&E
>    Share-My-Data authorization OR bill upload; meter-master spreadsheet optional) → land in the
>    dashboard. No scripted reveal; the dashboard is the pitch; the LOA is an upgrade, not the
>    entry toll. Returning users **log in (Google SSO / magic link, no passwords)** straight to
>    their dashboard. This relaxes the earlier "concierge-only, no grower-facing upload" framing
>    (§6) to **operator-operable connect**, which still covers the on-site/concierge case.

## 2. Target User

### 2.1 Jobs To Be Done
- **See my whole PG&E footprint in one correct place** — every meter, account, ranch, rate,
  and total spend.
- **Trust it** — my real pump names, and numbers that reconcile to my actual bill.
- **Know where I'm overpaying, in dollars** — which meters are mis-rated, where demand
  charges hit.
- **Check it in seconds, on a phone, in the truck**, during the season.
- Underneath all of it (emotional): **stop treating PG&E billing as an unknowable black box
  I can't check line by line.**

### 2.2 Non-Users (v1)
- **The investor** — a viewer of the badged representative demo, not someone v1 builds
  features for. (See the two demo surfaces in §6 MVP Scope.)
- **Farm employees / irrigators doing operational pump scheduling** — Terra is owner-facing
  and a planner, not a live operational scheduler.
- **PG&E / utility staff.**
- **Kamran as a distinct in-product role** — he is the caretaker/operator (onboarding more
  growers, running demos) during the founder's absence, not a separate persona v1 designs
  UI for.

### 2.3 Key User Journeys

- **UJ-1. Gagan sees his whole operation for the first time.**
  - **Persona + context:** Gagan, owner and decision-maker at Batth Farms — 183 meters
    across six entities and dozens of ranches, low software literacy, skeptical, learns
    line by line in Excel. Just onboarded: his assistant sent PG&E bill PDFs; his master
    spreadsheet is loaded as the inventory layer.
  - **Entry state:** opens the dashboard on his phone, first session.
  - **Path:** lands on the home dashboard → his **whole operation laid out as a chart,
    table, and map he can read at a glance** → his meters roll up by entity and ranch, each
    labeled with his own pump name, total PG&E spend reading clearly in the KPI strip (not as
    a lone hero number) → he recognizes his actual operation.
  - **Climax:** he believes the picture. For the first time his entire energy footprint is
    in one correct place, and every number shown reconciles to his real bill.
  - **Resolution:** he trusts the tool enough to look at what it flags. Overpayment is the
    next beat.

- **UJ-2. A new bill posts and Gagan checks whether the tool called it.**
  - **Persona + context:** the same Gagan, now a returning user. A new PG&E bill has posted
    (data lags ~a day).
  - **Entry state:** he reopens the app because a bill landed — the one moment he already
    cares about PG&E.
  - **Path:** the newly posted bill is reflected → he sees **predicted total vs. actual
    posted total**, side by side → "did the tool call it right."
  - **Climax:** the prediction matched (or was close). The tool has been right, not just a
    one-time snapshot — trust compounds.
  - **Resolution:** v1 stops at "did we call it." It does not explain *why* a bill was off
    (variance attribution is a later beat).
  - **Edge case:** if a figure's line items don't reconcile within one cent, it shows
    **"needs review"** rather than a wrong number.

- **UJ-3. Gagan acts on an overpayment finding.**
  - **Persona + context:** Gagan, now trusting the picture, looking at what Terra flags.
  - **Entry state:** on the dashboard, a recommendation surfaces — e.g., a legacy-flagged
    meter that looks mis-rated.
  - **Path:** he taps the finding → sees the **situation in plain language, the dollar
    impact, and the data it traces to** (the meter's rate, its usage pattern, all visible on
    the dashboard) → a single **one-tap response**.
  - **Climax:** a concrete dollar number and one clear action — never "consider load
    management."
  - **Resolution:** the recommendation is recorded as pending/accepted; the after-the-fact
    result is shown when it resolves. v1 displays and records the action; the agent executes
    it later.

## 3. Glossary

_Downstream readers and FRs use these terms exactly. Detailed real-data shape lives in
`addendum.md` §A; bill mechanics in §C._

- **Farm** — the whole grower operation (customer zero: Batth). Comprises several Entities.
- **Entity** — a legal billing entity (Batth has 6). Distinct from **Actual Owner** (the
  real owner, which the master sheet tracks separately from **Billing Name**).
- **Account** — a PG&E account number (Batth: 57). Belongs to one Entity; groups Meters.
- **Service Agreement / SA ID** — PG&E's per-meter service-agreement identifier. **The join
  key** that links a bill's per-meter charges to its inventory **Meter** row.
- **Meter / Pump** — a metered service point (Batth: 183); used interchangeably on the
  surface since most meters are pumps. Carries SA ID, meter #, **Pump ID** (e.g. `P017`),
  real name (**Existing descriptor**, e.g. `PUMP # 17`), Rate Schedule, lat/long, GPM, Crop,
  Solar, **Status**.
- **Ranch** — a named grouping of Meters (Batth: ~36–37, to confirm). Rollup level between
  Account and Meter. **Block** — a planting sub-unit of a Ranch served by one or more Meters.
- **Rate Schedule** — the PG&E tariff a Meter is billed on. **Read per-meter from the data,
  never inferred.** **Legacy Schedule** — an older AG schedule being phased out (AG-4/5/1/R/V,
  e.g. `AG5B`); a wrong-rate surface (27 Batth meters flagged legacy).
- **TOU period** — time-of-use pricing band. **Two-tier** (Peak / Off-Peak, current
  schedules) or **three-tier** (Peak / Part-Peak / Off-Peak, legacy). The AG **rate** TOU
  peak is **5–8pm year-round** — distinct from the **DR event window** (4–9pm).
- **Demand Charge** — a $/kW charge on a Meter's billed peak demand. Set by the 5–8pm peak;
  not offset by solar. **Non-Bypassable Charge (NBC)** — per-kWh charges on grid consumption
  that solar credits cannot offset.
- **Array** — a solar generation system (Batth: 2). Credits multiple **Benefiting Meters**
  under **NEM2 / NEMA** (Net Energy Metering 2.0 aggregation), settling monthly with an
  annual **True-up** (per array; multiple arrays = multiple true-up dates).
- **Status** — Meter/pump health: GOOD / BAD / NEW WELL / OLD. First-class.
- **Canonical Billing Shape** — the one normalized, **multi-period** billing model the
  dashboard, math, and Recommendations read. Both the PDF extractor and the future Bayou
  adapter target it.
- **Reconciliation** — tying a figure's extracted line items to the bill's printed total
  within one cent. A figure that fails is withheld and marked **"needs review."**
- **Billing Coverage** — how much of a Meter/Account's billing has been ingested and
  reconciled. Surfaced honestly: inventory is complete day one, billing is partial at launch.
- **Representative seed** — the badged demo Farm (`isDemo:true`, labeled "Representative data")
  used as the investor surface. Tells a complete money story while real billing is partial; a
  connected real farm outranks it and it stops rendering. The canonical noun for this surface.
- **Crop** — the crop a Meter/Block serves (almonds, pistachios, grapes). A per-meter field and
  a first-class shared entity in the data model.
- **Person** — a contact associated with the Farm or an Entity (owner, manager, accountant). A
  first-class shared entity; carried in the data model for the monorepo move, minimal UI in v1.
- **Connection** — a billing-data connection (the dormant Bayou live-connect, Green Button, or
  the v1 concierge import). A first-class shared entity; all Connections feed the Canonical
  Billing Shape.
- **Recommendation** — a finding in the grammar `{ situation + action + impactUsd?/
  impactNote? + severity(info|watch|act) + status(pending|done|dismissed|overridden) +
  result? }`. Secondary to the dashboard; must trace to data visible on it; `action` shaped
  to be executed later (v1 displays).

## 4. Features

_Each subsection is a coherent feature: behavioral description, then FRs nested with stable
global IDs (FR-N) and testable consequences. Cluster order: A (engine, §4.1) → B (hero, §4.2) →
C (levers, §4.3) → D (close-the-loop, §4.4) → E (data-in, §4.5)._

### 4.1 Data Foundation (the engine)

**Description:** The engine turns the grower's master spreadsheet and his scanned PG&E bills
into one trustworthy, queryable picture. The **inventory** (all 183 meters, organized by
entity and ranch, with real pump names) is present **day one**, before any billing. **Billing**
is extracted from scanned, image-only PG&E bills by vision/LLM into structured JSON,
normalized into one **canonical multi-period shape**, joined to inventory **via SA ID**, and
gated by a **one-cent reconciliation guardrail** so a wrong number never reaches the screen.
This feature makes UJ-1 possible (the legible picture) and underpins UJ-2 (close-the-loop)
and UJ-3 (findings). v1 proves the extractor on **one account**; bulk across all 57 is
deferred. See `addendum.md` §A (data shape) and §C (bill mechanics).

**Functional Requirements:**

#### FR-1: Inventory import

The system loads the master spreadsheet into the farm ontology so every Meter is present and
legible before any billing exists. Realizes UJ-1.

**Consequences (testable):**
- The 7 billing-name variants dedupe to 6 Entities; typo'd duplicates collapse to the true
  Entity.
- All 183 Meters load, organized as Entity → Account → Ranch → Meter; each Meter carries its
  real name (Existing descriptor), Pump ID, SA ID, Rate Schedule (stored as read), Legacy
  flag, lat/long, GPM, Crop, Solar flag, and Status.
- Each Array links to its Benefiting Meters (NEMA), not flat meters.
- Rate Schedule is never inferred or computed at import — only the value present in the sheet.

#### FR-2: Scanned-bill extraction

The system extracts a scanned, image-only PG&E bill PDF into structured JSON per Service
Agreement using vision/LLM extraction, classifying each page's type before extracting.
Realizes UJ-1, UJ-2, UJ-3.

**Consequences (testable):**
- Each page is classified before extraction (payment-confirmation / account summary / per-SA
  summary list / per-SA charge detail / NEM reconciliation); the extractor does not apply a
  charge-detail schema to a summary page.
- For each Service Agreement, extraction yields: the printed Rate Schedule name, meter #,
  Pump ID, the TOU energy split with charges, the Demand Charge, NBCs, **and every other line
  item that composes the SA's printed total** — customer/minimum charge, taxes, surcharges,
  riders, and credits. No contributing line may be silently omitted, because FR-5 reconciles
  against the *printed total*, not a partial subtotal.
- Both two-tier (Peak / Off-Peak) and three-tier (Peak / Part-Peak / Off-Peak, legacy) TOU
  are handled.
- A single PDF fans out to many Service Agreements (one account carries dozens of meters).

**Out of Scope:**
- 15-minute interval data and the timestamp of the demand peak (not on the bill). v1 demand
  analysis is cycle-level only.

#### FR-3: NEM reconciliation extraction

The system extracts NEM meters' reconciliation tables — monthly rows and the annual True-up —
including negative usage, and links them to the generating Array.

**Consequences (testable):**
- Negative usage (generation exceeding consumption) is captured, not dropped or floored at
  zero.
- The bundled monthly rows are each captured as distinct periods; the True-up value and date
  are captured per Array.
- Extracted NEM allocations attach to the correct Benefiting Meters via SA ID.

#### FR-4: Canonical billing model and SA-ID join

The system normalizes all extracted billing into one canonical, multi-period shape and
attaches it to inventory Meters via SA ID; the future Bayou adapter targets the same shape.

**Consequences (testable):**
- The dashboard, energy math, and Recommendations read only the canonical shape, never a raw
  source format.
- The shape is multi-period, so year-over-year is possible from a single export.
- Swapping the billing source (PDF extractor → Bayou adapter) requires no change downstream
  of the canonical shape.
- **The SA-ID join is identity-checked, not assumed clean.** The extracted meter # and Pump ID
  must match the inventory row joined on SA ID; a mismatch is flagged "needs review" rather than
  attaching a (possibly cent-perfect) figure to the wrong meter. (The sum guardrail in FR-5
  checks totals, not identity, so the join must be validated separately.)

#### FR-5: Reconciliation guardrail

A figure renders in the product only if the full set of its extracted line items reconciles to
the relevant **printed total** within one cent; otherwise it is withheld and marked "needs
review." Realizes UJ-2.

**Consequences (testable):**
- Reconciliation runs against the **printed total**, not a partial subtotal: at the
  Service-Agreement level against the SA's printed total, and at the account level against the
  account total. Every charge line composing that total (FR-2) must be captured, so a missing
  line fails the check rather than passing a weaker subtotal.
- A Service Agreement whose extracted charges sum to within $0.01 of its printed total renders;
  outside $0.01 it is withheld and shown as "needs review," never as a number.
- OCR/extraction errors surface as "needs review," not as wrong dollar figures.
- Reconciliation is proven on one account before any bulk extraction.

#### FR-6: Partial-billing coverage

The system tracks Billing Coverage per Meter and Account and presents the complete inventory
while billing fills in. Realizes UJ-1.

**Consequences (testable):**
- The full 183-meter inventory renders day one regardless of how much billing is ingested.
- Each Meter/Account shows an honest coverage state: no bill yet, needs review, or reconciled.
- v1 proves extraction on a single account; bulk across all 57 accounts is explicitly out of
  scope for v1.

**Notes:** `[NOTE FOR PM]` Bulk extraction across ~57 accounts (thousands of scanned pages) is
a real pipeline deferred past v1 — revisit when the single-account parser is proven and Bayou
is live.

### 4.2 Dashboard (the hero — legibility)

**Description:** The home surface and the conversion demo. It follows the card → chart →
table → drawer hierarchy inside a three-zone shell (agent rail · data hero · persistent
findings rail). The **hero is the chart, table, and map** — Chart · Table · Map · Calendar
lenses over one meter dataset, Chart default — and money is the story those visuals tell,
not a lone hero number.
Home is a **data dashboard**: recommendations are secondary and live in the feed (§4.3), never
as a hero card. The billing-cycle calendar is **not** here — it demotes into the
billing-cycle-timing lever (§4.3). Realizes UJ-1 (first reveal) and UJ-2 (the recurring check).

Surface-priority and form-factor are runway decisions: the **dense meter table (FR-9) is P0**
— it is what earns Gagan's trust — and the **map (FR-12) is promoted to a co-equal home
lens**, no longer the first cut (see UX Reconciliation, §1). Both demos in the next six weeks run on a **laptop**, so the
desktop/tablet dashboard must land hard, with a clean responsive phone view. Mobile-first is
kept as a discipline (nothing breaks on a phone), but desktop is the surface actually in the
room.

**Functional Requirements:**

#### FR-7: Home summary cards

The home surface leads with a small set of KPI cards, hero first. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- The hero card is **total PG&E spend**, scoped to the covered period, with the
  **billing-coverage indicator** ("N of 183 meters loaded") beside it so the number is honest;
  the indicator reads 100% on the fully-loaded representative seed.
- A **demand-charge exposure** card shows the sum of billed demand charges ($) across covered
  meters.
- A **biggest cost mover** card renders only when a meter has ≥2 covered periods; otherwise it
  is hidden gracefully, never faked.
- Each card pairs a number with a sparkline and a vs-last-period delta **when ≥2 covered
  periods exist**; with a single covered period the sparkline and delta degrade gracefully
  (hidden, not faked) — the same rule as the biggest-mover card, since at launch Batth's
  real screen may have only one covered period.
- All figures are tabular; money is the story the chart/table/map hero tells, never the
  loudest single element and never a lone hero number.
- No card presents overpayment, savings, or a projected bill.

**Out of Scope:**
- Savings-captured-YTD card (no acted recommendations at launch) and projected-month-end card
  (that is the close-the-loop engine, §4.4).

#### FR-8: Spend and TOU chart

The home surface shows one chart: energy split by TOU period, with a year-over-year toggle.

**Consequences (testable):**
- Bars stack **Peak / Part-Peak / Off-Peak**; legacy three-tier meters render Part-Peak,
  current two-tier meters render without it.
- The year-over-year toggle compares equivalent periods drawn from the multi-period canonical
  shape.
- The chart reads only the canonical billing shape.

#### FR-9: Meter table (P0)

A single dense, sortable, filterable table of every meter — the surface Gagan lives in.
Realizes UJ-1.

**Consequences (testable):**
- Columns include: real name (Existing descriptor), ranch, entity, rate schedule, legacy flag,
  this-cycle cost, demand charge ($), status, coverage. (The underlying peak-demand level drives
  the demand charge, but kW is not shown as surface copy — see the never-kW voice rule in §7.)
- Sortable by any column; filterable by entity / ranch / rate.
- Concerning cells are color-coded (traffic-light; watch/act earn amber/red).
- A meter with no reconciled billing still shows its inventory row with a coverage state —
  never a blank or a fabricated cost.
- The full dense multi-column table is the tablet/desktop power-surface; mobile shows a
  simplified sortable list (see feature NFRs).

#### FR-10: Meter drawer

Clicking a table row (or a map pin) opens a side drawer with that meter's full detail, without
leaving context. Realizes UJ-3.

**Consequences (testable):**
- The drawer shows the meter's canonical billing detail (rate schedule, TOU split, demand) plus
  its inventory (pump name, ranch, crop, GPM, status).
- Solar meters additionally show Array linkage, NEM allocation, and True-up.
- That meter's findings (Recommendations) appear in the drawer, each tracing to the data visible
  there.

#### FR-11: Rollup and filter

The dashboard rolls up and filters so 183 meters stay usable. Realizes UJ-1.

**Consequences (testable):**
- Filtering by entity / ranch / rate recomputes both the cards and the table to that subset;
  clearing returns to the whole farm.
- Money rollups count only covered (reconciled) meters; the coverage indicator reflects the
  active filter.

#### FR-12: Map view (a co-equal home lens)

A lightweight, read-only map of geotagged meters. Realizes UJ-1.

**Consequences (testable):**
- Every meter with lat/long renders a pin; pin color encodes status (or cost) via the
  traffic-light system.
- Tapping a pin opens the same meter drawer (FR-10).
- The map is **inventory-driven**, so it renders fully on day one and on the partial-billing
  representative seed even when billing is incomplete.

**Notes:** `[NOTE FOR PM]` FR-12 is **promoted to a co-equal home lens** (UX Reconciliation, §1):
it is the strongest "feel of control" surface and renders inventory-only — pins come from the
bill's PLSS land descriptions + street addresses, so no Bayou is needed. FR-9 (table) and FR-12
(map) are now peer lenses over one meter dataset, not a P0/P1 trade-off.

#### FR-22: CSV export

The grower can export the current meter view to CSV in one click. Realizes UJ-1 (the
Excel-brained grower's bridge).

**Consequences (testable):**
- One click exports the meter table to CSV, respecting the active entity/ranch/rate filter.
- Exported figures match what is shown on screen; "needs review" cells export as "needs review,"
  never as a fabricated number.

**Out of Scope:**
- SGMA energy-to-water export (needs the energy-to-water conversion; deferred — see §6.2).

**Feature-specific NFRs:**
- **Form-factor:** the dense table (FR-9) is a tablet/desktop progressive enhancement over a
  mobile core of hero + KPIs + simplified sortable list + drawer (+ map if it survives).
  (Build-target and mobile-first rationale in the §4.2 description and §7.)
- **Speed:** sub-second navigation across cards, table, drawer, and map (Linear/Stripe craft
  bar).

### 4.3 Recommendations and the energy levers (the money — secondary)

**Description:** Once the picture is trusted, the same data surfaces where money is hiding.
Recommendations are **secondary to the dashboard**, appear in a **feed and inside the relevant
meter's drawer** (never as a home hero card), and **every finding traces to data visible on the
dashboard.** v1 **displays** findings in the recommendation grammar, shaped so the action can be
executed by the agent later. The honest lever priority governs what is real in v1: **rate
optimization is the one fully-computed lever**; solar/NEM contributes a single retrospective
insight; billing-cycle timing is the lightweight demoted calendar; pump health is a flag, not a
computed efficiency number; DR enrollment is legible info only. Realizes UJ-3.

**Functional Requirements:**

#### FR-13: Recommendation feed

The system presents Recommendations in the grammar, secondary to the dashboard, displayed
propose-then-approve. Realizes UJ-3.

**Consequences (testable):**
- Each Recommendation carries `situation + action + impactUsd?/impactNote? + severity(info|
  watch|act) + status(pending|done|dismissed|overridden) + result?`.
- Recommendations render in a feed and in the relevant meter's drawer; never as a home hero
  card.
- Each shows its reasoning, one concrete action, the dollar impact, and a one-tap response;
  v1 records status and shows the after-the-fact result.
- Every finding traces to data visible on the dashboard (the meter, its rate, its usage). A
  finding with no dollar impact and no `impactNote` is not shown.

#### FR-14: Rate optimization (lever 1, fully real)

The system identifies meters on a non-optimal or legacy rate schedule and quantifies the dollar
impact of switching to the cheapest eligible schedule, using a dated, versioned PG&E ag tariff
fixture and the meter's own usage. The 27 legacy-flagged meters are the lead. Realizes UJ-3.

**Consequences (testable):**
- The tariff fixture is a **dated, versioned data file** — per schedule: customer charge, TOU
  energy by season, demand charge, demand-charge limiter. No rate is hardcoded in code.
- Fixture scope is **bounded to the schedules Batth holds plus their current-equivalents**
  (AG5B / AG5C / AG4C, HAGC, HAGA1 / HAGA2 / HAGB, and the AG-A / AG-B / AG-C targets), not all
  PG&E ag schedules.
- **Back-test gate:** before any alternative-schedule savings render for a meter, the system
  recomputes that meter's **current** charges from the fixture plus the meter's own TOU usage
  and billed demand, and compares to the actual billed charges.
- **The back-test tolerance is a defined small percentage band, not one cent** — because
  riders, baseline adjustments, and credits outside the fixture mean a fixture recompute will
  not hit the printed total exactly. The band is calibrated during build against real bills.
  This is distinct from the cent-exact guarantees on FR-5 (bill reconciliation) and FR-19
  (verification), which check against ground truth; the rate back-test validates a *model*.
- On pass: the finding shows the savings **as a labeled estimate** ("estimated savings ~$X"),
  with the rates used and the rate effective date, so Gagan can verify the math. The savings
  number is never presented as cent-exact.
- On fail (recompute outside the band): the meter falls back to a **qualitative legacy→current
  finding** without a dollar number.
- Eligibility respects the **35 kW threshold**; the finding notes the **once-per-12-months**
  switch constraint.

**Out of Scope:**
- The full set of PG&E ag schedules (fixture is bounded to Batth's set plus equivalents);
  deriving an "effective rate" from one meter's bill to price another meter (rejected — not
  transferable, produces misleading savings).

#### FR-15: Solar/NEM demand insight (lever 4)

For solar meters on a demand-carrying schedule, the system surfaces the retrospective insight
that solar does not offset the demand charge. Realizes UJ-3.

**Consequences (testable):**
- The insight renders **only** for meters that are both solar (NEM) **and** on a
  demand-carrying schedule (AG-C family); it never renders on a solar meter with no demand
  charge.
- It states the meter's energy position (net-zero or net credit) alongside the demand charge
  still owed ($), tied to the 5–8pm peak.
- It appears in the drawer's NEM section and as a feed item.

#### FR-16: Billing-cycle timing (lever 5)

A lightweight calendar of each meter's billing-cycle close, derived from its serial code via the
2026 meter-read schedule fixture.

**Consequences (testable):**
- Each meter's cycle-close date is derived from its serial code plus the meter-read fixture.
- It is presented as a small calendar/timing view, not as the home surface, and kept
  lightweight.

#### FR-17: Pump health flag (lever 3)

The system flags BAD-status pumps from the master `Status` field as a health signal, in the
table and the drawer.

**Consequences (testable):**
- `Status` (GOOD / BAD / NEW WELL / OLD) is shown in the table and drawer; BAD is flagged.
- **No kWh-per-gallon or efficiency figure is computed or shown** — GPM is present but runtime
  and pumped volume are not, so any efficiency number would be invented.

**Out of Scope:**
- Efficiency math as a recommendation lever (deferred until runtime/volume data exists).

#### FR-18: Enrollment status (lever 2, info only)

The system displays demand-response / program enrollment status as legible information pulled
from the bill. It generates no DR recommendation.

**Consequences (testable):**
- If the bill shows program enrollment (e.g. PDP), it is displayed as info.
- No DR recommendation or savings claim is generated (no defensible dollar impact; Batth is
  already enrolled).

**Notes:** `[NON-GOAL for MVP]` within this feature: kWh-per-gallon efficiency math, DR
enrollment recommendations, precision/deficit irrigation (lever 6), and coincident-peak
staggering (kept in code, unsurfaced).

### 4.4 Close-the-loop (accuracy and realized results)

**Description:** Two distinct beats turn a one-time reveal into compounding trust, and they must
not be conflated. **Bill-accuracy verification (FR-19)** is *accuracy, not prediction*: Terra
independently recomputes a posted bill from the rates and the meter's own usage and shows that
it matches — this is what licenses every alternative-schedule number in FR-14, and it carries
the trust beat live every cycle. **Recommendation result (FR-20)** is the true close-the-loop:
for an accepted recommendation, predicted impact vs. the realized number on the next bill. v1
shows the diff, never *why* it differed. Realizes UJ-2.

**Functional Requirements:**

#### FR-19: Bill-accuracy verification (accuracy, not a forecast)

The system recomputes a posted bill from the tariff fixture and the meter's own usage and shows
whether it matches the actual bill. Realizes UJ-2.

**Consequences (testable):**
- For a posted bill, the system recomputes charges from the tariff fixture plus the meter's own
  TOU usage and billed demand, and compares to the actual posted total.
- On match (within tolerance), it shows a **verification badge** worded as independent
  calculation matching the bill (e.g. "Terra independently calculated this bill from the rates
  and your usage and matched it to the cent").
- The copy **never** claims prediction or forecast. (Matching ground truth is what licenses the
  alternative-schedule numbers in FR-14.)

#### FR-20: Recommendation result (the close-the-loop)

For an accepted Recommendation, the system records the predicted impact and later populates the
realized number from the next posted bill, via FR-13's `result`. Realizes UJ-2, UJ-3.

**Consequences (testable):**
- On acceptance, the predicted impact is recorded; `result` populates with the realized number
  from the first bill that posts after acceptance.
- Until that bill posts, `result` reads "pending."
- v1 shows the diff (predicted vs. realized); it does not explain the variance.

**Notes:** `[NOTE FOR PM]` Demo framing: at the v1 demo, FR-19 is the live trust signal (a
completed match every cycle); FR-20 reads as "pending result" until a bill posts after a rec is
accepted. Do not script the demo as if a loop has already closed.

### 4.5 Data-in (concierge import)

**Description:** v1 ingests both layers — inventory (the master spreadsheet) and billing (the
PG&E PDFs) — through a **dev/admin import path**, run by the (technical) founder or Kamran. There
is **no grower-facing upload UI in v1**: it would be build effort competing with the load-bearing
parser and dashboard, feeding a parser that must first be proven on one account. The existing Bayou
live-connect flow is kept **dormant**, not removed — it is the future path once Bayou works,
targeting the same canonical billing shape (the cluster-A adapter seam). The representative seed
needs no onboarding at all.

**Functional Requirements:**

#### FR-21: Concierge/admin import

The system ingests inventory and billing via an admin/dev import path; self-serve onboarding is
deferred.

**Consequences (testable):**
- The master spreadsheet loads via an admin/dev import, not a self-serve UI.
- PG&E PDFs import via the same path; one account is proven before bulk.
- No grower-facing upload page exists in v1.
- The Bayou live-connect flow remains present but dormant in the codebase, targeting the
  canonical billing shape.

**Notes:** `[NOTE FOR PM]` Founder-dependency risk: the recurring loop (UJ-2) needs new monthly
PDFs fed over time, and the founder leaves ~July 20 for ~5 months. Concierge-only ingest stalls
the product the moment the founder is unavailable. A minimal Kamran/Jorge-runnable ingest path is
the explicit **first fast-follow after v1** — captured as a deliberate deferral in §5 Non-Goals,
not an accident.

## 5. Non-Goals (Explicit)

- **Not a real-time / live energy meter or operational pump controller.** Planner, not live
  meter: PG&E data lags ~a day; no spike detection, no 90-minute peak alerts, no remote pump
  control, no intra-day demand curve. v1 demand analysis is cycle-level.
- **Not the agentic Brain.** v1 *displays* recommendations in the grammar; no ⌘K command
  palette, sidebar copilot, natural-language Q&A, or autonomous propose→execute actions (those
  are Stage 2).
- **Not a self-serve onboarding product.** v1 is concierge/admin import; no grower-facing upload
  UI. (The minimal Kamran/Jorge-runnable ingest path is a deliberate **first fast-follow**, not
  an oversight — it removes the founder-dependency risk during the ~5-month absence.)
- **Not a multi-account bulk pipeline.** v1 proves the extractor on one account; bulk across all
  57 (thousands of scanned pages) is deferred.
- **Not a full PG&E rate engine.** The tariff fixture is bounded to Batth's schedules plus their
  current-equivalents, not all PG&E ag schedules.
- **Not a pump-efficiency analytics tool.** Pump health is a flag from the `Status` field; no
  kWh-per-gallon or efficiency number is computed (no runtime/volume data — it would be invented).
- **Not a demand-response enrollment broker.** Enrollment status is shown as info; no DR
  recommendation.
- **Not a precision-irrigation tool, and not a coincident-peak stagger advisor.** Lever 6 is a
  future tool; staggering stays in code, unsurfaced.
- **Not Tool 2, and not a monorepo yet.** Single Next.js repo with clean logic/data/UI
  boundaries so the later monorepo move is mechanical.

## 6. MVP Scope

### 6.1 In Scope
- **Data foundation (FR-1–6):** inventory import (183 meters, the entity/account/ranch/meter
  tree + array→benefiting-meter graph + meter health), scanned-bill vision extraction with page
  classification, NEM reconciliation extraction, the canonical multi-period billing shape joined
  on SA ID, the one-cent reconciliation guardrail, and partial-billing coverage — proven on **one
  account**.
- **Dashboard (FR-7–12, FR-22):** hero total-spend card + KPIs with the coverage indicator, TOU
  chart, the dense sortable/filterable meter table (**P0**), the meter drawer, rollup/filter by
  entity/ranch/rate, one-click CSV export, and the lightweight read-only map (**P1**).
- **Recommendations + levers (FR-13–18):** the secondary recommendation feed; **rate optimization
  fully real** (tariff fixture + back-test gate, lead with the 27 legacy meters); the solar/NEM
  demand insight (AG-C-family solar meters only); the lightweight billing-cycle calendar; the pump
  health flag; DR enrollment shown as info.
- **Close-the-loop (FR-19–20):** the bill-accuracy verification badge and the accepted-rec
  predicted-vs-realized result.
- **Data-in (FR-21):** concierge/admin import; Bayou flow kept dormant.
- **Two demo surfaces:** Gagan's real screen (conversion) and the badged representative seed
  (investor) — both already supported by the `isDemo` resolution, zero new build.
- **Craft + design system:** Inter throughout, tabular figures, traffic-light status, 8px scale,
  sub-second navigation; desktop/tablet primary with a clean responsive phone view.

### 6.2 Out of Scope for MVP
- **Bulk extraction across all 57 accounts** — deferred until the single-account parser is proven.
- **Minimal Kamran/Jorge-runnable ingest path** — `[NOTE FOR PM]` deferred but the **explicit
  first fast-follow**; load-bearing for the founder's ~5-month absence, revisit immediately
  post-v1.
- **Self-serve onboarding and live Bayou connect** — dormant; future path once Bayou works.
- **Proactive spike/anomaly alerts** — revisit once billing is complete and Bayou is live (false
  alarms on partial, lagged data risk the first real customer).
- **Forward bill projection / projected-month-end card** — no projection model on this runway.
- **Savings-captured-YTD card** — no acted recommendations at launch.
- **Variance attribution** ("why was it off by $400") — close-the-loop shows the diff only.
- **Anonymized-real investor mode** — the badged seed covers rooms that can't see live data.
- **The agentic Brain** (palette, copilot, NL actions) — Stage 2.
- **15-minute interval data / intra-day demand curve / SMS peak alerts / remote control** — not in
  the bill and/or hardware-dependent.
- **SGMA energy-to-water export** — the energy-to-water conversion is heavier; v1 ships plain CSV
  export (FR-22) only.

### 6.3 Build priority and demo framing (risk)

_Surfaced by the finalize reviewer pass. The runway is the binding constraint; these protect the
two demos if the parser eats time._

- **Cut order if the cluster-A parser overruns:** FR-12 map first, then the FR-8 year-over-year
  toggle, then FR-20 (the rec result reads "pending" at demo time anyway), then FR-3 NEM depth.
  **Protect the spine:** FR-1, FR-2, FR-4, FR-5, FR-7, FR-9, FR-14 (engine + hero + the one real
  lever). `[NOTE FOR PM]`
- **Extraction proof milestone:** prove cent-exact extraction on the demo account **early**
  (~week 2). The whole product rides on a vision step never yet demonstrated. If it cannot reach
  cent-exact in time, fall back to **hand-verified extraction of the single demo account**
  (concierge, technical operators) so the conversion demo still shows real, reconciled numbers.
  `[NOTE FOR PM]`
- **Demo coverage is asymmetric — frame it deliberately.** The investor seed is 100% covered;
  Gagan's real screen is **partial billing at launch** (one of 57 accounts proven). The
  legibility win rides on the **complete inventory** (all 183 meters from the spreadsheet, day
  one), while the hero spend number is covered-scope with the coverage indicator beside it.
  Choose the demo account for the best story; do **not** script the Batth demo expecting a
  complete spend total. `[NOTE FOR PM]`

## 7. Cross-Cutting NFRs

_System-wide quality attributes not tied to one feature. The design system in
`project-context.md` is the source of truth for visual detail; this section names the bars that
govern every feature._

**Correctness and trust (the product's reason to exist)**
- No figure renders unless it reconciles to ground truth within tolerance; otherwise it shows
  "needs review" (FR-5 bill guardrail; FR-14 back-test gate).
- Pure energy math lives in tested `/lib/energy` functions; new energy logic ships with
  colocated tests. This is the trust surface.
- **Never hardcode a rate or `$/kW`** — dollars are read from data; the tariff fixture is dated
  and versioned.
- **No fabricated numbers** — nothing inferred (efficiency, coverage, projection) is presented as
  if measured.

**Posture**
- Planner, not live meter: PG&E data lags ~a day; no real-time or spike claims; demand analysis
  is cycle-level.

**Performance, form-factor, and comprehension**
- Sub-second navigation across cards, table, drawer, and map.
- Desktop/tablet is the primary build target (both six-week demos run on a laptop); a clean
  responsive phone view; mobile-first as a discipline so nothing breaks on a phone.
- **Comprehension bar:** a non-technical grower answers the main question on each screen (which
  pump is costing me, and why) in seconds — the research bar is **under ~10 seconds from the
  home screen.** Legibility first, luxury second.

**Design and voice** (per the project design system)
- Editorial agrarian-luxury: warm paper background, warm charcoal text, one dominant green
  (**`#2fa84f`**) plus one accent, traffic-light status (watch/act earn amber/red). No
  glassmorphism or heavy gradients.
- Inter across display, body, and data (loaded via next/font); hierarchy from weight and size,
  not from mixing typefaces. Tabular figures; money reads clearly through the chart/table/map hero
  (never the largest single element, never a lone hero number); 8px spacing; hairline
  borders; soft shadows.
- One orchestrated motion moment per view; easing `cubic-bezier(0.16, 1, 0.3, 1)`, 400–700ms,
  **stagger 60–100ms, no bounce or overshoot**; honor `prefers-reduced-motion` (instant fallback).
- Voice: plain operator English in the grower's words (blocks, sets, ranches, pumps); never kW,
  "15-minute interval," or AI jargon on the surface; no em dashes, no exclamation marks. All copy
  lives in `/copy` (localization-ready).

**Security and privacy**
- Grower utility credentials never touch the repo, client code, or anything agent-readable;
  exports/fixtures for dev, real auth in prod.
- Real grower financials are never shown to investors; the badged representative seed (labeled
  **"Representative data"**) is the investor surface. Real and demo farms are **separate rows
  that never merge** — a connected real farm outranks the seed, which then stops rendering.

**Architecture (keep the monorepo move mechanical)**
- Clean boundaries: pure logic in `/lib/energy`, ingestion/parsing in `/lib`, DB edges and
  derivation in their modules, UI in `/app`, strings in `/copy`. The canonical billing shape
  isolates the source so the PDF→Bayou swap changes nothing downstream.
- Single Next.js repo now, structured so the Tool 2 monorepo move is just moving files.

## 8. Success Metrics

**Primary (binary outcomes — no invented targets)**
- **SM-1 — Batth converts.** Batth signs a paying pilot. Validates the whole product, especially
  the legible picture (FR-1, FR-7, FR-9) and real rate dollars (FR-14).
- **SM-2 — Investor signal.** The demo advances the raise (a real next meeting or a commitment).
  Validates the badged-seed demo surface and the craft bar.

**Secondary (the trust/correctness bar that makes the primaries possible)**
- **SM-3 — Reconciliation.** 100% of displayed figures tie to the cent on the proven account;
  anything that does not is "needs review," not shown. Validates FR-5, FR-19.
- **SM-4 — Defensible rate findings.** Every legacy meter whose back-test passes carries an
  alternative-schedule finding with a checkable estimated-savings number and the rates shown;
  meters that fail the back-test fall back to the qualitative legacy→current finding rather than
  showing a number. (Bar softened from "all 27" during finalize — the back-test is honest about
  meters it cannot reconcile; see Open Question 2.) Validates FR-14.
- **SM-5 — Clean demo.** Both demos run end to end with zero wrong numbers and no stall. Validates
  the system end to end.

**Counter-metrics (do not optimize)**
- **SM-C1 — Correctness over polish.** A good-looking number that fails reconciliation is worse
  than "needs review." Counterbalances SM-2, SM-5.
- **SM-C2 — One real lever over six shallow.** One defensible rate finding beats six uncertain
  ones. Counterbalances SM-4.
- **SM-C3 — "Needs review" over fake coverage.** Honest gaps beat a fuller-looking but fabricated
  screen. Counterbalances SM-3.

## 9. Open Questions

1. **Ranch count:** 36 vs. 37 — confirm against the real master sheet.
2. **Rate back-test tolerance band (FR-14):** approach resolved during finalize — the back-test
   uses a defined small **percentage** band (not one cent), and rate savings render as labeled
   estimates. The remaining task is **calibrating the band value** against real Batth bills
   during build (too tight → most legacy meters fall to the qualitative fallback and SM-4
   thins; too loose → estimates drift). This is the one item with real build consequences.
3. **Tariff fixture sourcing:** the dated PG&E ag tariff values (customer charge, TOU energy by
   season, demand charge, limiter) for Batth's schedules + current-equivalents must be sourced
   from published tariffs with effective dates; sourcing and refresh cadence TBD.
4. **Bayou account scope:** re-verify one-account-per-login against the live PG&E flow before
   the adapter is built (parked; not v1-blocking).
5. **History depth:** which months/periods the Batth export actually bundles — bounds YoY (FR-8)
   and the biggest-mover card (FR-7). Empirical, confirm during ingest.
6. **Open visual-system decisions** (Architect): exact severity palette (watch/act amber/red).
   (Brand green RESOLVED 2026-06-08: dominant green is `#2fa84f`, superseding deep-forest and
   the marketing green.)
7. **Working title:** "Terra Tool 1 — PG&E Energy Dashboard" — confirm or replace.
8. **New runtime fixtures and the Vercel trap (architect):** the dated tariff fixture (FR-14) and
   the 2026 meter-read schedule (FR-16) are new runtime-read fixtures — they must use
   `process.cwd()` (not `import.meta.url`) and be added to `outputFileTracingIncludes`, or they
   break on `next start` / Vercel (per project-context).

## 10. Assumptions Index

- **[ASSUMPTION]** PG&E's published AG tariff sheets are obtainable and can be encoded as a dated,
  versioned fixture (FR-14 depends on this).
- **[ASSUMPTION]** The scanned bill reliably carries, per service agreement, the printed rate
  name, TOU split, demand, and NBCs for the relevant meters — verified on inspected pages,
  assumed to generalize within the account.
- **[ASSUMPTION]** The bill's `SA ID` matches the master sheet's `SA ID` for every meter, making
  it a clean join key.
- **[ASSUMPTION]** The 7 billing-name variants dedupe cleanly to 6 legal entities.
- **[ASSUMPTION]** The representative seed can be populated into a complete, believable money
  story (content task, not new build) to carry the investor room.
- **[ASSUMPTION]** Map pins are drawn only for meters that have lat/long; meters lacking it are
  absent from the map but present everywhere else.
- **[ASSUMPTION]** The back-test (FR-14) will reconcile for Batth's main schedules; meters where
  it cannot fall back to the qualitative legacy→current finding (this is designed-for, but its
  frequency is unknown until the fixture meets real bills).
