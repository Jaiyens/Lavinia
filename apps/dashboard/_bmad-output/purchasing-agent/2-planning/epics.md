---
title: Terra Purchasing Agent
status: draft
created: 2026-06-14
updated: 2026-06-14
inputDocuments:
  - ../2-planning/prd.md
  - ../1-analysis/product-brief.md
  - ../1-analysis/prfaq.md
  - ../0-research/clone-target-and-ai-thesis.md
  - ../1-analysis/market-research.md
---

# Terra Purchasing Agent - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Terra Purchasing Agent (Terra Tool 2), decomposing the requirements from the [PRD](./prd.md) into implementable, vertically-sliced stories. It builds on the [product brief](../1-analysis/product-brief.md), the [PRFAQ](../1-analysis/prfaq.md), the [clone target and AI thesis](../0-research/clone-target-and-ai-thesis.md), and the [market research](../1-analysis/market-research.md).

Scope discipline carried straight from the PRD: v1 is legibility plus the grower-side rebate and prepay audit. It ingests Invoices and the Crop Plan, normalizes every line to a per-unit, same-Active-Ingredient Market Band, shows Overpayment and owed Rebates, forecasts the buy, surfaces display-only Recommendations, tracks spend versus budget across Entities, and closes the loop after Invoices post. Every Recommendation is human-in-the-loop: the agent surfaces and recommends, the human decides. Live cross-supplier scouting, agentic negotiation, and auto-PO with delivery are explicitly POST-MVP and are listed in the final epic, marked as later, never described as shipping in v1.

Glossary terms from [PRD §3](./prd.md) are used verbatim throughout (Input, Active Ingredient, SKU, Generic Equivalent, Dealer, Co-op, PCA, Rebate, Prepay, Dealer order sheet, Invoice, Bill of Materials, Crop Plan, Market Band, Overpayment, Recommendation, Entity, Ranch/Block, Account, Spend Budget, Forecast spend, Committed spend, Spend Table, Buy Window Calendar, Price Band Chart, Findings rail, Review queue). No surface jargon, plain operator English (blocks, sets, acres, dealers, ranches, pumps), no exclamation marks, no em dashes in user-facing copy.

## Requirements Inventory

### Functional Requirements

All seventeen FRs are quoted from [PRD §4](./prd.md).

FR-1: Ingest Invoices by photo, PDF, or email forward, and extract structured lines (SKU, quantity, unit, unit price, total, and any Rebate or Prepay lines), never requiring or storing a Dealer or financial credential, flagging unreadable lines "needs review," running with zero external calls against fixtures. ([PRD FR-1](./prd.md))
FR-2: Attribute each Invoice line to exactly one Ranch, Entity, and Account on the shared data model, reusing Tool 1 records, with grower-correctable, persisting attribution and no silent drops. ([PRD FR-2](./prd.md))
FR-3: Forecast a per-product Bill of Materials from the Crop Plan (acres times crop times program times growth stage), producing no fabricated lines for Blocks with no Crop Plan data, recomputed when the Crop Plan changes. ([PRD FR-3](./prd.md))
FR-4: Present each forecast Input's buying window and Prepay close on the Buy Window Calendar, color-coded on a month grid, one plain-language action line each, graspable on a phone for a single Entity without horizontal scrolling. ([PRD FR-4](./prd.md))
FR-5: Normalize every Invoice and forecast line to a per-unit price for its Active Ingredient, applying unit conversions, excluding and flagging lines whose Active Ingredient cannot be resolved rather than force-matching. ([PRD FR-5](./prd.md))
FR-6: Compute and display a single-grower Market Band (low, median, high) per Active Ingredient from this grower's own normalized Invoices only, label thin-data Ingredients "no reliable band yet," disclose the single-grower basis, and let the grower open the math and export to CSV. ([PRD FR-6](./prd.md))
FR-7: Surface the Generic Equivalent for a branded line carrying the same Active Ingredient with the per-unit price difference, without quoting, sourcing, or ordering it. ([PRD FR-7](./prd.md))
FR-8: Flag any line priced above the Market Band as an Overpayment with the dollar gap, math openable line by line, never flagged on a "no reliable band yet" Ingredient, always surfaced as a Recommendation with a dollar figure. ([PRD FR-8](./prd.md))
FR-9: Audit Invoices against applicable Rebate tiers, thresholds, and early-fill milestones, flag under-credited Rebates the grower earned but was not credited with the dollar amount and threshold math, and route ambiguous or non-machine-readable terms to the Review queue as lower-confidence "possible, needs confirmation." ([PRD FR-9](./prd.md))
FR-10: Model Prepay timing for forecast Inputs against the working-capital window, presenting discount, close date, and a plain-language timing trade-off note, never instructing a Prepay purchase autonomously. ([PRD FR-10](./prd.md))
FR-11: Surface every Overpayment, under-credited Rebate, Generic Equivalent, and Prepay-timing finding as a display-only Recommendation in Terra's grammar (situation, action, impactUsd or impactNote, severity, one-tap response), appearing in the Findings rail, with the action field shaped for future execution but no v1 execution path. ([PRD FR-11](./prd.md))
FR-12: Close the loop with predicted versus actual on a Recommendation once the relevant Invoice posts, filling the Recommendation result and producing line-level traceability, with done-without-posted-Invoice Recommendations counting only toward identified savings. ([PRD FR-12](./prd.md))
FR-13: Show all Input spend in the Spend Table (SKUs down, months across, charges in cells), filterable by Entity, Ranch, Dealer, and Active Ingredient, usable at 180-plus lines, every cell traceable to its Invoice line, one-click CSV export of the filtered view. ([PRD FR-13](./prd.md))
FR-14: Let a grower set or review a Spend Budget per Entity and track Forecast spend plus Committed spend against it across all Entities, marking budgets "not set" rather than fabricating, counting a line as Committed spend only at its obligating event, and attributing over-budget overages to driving Ranches and Dealers. ([PRD FR-14](./prd.md))
FR-15: Grant a PCA read-only, Entity-scoped advisor visibility into the Spend Table, Findings, and Recommendations, with no edit, budget, or act capability, revocable immediately and leaving no retained copy on revoke. ([PRD FR-15](./prd.md))
FR-16: Let a PCA with visibility mark a flagged Overpayment or Rebate finding as confirmed-true or disputed, recorded against the finding, visible to the grower, feeding the retrospective accuracy metric. ([PRD FR-16](./prd.md))
FR-17: Route a low-confidence Invoice line, an un-normalizable unit, or an ambiguous Rebate term to the internal-ops-only Review queue, hold the affected finding out of any asserted dollar figure until a reviewer resolves it, write the resolved value back into the pipeline, show no grower-facing queue, wait time, or SLA, and never count a pending item toward savings. ([PRD FR-17](./prd.md))

