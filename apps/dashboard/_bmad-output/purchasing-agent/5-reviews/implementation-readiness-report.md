---
title: Terra Purchasing Agent - Implementation Readiness Report
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-14
**Project:** Terra Purchasing Agent (Tool 2)
**Assessor:** BMAD implementation-readiness check

This report assesses whether the Terra Purchasing Agent planning package is ready for development. It checks four things: that every functional requirement traces to an epic and a story, that the UX spec aligns with the PRD and architecture, that the epics meet the quality bar (user value, independence, no forward dependencies), and that the architecture is complete enough to build against. The gate at the end is honest about the two items that hold full readiness back: the Crop Plan model that does not exist yet, and the unsolved Savings Attribution method.

---

## Document Inventory

All four required documents are present, single-version (no whole-plus-sharded duplicates), and current as of 2026-06-14.

| Document | Path | Size | Status |
|---|---|---|---|
| PRD | `2-planning/prd.md` | 65 KB | Found, read in full |
| Epics and stories | `2-planning/epics.md` | 47 KB | Found, read in full |
| UX spec | `2-planning/ux-spec.md` | 45 KB | Found, read in full |
| Architecture | `3-solutioning/architecture.md` | 74 KB | Found, read in full |

Supporting documents also present and cross-referenced (not part of the gate): `2-planning/design.md` (the visual design system the UX spec composes from), `3-solutioning/architecture-decisions.md`, and the upstream research and analysis set (`0-research/`, `1-analysis/`). No duplicates to resolve. No missing required documents.

---

## PRD Analysis

### Functional Requirements (17 total)

Every FR is numbered, scoped to one feature, carries testable consequences, and references the user journeys it realizes. Extracted from PRD section 4.

- FR-1: Ingest Invoices by photo, PDF, or email forward; extract structured lines; never require or store a Dealer credential; flag unreadable lines "needs review"; zero external calls against fixtures.
- FR-2: Attribute each Invoice line to exactly one Ranch, Entity, and Account; reuse Tool 1 records; grower-correctable; no silent drops.
- FR-3: Forecast a per-product Bill of Materials from the Crop Plan; no fabricated lines for Blocks with no Crop Plan data; recomputed on change.
- FR-4: Present each forecast Input's buying window and Prepay close on the Buy Window Calendar; color-coded month grid; one action line each; phone-graspable for a single Entity.
- FR-5: Normalize every line to a per-unit price for its Active Ingredient; apply unit conversions; exclude and flag unresolved ingredients rather than force-match.
- FR-6: Compute and display a single-grower Market Band per Active Ingredient from this grower's own Invoices only; label thin data "no reliable band yet"; disclose the single-grower basis; openable math and CSV export.
- FR-7: Surface the Generic Equivalent for a branded line with the per-unit difference; do not quote, source, or order it.
- FR-8: Flag any line priced above the Market Band as an Overpayment with the dollar gap; never flag on a "no reliable band yet" ingredient; always a Recommendation with a dollar figure.
- FR-9: Audit Invoices against Rebate tiers, thresholds, and early-fill milestones; flag under-credited Rebates with threshold math; route ambiguous terms to the Review queue as lower-confidence.
- FR-10: Model Prepay timing against the working-capital window; present discount, close date, and a plain-language trade-off; never instruct a purchase autonomously.
- FR-11: Surface every finding as a display-only Recommendation in Terra's grammar; appear in the Findings rail; action field shaped for future execution but no v1 execution path.
- FR-12: Close the loop with predicted versus actual once the relevant Invoice posts; fill the Recommendation result; produce line-level traceability.
- FR-13: Show all Input spend in the Spend Table, filterable by Entity, Ranch, Dealer, Active Ingredient; usable at 180-plus lines; every cell traceable; one-click CSV export.
- FR-14: Set or review a Spend Budget per Entity; track Forecast spend plus Committed spend; mark budgets "not set" rather than fabricate; count Committed spend only at the obligating event; attribute overage to driving Ranches and Dealers.
- FR-15: Grant a PCA read-only, Entity-scoped advisor visibility; no edit, budget, or act; revocable immediately with no retained copy.
- FR-16: Let a PCA mark a flagged line confirmed-true or disputed; recorded against the finding; visible to the grower; feeds the retrospective accuracy metric.
- FR-17: Route low-confidence lines, un-normalizable units, and ambiguous Rebate terms to the internal-ops-only Review queue; hold out of any asserted dollar; write resolved values back; no grower-facing queue or SLA.

