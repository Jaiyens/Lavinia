---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
prdRequirementCount: 22
frCoveragePercent: 100
uxAlignmentIssues: 2
uxAlignmentIssuesResolved: 2
epicCount: 5
storyCount: 27
criticalViolations: 0
majorViolations: 0
minorConcerns: 3
overallReadiness: 'READY'
stepsCompletedFinal: true
documentsIncluded:
  prd: 'prds/prd-Terra-2026-06-07/prd.md'
  prdCompanions: ['addendum.md', '.decision-log.md', 'review-adversarial.md', 'review-rubric.md', 'reconcile-product-ux-research.md', 'reconcile-project-context.md', 'research-landscape.md']
  architecture: 'architecture.md'
  epics: 'epics.md'
  ux: ['ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md', 'ux-designs/ux-Terra-2026-06-08/DESIGN.md']
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-08
**Project:** Terra

## 1. Document Inventory

| Type | Form | Path | Size | Modified |
|------|------|------|------|----------|
| PRD | Whole | `prds/prd-Terra-2026-06-07/prd.md` | 48 KB | 2026-06-08 |
| PRD addendum | Companion | `prds/prd-Terra-2026-06-07/addendum.md` | 8 KB | 2026-06-07 |
| Architecture | Whole | `architecture.md` | 47 KB | 2026-06-08 |
| Epics & Stories | Whole | `epics.md` | 70 KB | 2026-06-08 |
| UX — Experience/IA | Whole | `ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md` | 15 KB | 2026-06-08 |
| UX — Design/Tokens | Whole | `ux-designs/ux-Terra-2026-06-08/DESIGN.md` | 10 KB | 2026-06-08 |

**Duplicates:** None. Every artifact exists in exactly one form (no whole-vs-sharded collision).

**Missing required documents:** None. PRD, Architecture, Epics, and UX are all present.

**Notes:**
- Stories are not sharded into individual files; they live inside `epics.md`. To be confirmed in Step 5 (Epics & Stories analysis).
- The PRD folder also contains review/reconcile/research companion docs (adversarial review, rubric, decision log, landscape). These are supporting evidence, not the spec of record.
- UX is split across two files by design: `EXPERIENCE.md` (IA/behavior/flows, governs the surface) and `DESIGN.md` (visual identity/tokens). Per project-context, the UX spec wins on conflict with PRD/CLAUDE.md.

## 2. PRD Analysis

The PRD is feature-clustered with stable global FR IDs (FR-1…FR-22) nested under five feature groups (A engine → B hero → C levers → D close-the-loop → E data-in). Requirements are well-formed: each carries a behavioral statement plus testable consequences. The companion `addendum.md` carries the real-data shape, resolved corrections, and bill mechanics.

### Functional Requirements (22 total)