### NonFunctional Requirements

Derived from the binding [Constraints and Guardrails](./prd.md), [Data Governance](./prd.md), [Platform](./prd.md), and [Information Architecture](./prd.md) clusters and the [Non-Goals](./prd.md) of the PRD.

NFR-1: Credential discipline. The system never requires, stores, or exposes a Dealer, financial, or utility credential in any form the system, repo, or team can read. v1 requires no Dealer login. ([PRD §5, Privacy](./prd.md))
NFR-2: Zero external calls in dev and test. All development and testing run against committed fixture Invoices and a Batth-shaped seed, with no external calls. ([PRD §6.1, Platform](./prd.md))
NFR-3: Human-in-the-loop by default. No autonomous action, purchase, payment, or external action fires from any tap in v1; the agent surfaces and recommends, the human decides. ([PRD §5, Constraints](./prd.md))
NFR-4: Honest-number discipline. The agent never claims a verified savings number it cannot trace line by line, never labels identified (pre-action) savings "verified," reserves "verified" for the loop-closed attributable subset, and labels low-confidence findings (thin Market Bands, ambiguous Rebate terms) rather than asserting them. ([PRD §5, SM-C1, Constraints](./prd.md))
NFR-5: Mobile-first, plain operator English. Mobile-first for the farmer on a phone in a truck; plain operator English (blocks, sets, acres, Dealers, Ranches, pumps), no surface jargon, no exclamation marks, no em dashes in user-facing copy, all copy in /copy for localization. ([PRD Information Architecture](./prd.md))
NFR-6: Shared data model and clean boundaries. v1 ships inside the existing Terra Next.js app on the shared data model (Farm, Entity, Ranch/Block, Crop, Recommendation grammar), reusing the Tool 1 OS shell, Findings rail, three-views discipline, and credential discipline, with pure logic in /lib, a clear data model, and a UI layer so the eventual monorepo move stays mechanical. ([PRD Platform](./prd.md))
NFR-7: Data portability and governance. The grower's data is theirs and exportable to a spreadsheet at any time with no lock-in; v1 does no cross-grower pooling (the Market Band is single-grower); deletion is provided on request. ([PRD Data Governance](./prd.md))
NFR-8: Data hero leads, money is not a lone hero number. The data hero (the farm and its spend known at a glance) leads; money is the story but never a lone screaming hero number; money and usage values use tabular figures. ([PRD Information Architecture](./prd.md))
NFR-9: Confidence-carrying findings. Findings carry confidence so the agent never asserts a dollar it cannot defend; thin Market Bands and ambiguous Rebate terms are labeled, not asserted. ([PRD §5, Constraints](./prd.md))

### Additional Requirements

No Architecture document exists for Tool 2 yet; technical requirements below are drawn from the [Platform cluster](./prd.md) and inherited Terra conventions ([CLAUDE.md](../../../CLAUDE.md)).

- Build on the existing Terra Next.js (App Router) + TypeScript (strict) + Tailwind + Prisma + Postgres stack. No `any`. Pure calculation functions live in /lib and are unit-tested.
- Extend the existing shared Prisma schema (Farm, Entity, Ranch/Block, Crop, Recommendation) with the new procurement entities (Invoice, Invoice line, SKU, Active Ingredient, Account, Dealer, Bill of Materials, Market Band, Spend Budget, PCA visibility grant, Review queue item). Add tables only when the first story that needs them is built.
- Reuse the Recommendation grammar verbatim; tool is "purchasing"; the action field is shaped to be executable later but carries no v1 execution path.
- Reuse the Tool 1 OS shell, persistent Findings rail, three-views discipline, value-honest connect-a-source onboarding, and vision-read pipeline used for Tool 1 bill PDFs.
- Commit fixture Invoices and a Batth-shaped seed so the app runs with zero external calls.

### UX Design Requirements

No standalone UX Design Specification exists for Tool 2 yet. The [Information Architecture cluster](./prd.md) specifies the three-views discipline carried from Tool 1, which is treated as binding UX guidance and covered by the relevant feature epics rather than a dedicated design-system epic.