**Total FRs: 17.**

### Non-Functional Requirements (9 total)

Derived in the epics from the PRD Constraints, Data Governance, Platform, and Information Architecture clusters.

- NFR-1: Credential discipline. No Dealer, financial, or utility credential stored anywhere readable. No Dealer login.
- NFR-2: Zero external calls in dev and test, against committed fixtures and a Batth-shaped seed.
- NFR-3: Human-in-the-loop by default. No autonomous action, purchase, or payment from any tap.
- NFR-4: Honest-number discipline. Never claim a savings number that cannot trace line by line; "verified" reserved for the loop-closed attributable subset; low-confidence findings labeled, not asserted.
- NFR-5: Mobile-first, plain operator English. No surface jargon, no exclamation marks, no em dashes; copy in /copy.
- NFR-6: Shared data model and clean boundaries. Inside the existing Terra app; pure logic in /lib, data model, UI layer; reuse the Tool 1 OS shell and grammar.
- NFR-7: Data portability and governance. Exportable, no lock-in; no cross-grower pooling in v1; deletion on request.
- NFR-8: Data hero leads. Money is the story but never the lone screaming number; tabular figures.
- NFR-9: Confidence-carrying findings. Thin bands and ambiguous terms labeled, not asserted.

**Total NFRs: 9.**

### Additional Requirements and Constraints

- Six success metrics (SM-1 identified savings, SM-1b attributed realized savings, SM-2 retrospective accuracy, SM-3 activation, SM-4 loop closure, SM-5 coverage, SM-6 advisor engagement) plus three counter-metrics (SM-C1 do not game the band, SM-C2 do not chase activation over accuracy, SM-C3 do not let Recommendation volume become the goal). Each SM cross-references the FRs it validates.
- Seven Open Questions (PRD section 8), led by the Savings Attribution method, which gates the entire gain-share monetization model.
- An Assumptions Index (PRD section 9) that surfaces the load-bearing assumption later proven false by the architecture: that the Crop Plan is "reused from Tool 1." See the Architecture and gate sections below.

### PRD Completeness Assessment

The PRD is unusually disciplined. Glossary terms are used verbatim downstream, every FR carries testable consequences, POST-MVP scope is fenced off in section 4.10 and section 6.2 and never described as shipping, and the honesty posture (identified vs verified savings, single-grower band, no autonomous action) is consistent throughout. The two real gaps are not omissions in the PRD's reasoning but unknowns the PRD itself names: Savings Attribution (section 8, #1) and Crop Plan completeness (section 8, #7). The architecture later upgrades the second from a completeness question to a hard blocker. The PRD is complete and clear; it is not the bottleneck.

---

## Epic Coverage Validation

### Coverage Matrix

The epics document carries an explicit FR Coverage Map (epics.md, "FR Coverage Map"). Every FR maps to exactly one epic, and every epic that owns an FR contains a story whose acceptance criteria cite that FR. Verified by reading each story's ACs against the FR text.

| FR | Epic | Story | Status |
|---|---|---|---|
| FR-1 | Epic 1 | Story 1.2 | Covered |
| FR-2 | Epic 1 | Story 1.3 | Covered |
| FR-3 | Epic 3 | Story 3.1 | Covered (blocked, see gate) |
| FR-4 | Epic 3 | Story 3.2 | Covered (blocked, see gate) |
| FR-5 | Epic 4 | Story 4.1 | Covered |
| FR-6 | Epic 4 | Stories 4.2, 4.4 | Covered |
| FR-7 | Epic 4 | Story 4.3 | Covered |
| FR-8 | Epic 5 | Story 5.1 | Covered |
| FR-9 | Epic 5 | Story 5.2 | Covered |
| FR-10 | Epic 5 | Story 5.3 | Covered |
| FR-11 | Epic 5 | Story 5.4 | Covered |
| FR-12 | Epic 5 | Story 5.5 | Covered |
| FR-13 | Epic 6 | Story 6.1 | Covered |
| FR-14 | Epic 6 | Story 6.2 | Covered |
| FR-15 | Epic 7 | Story 7.1 | Covered |
| FR-16 | Epic 7 | Story 7.2 | Covered |
| FR-17 | Epic 2 | Stories 2.1, 2.2 | Covered |

