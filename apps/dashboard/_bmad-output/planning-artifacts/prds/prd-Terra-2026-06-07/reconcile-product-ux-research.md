# Input Reconciliation — product-ux-research.md vs. PRD

Source input: `docs/product-ux-research.md`
PRD: `_bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md` (+ `addendum.md`)
Date: 2026-06-07

This file lists MATERIAL items from the research doc that the PRD drops or underserves.
Each entry: the research point + its location, a coverage verdict, and the PRD location.
Items the PRD *deliberately* filtered for Critical-Rules reasons (Inter font, real-time /
15-min / 90-min SMS alerts, remote pump control, ET irrigation calculator, the whole
agentic Stage-2 layer / ⌘K / sidebar copilot) are NOT relisted as gaps — they are
intentional and documented in PRD §5/§6. A short "Intentional filters — confirmed
correctly excluded" section at the end records that they were checked.

---

## GENUINE GAPS / UNDERSERVED (in-scope for v1, would strengthen the PRD)

### G1. CSV / data export is a first-class Wexus feature and a named JTBD-CFO action, but the PRD never makes it an FR.
- **Research:** Wexus has a dedicated **Data Export page** ("My Bills," multi-year CSV for
  electric/gas/water) as one of its four core pages (Key Finding #7; Part 3 Wexus teardown,
  lines 99, 142). The "Prioritized features for Tool 1" list item #8 is **"One-click
  SGMA/CSV export."** The Stage-1 recommendation (line 168) sets the explicit benchmark "a
  CFO should export an SGMA/cost report in one click." CLAUDE.md itself calls for "one-click
  CSV export" on the Table view.
- **PRD coverage verdict: DROPPED.** No FR mentions CSV/data export. The meter table (FR-9)
  is sortable/filterable but has no export consequence. SGMA water reporting is correctly out
  (energy-to-water conversion is out of scope), but **plain CSV export of the meter table /
  cost data is cheap, in-runway, and is a named success benchmark in the research.** This is
  the one concrete Wexus feature the PRD silently drops. CLAUDE.md lists it as a Table-view
  requirement, so it is in-scope.
- **PRD location:** absent. Would slot as a consequence of FR-9 (FR-9 already mentions CSV in
  CLAUDE.md but not the PRD) or a small new FR under §4.2.

### G2. KPI-card composition: research specifies a sparkline + vs-period delta *and* a specific card set; PRD keeps the form but the "biggest mover" and delta depend on multi-period coverage the PRD admits is thin.
- **Research:** Cards "pair a number with a sparkline and a vs-last-period delta in
  green/red" (line 50), card set = spend, demand-charge exposure, biggest mover, projected
  bill, savings YTD (lines 50, 141).