- UX-DR1: Buy Window Calendar (home view). Each forecast Input's buying window and Prepay close on a color-coded month grid, one plain-language action line each, graspable in seconds on a phone for a single Entity (covered in Epic 3, FR-4).
- UX-DR2: Spend Table (Excel-style bridge). SKUs down, months across, charges in cells, filterable by Entity, Ranch, Dealer, and Active Ingredient, usable at 180-plus lines, one-click CSV export (covered in Epic 6, FR-13).
- UX-DR3: Price Band Chart (trends, behind a tap). Per-unit price history and the Market Band over time (covered in Epic 4, FR-6).
- UX-DR4: Findings rail. The persistent list of pending Recommendations carried from the Tool 1 OS shell (covered in Epic 5, FR-11).
- UX-DR5: Value-honest connect-a-source onboarding reusing the Tool 1 shell and the same-day-finding activation target (covered in Epic 1, FR-1/FR-2, and Epic 4).

### FR Coverage Map

- FR-1: Epic 1 - Ingest Invoices by photo, PDF, or email forward with vision extraction.
- FR-2: Epic 1 - Attribute each Invoice line to Ranch, Entity, and Account on the shared data model.
- FR-3: Epic 3 - Forecast a per-product Bill of Materials from the Crop Plan.
- FR-4: Epic 3 - Present forecast buying windows and Prepay closes on the Buy Window Calendar.
- FR-5: Epic 4 - Normalize every line to a per-unit, same-Active-Ingredient basis.
- FR-6: Epic 4 - Compute and display the single-grower Market Band per Active Ingredient.
- FR-7: Epic 4 - Surface the Generic Equivalent where one exists.
- FR-8: Epic 5 - Flag Overpayment against the Market Band.
- FR-9: Epic 5 - Audit Invoices against Rebate / Program Pricing and flag under-credited Rebates.
- FR-10: Epic 5 - Model Prepay timing against the working-capital window.
- FR-11: Epic 5 - Surface every finding as a display-only Recommendation in the grammar.
- FR-12: Epic 5 - Close the loop with predicted versus actual after the Invoice posts.
- FR-13: Epic 6 - Show spend across every Entity, Account, Ranch, and Dealer in the Spend Table.
- FR-14: Epic 6 - Track Forecast spend and Committed spend against the Spend Budget per Entity.
- FR-15: Epic 7 - Grant a PCA read-only, Entity-scoped advisor visibility.
- FR-16: Epic 7 - Let an advisor confirm or dispute a flagged line.
- FR-17: Epic 2 - Route low-confidence lines and ambiguous Rebate terms to the Review queue.

## Epic List

### Epic 1: Connect a source and see legible, attributed Input spend
Stand up the Purchasing Agent on Terra's shared data model and let a grower connect by supplying historical Invoices through the lowest-friction path (photo, PDF, email forward), with every extracted line attributed to a Ranch, Entity, and Account. This is the data foundation the whole tool sits on: the procurement entities on the shared schema, the vision-and-parse ingestion pipeline, and the attribution that reuses Tool 1 records. It delivers standalone value on day one (the grower's scattered paperwork becomes structured, attributed spend) and requires no later epic to function.
**FRs covered:** FR-1, FR-2

### Epic 2: Hold low-confidence work out of the numbers (internal Review queue)
Build the internal-ops-only human-in-the-loop Review queue so the agent never guesses work it cannot do confidently. Blurry or unreadable Invoice lines, units that cannot be normalized, and ambiguous Rebate terms route here, are held out of any asserted dollar figure until a Terra ops reviewer resolves them, and flow back into the pipeline once resolved. The grower only ever sees "needs review" or "possible, needs confirmation," never a queue or an SLA. This is the human side of the HITL posture and is the honesty backbone every downstream number depends on, so it comes before the band, the audit, and the Recommendations that must respect it.
**FRs covered:** FR-17

### Epic 3: Forecast the season from the Crop Plan
Translate the Crop Plan (acres times crop times program times growth stage) into a per-product Bill of Materials and present each forecast Input's buying window and Prepay close on the Buy Window Calendar home view, so the grower sees what is coming before the Dealer order sheet arrives. Standalone: it derives the forecast from data the grower already gave Terra and shows it on a phone-graspable calendar, independent of the band or the audit.
**FRs covered:** FR-3, FR-4

### Epic 4: Normalize every line and show it against the Market Band
Build the legibility engine and the trojan-horse feature: normalize every Invoice and forecast line to a per-unit, same-Active-Ingredient basis, compute the single-grower Market Band (low, median, high), surface the Generic Equivalent where one exists, and show the grower their own price against the band with the Price Band Chart and openable math. This is the core retrospective insight, single-grower and honest about thin data, and it stands alone as a legibility win even before findings become Recommendations.
**FRs covered:** FR-5, FR-6, FR-7

### Epic 5: Turn findings into display-only Recommendations and close the loop
Convert the legibility into action the grower can check: flag Overpayment against the Market Band, audit Invoices against Rebate / Program Pricing for under-credited Rebates the grower is owed, model Prepay timing against the working-capital window, and surface every finding as a display-only Recommendation in Terra's grammar in the Findings rail. After a relevant Invoice posts, close the loop with predicted versus actual. Every Recommendation is human-in-the-loop with no execution path. This epic delivers the headline v1 value (the identified-savings number traceable line by line) on top of Epics 1, 2, and 4.
**FRs covered:** FR-8, FR-9, FR-10, FR-11, FR-12

### Epic 6: Cross-entity spend control (Spend Table and spend-versus-budget)
Give a Batth-scale operation one legible ledger of fragmented Input spend across many Accounts, Dealers, Ranches, and Entities: the Excel-style Spend Table (filterable, CSV-exportable, usable at 180-plus lines) and a spend-versus-budget summary that tracks Forecast spend plus Committed spend against a per-Entity Spend Budget. Standalone cross-entity legibility and spend control, built on the attributed spend from Epic 1 and the forecast from Epic 3.
**FRs covered:** FR-13, FR-14