No FR in the PRD is absent from the epics. No epic claims an FR that the PRD does not define. Epic 8 is correctly marked POST-MVP and carries zero v1 FRs, so it does not dilute v1 scope.

### Missing Requirements

None. All 17 FRs are covered.

### Coverage Statistics

- Total PRD FRs: 17
- FRs covered in epics: 17
- Coverage percentage: 100 percent

NFR coverage is also threaded: each story's acceptance criteria name the NFRs that apply (for example NFR-1 and NFR-2 in Story 1.2, NFR-4 and NFR-9 across the band and audit stories), and the architecture (section 12) maps every NFR to a mechanism. Coverage is complete on both FRs and NFRs.

---

## UX Alignment Assessment

### UX Document Status

Found. `2-planning/ux-spec.md`, a full screen-by-screen specification.

### UX-to-PRD Alignment

Strong. Every screen in the UX spec names the FR-N and UJ-N it realizes, verbatim from the PRD, and all five user journeys (UJ-1 through UJ-5) have a concrete screen-by-screen flow in section 3 of the UX spec, including their edge cases (blurry photo, ambiguous program, no clean band, revoke, no budget set). The three-views discipline (Buy Window Calendar, Spend Table, Price Band Chart) plus the persistent Findings rail matches the PRD Information Architecture cluster exactly. The honesty states (needs review, possible-needs-confirmation, no reliable band yet, not-set budget) are first-class UX states, which directly serves NFR-4 and NFR-9.

One alignment strength worth calling out: the UX spec resolves a real double-counting risk by naming the KPI strip the single canonical home of the SM-1 identified-savings total and making the Findings rail echo it rather than compute its own. That is the kind of detail that prevents two numbers disagreeing on screen.

### UX-to-Architecture Alignment

Consistent. The UX surfaces map cleanly to the architecture routes (section 9.2): onboarding to `purchasing/onboarding`, Spend Table to `purchasing/spend`, Price Band Chart to `purchasing/band/[activeIngredientId]`, budget to `purchasing/budget`, advisor to `purchasing/advisor`, and the internal Review queue to an admin route outside the grower app. The UX "never render a store, a buy button, or a verified label on an unclosed number" rule is the same display-never-execute law the architecture enforces by keeping `action.execute` null with no external write surface.

### Alignment Issues

- The UX spec inherits the same Crop Plan assumption the PRD makes. Screen 2.3 (Buy Window Calendar) describes forecast lines "from the Bill of Materials (FR-3, FR-4)" and its empty state assumes "Crop Plan data" exists per Block. Under architecture path (b) (repeat-buy projection from prior Invoices), the calendar still works, but the honest label changes from "your crop plan forecast" to "projected from what you bought last season." The UX copy for screen 2.3 will need a small adjustment once the section 4.6 path is chosen. This is a copy and labeling follow-on of the Crop Plan blocker, not an independent UX defect.

### Warnings

None beyond the Crop Plan labeling note above. The UX spec carries its own accessibility floor (WCAG AA, reduced-motion fallbacks for every Magic UI component, tabular figures, 44px tap targets), which is more than most readiness packages include.

---

## Epic Quality Review

The epics were validated against the create-epics-and-stories standards: user value, epic independence, no forward dependencies, story sizing, acceptance-criteria quality, and database-when-needed.

### User Value Focus

Every epic title and goal is user-centric, with one deliberate and defensible exception.