- **PRD coverage verdict: COVERED, with a load-bearing caveat the PRD half-states.** FR-7
  keeps spend + demand-charge exposure + biggest-mover and correctly cuts projected-bill and
  savings-YTD (§5). But FR-7 requires "a sparkline and a vs-last-period delta" on **every**
  card, while also conceding (Open Question #5, line 695) that history depth is unknown and
  the biggest-mover card only renders with ≥2 covered periods. **On a single-account,
  partial-billing v1, most cards may have no prior period, so the sparkline/delta requirement
  may be unsatisfiable for the real-Batth demo** (it is satisfiable on the fully-loaded seed).
  The PRD should state that sparkline/delta degrade gracefully to "no prior period" the same
  way biggest-mover does, or the FR-7 consequence "each card pairs a number with a sparkline
  and a vs-last-period delta" will fail its own test on the conversion surface.
- **PRD location:** FR-7 (lines 277–290); tension with Open Question #5 (line 695).

### G3. "Pre-modeled meter entity with normalized cost/demand/efficiency/rate fields" — the Stripe upstream-aggregation insight — is partially lost.
- **Research:** Key Finding #3 (line 16): Stripe pre-aggregates messy raw data into clean
  fact/dimension tables so "every dashboard answers the next question without a new query";
  for Terra the equivalent is "a pre-modeled meter/pump entity with normalized cost, demand,
  **efficiency**, and rate-plan fields." Echoed by the Palantir ontology finding (#4) and the
  Tool-1 ontology item (Part 3, line 153).
- **PRD coverage verdict: MOSTLY COVERED.** The PRD's canonical billing shape (FR-4) + farm
  ontology (FR-1, Glossary) realize the "pre-modeled entity" insight well, and "ontology" is
  used verbatim. **The one lost field is `efficiency`** — but that loss is *intentional and
  defensible*: FR-17 explicitly refuses to compute a kWh/gallon efficiency number because
  runtime/volume data does not exist (no fabrication). So the drop is correct; flag only so
  the reviewer sees the research's "efficiency" word was consciously dropped, not missed.
- **PRD location:** FR-1 (line 174), FR-4 (line 220), FR-17 (line 446). No action needed
  beyond noting the deliberate efficiency exclusion.

### G4. Alerting as a first-class object with a Normal→Pending→Firing lifecycle (Grafana/Datadog) — the research recommends it even apart from SMS/real-time.
- **Research:** Lines 56, 145: "Alerting as a first-class object with a Normal→Pending→Firing
  lifecycle, grouped to avoid storms, routed by severity, and silenceable." Tool-1 feature #5
  bundles this with 90-min SMS, but the *lifecycle/grouping/silencing* concept is separable
  from the SMS/real-time mechanism.
- **PRD coverage verdict: DEFERRED — correctly.** The PRD defers proactive spike/anomaly
  alerts (§6.2, line 599) with a sound rationale ("false alarms on partial, lagged data risk
  the first real customer"). The *real-time SMS* half is a Critical-Rules filter (planner-not-
  live-meter). The recommendation feed (FR-13) already carries a `severity(info|watch|act)`
  field, which is the static analogue of the alert lifecycle. **Verdict: not a gap** — the
  alerting-as-object idea survives as the severity-graded feed; the lifecycle/SMS machinery is
  legitimately out of scope for a lagged planner. Recorded so the reviewer knows it was
  weighed, not dropped.
- **PRD location:** FR-13 severity field (line 386); §6.2 deferral (line 599).

### G5. The "10-second" / F-pattern hierarchy and "color encodes meaning not decoration" qualitative bars are present but the explicit *10-second answerability* benchmark is not a success metric.
- **Research:** The single sharpest UX benchmark in the doc (Stage-1 rec, line 168): "a
  non-technical ranch manager should answer 'which pumps are costing me too much and why?' in
  under 10 seconds from the home screen." Also Key Finding #2 (color = meaning) and the
  F-/Z-pattern scanning layouts (line 44), "a great dashboard is invisible" / restraint over
  decoration (line 44).
- **PRD coverage verdict: PARTIALLY COVERED — the qualitative bar made it, the measurable
  benchmark did not.** The PRD captures restraint, traffic-light color semantics, and money-
  as-largest-element in §4.2 and §7 (lines 633–639), and CLAUDE.md's "graspable in seconds"
  is echoed in the Vision (line 33, "the first ten seconds"). **But §8 Success Metrics has no
  legibility/speed metric** — SM-1..SM-5 are all conversion/correctness/clean-demo binaries.
  The research's "answer the question in <10s" is a concrete, testable UX target that would
  strengthen §8 and directly validate FR-9/FR-7. Currently the only speed bar is the NFR
  "sub-second navigation," which is page-load speed, not *comprehension* speed.
- **PRD location:** §8 (lines 658–680) — no comprehension/time-to-answer metric; §7 NFR
  "sub-second navigation" (line 629) covers a different thing.

### G6. Side-drawer drill-down explicitly "without leaving context" / Notion-style multi-view over the same dataset — drawer is covered, multi-view flip is thin.
- **Research:** Stripe side panel "opens full detail for any row without leaving context"
  (line 34) — covered. **Notion/Airtable/Retool finding (line 46):** "letting a grower flip
  the same meter dataset between a map view, a table view, and a cost-trend view." CLAUDE.md
  names exactly three views (Calendar/Table/Chart) over the same data.
- **PRD coverage verdict: MOSTLY COVERED.** Drawer = FR-10 (verbatim "without leaving
  context"). Table = FR-9, Map = FR-12, TOU chart = FR-8, billing-cycle calendar = FR-16 —
  so all the views from CLAUDE.md exist as separate FRs. **What is underspecified is the
  "flip the *same* dataset between views" unification** — the PRD treats them as distinct
  surfaces (table P0, map P1, calendar demoted into a lever) rather than as toggleable views
  over one filtered selection. This is minor and arguably an intentional simplification for a
  6-week runway, but the research's view-unification insight (and CLAUDE.md's three-views
  framing) is not stated as a goal anywhere. Flag as low-priority.
- **PRD location:** FR-8/9/10/12/16 exist; no FR ties them as views of one shared
  filter/selection.

### G7. Year-over-year "this-week/last-week/trailing-high-low" pairing per metric (Linear dashboard guidance) — YoY exists for the chart only, not per KPI card or table.
- **Research:** Linear guidance (line 38): "pair every key metric with a simple this-week/
  last-week/trailing-high-low chart so anyone could instantly see if something was good, bad,
  or in line." Tool-1 feature #3 (line 143): TOU-stacked bars **+ year-over-year compare.**
- **PRD coverage verdict: COVERED for the chart, NOT for cards/table.** FR-8 has a YoY toggle
  on the TOU chart. The cards' "vs-last-period delta" (FR-7) is the per-metric trailing
  comparison Linear describes, so it is conceptually present — but again gated by G2's
  coverage problem. **No real gap beyond G2**; recorded for completeness.
- **PRD location:** FR-8 (line 296), FR-7 delta (line 286).

### G8. Map view: research wants on/off + status overlays and spatial cost intensity ($/acre-foot); PRD map is status-or-cost only and read-only.
- **Research:** Wexus Pump Status map = geotagged meters with real-time on/off, efficiency
  rating, **$/acre-foot cost intensity**, rate plan per meter (lines 99–100, 146). "Growers
  think spatially in ranches and blocks" (line 54).
- **PRD coverage verdict: COVERED at the right scope.** FR-12 correctly makes the map read-
  only, inventory-driven, status- or cost-colored, P1, and the first cut. Real-time on/off and
  efficiency rating are correctly excluded (planner-not-live-meter; no efficiency math).
  **$/acre-foot is implicitly out** because it needs pumped-volume data the PRD says doesn't
  exist (same reason as FR-17). **Verdict: not a gap** — the map is right-sized; the dropped
  map fields all trace to deliberate exclusions (real-time, efficiency, volume). Recorded so
  the reviewer sees the spatial-thinking insight (a CLAUDE.md value too) is honored by FR-12.
- **PRD location:** FR-12 (line 344).

### G9. Solar ROI Dashboard (actual-vs-would-have-been bills, production vs consumption) — Wexus has it; PRD reduces solar to one retrospective demand insight.
- **Research:** Wexus **Solar ROI Dashboard** — actual-vs-would-have-been bills, production
  vs consumption (line 99). Tool-1 feature #7 pairs it with the irrigation calculator.
- **PRD coverage verdict: DELIBERATELY NARROWED — and consistent with the data.** The PRD's
  FR-15 keeps only the sharpest solar insight (solar does NOT offset the demand charge, tied
  to the 5–8pm peak) and FR-3 captures NEM monthly rows + true-up + negative usage. A full
  "actual-vs-would-have-been" solar ROI model is a projection/counterfactual — adjacent to the
  forward-projection the PRD explicitly defers (§6.2, line 600). **The negative-usage / true-
  up data needed for production-vs-consumption IS being extracted (FR-3), so a *retrospective*
  solar-value view (not a counterfactual) is within reach and would strengthen lever 4** — but
  this is a reasonable scope call given the runway and the "honest lever priority" (solar = one
  insight). Flag as a *possible* enhancement, not a clear drop. The headline NEM insight is the
  right v1 cut.
- **PRD location:** FR-15 (line 423), FR-3 (line 205).

### G10. AG-C $0.50/kWh demand-charge limiter and AG-C summer-peak-demand awareness — the research names these specifically; PRD's fixture includes a "demand-charge limiter" field but the AG-C-specific dollar figure is not surfaced as a user finding.
- **Research:** Tool-1 feature #4 (line 144): Utility Rate Analysis "with awareness of AG-C's
  summer peak demand charge and **$0.50/kWh demand-charge limiter.**"
- **PRD coverage verdict: COVERED structurally.** FR-14 requires the tariff fixture to carry a
  per-schedule "demand-charge limiter" field (line 408), and FR-15 ties the AG-C-family demand
  charge to the 5–8pm peak. So the limiter and AG-C demand awareness are in the data model and
  math. **No gap** — the research's specific AG-C mechanics are encoded as fixture fields and
  the solar/demand insight. Recorded as verified-present.
- **PRD location:** FR-14 limiter field (line 408), FR-15 (line 423).

### G11. Wexus savings claims epistemics — research flags "up to 40%" as promotional/not-audited; PRD repeats the "~40%" framing without the caveat in the PRD body.
- **Research:** Caveats (line 177) and Key Finding #7 (line 103): the "up to 40–50%" figure is
  **marketing, not audited** — the CEC/UC Davis modeled result was **not statistically
  significant after adjustment.** "Cite 'up to 40%' only as a vendor claim."
- **PRD coverage verdict: UNDERSERVED — a place the PRD risks a claim the research contradicts.**
  CLAUDE.md says "Wexus reports up to ~40% on one pump from rate analysis" and the PRD Vision
  positions Terra as beating Wexus on the "same core analysis." The PRD does NOT itself quote a
  40% number (good), and SM-4's "defensible, back-test-passing, checkable dollar" standard is
  exactly the right epistemic posture. **But the PRD never explicitly records the research's
  caveat that the incumbent's headline savings are unaudited** — relevant because the demo/
  pitch may reach for "Wexus claims 40%, we prove our number." The PRD's correctness counter-
  metrics (SM-C1/C2) cover Terra's own numbers but not the framing of the competitor claim.
  Low-severity, but worth a one-line note so the pitch doesn't inherit an unaudited figure.
- **PRD location:** §8 SM-4 (line 670) is the right standard; no explicit "competitor claim is
  promotional" note. (Research-landscape.md companion may already hold this — verify.)

### G12. Approval-queue / "concrete human-readable ask, not raw JSON" agentic-UX detail — Stage 2, but the recommendation *grammar* in v1 should already be shaped for it.
- **Research:** Agentic patterns (lines 20, 72–74, 89): make the ask concrete ("Delete user
  john@…?" not "Tool execution requires approval"), summarize context not raw JSON, support an
  **approval queue** when actions stack. CLAUDE.md: shape `action` so it can later be EXECUTED.
- **PRD coverage verdict: COVERED at the right depth for v1.** FR-13 requires each rec to carry
  a concrete `situation + action + impactUsd + one-tap response` and "one concrete action,
  never 'consider load management'" — which IS the "concrete ask, not raw JSON" principle
  applied to v1 display. The `action` shape is explicitly "shaped to be executed later." The
  approval *queue*, ⌘K, and propose→execute are correctly Stage 2 (§5). **Verdict: not a
  gap** — the v1 grammar already embodies the concrete-ask principle; the queue/execution
  machinery is rightly deferred. Recorded as verified.
- **PRD location:** FR-13 (line 381); §5 agentic non-goal (line 550).

---

## INTENTIONAL FILTERS — CONFIRMED CORRECTLY EXCLUDED (not gaps)

Checked against PRD §5/§6 and the project Critical Rules; each is deliberate and documented,
so NOT reported as a gap:

- **Inter typeface** (research lines 22, 57, 150) → PRD mandates Fraunces / Hanken Grotesk /
  JetBrains Mono and explicitly forbids Inter (§7, line 637; §6.1, line 588). Correct override.
- **90-minute peak/demand SMS alerts, 15-minute interval data, intra-day demand curve, real-
  time spike/anomaly detection** (research lines 24, 100, 145) → deferred as planner-not-live-
  meter (§5 line 547, §6.2 line 606, addendum §C.1 line 128). Correct.
- **Remote pump shut-off / control** (research lines 100, 106) → out, hardware-dependent (§5
  line 548). Correct.
- **ET-based Irrigation Cost Calculator** (research lines 24, 99, 147) → cut; precision/deficit
  irrigation is lever 6 / future tool (§5 line 563, §4.3 line 469). Correct per CLAUDE.md.
- **The full agentic Brain — ⌘K command palette, sidebar copilot, NL Q&A, propose→execute,
  generative UI blocks, guardrails-as-policy, reasoning trace, advisor personas** (research
  Part 2 throughout; lines 5, 64–90, 152–158) → all Stage 2 (§5 line 550, §6.2 line 604).
  Correct; v1 displays recs in the grammar only.
- **SGMA / energy-to-water reporting** (research lines 101, 148) → out (energy-to-water
  conversion not in scope; only plain CSV export is flagged as the residual gap, see G1).
- **Pump efficiency / kWh-per-gallon / $/acre-foot** (research lines 99, 146) → flag-only, no
  computed efficiency (FR-17, §5 line 560). Correct; drives the G3/G8/G9 sub-notes.
- **Eyes/Ears vision, ontology expansion to spray/labor, partner ecosystem, fleet telemetry,
  Orchard/Bonsai/Deere borrows** (research Part 3 Group B, lines 152–162) → all Tool 2 /
  Stage 3, out of a single-repo Tool-1 PRD (§5 line 565). Correct.

---

## SUMMARY OF VERDICTS

| # | Item | Verdict |
|---|------|---------|
| G1 | CSV / data export | **DROPPED — clearest in-scope gap** |
| G2 | KPI sparkline/delta on partial data | **UNDERSERVED — FR-7 may fail its own test on real-Batth** |
| G3 | Pre-modeled entity w/ efficiency | Covered; efficiency drop is intentional |
| G4 | Alert lifecycle object | Deferred correctly (survives as severity feed) |
| G5 | 10-second answerability metric | **UNDERSERVED — no comprehension/speed success metric** |
| G6 | Same-dataset multi-view flip | Mostly covered; unification not stated (low) |
| G7 | Per-metric YoY pairing | Covered via FR-7/FR-8 (= G2) |
| G8 | Map on/off + $/acre-foot | Right-sized; dropped fields are deliberate exclusions |
| G9 | Solar ROI dashboard | Narrowed deliberately; retrospective solar-value is a possible add |
| G10 | AG-C limiter / demand awareness | Covered as fixture fields + FR-15 |
| G11 | Wexus "40%" is unaudited | **UNDERSERVED — caveat not recorded in PRD body** |
| G12 | Concrete-ask / approval queue | Covered at v1 depth; queue rightly Stage 2 |

**Top material gaps (in-scope, fit the runway, would strengthen the PRD):**
1. **G1 — one-click CSV export** of the meter/cost table. A named Wexus page, a CLAUDE.md
   Table-view requirement, and the research's explicit CFO success benchmark; the PRD has no
   FR for it.
2. **G5 — a legibility/time-to-answer success metric** ("answer 'which pumps cost too much
   and why' in <10s"). The sharpest UX benchmark in the research; §8 has only conversion and
   correctness binaries.
3. **G2 — FR-7's mandatory sparkline + vs-period delta** is likely unsatisfiable on the
   single-account, partial-billing real-Batth conversion surface; needs the same graceful
   "no prior period" degradation FR-7 already grants the biggest-mover card.
4. **G11 — the incumbent's "~40%" savings is unaudited** (CEC/UC Davis not statistically
   significant); the PRD's own back-test standard (SM-4) is right but the competitor-claim
   caveat is not recorded, risking the pitch inheriting an unaudited figure.
5. **G9 — a retrospective solar-value view** (not a counterfactual) is within reach from the
   FR-3 NEM data and would deepen lever 4; reasonable to keep narrowed for runway, flagged as
   the strongest optional enhancement.