### Epic 7: Arm the advisor (PCA read-only visibility and confirm/dispute)
Let the grower grant their PCA read-only, Entity-scoped visibility into the Spend Table, Findings, and Recommendations, revocable with no retained copy, and let the PCA confirm or dispute flagged lines so the confirmation feeds the retrospective accuracy metric. This arms the trusted-advisor circle rather than routing around it, and depends only on the views and findings from earlier epics.
**FRs covered:** FR-15, FR-16

### Epic 8 (POST-MVP, not in v1): Scout, negotiate, and act
Listed here so the destination is visible and never mistaken for v1 scope. None of this ships in the first version. Live cross-supplier scouting, agentic negotiation and RFQ / reverse auction, auto-PO and delivery tracking, attached crop-cycle financing, true delegated auto-buy, and cross-grower price pooling are all explicitly POST-MVP per [PRD §4.10](./prd.md) and [§6.2](./prd.md). The Recommendation action field built in Epic 5 is shaped to support these later, but v1 contains no execution path. No FRs from the v1 inventory are deferred to this epic.
**FRs covered:** none (POST-MVP only; no v1 FRs)

## Epic 1: Connect a source and see legible, attributed Input spend

Stand up the Purchasing Agent on Terra's shared data model and let a grower turn it on from the same home screen as the energy tool, then connect by supplying historical Invoices through the lowest-friction path. The agent reads each Invoice (vision and parse), extracts structured lines, and attaches every line to the correct Ranch, Entity, and Account on the shared data model, reusing the records a dual-tool grower already gave Terra. It never requires a Dealer login. Lines it cannot read confidently are marked "needs review" rather than guessed. This epic realizes UJ-1 and is the data foundation the rest of the tool sits on. (NFR-1, NFR-2, NFR-5, NFR-6, NFR-8 apply throughout.)

### Story 1.1: Stand up the Purchasing Agent on the shared data model

As a Terra engineer,
I want the procurement data model and the Purchasing Agent tool entry stood up on the existing shared schema and OS shell,
So that a grower can turn on the Purchasing Agent from the same home screen and the tool has the entities it needs to store Invoices and attributed lines.

**Acceptance Criteria:**

**Given** the existing Terra app, shared Prisma schema (Farm, Entity, Ranch/Block, Crop, Recommendation), and Tool 1 OS shell,
**When** the procurement foundation is added,
**Then** the schema is extended with the procurement entities needed for ingestion and attribution (Invoice, Invoice line, SKU, Account, Dealer, with Dealer and Co-op modeled as a single source type per the Glossary),
**And** the new entities attach to the existing Farm, Entity, Ranch/Block model with no change to Tool 1 behavior,
**And** the Purchasing Agent appears as a tool the grower can turn on from the same home screen, authenticated through the existing Terra account,
**And** pure logic lives in /lib and the UI layer is separate so the future monorepo move stays mechanical (NFR-6),
**And** no Dealer or financial credential is requested or stored at any point (NFR-1),
**And** a Batth-shaped procurement seed and fixture Invoices are committed so the app runs with zero external calls (NFR-2).

### Story 1.2: Ingest an Invoice by photo, PDF, or email forward and extract its lines

As a Batth-scale almond grower,
I want to submit last season's Invoices by photo, PDF upload, or email forward and have the agent read each one into structured lines,
So that my scattered paperwork becomes structured records without me typing anything or handing over a Dealer login.

**Acceptance Criteria:**

**Given** an authenticated grower with the Purchasing Agent turned on,
**When** the grower submits one or more clear Invoices by photo, PDF, or email forward,
**Then** the agent extracts a structured record for each line with SKU, quantity, unit, unit price, and total, plus any Rebate or Prepay lines (FR-1),
**And** the system never prompts for or stores a Dealer or financial login credential at any point in ingestion (FR-1, NFR-1),
**And** a line the agent cannot read with confidence above the defined threshold is flagged "needs review" and excluded from Market Band comparison until confirmed (FR-1),
**And** ingestion runs with zero external calls against committed fixture Invoices in development and test (FR-1, NFR-2),
**And** the grower sees only the line state, never a queue or a wait time, for a "needs review" line.

### Story 1.3: Attribute each extracted line to a Ranch, Entity, and Account

As a Batth-scale almond grower with six Entities and four Dealers,
I want every extracted Invoice line attached to the right Ranch, Entity, and Account,
So that my fragmented spend resolves onto one shared model and I can later see it in one place.

**Acceptance Criteria:**

**Given** extracted Invoice lines from Story 1.2 and a grower who already uses Tool 1,
**When** the agent attributes each line,
**Then** every ingested line resolves to exactly one Entity and one Account (FR-2),
**And** a line that cannot be resolved is flagged for grower confirmation rather than silently dropped (FR-2),
**And** attribution reuses the Farm, Entity, Ranch/Block, and Crop records already present from Tool 1 for a dual-tool grower (FR-2, NFR-6),
**And** the grower can correct an attribution and the correction persists across sessions (FR-2),
**And** the experience is mobile-first and in plain operator English with no surface jargon (NFR-5).

## Epic 2: Hold low-confidence work out of the numbers (internal Review queue)

Build the internal-ops-only human-in-the-loop Review queue. The agent does not guess work it cannot do confidently: blurry or unreadable Invoice lines (from FR-1), lines whose unit cannot be normalized (from FR-5), and ambiguous or non-machine-readable Rebate terms (from FR-9) all route here. A pending item is held out of any asserted dollar figure until a Terra ops reviewer resolves it, and the resolved value flows back into the pipeline. In v1 this is internal-ops-only: no grower-facing queue, wait time, or SLA. The grower sees only "needs review" or "possible, needs confirmation." This epic realizes the UJ-1 and UJ-2 edge cases and is the honesty backbone (NFR-3, NFR-4, NFR-9) that the band, the audit, and the Recommendations all depend on, which is why it precedes them. Note: the unit-normalization and Rebate-term producers are built in Epics 4 and 5; this epic builds the queue mechanism and wires in the blurry-line producer from Epic 1, then Epics 4 and 5 enqueue to it.