- Epic 1 "Connect a source and see legible, attributed Input spend": user value, day one.
- Epic 3 "Forecast the season from the Crop Plan": user value (planning win).
- Epic 4 "Normalize every line and show it against the Market Band": user value (the legibility insight).
- Epic 5 "Turn findings into display-only Recommendations and close the loop": user value (the headline savings number).
- Epic 6 "Cross-entity spend control": user value.
- Epic 7 "Arm the advisor": user value.
- Epic 2 "Hold low-confidence work out of the numbers (internal Review queue)": this is the one epic whose primary actor is a Terra ops reviewer, not the grower. Under a strict reading it looks like an infrastructure epic. It is justified: it is the honesty backbone every downstream dollar depends on, it has a real human user (the ops reviewer) and a real grower-facing effect (the "needs review" state), and it ships a vertical slice (route a line, hold it out of the numbers, resolve it, feed it back). It is correctly sequenced before the band and the audit that must respect it. Accept as-is. Note (minor) that its grower value is indirect; the story framing leans on the ops persona, which is appropriate here but is the closest the package comes to a technical epic.

### Epic Independence

No epic requires a later epic to function. The dependency direction is strictly backward:

- Epic 1 stands alone (the data foundation).
- Epic 2 builds the queue mechanism and wires in the Epic 1 blurry-line producer; it explicitly accepts the un-normalizable-unit and ambiguous-Rebate-term item types so Epics 4 and 5 can enqueue to it later without rework. That is forward-compatible design, not a forward dependency: Epic 2 is complete and testable on its own with only the Epic 1 producer.
- Epic 3 depends only on the Crop Plan source (subject to the section 4.6 decision), not on later epics.
- Epic 4 depends on Epic 1 (attributed lines) and enqueues to Epic 2. Backward only.
- Epic 5 depends on Epics 1, 2, and 4. Backward only.
- Epic 6 depends on Epics 1 and 3. Backward only.
- Epic 7 depends on the views and findings from earlier epics. Backward only.

The Epic 2 cross-references to Epics 4 and 5 are the one thing that could be misread as a forward dependency. They are not: Epic 2 ships a working queue that accepts those item types; Epics 4 and 5 produce them later. This is clean.

### Story Sizing and Acceptance Criteria

- Stories are vertically sliced and appropriately sized (one ingestion path, one normalization function, one calendar view, and so on). No "set up all the models" mega-story; the schema is stood up in Story 1.1 only for the entities ingestion and attribution need, consistent with the database-when-needed rule and the architecture's "add a table when the first story needs it."
- Acceptance criteria are in Given/When/Then form, testable, and trace to FRs and NFRs by ID. Error and honesty paths are covered (needs-review states, no-reliable-band-yet, not-set budgets, revoke-immediately), not just happy paths.
- The greenfield-vs-brownfield posture is correct: this is brownfield (Tool 2 on an existing app), and Story 1.1 is the integration story (extend the shared schema, add the tool entry to the existing OS shell) rather than a from-scratch project setup. The architecture confirms there is no starter-template decision to make.

### Quality Findings by Severity

**Critical violations:** none.

**Major issues:** none.

**Minor concerns:**

- Epic 2 is ops-actor-led rather than grower-led. Justified and correctly sequenced, but it is the one epic whose user value is indirect. No change required; noted for transparency.
- Epic 3's stories (3.1, 3.2) are written against a Crop Plan that does not yet exist in the schema. The stories are well-formed, but they cannot be implemented as written until the section 4.6 path is chosen. This is the Crop Plan blocker surfacing in the epic layer; it is a sequencing gate, not a story-quality defect. Story 3.1's source ("a Crop Plan with acres, crop, program, and growth stage, reused from Tool 1") will need to be corrected to match whichever path is chosen (a net-new CropProgram, or a repeat-buy projection from prior Invoices).

Epic quality is high. The one thing standing between Epic 3's stories and implementation is the Crop Plan model decision, covered in the gate.

---

## The Two Gating Items (called out honestly)

These are the items that hold the package back from a clean "go." Both are already named in the architecture; this report does not discover them, it confirms them and grades their weight.

### Blocker 1: The Crop Plan model does not exist (architecture section 4.6)