**Cluster A — Data Foundation (the engine)**
- **FR-1: Inventory import.** Load the master spreadsheet into the farm ontology so every Meter is legible before any billing. (7 billing-name variants → 6 Entities; 183 Meters as Entity→Account→Ranch→Meter; rate schedule stored as read, never inferred; Array→Benefiting-Meter graph.)
- **FR-2: Scanned-bill extraction.** Vision/LLM extraction of image-only PG&E bill PDFs into structured JSON per Service Agreement, classifying page type first; captures every line item composing the SA's printed total; handles two- and three-tier TOU; one PDF fans out to many SAs.
- **FR-3: NEM reconciliation extraction.** Extract NEM monthly rows + annual True-up (including negative usage), linked to the generating Array via SA ID.
- **FR-4: Canonical billing model and SA-ID join.** Normalize all billing into one multi-period canonical shape attached to inventory via SA ID; identity-checked join (meter#/Pump ID must match, else "needs review"); future Bayou adapter targets same shape.
- **FR-5: Reconciliation guardrail.** A figure renders only if its line items reconcile to the printed total within one cent; otherwise withheld as "needs review." Proven on one account first.
- **FR-6: Partial-billing coverage.** Track Billing Coverage per Meter/Account; full 183-meter inventory renders day one regardless of billing; bulk across 57 accounts out of scope.

**Cluster B — Dashboard (the hero)**
- **FR-7: Home summary cards.** KPI cards led by total PG&E spend (covered period) + coverage indicator ("N of 183 meters loaded"); demand-charge exposure card; biggest-cost-mover card (only with ≥2 periods); sparkline+delta degrade gracefully with one period; tabular figures; money never the loudest/lone element; no overpayment/savings/projection card.
- **FR-8: Spend and TOU chart.** One chart: energy split by TOU (Peak/Part-Peak/Off-Peak) with YoY toggle; reads only canonical shape.
- **FR-9: Meter table (P0).** Dense, sortable, filterable table of every meter (name, ranch, entity, rate, legacy flag, this-cycle cost, demand charge $, status, coverage); traffic-light cells; no kW surface copy; mobile simplified list.
- **FR-10: Meter drawer.** Row/pin click opens side drawer with canonical billing detail + inventory + Array/NEM/True-up for solar + that meter's findings.
- **FR-11: Rollup and filter.** Filter by entity/ranch/rate recomputes cards + table; money rollups count only covered meters.
- **FR-12: Map view (co-equal home lens).** Read-only map of geotagged meters; pin color = status/cost; pin opens drawer; inventory-driven so it renders day one. (Promoted from P1 to co-equal lens per UX Reconciliation.)
- **FR-22: CSV export.** One-click export of current (filtered) meter view; exported figures match screen; "needs review" exports as "needs review."

**Cluster C — Recommendations and energy levers (secondary)**
- **FR-13: Recommendation feed.** Recommendations in the grammar `{situation + action + impactUsd?/impactNote? + severity + status + result?}`, secondary to dashboard, in a feed + the meter drawer, propose-then-approve; every finding traces to visible data.
- **FR-14: Rate optimization (lever 1, fully real).** Identify mis-rated/legacy meters and quantify $ of switching to cheapest eligible schedule, using a dated/versioned PG&E ag tariff fixture + the meter's own usage; back-test gate (recompute current charges, compare to billed) within a calibrated percentage band; savings shown as labeled estimate; fallback to qualitative finding on back-test fail; respects 35 kW threshold + once-per-12-months constraint. 27 legacy meters are the lead.
- **FR-15: Solar/NEM demand insight (lever 4).** For solar meters on a demand-carrying (AG-C-family) schedule only, surface that solar does not offset the demand charge (energy position vs demand still owed, tied to 5–8pm peak).
- **FR-16: Billing-cycle timing (lever 5).** Lightweight calendar of each meter's cycle-close, derived from serial code via the 2026 meter-read schedule fixture.
- **FR-17: Pump health flag (lever 3).** Flag BAD-status pumps from the master `Status` field in table + drawer; no efficiency/kWh-per-gallon number computed.
- **FR-18: Enrollment status (lever 2, info only).** Display DR/program enrollment from the bill as info; no DR recommendation or savings claim.

**Cluster D — Close-the-loop**
- **FR-19: Bill-accuracy verification (accuracy, not forecast).** Recompute a posted bill from tariff fixture + meter usage, show match via a verification badge; copy never claims prediction. This licenses FR-14's numbers.
- **FR-20: Recommendation result (the close-the-loop).** For an accepted rec, record predicted impact and populate `result` with realized number from the next posted bill; "pending" until then; shows diff, not variance.

**Cluster E — Data-in**
- **FR-21: Concierge/admin import.** Ingest inventory + billing via an admin/dev path; no grower-facing upload UI in v1; one account proven before bulk; Bayou flow kept dormant targeting the canonical shape.

### Non-Functional Requirements (§7 Cross-Cutting + feature NFRs)

- **NFR-Correctness:** No figure renders unless it reconciles to ground truth within tolerance (else "needs review"); pure energy math in tested `/lib/energy`; never hardcode a rate/$/kW; no fabricated/inferred numbers presented as measured.
- **NFR-Posture:** Planner not live meter; PG&E data lags ~1 day; no real-time/spike claims; demand analysis cycle-level.
- **NFR-Performance:** Sub-second navigation across cards/table/drawer/map.
- **NFR-Form-factor:** Desktop/tablet primary build target (both demos on a laptop); clean responsive phone view; mobile-first as discipline (dense table is a desktop progressive enhancement over a mobile core).
- **NFR-Comprehension:** Non-technical grower answers "which pump is costing me, and why" in under ~10 seconds from home.
- **NFR-Design/voice:** Editorial agrarian-luxury; warm paper bg, warm charcoal text, dominant green `#2fa84f` + one accent, traffic-light status; Inter across display/body/data; tabular figures; money never loudest/lone; 8px scale, hairline borders, soft shadows; one orchestrated motion moment, `cubic-bezier(0.16,1,0.3,1)`, 400–700ms, stagger 60–100ms, no bounce, honor reduced-motion; plain operator English (no kW/jargon, no em dashes, no exclamation marks); all copy in `/copy`.
- **NFR-Security/privacy:** Grower credentials never in repo/client/agent-readable; real financials never shown to investors; representative seed is the investor surface; real and demo farms are separate rows that never merge.
- **NFR-Architecture:** Clean logic/ingestion/DB-edge/UI/copy boundaries; canonical billing shape isolates the source; single Next.js repo structured so the monorepo move is mechanical.

### Additional Requirements / Constraints

- **Runway:** ~6-week build to ~July 20; two audiences (convert Batth on his real screen + investor proof on the badged seed).
- **Build priority / cut order (§6.3):** Protect the spine FR-1, FR-2, FR-4, FR-5, FR-7, FR-9, FR-14. Cut order if parser overruns: FR-12 → FR-8 YoY toggle → FR-20 → FR-3 NEM depth. Extraction proof milestone ~week 2 (fallback: hand-verified single-account extraction).
- **Open Questions (§9):** ranch count 36 vs 37; back-test tolerance band calibration (the one item with real build consequences); tariff fixture sourcing + refresh; Bayou account scope (parked); history depth; severity palette; working title; new runtime fixtures + Vercel `outputFileTracingIncludes` trap.
- **Assumptions (§10):** AG tariff sheets encodable as dated fixture; bill carries per-SA rate/TOU/demand/NBC; SA ID is a clean join key; 7 names → 6 entities; representative seed populatable; map pins only for lat/long meters; back-test reconciles for main schedules.

### PRD Completeness Assessment (initial)

Strong. The PRD is glossary-anchored, every FR carries testable consequences, scope boundaries and non-goals are explicit, and the UX reconciliation block resolves the surface conflicts up front. Numbering is contiguous (FR-1…FR-22, with FR-21/FR-22 intentionally clustered into E/B rather than placed last). NFRs are categorical rather than individually ID'd, which is acceptable but means epic traceability for NFRs will be assessed by category, not by ID. The two real risk items to watch downstream: (1) the rate back-test tolerance band (FR-14) is still uncalibrated, and (2) the whole product rides on a never-yet-demonstrated vision-extraction step (FR-2). Both are explicitly flagged in the PRD itself.

## 3. Epic Coverage Validation

The epics document carries its own **FR Coverage Map** (`epics.md` §"FR Coverage Map") asserting all 22 FRs map to exactly one owning epic, and additionally decomposes each into concrete stories with Given/When/Then acceptance criteria. I independently verified each FR resolves to at least one story (not just an epic).

### Coverage Matrix

| FR | Requirement | Owning Epic | Story(ies) | Status |
|----|-------------|-------------|-----------|--------|
| FR-1 | Inventory import | Epic 1 | 1.1 (schema), 1.2 (import) | ✓ Covered |
| FR-2 | Scanned-bill extraction | Epic 1 | 1.4 | ✓ Covered |
| FR-3 | NEM reconciliation extraction | Epic 1 | 1.5 | ✓ Covered |
| FR-4 | Canonical model + SA-ID join | Epic 1 | 1.3 (canonical/Zod), 1.6 (join, identity-checked) | ✓ Covered |
| FR-5 | Reconciliation guardrail | Epic 1 | 1.7 | ✓ Covered |
| FR-6 | Partial-billing coverage | Epic 1 | 1.7 (coverage state), 1.8 (e2e run) | ✓ Covered |
| FR-7 | Home summary cards (KPI strip) | Epic 2 | 2.3 | ✓ Covered |
| FR-8 | Spend and TOU chart | Epic 2 | 2.8 | ✓ Covered |
| FR-9 | Meter table (P0) | Epic 2 | 2.4 | ✓ Covered |
| FR-10 | Meter drawer | Epic 2 | 2.5 | ✓ Covered |
| FR-11 | Rollup and filter | Epic 2 | 2.6 | ✓ Covered |
| FR-12 | Map view (co-equal lens) | Epic 2 | 2.9 | ✓ Covered |
| FR-13 | Recommendation feed | Epic 3 | 3.1 | ✓ Covered |
| FR-14 | Rate optimization (back-test) | Epic 3 | 3.2 (tariff fixture + rate model), 3.3 (back-test gate) | ✓ Covered |
| FR-15 | Solar/NEM demand insight | Epic 3 | 3.4 | ✓ Covered |
| FR-16 | Billing-cycle Calendar lens | Epic 3 | 3.5 | ✓ Covered |
| FR-17 | Pump health flag | Epic 3 | 3.6 | ✓ Covered |
| FR-18 | Enrollment status (info) | Epic 3 | 3.7 | ✓ Covered |
| FR-19 | Bill-accuracy verification | Epic 4 | 4.1 | ✓ Covered |
| FR-20 | Recommendation result | Epic 4 | 4.2 | ✓ Covered |
| FR-21 | Concierge/admin import | Epic 5 | 5.2 (operator-operable connect; import action built in 1.8) | ✓ Covered |
| FR-22 | CSV export | Epic 2 | 2.7 | ✓ Covered |

### Missing Requirements

**None.** Every PRD FR (FR-1…FR-22) traces to an owning epic and at least one story with acceptance criteria. No orphan FRs appear in the epics that are absent from the PRD (the epics' FR list is identical to the PRD's).

### Coverage Observations (carried forward, not gaps)

- **Coverage is at story granularity, not merely epic-level** — stronger than the minimum bar. FR-1, FR-4, FR-6, and FR-14 each fan out across two stories, which is appropriate given their size.
- **FR-21 is split across epic boundaries by design:** the import *action* is built in Epic 1 (Story 1.8 `api/import`) and *wrapped* in operator-operable UI + auth in Epic 5 (Story 5.2). The Coverage Map flags this explicitly, so it is intentional, not a gap — but I will confirm in Step 5 that the dependency direction (Epic 5 depends on Epic 1) is honored in sequencing.
- **NFRs and ARs are mapped too:** the epics carry NFR-1…NFR-16, AR-1…AR-17, and UX-DR1…UX-DR24 onto owning epics/stories (e.g. design tokens → Story 2.1, auth tables → Story 5.1). NFR traceability will be assessed by category in later steps since the PRD does not individually ID its NFRs (the epics document added the NFR-N IDs).

### Coverage Statistics

- **Total PRD FRs:** 22
- **FRs covered in epics:** 22
- **Coverage percentage:** 100%
- **FRs covered at story level (with acceptance criteria):** 22 / 22

## 4. UX Alignment Assessment

### UX Document Status

**Found.** A binding, `status: final` UX spec exists as a deliberate two-file set:
- `EXPERIENCE.md` — IA, behavior, state patterns, interaction primitives, voice, four key flows. Governs the surface and "wins on conflict with any mock or upstream doc."
- `DESIGN.md` — full visual identity: color tokens, the named Inter type scale, spacing/shape/elevation tokens, component visual specs.

This is a genuinely strong UX artifact: every component named in the PRD has a behavioral spec and a visual spec, the four flows trace directly to the PRD's three user journeys, and the design tokens are concrete enough to implement from.

### UX ↔ PRD Alignment

**Strong, and explicitly reconciled.** The PRD's §1 "UX Reconciliation" block already defers to this spec and enumerates the five overrides (north star, hero-not-money, map promoted, OS shell + findings rail, value-honest onboarding). The UX spec is internally consistent with all five.

- UX flows ↔ PRD journeys: Flow 1 (returning morning) ↔ UJ-2 + the <10s comprehension bar; Flow 2 (operator on-site setup) ↔ UJ-1 + FR-21; Flow 3 (find the money) ↔ UJ-3; Flow 4 (connect PG&E later) ↔ the LOA-as-upgrade onboarding model.
- UX lenses ↔ FRs: Chart→FR-8, Table→FR-9, Map→FR-12, Calendar→FR-16; KPI strip→FR-7; drawer→FR-10; findings rail→FR-13; rollup/filter→FR-11; CSV→FR-22; connect-a-source + auth→FR-21. No UX surface lacks an FR, and no UI-implying FR lacks a UX surface.

**✅ Misalignment U1 (LOW) — "projected bill" KPI card — RESOLVED 2026-06-08.** `EXPERIENCE.md` (Component Patterns, KPI strip row) had listed the strip's example cards as "spend, demand exposure, biggest mover, **projected bill**," contradicting the PRD: FR-7 says "No card presents overpayment, savings, **or a projected bill**," and §6.2 lists "Forward bill projection / projected-month-end card" as out of scope (no projection model on this runway; planner-not-live-meter posture). After confirming with Jaiyen that no forecast card was actually wanted, this was **resolved by aligning EXPERIENCE.md to the PRD's deliberate deferral**: the KPI strip row now reads "3 compact cards (spend, demand exposure, biggest mover)… No projected/forecast bill card." All three docs (PRD, EXPERIENCE.md, epics Story 2.3) now agree. No scope change.

### UX ↔ Architecture Alignment

**Strong.** The architecture document was authored against both UX files (they are listed in its `inputDocuments`) and provides explicit substrate for every UX surface:
- Three-zone OS shell → Frontend Architecture (Server Components + client islands for lens/drawer/map/charts; mobile collapse to bottom-tabs + bottom-sheet).
- Lens toggle + Chart/Table/Map/Calendar → visx (charts), MapLibre GL 5.x (map), `lens-calendar` from the serial-code fixture, nuqs `lens` key.
- Shared meter drawer → single `meter-drawer` component + nuqs `meter` key surviving lens switches/refresh.
- Findings rail → `recommendations` + `finding-card`; severity colors fixed (act=clay, watch=type-only, info=muted).
- Onboarding + returning-user auth → Auth.js v5 + Prisma adapter + Google/magic-link; `(auth)` vs `(app)` route groups; connect-a-source routes.
- Map geometry from the bill (PLSS + Census) → `lib/geo/*`, no paid key, no Bayou for geo — matches EXPERIENCE.md's "no Bayou needed for geometry."
- Design tokens → one `globals.css` CSS-variable file; charts/map read tokens, never hex.
- Performance/motion/accessibility floors → RSC+nuqs sub-second nav, single `motion` reveal honoring reduced-motion, color-never-the-only-signal.
- The one real tension (operator-operable vs concierge-only, FR-21 vs EXPERIENCE.md) is explicitly raised and resolved in the architecture (AR-16): operator-operable connect, not grower-self-serve.

**✅ Misalignment U2 (LOW) — stale "Helvetica" in the architecture document — RESOLVED 2026-06-08.** `architecture.md` had said "**Helvetica** with tabular figures" (Project Context, Design & voice) and "tokens / **Helvetica** / tabular / motion" (Requirements Coverage Validation), the only place the old typeface survived. Both were **replaced with "Inter"**, matching the binding DESIGN.md, PRD §7, project-context.md, CLAUDE.md, the epics (NFR-10 / UX-DR2), and the app code (`layout.tsx` already loads Inter via `next/font`). Historical decision-logs and reconcile/review companion docs retain their Helvetica references by design (point-in-time audit trail of the Helvetica→Inter flip), and were intentionally left untouched.

### Warnings

- Neither U1 nor U2 blocks implementation: both are already resolved correctly in the epics (the spec the dev agent will actually execute), and the document precedence order is unambiguous. They are documentation-hygiene corrections, surfaced so the binding source docs do not mislead an implementer who reads them in isolation.
- No architectural gap was found for any UX requirement. Every component, lens, state, and flow has a named home in the architecture's directory tree and FR→structure map.

## 5. Epic Quality Review

Reviewed against create-epics-and-stories standards: user-value focus, epic independence, forward-dependency prohibition, story sizing, AC quality, and DB-creation timing. Scope: **5 epics, 27 stories.**

### A. User-Value Focus

| Epic | Title | Verdict |
|------|-------|---------|
| 1 | The Reconciled Data Engine | ⚠️ Minor — engine-framed title; value is real (UJ-1 day-one legibility + reconciled figures) but fully visible only once Epic 2's UI lands |
| 2 | The Legible Dashboard (the farm, known at a glance) | ✓ Strong user outcome |
| 3 | Find the Money (recommendations & levers) | ✓ Strong user outcome |
| 4 | Close the Loop (accuracy & realized results) | ✓ Strong user outcome |
| 5 | Get In (sign-in & connect a source) | ✓ User-facing (login + connect), not a bare "Auth System" technical epic |

No "Setup Database / API Development / Infrastructure" technical-milestone epics exist. Epic 1 is the only borderline case and is a **defensible, risk-carved foundation epic**: the epics doc justifies the boundary explicitly ("the trust spine and the product's riskiest surface… owns its own epic boundary"), Story 1.2 delivers the UJ-1 "see my whole operation day one" outcome, and the PRD's week-2 extraction-proof milestone depends on it being a standalone provable unit. Not a violation; see M1 below.

### B. Epic Independence — PASS

- **Epic 1** stands alone (loads + reconciles data; needs nothing downstream).
- **Epic 2** reads *only* the canonical shape from Epic 1 — stated explicitly. No reference to Epic 3/4/5 to function.
- **Epic 3** depends on Epic 1 (canonical) + Epic 2 (the dashboard findings trace to) — backward only.
- **Epic 4** depends on Epic 1 (reconcile) + Epic 3 (rec grammar) — backward only; additively enhances Epic 2/3 surfaces (badge on the existing drawer), which the epic flags as "enhancement, not file churn."
- **Epic 5** depends on Epic 1 (the importer it drives) + Epic 2 (lands in the dashboard) — backward only; correctly sequenced last because the demos run on the loaded dashboard without auth (AR-17).

No circular dependencies. No Epic-N-needs-Epic-N+1 violation. The **FR-21 cross-epic split** (import action in Epic 1, operator UI + auth in Epic 5) flagged in Step 3 is confirmed to honor dependency direction (Epic 5 after Epic 1) — resolved, not an issue.

### C. Forward-Dependency Scan — PASS (two benign incremental-wiring patterns)

Within-epic story chains are clean backward dependencies (1.1→1.8, 2.1→2.9, 3.1→3.7, 4.1→4.2, 5.1→5.3). Two annotations look like forward references but are correct incremental construction, not blocking dependencies:
- **Story 2.5 (drawer)** opens from a table row (built in 2.4) and is annotated to gain chart-bar / map-pin triggers "later" in 2.8 / 2.9. The drawer functions from the table alone; later lenses add entry points. Benign.
- **Story 2.5** also reserves a findings section "populated by Epic 3." The slot renders inventory + billing detail without Epic 3; findings are additive. Benign.

These rely on the reader honoring the "(later)/(Epic 3)" annotations — see M3.

### D. DB-Creation Timing — PASS (a genuine strength)

Textbook incremental table creation, not an upfront mega-migration:
- Inventory entities (Ranch / Array / Crop / evolved Entity & Meter) → **Story 1.1**.
- Billing tables (`BillingPeriod` / `BillingLineItem` / `coverageState`) → **Story 1.3**, when the canonical shape first needs them.
- Auth tables (User / Account / Session / VerificationToken) → **Story 5.1**, explicitly deferred out of 1.1 ("NOT created here").

### E. Acceptance-Criteria Quality — PASS

Every story uses Given/When/Then. ACs are specific, measurable, and testable (e.g. "sum to within $0.01 compared in integer cents," "7 billing-name variants dedupe to 6 Entities," "negative usage captured, not floored at zero"). Error/edge paths are covered well: Zod-failure → `needs_review` (1.4), identity mismatch → `needs_review` (1.6), back-test outside band → qualitative fallback (3.3), filter-to-zero → "No meters match" (2.6), unreadable bill → inline confirm (5.2), empty findings → "Nothing needs you right now" (3.1). No vague "user can log in"–class criteria found.

### Findings by Severity

**🔴 Critical Violations:** None.

**🟠 Major Issues:** None.

**🟡 Minor Concerns:**
- **M1 — Epic 1 title is engine-centric.** "The Reconciled Data Engine" reads technical; its user value (all 183 meters legible day one + every figure reconciled) is genuine but only surfaces through Epic 2's UI. *Defensible* as a risk-carved foundation epic. Optional remediation: reframe the title toward the outcome (e.g. "Every Meter, Loaded and Proven Correct"). Does not block.
- **M2 — A few stories bundle multiple concerns and run large.** Story 2.2 (shell + agent rail + lens toggle + responsive collapse + reveal motion + accessibility, 6 AC groups), Story 1.8 (pipeline orchestration + AI Gateway model config + cost-lever escalation + extraction fixture + logging), and Story 5.3 (tour-a-sample + demo separation + connection states) are each coherent single-outcome stories but sizeable. Optional remediation: consider splitting at sprint-planning (e.g. 2.2 → shell/rail, then lens-toggle, then responsive+motion) for smoother review. Does not block.
- **M3 — Incremental-wiring annotations must be honored as additive.** The drawer's later entry points (2.8/2.9) and its Epic-3 findings slot are correctly designed as additive, but a dev agent must read them as non-blocking enhancements, not as gates. Ensure story-context handoff preserves the "(later)/(Epic 3)" framing.

### Best-Practices Compliance Checklist

| Check | Epic 1 | Epic 2 | Epic 3 | Epic 4 | Epic 5 |
|-------|:---:|:---:|:---:|:---:|:---:|
| Delivers user value | ⚠️ (defensible) | ✓ | ✓ | ✓ | ✓ |
| Functions independently (backward deps only) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stories appropriately sized | ✓ (1.8 large) | ✓ (2.2 large) | ✓ | ✓ | ✓ (5.3 large) |
| No forward dependencies | ✓ | ✓ (benign wiring) | ✓ | ✓ | ✓ |
| DB tables created when needed | ✓ | n/a | n/a | n/a | ✓ |
| Clear, testable acceptance criteria | ✓ | ✓ | ✓ | ✓ | ✓ |
| Traceability to FRs maintained | ✓ | ✓ | ✓ | ✓ | ✓ |

**Verdict:** The epic/story set is high quality. No critical or major violations. Three minor, optional refinements (M1–M3), none of which block implementation.

## 6. Summary and Recommendations

### Overall Readiness Status

**READY** (with minor, optional refinements).

The four planning artifacts — PRD, UX (EXPERIENCE.md + DESIGN.md), Architecture, and Epics/Stories — are complete, mutually consistent, and traceable end to end. All 22 functional requirements trace to an owning epic and at least one story with testable Given/When/Then acceptance criteria (100% coverage). The architecture supports every UX surface and every FR cluster, with a verified, locked, brownfield-faithful stack. The epic decomposition has no critical or major structural violations: epics are user-valued (one defensible engine-framed foundation epic), independence holds with backward-only dependencies, DB tables are created incrementally when needed, and acceptance criteria are specific and error-aware.

This plan is fit to start implementation. The implementation sequence is already defined and protects the PRD spine (FR-1, 2, 4, 5, 7, 9, 14), beginning with the Prisma migration and proving cent-exact extraction on the real demo account by ~week 2.

### Critical Issues Requiring Immediate Action

**None.** No issue blocks the start of implementation.

### Issues Found (all minor / non-blocking)

Documentation hygiene — **both RESOLVED 2026-06-08:**
- **U1 (LOW) ✅ FIXED:** `EXPERIENCE.md` KPI-strip example listed a "projected bill" card that the PRD (FR-7, §6.2) puts out of scope. Confirmed with Jaiyen that no forecast card was wanted; resolved by dropping "projected bill" from EXPERIENCE.md so it matches the PRD's deferral. PRD / EXPERIENCE.md / epics now agree; no scope change.
- **U2 (LOW) ✅ FIXED:** `architecture.md` named "Helvetica" twice; both replaced with "Inter," matching every other binding doc and the app code (which already loads Inter). Historical decision-logs left intact as audit trail.

Epic refinements (optional, take or leave at sprint-planning):
- **M1 (LOW):** Epic 1's engine-framed title; consider an outcome-framed title.
- **M2 (LOW):** Stories 2.2, 1.8, 5.3 run large; consider splitting at sprint-planning.
- **M3 (LOW):** Honor the drawer's "(later)/(Epic 3)" wiring annotations as additive, not blocking, in story-context handoff.

### Pre-Existing Build-Time Risks (already tracked in the PRD/Architecture — not planning gaps)

These are surfaced by the planning docs themselves and are watch-items during the build, not defects in the plan:
1. **Extraction accuracy is unproven** — the whole trust spine rides on a never-yet-demonstrated cent-exact vision step (FR-2). Mitigated by the reconciliation gate (wrong numbers are withheld) and the week-2 hand-verified fallback. *Prove early.*
2. **Rate back-test tolerance band (FR-14, Open Q2)** — the one open item with real build consequences; must be calibrated against real Batth bills during build.
3. **Fixture values must be sourced and dated** — `pge-ag-rate-card.json` (tariff values + effective dates, Open Q3) and `pge-meter-read-schedule.json` (the real 2026 serial→close table). Loaders exist; values need populating.
4. **PLSS centroid source** — confirm a committable BLM PLSS section-centroid table (vs. an API) for `geo/centroid.ts`.

### Recommended Next Steps

1. **Proceed to implementation** with Epic 1, Story 1.1 (the Prisma migration), per the architecture's first-priority sequence.
2. ~~Apply the two one-line documentation fixes (U1, U2)~~ — **DONE 2026-06-08.** EXPERIENCE.md projected-bill card dropped; architecture.md Helvetica→Inter. The binding docs are now internally clean.
3. **Front-load the extraction-accuracy proof** (risk #1) on the real demo account toward the week-2 milestone, with the hand-verified fallback staged.
4. **Schedule the two data-sourcing tasks** (risk #2 back-test band calibration, risk #3 tariff + meter-read fixture values) as explicit build tasks before Epic 3's rate lever (Stories 3.2–3.3) and Epic 4 (verification) depend on them.
5. **Optionally split the three large stories** (M2) during sprint planning if smoother review cadence is wanted.

### Final Note

This assessment reviewed 6 planning artifacts across 5 validation dimensions and identified **5 minor issues** (2 documentation-hygiene, 3 optional epic refinements) and **4 pre-existing build-time risks already tracked by the planning docs**. **Zero critical and zero major issues** were found, and FR coverage is **100% (22/22)** at story granularity. The artifacts are ready for implementation; the minor items can be fixed in passing or proceeded past as-is.

---

**Assessment date:** 2026-06-08
**Assessor:** Implementation Readiness review (Product Manager role)
**Artifacts reviewed:** PRD (`prd.md` + `addendum.md`), Architecture (`architecture.md`), Epics/Stories (`epics.md`), UX (`EXPERIENCE.md` + `DESIGN.md`)