### Story 2.1: Route a low-confidence Invoice line to the internal Review queue and hold it out of the numbers

As a Terra ops reviewer,
I want low-confidence Invoice lines routed to an internal Review queue and held out of any asserted dollar figure until I resolve them,
So that the agent never guesses a quantity or unit it cannot read and never surfaces a number it cannot defend.

**Acceptance Criteria:**

**Given** a line flagged "needs review" during ingestion (FR-1),
**When** the line enters the pipeline,
**Then** it creates a Review queue item and does not produce a Market Band comparison or an asserted dollar figure until it resolves (FR-17),
**And** the Review queue is internal-ops-only with no grower-facing queue surface, wait time, or SLA shown (FR-17),
**And** the grower sees only the line state "needs review" until resolution (FR-17),
**And** a pending Review queue item is never counted toward identified savings or attributed realized savings and is never surfaced as a confidently asserted Recommendation (FR-17, NFR-4),
**And** the queue accepts the un-normalizable-unit and ambiguous-Rebate-term item types so Epics 4 and 5 can enqueue to it without rework.

### Story 2.2: Resolve a Review queue item and feed the resolved value back into the pipeline

As a Terra ops reviewer,
I want to resolve a Review queue item (confirm the unit and quantity, normalize the unit, or confirm the Rebate term) and have the resolved value written back to the line,
So that the corrected line re-enters normalization or the Rebate audit and the grower's "needs review" state clears.

**Acceptance Criteria:**

**Given** a pending Review queue item,
**When** a reviewer resolves it with a confirmed unit and quantity, a normalized unit, or a confirmed Rebate term,
**Then** the resolved value is written back to the line (FR-17),
**And** the line then re-enters normalization or the Rebate audit (FR-17),
**And** the grower-facing line state changes from "needs review" or "possible, needs confirmation" to resolved (FR-17),
**And** the resolved line can now contribute to a Market Band comparison or an asserted Rebate dollar figure where it could not before (FR-17, NFR-9),
**And** no grower-facing review surface, self-service confirmation flow, or service-level commitment on turnaround is exposed (FR-17, Out of Scope).

## Epic 3: Forecast the season from the Crop Plan

Translate the Crop Plan into a per-product Bill of Materials and present it on the Buy Window Calendar home view. The grower sees what each Block needs and when the Prepay window closes before the Dealer order sheet arrives. This epic realizes UJ-3 and stands alone as a forward-looking planning win. (NFR-5, NFR-6, NFR-8 apply.)

This epic depends on a Crop Plan model decision that is net-new, not reused from Tool 1. Tool 1's `Crop` is minimal (`id`, `name`, `cropCoefficient`, `blocks`, `ranches`, `pumps`) with no program and no growth stage, so the forecast has no `program` or `growth stage` to read until one of two paths is chosen ([architecture §4.6](../3-solutioning/architecture.md)): (a) a net-new `CropProgram` model plus a grower-supplied ingestion step, or (b) a repeat-buy projection from prior-season Invoices first. Architecture §4.6 recommends shipping (b) first and treating (a) as the later path to the full agronomic forecast. Settle this before building Story 3.1.

### Story 3.1: Forecast a per-product Bill of Materials from the Crop Plan

As a Batth-scale almond grower,
I want the agent to forecast a per-product Bill of Materials for the season from my Crop Plan,
So that I see what I will need to buy and when, before the Dealer order sheet arrives.

**Acceptance Criteria:**

**Given** a net-new Crop Plan source (not reused from Tool 1): either a `CropProgram` with acres, crop, program, and growth stage, or, per the recommended v1 path, a repeat-buy projection from prior-season Invoices ([architecture §4.6](../3-solutioning/architecture.md)),
**When** the agent forecasts the season,
**Then** it produces a Bill of Materials listing each forecast Input with a quantity and a target buying window (FR-3),
**And** a Block with no Crop Plan data produces no forecast lines for that Block rather than a fabricated estimate (FR-3, NFR-4),
**And** the forecast is recomputed when the Crop Plan changes (FR-3),
**And** the forecast logic is a pure, unit-tested function in /lib with no UI or DB coupling (NFR-6).

### Story 3.2: Present forecast buying windows and Prepay closes on the Buy Window Calendar

As a Batth-scale almond grower on my phone in the truck,
I want each forecast Input's buying window and Prepay close shown on a color-coded month grid with one plain action line each,
So that I can grasp my buying calendar for an Entity in seconds.

**Acceptance Criteria:**

**Given** a Bill of Materials from Story 3.1,
**When** the grower opens the Buy Window Calendar home view,
**Then** each forecast line appears on a month grid with a buying window and, where applicable, a Prepay close date, color-coded (FR-4, UX-DR1),
**And** each calendar entry carries one plain-language action line in operator English with no kW, no "SKU velocity," and no surface jargon (FR-4, NFR-5),
**And** the calendar is graspable on a phone screen without horizontal scrolling for a single Entity (FR-4, NFR-5),
**And** the data hero leads and no lone screaming money number dominates the view (NFR-8).

## Epic 4: Normalize every line and show it against the Market Band