The PRD and the epics both assume the Crop Plan is "already modeled by Terra for energy in Tool 1" and is to be consumed, not built. The architecture (section 4.6 and open question 14.5 #7) establishes that this is false against the real schema, and this report verified it directly:

- The real `Crop` model is exactly `{ id, name, cropCoefficient, blocks, ranches, pumps }`. There is no program and no growth-stage schedule.
- `Ranch` and `Block` carry `acreage` plus a nullable `cropId`, nothing more.

The PRD and epic forecast formula (acres times crop times program times growth stage) has no `program` and no `growth stage` to read. So `forecast-bom.ts` has nothing real to consume, and Epic 3 (FR-3, FR-4) cannot be built as specified. This is a hard Epic-3 blocker, not a calibration question.

The architecture provides two scoped resolutions, either of which unblocks the work:

- Path (a): model a net-new `CropProgram` with ordered growth-stage and per-acre application children, plus a grower-supplied ingestion path (Dealer order sheet, grower-entered program, or a vision read of a written spray and fertility plan). This is the full agronomic forecast the PRD describes. It is real new modeling and a real new onboarding step.
- Path (b): scope FR-3 and FR-4 down to a repeat-buy projection from prior-season Invoices (project next season from what the grower actually bought last season). No new program schema; reuses `InvoiceLine`; honestly labeled as a repeat-buy projection, not an agronomic plan. The architecture recommends shipping (b) first to unblock the calendar on real data, then building (a) for the full forecast.

What this gate requires before Epic 3 starts: a recorded decision (a or b), and the matching corrections to PRD section 8 #7 (reframe from "how complete must the Crop Plan be" to "the Crop Plan does not exist yet and must be modeled or scoped to repeat-buy"), to the PRD Assumptions Index entry that calls the Crop Plan reused, to Epic 3's story sources, and to the UX 2.3 calendar copy. Epics 1, 2, 4, 5, 6, and 7 are not blocked by this and can proceed.

### Blocker 2: Savings Attribution is unsolved (PRD section 8 #1, architecture section 8.5)

The Savings Attribution method (proving, cleanly and auditably, that a saved dollar is the agent's doing and not the grower's own Dealer haggling) is unsolved. It gates the entire gain-share monetization model. The PRD is honest that v1 is therefore free and exists in part to build the track record that makes attribution possible. The architecture (section 8.5) does the right thing: it captures an immutable, append-only `lineageJson` on every Finding (source Invoice line ids, the band inputs and sample count, the Rebate program and tier and threshold-crossing lines, confidence, and the asOf), and at loop closure appends the crediting-Invoice line ids. That is the invoice-level evidence SM-1b is built from.

Why this is a gating item but not a build blocker: v1 ships without it, by design, because v1 does not bill. The architecture builds the evidence track record; it explicitly does not decide the attribution method (section 14.5 #4). So this does not block Epics 1 through 7 from being implemented. It is a gate on monetization, not on v1 code. The honest position is: v1 is buildable and should clearly never display an attributed or "verified" savings figure for the Overpayment-vs-band case until attribution is solved (SM-1b counts only the cleanly attributable under-credited Rebate recovery in the meantime). The architecture and UX both already enforce this, so the risk is contained to the business model, not the codebase.

One implementation guard the architecture correctly resolves under this heading: the re-run idempotency tension. The established `run-rate-lever.ts` pattern is delete-pending-and-recreate, which would destroy the very `lineageJson` attribution depends on. Section 8.5 fixes this by making Findings immutable-on-create, upserted by a lineage natural key and never deleted on re-run, with only the pending Recommendation surface delete-recreated. This report verified that `run-rate-lever.ts` does call `prisma.recommendation.deleteMany`, so the tension is real and the resolution is necessary. There is a DB integration test specified to assert lineage survives a recompute byte-for-byte. This is handled correctly.

---

## Architecture Completeness

The architecture is the strongest document in the package. It covers all 17 FRs and 9 NFRs (section 14.1 requirements-coverage table and section 12 NFR table), specifies the full Prisma model extension, the pure `src/lib/procurement` calculation layer with module contracts, the ingestion pipeline mirrored on the Tool 1 bill pipeline, the Recommendation and loop-closure layer, six cross-cutting decisions (extraction confidence, idempotent re-ingest, dealer-account identity join, multi-entity and advisor scoping, savings-attribution lineage, honesty-as-a-type), the route design, the project structure, and a testing strategy that mirrors the existing harness.

This report spot-checked the architecture's load-bearing claims against the real repo and all held:

- The Crop model is exactly as described (the blocker is real).
- `Ranch` has no `entityId` and the schema comment confirms a ranch can hold meters from more than one account, validating the Account-routed Entity attribution and the orthogonal Ranch dimension (section 4.5).
- `Account.entityId` is nullable-until-reconciled, the precedent the architecture cites for `DealerAccount.entityId`.
- `run-rate-lever.ts` uses `deleteMany`, confirming the lineage-preservation tension and its resolution (section 8.5).
- `result.ts` carries `firstPostedBillAfter` and `acceptanceResult`, the PG&E-specialized closure the architecture says it follows-but-does-not-reuse, replacing it with a new `firstCreditingInvoiceLineAfter`.

The architecture's self-assessment (section 14.4) is candid: "READY EXCEPT FOR ONE HARD BLOCKER (the Crop Plan model)." That matches this report's finding. The remaining open technical questions (extraction confidence threshold, band minimum-point count, catalog bootstrap, DealerAccount-vs-Account) are genuine calibration and policy questions, not gaps, and each has a named home.

One open data question worth flagging for planning: the shared `ActiveIngredient` and `Product` catalog needs an initial seed of common almond and tree-nut chemistries and their generic equivalents (architecture 14.5 #6). Without it, FR-5 normalization and FR-7 generic-equivalent surfacing have nothing to resolve against on day one. Sourcing it without a paid third-party dataset (to respect the single-grower-band discipline) is unresolved. This does not block Epic 1, but it gates the usefulness of Epics 4 and 5 and should be scoped alongside them.

---

## Summary and Recommendations

### Overall Readiness Status

GO WITH CONDITIONS.

The package is coherent, traceable, and honest. FR coverage is 100 percent. UX aligns with both the PRD and the architecture. Epic quality is high with no critical or major violations. The architecture is rigorous and verified against the real codebase. What holds this back from an unconditional go is one hard blocker (the Crop Plan model) that gates one epic, and one strategic blocker (Savings Attribution) that gates monetization but not v1 code. Both are already named honestly in the architecture, which is the right posture.

Most of the build (Epics 1, 2, 4, 5, 6, 7, covering 15 of 17 FRs) can start now. Epic 3 (FR-3, FR-4) needs the Crop Plan decision first. Gain-share billing needs the attribution method, which v1 deliberately defers.

### Critical Issues Requiring Action Before or During Implementation

1. Settle the Crop Plan model decision (architecture section 4.6: path (a) net-new `CropProgram` plus grower-supplied ingestion, or path (b) repeat-buy projection from prior Invoices) before Epic 3 starts. This is a hard blocker for Epic 3 only.
2. Correct the documents that assert the Crop Plan is reused from Tool 1: PRD section 8 #7, the PRD Assumptions Index entry, Epic 3 Story 3.1's source line, and the UX 2.3 calendar copy. They all carry a claim the schema does not support.
3. Hold the line on Savings Attribution: v1 ships free, builds the lineage track record, and never labels an Overpayment-vs-band figure "verified" or attributed until the method is solved. The architecture and UX already enforce this; keep it enforced.

### Recommended Next Steps

1. Make the section 4.6 Crop Plan call now (the architecture recommends shipping path (b) first, then path (a)), and patch the four documents in item 2 above so no downstream agent builds against the false "reused Crop Plan" assumption.
2. Begin Epic 1 (schema plus ingestion pipeline plus Batth-shaped seed) and Epic 2 (Review queue) immediately; they are unblocked and are the foundation everything else sits on.
3. Scope the `ActiveIngredient` and `Product` catalog seed alongside Epic 4, since normalization and generic-equivalent surfacing depend on it.
4. Keep the Savings Attribution method and the Review-queue cost-to-serve as tracked open questions with owners; neither blocks v1 code, but both gate the business model and operational scaling.

### Final Note

This assessment reviewed four documents across four categories (FR-to-epic-to-story coverage, UX alignment, epic quality, architecture completeness) and found a package that is ready to build on its critical path, with two honestly named gating items: the Crop Plan model (a hard blocker for one epic, with two scoped resolutions already specified) and Savings Attribution (a monetization gate the architecture handles by capturing immutable lineage rather than pretending to solve). Address the Crop Plan decision and the four document corrections, start Epics 1 and 2, and the rest follows. The planning work here is above the usual bar; the gaps that remain are the ones the team already saw coming.