Build the legibility engine and the trojan-horse feature. Normalize every Invoice and forecast line to a per-unit, same-Active-Ingredient basis, compute the single-grower Market Band (low, median, high) from this grower's own normalized Invoices only, surface the Generic Equivalent where one exists, and show the grower their own per-unit price against the band with openable math, CSV export, and the Price Band Chart. Where there are too few comparable points, the agent declares "no reliable band yet" rather than inventing one. This epic realizes UJ-1 and UJ-3 and stands alone as a legibility win even before findings become Recommendations. Un-normalizable units enqueue to the Epic 2 Review queue. (NFR-4, NFR-7, NFR-8, NFR-9 apply throughout.)

### Story 4.1: Normalize every line to a per-unit, same-Active-Ingredient basis

As a Batth-scale almond grower,
I want every Invoice and forecast line normalized to a per-unit price for its Active Ingredient,
So that two differently branded products with the same chemistry are compared on the same honest basis.

**Acceptance Criteria:**

**Given** attributed Invoice lines (Epic 1) and forecast lines (Epic 3),
**When** the agent normalizes a line,
**Then** two SKUs carrying the same Active Ingredient resolve to the same Active Ingredient and are compared on the same per-unit basis (FR-5),
**And** unit conversions (for example gallons, pounds, ounces of active) are applied so per-unit prices are directly comparable (FR-5),
**And** a line whose Active Ingredient cannot be resolved is excluded from band comparison and flagged, not force-matched (FR-5, NFR-9),
**And** a line whose unit cannot be normalized is routed to the internal Review queue (Epic 2) and held out of any asserted figure until resolved (FR-5, FR-17),
**And** the normalization logic is a pure, unit-tested function in /lib (NFR-6).

### Story 4.2: Compute and display the single-grower Market Band per Active Ingredient

As a Batth-scale almond grower who learns line by line in Excel,
I want to see the Market Band (low, median, high) for each Active Ingredient I buy with my own price against it,
So that I can tell whether I overpaid and check the math myself.

**Acceptance Criteria:**

**Given** normalized lines from Story 4.1,
**When** the agent computes the Market Band for an Active Ingredient,
**Then** the band is computed only from this grower's own normalized Invoices, with no cross-grower pooled prices, no published list prices, no scraped quotes, and no third-party datasets contributing (FR-6, NFR-7),
**And** the single-grower source basis is disclosed in the view and never presented as an audited network benchmark (FR-6, NFR-4),
**And** an Active Ingredient with too few comparable points is labeled "no reliable band yet" and produces no Overpayment finding (FR-6, NFR-9),
**And** the grower can open the underlying math for any band line and export it to CSV (FR-6, NFR-7),
**And** the grower's own price is shown against the band.

### Story 4.3: Surface the Generic Equivalent where one exists

As a Batth-scale almond grower,
I want the agent to flag a cheaper Generic Equivalent for a branded line carrying the same Active Ingredient,
So that I can see the per-unit gap and raise it with my dealer.

**Acceptance Criteria:**

**Given** a branded line with a resolved Active Ingredient (Story 4.1),
**When** that Active Ingredient has a known Generic Equivalent,
**Then** the agent surfaces the Generic Equivalent with the per-unit price difference (FR-7),
**And** the agent does not quote, source, or order the Generic Equivalent, surfacing only the equivalence and the gap (FR-7, NFR-3),
**And** the equivalence is shown in plain operator English (NFR-5).

### Story 4.4: Show per-unit price history and the Market Band on the Price Band Chart

As a Batth-scale almond grower,
I want a trends view of my per-unit price history and the Market Band over time behind a tap,
So that I can see how my buying has tracked against the band across the season.

**Acceptance Criteria:**

**Given** computed Market Bands and normalized line history (Stories 4.1, 4.2),
**When** the grower taps into the Price Band Chart,
**Then** the chart shows per-unit price history and the Market Band over time for a chosen Active Ingredient (FR-6, UX-DR3),
**And** the chart is behind a tap, not on the home view, consistent with the three-views discipline (UX-DR3, NFR-6),
**And** an Active Ingredient labeled "no reliable band yet" shows the price history without a fabricated band (FR-6, NFR-4),
**And** money and usage values use tabular figures and no lone screaming number dominates (NFR-8).

## Epic 5: Turn findings into display-only Recommendations and close the loop

Convert legibility into action the grower can check. Flag Overpayment against the Market Band with the dollar gap, audit Invoices against Rebate / Program Pricing for under-credited Rebates the grower is owed, model Prepay timing against the working-capital window, and surface every finding as a display-only Recommendation in Terra's grammar in the Findings rail. After a relevant Invoice posts, close the loop with predicted versus actual. Every Recommendation is human-in-the-loop: the one-tap response sets status only, and no purchase or external action fires. The action field is shaped to be executable later but carries no v1 execution path. This epic realizes UJ-1, UJ-2, and UJ-3 and delivers the headline v1 value (the identified-savings number, SM-1, traceable line by line). Ambiguous Rebate terms enqueue to the Epic 2 Review queue. (NFR-3, NFR-4, NFR-9 apply throughout.)

### Story 5.1: Flag Overpayment against the Market Band as a Recommendation

As a Batth-scale almond grower,
I want any line priced above the Market Band flagged as an Overpayment with the dollar gap and openable math,
So that I can see exactly where I overpaid and check it line by line.

**Acceptance Criteria:**

**Given** a normalized line and a Market Band that is not "no reliable band yet" (Epic 4),
**When** the line's per-unit price sits above the band,
**Then** the agent flags an Overpayment stating the grower's per-unit price, the band, and the dollar impact, with the math openable line by line (FR-8),
**And** no Overpayment is flagged on a line whose Active Ingredient has "no reliable band yet" (FR-8, NFR-4),
**And** the Overpayment is surfaced as a Recommendation and never as advice without a dollar figure (FR-8, FR-11),
**And** the identified Overpayment counts only toward identified savings (SM-1) and is never labeled "verified" before loop closure (NFR-4).

### Story 5.2: Audit Invoices against Rebate / Program Pricing and flag under-credited Rebates

As a Batth-scale almond grower who hit an early-fill milestone and never saw the credit,
I want the agent to reconcile my Invoices against the applicable Rebate tiers, thresholds, and early-fill milestones and flag Rebates I earned but was not credited,
So that I can recover dollars I was quietly shorted.

**Acceptance Criteria:**

**Given** ingested Invoices (Epic 1) and the Rebate tiers, thresholds, and early-fill milestones the grower entered or that were extracted from program documents,
**When** ingested volume crosses a defined Rebate threshold and no corresponding credit appears on any Invoice,
**Then** the agent produces an under-credited Rebate finding with the dollar amount and the threshold math (FR-9),
**And** a program whose terms are ambiguous or not machine-readable produces a lower-confidence "possible, needs confirmation" finding routed to the internal Review queue (Epic 2), never a confidently asserted dollar figure (FR-9, FR-17, NFR-9),
**And** under-credited Rebate findings are surfaced as Recommendations (FR-9, FR-11),
**And** the grower sees only the "possible, needs confirmation" line state for an ambiguous program, never a queue or wait time (FR-17).

### Story 5.3: Model Prepay timing against the working-capital window

As a Batth-scale almond grower deciding whether to prepay,
I want a plain-language Prepay timing assessment that weighs the early-order discount against the cash and counterparty risk,
So that I can decide on the Prepay window myself with the trade-off in front of me.

**Acceptance Criteria:**

**Given** a forecast Input with a Prepay window (Epic 3),
**When** the grower views its Prepay timing assessment,
**Then** the agent presents the discount, the close date, and a plain-language note on the timing trade-off (FR-10, NFR-5),
**And** the agent never instructs a Prepay purchase autonomously and only informs the grower's decision (FR-10, NFR-3),
**And** the Prepay-timing item is surfaced as a Recommendation in the grammar (FR-10, FR-11).

### Story 5.4: Surface every finding as a display-only Recommendation in the Findings rail

As a Batth-scale almond grower,
I want every Overpayment, under-credited Rebate, Generic Equivalent, and Prepay-timing finding expressed as a Recommendation with a situation, an action, the dollar impact, and a one-tap response in my Findings rail,
So that I have one clear list of items to review, each with a dollar figure I can check, and none acting on its own.

**Acceptance Criteria:**

**Given** Overpayment (5.1), under-credited Rebate (5.2), Generic Equivalent (Epic 4), and Prepay-timing (5.3) findings,
**When** a finding is surfaced,
**Then** it conforms to the grammar { id, farmId, tool, situation, action, impactUsd?, impactNote?, severity, status, createdAt, resolvedAt?, result? } (FR-11),
**And** the one-tap response sets status to done, dismissed, or overridden, and v1 never performs a purchase or any external action from the tap (FR-11, NFR-3),
**And** Recommendations appear in the Findings rail carried over from the Tool 1 OS shell (FR-11, UX-DR4),
**And** the action field is structured so a future version could execute it, but no v1 execution path is present (FR-11),
**And** Recommendation count is not treated as a goal and a flood of low-confidence findings is avoided (NFR-4, SM-C3).

### Story 5.5: Close the loop with predicted versus actual after the Invoice posts

As a Batth-scale almond grower,
I want the agent to show predicted versus actual on a Recommendation once the relevant Invoice posts,
So that I can believe the savings number because it closed against a real bill.

**Acceptance Criteria:**

**Given** an acted-on Recommendation and a later relevant Invoice ingested (Epic 1),
**When** the agent reconciles the Recommendation,
**Then** it records the actual outcome and fills the Recommendation result (FR-12),
**And** a Recommendation marked done without a posted Invoice remains open for loop closure and counts only toward identified savings (SM-1), never toward attributed realized savings (SM-1b) (FR-12, NFR-4),
**And** loop closure produces the line-level traceability that the attributed realized savings figure (SM-1b) depends on (FR-12),
**And** only the loop-closed, attributable subset is ever labeled "verified" (NFR-4).

## Epic 6: Cross-entity spend control (Spend Table and spend-versus-budget)

Give a Batth-scale operation one legible ledger of Input spend fragmented across many Accounts, Dealers, Ranches, and Entities. The Excel-style Spend Table shows SKUs down, months across, and charges in cells, filterable and CSV-exportable and usable at 180-plus lines. The spend-versus-budget summary tracks Forecast spend plus Committed spend against a per-Entity Spend Budget, attributing over-budget overages to the driving Ranches and Dealers. This epic realizes UJ-1 and UJ-5 and is the multi-entity legibility win, built on the attributed spend from Epic 1 and the forecast from Epic 3. (NFR-5, NFR-7, NFR-8 apply.)

### Story 6.1: Show all Input spend in the filterable, exportable Spend Table

As a Batth-scale almond grower with spend scattered across many Accounts and Dealers,
I want all my Input spend in one Excel-style Spend Table I can filter and export,
So that for the first time I see my whole input spend on one screen and can check any cell against its Invoice.

**Acceptance Criteria:**

**Given** attributed Invoice lines across many Entities and Accounts (Epic 1),
**When** the grower opens the Spend Table,
**Then** the table shows SKUs down, months across, and charges in cells, and stays usable (filterable) at 180-plus lines across many Entities and Accounts (FR-13, UX-DR2),
**And** the grower can filter by Entity, Ranch, Dealer, and Active Ingredient (FR-13),
**And** every cell traces to its underlying Invoice line (FR-13),
**And** one click exports the current filtered view to CSV (FR-13, NFR-7),
**And** the data hero leads and money uses tabular figures with no lone screaming number (NFR-8).

### Story 6.2: Track Forecast spend and Committed spend against a per-Entity Spend Budget

As a Batth-scale almond grower with six Entities,
I want to set or review a Spend Budget per Entity and see Forecast spend plus Committed spend tracked against it across all Entities,
So that I get cross-entity spend control I never had, with over-budget Entities flagged and explained.

**Acceptance Criteria:**

**Given** attributed spend (Epic 1) and a Bill of Materials forecast (Epic 3),
**When** the grower sets or reviews a Spend Budget for an Entity,
**Then** the view shows Forecast spend plus Committed spend against budget and flags over-budget Entities (FR-14),
**And** a line counts as Committed spend only at its obligating event (a signed Dealer order sheet line, an accepted Prepay, or a posted Invoice not yet in a closed budget period), while a still-projected Bill of Materials line counts as Forecast spend (FR-14),
**And** an Entity with no Spend Budget shows spend with budget marked "not set" rather than a fabricated target (FR-14, NFR-4),
**And** over-budget findings attribute the overage to the driving Ranches and Dealers (FR-14),
**And** the view is exportable to a spreadsheet (NFR-7).

## Epic 7: Arm the advisor (PCA read-only visibility and confirm/dispute)

Arm the trusted-advisor circle rather than route around it. The grower can grant their PCA read-only, Entity-scoped visibility into the Spend Table, Findings, and Recommendations, revocable at any time with no retained copy on revoke. The PCA can confirm or dispute flagged Overpayment and Rebate findings, and that confirmation feeds the retrospective accuracy metric. The PCA is never a paying seat-holder or an approver in v1. This epic realizes UJ-4 and depends only on the views and findings from earlier epics. (NFR-1, NFR-3, NFR-7 apply.)

### Story 7.1: Grant and revoke a PCA read-only, Entity-scoped advisor visibility

As a Batth-scale almond grower,
I want to grant my PCA read-only visibility into the Spend Table, Findings, and Recommendations for chosen Entities and revoke it any time,
So that my advisor stays in the loop without ever being able to change my data or act for me.

**Acceptance Criteria:**

**Given** a grower with a Spend Table, Findings, and Recommendations (Epics 4, 5, 6),
**When** the grower grants a PCA visibility for chosen Entities,
**Then** the PCA sees the same Spend Table, Findings, and Recommendations the grower sees, limited to the shared Entities (FR-15),
**And** the PCA cannot edit data, set a Spend Budget, or act on a Recommendation, with visibility strictly read-only in v1 (FR-15, NFR-3),
**And** revoking visibility ends the PCA's access immediately and leaves the PCA no retained copy of the grower's data (FR-15, NFR-7),
**And** no Dealer or financial credential of the grower or the PCA is requested or stored (NFR-1).

### Story 7.2: Let a PCA confirm or dispute a flagged line

As Harjit's PCA, Manpreet,
I want to mark a flagged Overpayment or Rebate finding as confirmed-true or disputed,
So that I keep the relationship intact and my confirmation tells the grower and Terra which flags are right.

**Acceptance Criteria:**

**Given** a PCA with read-only visibility (Story 7.1) and a flagged Overpayment or Rebate finding (Epic 5),
**When** the PCA marks the finding confirmed-true or disputed,
**Then** the confirm or dispute action is recorded against the specific finding and is visible to the grower (FR-16),
**And** confirmations and disputes feed the retrospective accuracy metric (SM-2) (FR-16),
**And** the PCA is never asked to approve a purchase, because v1 does not transact (FR-16, NFR-3).

## Epic 8 (POST-MVP, not in v1): Scout, negotiate, and act

This epic is listed so downstream readers see the destination and never mistake it for v1 scope. None of these capabilities ship in the first version. They are quoted from [PRD §4.10](./prd.md) and [§6.2](./prd.md) and are each marked NON-GOAL for MVP. The Recommendation action field built in Epic 5 is shaped to support them later, but v1 contains no execution path and no v1 FR is deferred here. Stories are intentionally left as named capability placeholders, not detailed for v1 implementation.

- **POST-MVP: Live cross-supplier scouting.** Pull live quotes across local Dealers, Co-ops, and Generic Equivalent channels and line them up in the same per-unit terms, with the grower's existing Dealer invited to quote. Ships only as supplier participation density is earned. [NON-GOAL for MVP]
- **POST-MVP: Agentic negotiation and RFQ / reverse auction.** Fire RFQs and negotiate the long tail on a Gain-share basis (the Pactum-style capability, proven elsewhere, never built for the farm). [NON-GOAL for MVP]
- **POST-MVP: Auto-PO and delivery tracking.** Prepare a one-tap purchase order bounded by grower-set dollar caps, visible to the PCA, with delivery tracked to the Ranch, riding agentic-commerce rails. [NON-GOAL for MVP]
- **POST-MVP: Attached crop-cycle financing.** Harvest-timed terms and Prepay financing. [NON-GOAL for MVP]
- **POST-MVP: True delegated auto-buy.** The agent buying within a grower-set cap, earned only after retrospective accuracy is proven and the loop is closed enough times, bounded by dollar caps and advisor visibility when it ships. [NON-GOAL for MVP]
- **POST-MVP: Cross-grower price pooling and a public crowdsourced price benchmark.** Pool anonymized per-unit prices across growers into a network Market Band, and any public benchmark built on it. Requires network density that does not exist on day one and a disclosed privacy boundary. The v1 Market Band stays single-grower (FR-6). [NON-GOAL for MVP]
