---
title: Terra Purchasing Agent
status: draft
created: 2026-06-14
updated: 2026-06-14
---

# PRD: Terra Purchasing Agent
*Working title, confirm.*

## 0. Document Purpose

This PRD is for the Terra product manager, the engineers and UX designer who will build Tool 2, and the stakeholders who fund it. It defines the first version (v1) of the Terra Purchasing Agent: an AI-native, farmer-side input-procurement agent for California specialty and permanent-crop growers, beachhead almonds and tree nuts. It builds on four upstream documents and does not duplicate them: the [product brief](../1-analysis/product-brief.md), the [PRFAQ](../1-analysis/prfaq.md), the [clone target and AI thesis](../0-research/clone-target-and-ai-thesis.md), and the [market research](../1-analysis/market-research.md). It is structured the BMAD way: a Glossary anchors every domain noun, Features are grouped with numbered Functional Requirements (FR-N) nested under them, User Journeys (UJ-N) are named-persona narratives the FRs reference by ID, Success Metrics (SM-N) cross-reference the FRs they validate, and assumptions are tagged inline and indexed at the end. The destination product described in the PRFAQ (live scouting, negotiation, auto-PO with delivery, financing, true auto-buy) is the vision this PRD builds toward; only the legibility and grower-side rebate-and-prepay audit ship in v1, and every later layer is marked POST-MVP and never described as shipping now.

## 1. Vision

Inputs are the largest controllable cost on a California farm and the one the grower can see least. Crop inputs (chemicals, fertilizer, seed) were $72.2B, or 28.6 percent of crop-farm total expenses, in 2024 ([USDA via AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)), and the buying runs through a channel built to hide the real net price: seven retailers control roughly 70 percent of crop inputs, and the true price only appears after year-end rebates and program pricing settle ([CropLife](https://www.croplife.com/management/marketingrebate-programs/)). Two growers buy the same active ingredient at wildly different prices and neither can tell. The squeeze makes it bite now: input prices sit 20 to 40 percent above pre-2021 levels while almond net returns above total cost swung from a +$205/acre gain in 2019 to a roughly $4,280/acre loss in 2024 ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)). To be honest about that figure: the $4,280/acre loss is net return against the full mature-orchard cost base of roughly $5,000 to $6,500/acre (UC Davis), not a single line item. The fertilizer and crop-protection spend this agent works is the roughly $800/acre slice of that base where price discovery is worst, so the addressable savings are a modest percentage of that slice, not of the loss. In a year this far underwater, even a modest percentage of that slice is real money.

The Terra Purchasing Agent is the buyer that works for the farm, not the store. It is Terra's Tool 2, sold to the same customer Tool 1 already serves, on the same shared data model and the same Recommendation grammar. v1 does not negotiate and does not buy. It makes the grower's own input spend legible: it ingests historical invoices and the crop plan, attaches every line to a ranch, entity, and account, normalizes each line to a per-unit, same-active-ingredient market band, audits the rebate and prepay paperwork against what was actually invoiced, forecasts a per-product bill of materials from the crop plan, and surfaces buy recommendations in plain operator English with an identified dollar figure traceable line by line. That figure is potential savings the grower can check, not a banked number; "verified" is reserved for the loop-closed, attributable subset (SM-1b). Legibility first, the same thesis Terra proved on PG&E energy.

The agent earns the right to act the way Tool 1 did: prove the savings number on past invoices, close the predicted-versus-actual loop, then offer one-tap approval bounded by dollar caps with advisor visibility. Live cross-supplier scouting, agentic negotiation, auto-PO with delivery, financing, and true delegated auto-buy are the destination, earned later, never assumed. The moat is execution, the independent non-seller position the incumbents cannot copy without breaking their own profit and loss, and Terra's shared data model. There is no technology secret here, and we do not claim one.

## 2. Target User

### 2.1 Jobs To Be Done

The grower hires this product to do a set of jobs. Jobs 1 through 5 are deliverable in v1 from invoices and the crop plan alone and are the wedge. Jobs 6 through 8 are POST-MVP and earn the right to act ([market research, §3.6](../1-analysis/market-research.md)).

- **Functional:** "Show me every dollar I spend on inputs across all my ranches and entities, in one place." Make fragmented spend legible.
- **Functional:** "Tell me if I overpaid versus what others pay for the same active ingredient." Benchmark price to a per-unit market band.
- **Functional:** "Find me the same active ingredient cheaper, including the generic." Surface the generic equivalent on the grower's own lines (v1 surfaces the equivalent; live cross-supplier scouting is POST-MVP).
- **Functional:** "Make sure I actually got the rebate I earned and bought at the right time." Audit rebates and prepay against real invoices.
- **Functional:** "Plan what I will need to buy and when, before the season." Forecast a bill of materials and buying calendar from the crop plan.
- **Functional:** "After the bill posts, show me I really saved." Close the predicted-versus-actual loop.
- **Emotional:** Stop feeling like a price taker. Stop feeling embarrassed in front of the banker about a spend they cannot explain. Avoid being quietly shorted on a rebate they earned.
- **Social:** Keep the relationship with the dealer and the PCA intact. Have a better conversation with the dealer, armed with the band, not a fight that burns the relationship.
- **Contextual:** Do it on a phone, in a truck, in plain operator English, in one sitting, with a clear dollar ROI before paying anything.

POST-MVP jobs (named, not shipping in v1): "Get me a better price without me having to argue" (negotiation), "Place the order and tell me it showed up" (auto-PO and delivery), "Buy it for me within a cap I set" (delegated auto-buy).

### 2.2 Non-Users (v1)

- **Midwest row-crop growers.** The larger raw market, but crowded and well-served by FBN, GROWERS, and Bushel, and Terra has no distribution or differentiation there ([market research, §3.1](../1-analysis/market-research.md)). Revisit only after the specialty wedge is proven.
- **The dealer, retailer, or co-op as a buyer of software.** v1 is built for the grower and arms the advisor; it is not a retailer-side SaaS like AgVend. The dealer is a participant the grower invites later (POST-MVP), never the v1 customer.
- **The PCA as an independent paying customer.** The PCA is a secondary user with read-only advisor visibility in v1, not a buyer of a seat. They are a distribution channel and a trust ally, not the wallet.
- **Growers with zero historical invoices and no crop plan.** v1 runs on the grower's own documents. A grower who can supply neither cannot be served by the v1 retrospective engine.

### 2.3 Key User Journeys

*Named-persona narratives the product enables. FRs reference these by ID inline ("realizes UJ-3"). The personas are a Batth-scale California almond grower and their PCA.*

- **UJ-1. Harjit connects last season and sees his whole input spend on one screen for the first time.**
  - **Persona + context:** Harjit runs a Batth-scale almond operation, roughly six legal entities buying from four different dealers and co-ops across a sprawl of ranches. He already uses Terra's energy tool, so Terra knows his entities, ranches, blocks, and crops. He learns line by line in Excel and does not trust a vendor headline.
  - **Entry state:** Authenticated through the existing Terra account (Google or magic-link), on his phone, turning on the Purchasing Agent from the same home screen.
  - **Path:** He forwards last season's input invoices from his email and photos a stack of paper invoices. The agent reads each one (vision and parse), attaches every line to the right ranch, entity, and account on the shared data model, and normalizes each line to a per-unit, same-active-ingredient basis. He opens the Spend Table and sees meters of scattered paperwork collapsed into one Excel-style ledger: every SKU down the side, months across, dollars in the cells, filterable by entity, ranch, dealer, and active ingredient.
  - **Climax:** The same day he connected the source, the agent surfaces the first finding: a glyphosate line on the West Ranch entity priced at $X per unit against a market band of $Y to $Z, flagged as overpayment, with the math shown line by line and a one-tap to export to a spreadsheet.
  - **Resolution:** Harjit has, for the first time, a single legible ledger of his input spend and a first dollar finding he can check himself. He is left with a Findings rail of items to review, none of which he is asked to act on autonomously.
  - **Edge case:** An invoice photo is too blurry to read a quantity. The agent marks that line "needs review" rather than guessing and routes it to the internal Review queue (FR-17) to confirm the unit and quantity before it enters a band comparison. Harjit sees only the "needs review" state, never a queue or a wait time.

- **UJ-2. The agent catches a rebate Harjit earned and was never credited.**
  - **Persona + context:** Same Harjit. He hit an early-fill milestone on a fungicide program last fall but never saw the rebate applied on any invoice.
  - **Entry state:** Authenticated, invoices already ingested from UJ-1, on the home screen reviewing the Findings rail.
  - **Path:** The agent reconciles every ingested invoice against the rebate tiers, thresholds, and early-fill milestones the grower entered or that were extracted from program documents. It finds that the volume crossed the threshold but no rebate line posted. It builds a Recommendation: situation (you crossed the early-fill threshold on this program), action (claim the under-credited rebate of $X from this dealer), impactUsd ($X), one-tap response (mark as claimed / dismiss), after-the-fact result (filled once the credit posts).
  - **Climax:** Harjit reads "you earned this rebate and were never credited, $X" with the threshold math shown, and recognizes it as true because it is built from invoices he recognizes.
  - **Resolution:** He taps to mark it for his dealer conversation. The Recommendation moves to pending-claimed and waits to close the loop when the credit appears on a future invoice.
  - **Edge case:** The program terms are ambiguous or not machine-readable. The agent flags the rebate as "possible, needs confirmation" at a lower confidence and routes it to the internal Review queue (FR-17) rather than asserting a dollar figure it cannot defend.

- **UJ-3. Harjit reads the Dealer order sheet against the band before he signs it.**
  - **Persona + context:** Same Harjit. The Dealer order sheet for spring just arrived. In prior years he signed it on the relationship and his gut.
  - **Entry state:** Authenticated, prior season ingested, crop plan present from the energy tool, on his phone in the truck.
  - **Path:** The agent has already forecast a per-product bill of materials and a buying calendar from his crop plan (acres times crop times program times growth stage). He opens the Buy Window Calendar, sees what each block needs and when the prepay window closes, and opens each forecast line against the per-unit market band and last year's paid price.
  - **Climax:** Three lines on the Dealer order sheet sit above the band. The agent shows each as a Recommendation with the dollar gap and a generic equivalent where one exists. Harjit sends the Dealer order sheet back to his dealer with three lines flagged.
  - **Resolution:** He keeps his dealer and his PCA, buys from a position of knowledge, and the buy recommendations he acted on are queued to close the loop when the invoices post.
  - **Edge case:** A forecast line has no clean market band (a thin or specialty product with too few comparable points). The agent labels it "no reliable band yet" and does not flag overpayment on it, rather than inventing a benchmark.

- **UJ-4. Manpreet, Harjit's PCA, sees what the agent sees.**
  - **Persona + context:** Manpreet is Harjit's licensed PCA, the legal gatekeeper for crop-protection recommendations in California and a near-permanent member of Harjit's trusted-advisor circle. Harjit wants her armed, not bypassed.
  - **Entry state:** Manpreet has read-only advisor visibility that Harjit granted, on her own device.
  - **Path:** She opens the shared view and sees the same Spend Table, the same Findings, and the same buy recommendations Harjit sees, scoped to the entities Harjit shared. She can see the band math and the rebate audit.
  - **Climax:** She confirms two flagged lines are correct and notes one false positive (a specialty adjuvant the band mispriced), giving Harjit and Terra confirmed-true signal on the flags.
  - **Resolution:** Manpreet stays in the loop, the relationship holds, and her confirmation feeds the retrospective accuracy metric. She is never asked to approve a purchase in v1, because v1 does not transact.
  - **Edge case:** Harjit revokes Manpreet's visibility. Her access ends immediately and she retains no copy of his data.

- **UJ-5. Harjit checks the budget across all six entities before the season commits.**
  - **Persona + context:** Same Harjit, six entities, four dealers, no single ledger today.
  - **Entry state:** Authenticated, season forecast and prior spend present.
  - **Path:** He opens the spend-versus-budget view, sets or reviews a season Spend Budget per entity, and sees forecast spend plus Committed spend against budget across every entity and account in one place.
  - **Climax:** One entity is tracking 12 percent over its fertilizer budget for the season. The agent shows it plainly, attributed to the ranches and dealers driving it.
  - **Resolution:** Harjit has cross-entity spend control he never had, in plain operator English, exportable to a spreadsheet.
  - **Edge case:** No budget has been set for an entity. The view shows forecast spend and Committed spend with budget marked "not set" rather than fabricating a target.

## 3. Glossary

*Downstream workflows and readers must use these terms exactly. FRs, UJs, and SMs use these terms verbatim. Introducing a synonym anywhere in the PRD is a discipline violation.*

- **Input**. A consumable a grower buys to produce a crop: crop protection (pesticides), fertilizer and nutrition, seed, and fuel. v1 leads with crop protection, fertilizer and nutrition, and seed, the lines with the worst price discovery; fuel is surfaced for completeness, not led with ([PRFAQ](../1-analysis/prfaq.md)).
- **Active Ingredient**. The chemically active compound in a crop-protection or nutrition Input, the basis on which two otherwise differently-branded products are the "same" product for price comparison. Normalization compares price per unit of the same Active Ingredient.
- **SKU**. A specific purchasable product as it appears on an Invoice: a brand, formulation, and pack size. One Active Ingredient maps to many SKUs (branded and generic). Cardinality: many SKUs to one Active Ingredient.
- **Generic Equivalent**. A lower-cost SKU carrying the same Active Ingredient as a branded SKU. v1 surfaces the Generic Equivalent on the grower's own lines where one exists; it does not source or quote it (sourcing is POST-MVP).
- **Dealer**. A retailer of Inputs to the grower (an ag retailer, distributor, or independent dealer). Used interchangeably in operator English with "retailer" only in prose; the Glossary term is Dealer. A grower buys from several Dealers.
- **Co-op**. A cooperative that retails Inputs to its member growers. Treated as a Dealer for data-model purposes (a source of Invoices and an Account holder).
- **PCA**. Pest Control Adviser, the California-licensed adviser who is the legal gatekeeper for crop-protection recommendations and a near-permanent member of the grower's trusted-advisor circle ([market research, §3.1](../1-analysis/market-research.md)). A secondary user with read-only advisor visibility in v1.
- **Trusted-advisor circle**. The five-to-six-person group a grower relies on for input decisions, in which a Dealer agronomist or PCA sits nearly 100 percent of the time ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/)). The product arms this circle, it does not route around it.
- **Rebate / Program Pricing**. Manufacturer or Dealer incentives (volume tiers, thresholds, early-fill milestones) that change the real net price of an Input after the fact, so the true price only appears after year-end ([CropLife](https://www.croplife.com/management/marketingrebate-programs/)). The Rebate Audit reconciles these against Invoices.
- **Prepay**. Paying for Inputs ahead of the season to lock price, capture early-order discounts, and deduct the expense before January 1 for tax, at the cost of fronting cash and bearing counterparty risk ([MSU Extension](https://www.canr.msu.edu/news/best-practices-for-buying-farm-inputs)). The agent models Prepay timing against the working-capital window.
- **Dealer order sheet**. The Dealer's pre-season program and order document listing offered SKUs, program pricing, and Prepay windows; the artifact a grower checks against the Market Band before signing. The single canonical term; "program sheet" and "dealer sheet" are synonym drift and must not be used.
- **Invoice**. A document from a Dealer recording purchased Inputs: SKUs, quantities, unit prices, totals, and any Rebate or Prepay lines. Ingested by photo, PDF, or email forward. The primary v1 data source.
- **Bill of Materials**. The forecast per-product list of Inputs a farm will need for a season, derived from the crop plan (acres times crop times program times growth stage). Drives the Buy Window Calendar.
- **Crop Plan**. The farm's plan of what is grown where and on what program and growth-stage schedule. The input to the Bill of Materials forecast. This is net-new, not reused from Tool 1: Tool 1's `Crop` is minimal (`id`, `name`, `cropCoefficient`, `blocks`, `ranches`, `pumps`) with no program or growth stage, so v1 either models a net-new `CropProgram` with a grower-supplied ingestion step or, per the recommended path, scopes the forecast to a repeat-buy projection from prior-season Invoices first ([architecture §4.6](../3-solutioning/architecture.md), §8 #7).
- **Market Band**. The normalized per-unit price range (low, median, high) for a given Active Ingredient, against which a grower's line is compared to show overpayment. In v1 the Market Band is single-grower: it is computed only from this grower's own normalized Invoices, with no cross-grower pooling and no network benchmark ([product brief, Scope](../1-analysis/product-brief.md)). Pooling anonymized per-unit prices across growers, and any public crowdsourced benchmark, are POST-MVP (§4.10).
- **Overpayment**. The dollar gap between a grower's per-unit price on a line and the Market Band for that Active Ingredient. A core finding type.
- **Recommendation**. A finding in Terra's grammar: `{ id, farmId, tool, situation, action, impactUsd?, impactNote?, severity: info|watch|act, status: pending|done|dismissed|overridden, createdAt, resolvedAt?, result? }`. One situation, one concrete action, the dollar impact, a one-tap response, and an after-the-fact result. Shaped to be executable; v1 only displays it ([CLAUDE.md](../../../CLAUDE.md)).
- **Entity**. A legal billing entity. A Farm has several. Inputs, Invoices, Accounts, and the Spend Budget all attach to an Entity. Cardinality: one Farm to many Entities.
- **Ranch / Block**. A physical operating unit (Ranch) and the field subdivisions within it (Block). Inputs are attributed to the Ranch and Block they serve.
- **Account**. A Dealer or Co-op account number under which a grower's purchases are billed. A grower has many Accounts across many Dealers and Entities.
- **Spend Budget**. A grower-set or reviewed season target for Input spend, per Entity, against which forecast spend and Committed spend are tracked. May be "not set."
- **Forecast spend**. The projected season Input spend derived from the Bill of Materials (the per-product forecast from the Crop Plan), before anything is obligated. The forward-looking half of spend-versus-budget tracking.
- **Committed spend**. Input spend the grower has obligated but not necessarily paid: lines on a signed Dealer order sheet, an accepted Prepay, or a posted Invoice not yet in a closed budget period. A line becomes Committed spend at the obligating event (signature, Prepay acceptance, or Invoice posting), distinct from forecast spend, which is only projected. Tracked alongside forecast spend against the Spend Budget.
- **Spend Table**. The Excel-style legibility view: SKUs down, months across, charges in cells, filterable by Entity, Ranch, Dealer, and Active Ingredient, one-click CSV export. The bridge for the Excel-brained grower.
- **Buy Window Calendar**. The home view: each forecast Input's buying window and Prepay close on a month grid, color-coded, with one plain-language action line. The graspable-in-seconds hook.
- **Price Band Chart**. The trends view: per-unit price history and Market Band over time, behind a tap.
- **Findings rail**. The persistent list of pending Recommendations the grower reviews, carried over from the Tool 1 OS shell.
- **Loop closure**. Showing predicted versus actual on a Recommendation after the relevant Invoice posts, the procurement analog of Terra's energy reconciliation.
- **Savings Attribution**. The clean, auditable method for proving a given saved dollar is the agent's doing and not the grower's own Dealer haggling. The named prerequisite for any gain-share billing (see §8 Open Questions, Monetization, and Constraints).
- **Gain-share**. The monetization model: Terra is paid only as a share of realized savings, free to start. Requires Savings Attribution before it can be billed.
- **Human-in-the-loop (HITL)**. The v1 default posture: the agent surfaces and recommends, the human decides. No autonomous action in v1.
- **Review queue**. The internal-ops work surface where the agent routes low-confidence work it should not guess: blurry or unreadable Invoice lines, units it cannot normalize, and ambiguous or non-machine-readable Rebate / Program Pricing terms. A Terra ops reviewer resolves the item (confirms the unit and quantity, normalizes the unit, or confirms the Rebate term), and the resolved value flows back into the pipeline. In v1 the review queue is internal-ops-only with no grower-facing SLA: the grower sees the affected line as "needs review" or "possible, needs confirmation" until it resolves, and is never shown a queue, a wait time, or a service commitment. This is the human side of the HITL posture and is distinct from the grower deciding on a Recommendation.

## 4. Features

*Each subsection is a coherent feature. FRs are numbered globally (FR-1 through FR-N). User journeys are referenced by ID inline. Glossary terms are used verbatim. POST-MVP features are in §4.10 and explicitly marked.*

### 4.1 Invoice ingestion and extraction

**Description:** The grower connects the agent by supplying historical Invoices through the lowest-possible-friction path: photo, PDF, or email forward, the same vision-read discipline Tool 1 uses for bill PDFs. The agent extracts SKUs, quantities, unit prices, totals, and any Rebate or Prepay lines, then attaches every line to the correct Ranch, Entity, and Account on Terra's shared data model. It never requires a Dealer login. Lines it cannot read confidently are marked "needs review" rather than guessed. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Ingest Invoices by photo, PDF, or email forward

A grower can submit one or more Invoices by photo, PDF upload, or email forward, and the agent extracts the structured lines. Realizes UJ-1.

**Consequences (testable):**
- Submitting a clear Invoice photo produces a structured record with SKU, quantity, unit, unit price, and total for each line.
- The system never prompts for or stores a Dealer or financial login credential at any point in ingestion.
- A line the agent cannot read with confidence above a defined threshold is flagged "needs review" and excluded from Market Band comparison until confirmed.
- Ingestion runs with zero external calls in development and test, against committed fixture Invoices.

#### FR-2: Attribute each Invoice line to Ranch, Entity, and Account

The agent can attach every extracted Invoice line to a Ranch, Entity, and Account on the shared data model. Realizes UJ-1, UJ-5.

**Consequences (testable):**
- Every ingested line resolves to exactly one Entity and one Account; a line that cannot be resolved is flagged for grower confirmation rather than silently dropped.
- Attribution reuses the Farm, Entity, Ranch/Block, and Crop records already present from Tool 1 for a grower who uses both tools.
- A grower can correct an attribution and the correction persists.

**Out of Scope:**
- Pulling Invoices directly from a Dealer system or portal (no Dealer integration in v1).

### 4.2 Crop-plan to Bill of Materials forecast

**Description:** The agent translates the Crop Plan (acres times crop times program times growth stage) into a per-product Bill of Materials and a buying calendar, so the grower sees what is coming before the Dealer order sheet arrives. The Crop Plan is net-new, not reused from Tool 1: Tool 1 models the farm's Blocks and Ranches but its `Crop` carries no program or growth stage, so v1 forecasts from a repeat-buy projection off prior-season Invoices first, with a net-new `CropProgram` ingestion as the later path to the full agronomic forecast ([architecture §4.6](../3-solutioning/architecture.md)). Realizes UJ-3.

**Functional Requirements:**

#### FR-3: Forecast a per-product Bill of Materials from the Crop Plan

The agent can derive a per-product Bill of Materials for the season from the Crop Plan. Realizes UJ-3.

**Consequences (testable):**
- Given a Crop Plan with acres, crop, program, and growth stage, the agent produces a Bill of Materials listing each forecast Input with a quantity and a target buying window.
- A Block with no Crop Plan data produces no forecast lines for that Block rather than a fabricated estimate.
- The forecast is recomputed when the Crop Plan changes.

#### FR-4: Present forecast buying windows and Prepay closes on a calendar

A grower can view each forecast Input's buying window and Prepay close on the Buy Window Calendar. Realizes UJ-3.

**Consequences (testable):**
- Each forecast line appears on a month grid with a buying window and, where applicable, a Prepay close date, color-coded.
- Each calendar entry carries one plain-language action line in operator English (no kW, no "SKU velocity," no surface jargon).
- The calendar is graspable on a phone screen without horizontal scrolling for a single Entity.

### 4.3 Per-unit same-Active-Ingredient normalization and Market Band

**Description:** The legibility engine and the trojan-horse feature. The agent normalizes every spend line to a per-unit, same-Active-Ingredient basis and compares it against a Market Band, showing "you paid $X per unit versus the band of $Y to $Z." It surfaces the Generic Equivalent where one exists. The v1 Market Band is single-grower, computed only from this grower's own normalized Invoices, with no cross-grower pooling and no network benchmark; where there are too few comparable points, the agent declares "no reliable band yet" rather than inventing one. Realizes UJ-1, UJ-3.

**Functional Requirements:**

#### FR-5: Normalize every line to a per-unit, same-Active-Ingredient basis

The agent can normalize each Invoice and forecast line to a per-unit price for its Active Ingredient. Realizes UJ-1.

**Consequences (testable):**
- Two SKUs carrying the same Active Ingredient resolve to the same Active Ingredient and are compared on the same per-unit basis.
- Unit conversions (for example gallons, pounds, ounces of active) are applied so per-unit prices are directly comparable.
- A line whose Active Ingredient cannot be resolved is excluded from band comparison and flagged, not force-matched.

#### FR-6: Compute and display a Market Band per Active Ingredient

A grower can see the Market Band (low, median, high) for each Active Ingredient they buy, with their own price shown against it. Realizes UJ-1, UJ-3.

**Consequences (testable):**
- The Market Band is computed only from this grower's own normalized Invoices and no other source: no cross-grower pooled prices, no published list prices, no scraped quotes, no third-party datasets contribute to the v1 band. The single-grower source basis is disclosed in the view, never presented as an audited network benchmark.
- An Active Ingredient with too few comparable points (from this grower's own Invoices alone) is labeled "no reliable band yet" and produces no Overpayment finding.
- The grower can open the underlying math for any band line and export it to CSV.

#### FR-7: Surface the Generic Equivalent where one exists

The agent can flag a Generic Equivalent for a branded line carrying the same Active Ingredient. Realizes UJ-3.

**Consequences (testable):**
- Where a branded SKU has a known Generic Equivalent for the same Active Ingredient, the agent surfaces it with the per-unit price difference.
- The agent does not quote, source, or order the Generic Equivalent (that is POST-MVP); it only surfaces the equivalence and the gap.

### 4.4 Overpayment flagging

**Description:** Where a grower's normalized per-unit price sits above the Market Band, the agent flags the Overpayment with the dollar gap, shown line by line and exportable. This is retrospective on past Invoices and forward on forecast lines against the Dealer order sheet. Realizes UJ-1, UJ-3.

**Functional Requirements:**

#### FR-8: Flag Overpayment against the Market Band

The agent can flag any line priced above the Market Band as an Overpayment with the dollar gap. Realizes UJ-1, UJ-3.

**Consequences (testable):**
- An Overpayment finding states the grower's per-unit price, the band, and the dollar impact, with the math openable line by line.
- No Overpayment is flagged on a line whose Active Ingredient has "no reliable band yet."
- Overpayment findings are surfaced as Recommendations (see FR-11) and never as advice without a dollar figure.

### 4.5 Rebate and Prepay audit

**Description:** The capability nobody builds for the grower today (it exists only Dealer-side, in tools like AgVend). The agent reconciles every Invoice against the Rebate tiers, thresholds, and early-fill milestones that apply and flags under-credited Rebates the grower is owed. It models Prepay timing against price risk and the working-capital window. Because manufacturer programs are idiosyncratic and not machine-readable, ambiguous program terms route to the internal Review queue (FR-17) and the audit assigns confidence rather than asserting a figure it cannot defend. Realizes UJ-2.

**Functional Requirements:**

#### FR-9: Audit Invoices against Rebate / Program Pricing and flag under-credited Rebates

The agent can reconcile ingested Invoices against the applicable Rebate tiers, thresholds, and early-fill milestones, and flag Rebates the grower earned but was not credited. Realizes UJ-2.

**Consequences (testable):**
- When ingested volume crosses a defined Rebate threshold and no corresponding credit appears on any Invoice, the agent produces an under-credited Rebate finding with the dollar amount and the threshold math.
- A program whose terms are ambiguous or not machine-readable produces a lower-confidence "possible, needs confirmation" finding routed to the internal Review queue (FR-17), never a confidently asserted dollar figure.
- Under-credited Rebate findings are surfaced as Recommendations (see FR-11).

#### FR-10: Model Prepay timing against the working-capital window

A grower can see a Prepay timing assessment for forecast Inputs, weighing early-order discount against the cash and counterparty risk of fronting payment. Realizes UJ-3.

**Consequences (testable):**
- For a forecast Input with a Prepay window, the agent presents the discount, the close date, and a plain-language note on the timing trade-off.
- The agent never instructs a Prepay purchase autonomously; it informs the grower's decision (HITL).

### 4.6 Buy recommendations in the Recommendation grammar

**Description:** Overpayment findings, under-credited Rebates, Generic Equivalent swaps, and Prepay-timing items all surface as Recommendations in Terra's existing grammar: situation, action, impactUsd, severity, a one-tap response, and an after-the-fact result once the Invoice posts. In v1 the Recommendation is display-only and human-in-the-loop; its `action` is shaped so it can later be executed, but v1 never executes it. After an Invoice posts, the agent closes the loop, showing predicted versus actual. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-11: Surface every finding as a Recommendation, display-only

The agent can express every Overpayment, under-credited Rebate, Generic Equivalent, and Prepay-timing finding as a Recommendation with situation, action, impactUsd or impactNote, severity, and a one-tap response. Realizes UJ-1, UJ-2, UJ-3.

**Consequences (testable):**
- Every Recommendation conforms to the grammar `{ id, farmId, tool, situation, action, impactUsd?, impactNote?, severity, status, createdAt, resolvedAt?, result? }`.
- The one-tap response sets status to done, dismissed, or overridden; v1 never performs a purchase or any external action from the tap.
- Recommendations appear in the Findings rail carried over from the Tool 1 OS shell.
- The `action` field is structured so a future version could execute it, but v1 execution paths are absent.

#### FR-12: Close the loop with predicted versus actual after the Invoice posts

The agent can show predicted versus actual on a Recommendation once the relevant Invoice posts. Realizes UJ-2, UJ-3.

**Consequences (testable):**
- When a later Invoice relevant to an acted-on Recommendation is ingested, the agent records the actual outcome and fills the Recommendation `result`.
- A Recommendation marked done without a posted Invoice remains open for Loop closure and counts only toward identified savings (SM-1), never toward attributed realized savings (SM-1b).
- Loop closure produces the line-level traceability that the attributed realized savings figure (SM-1b) depends on.

### 4.7 Cross-entity spend-versus-budget

**Description:** A Batth-scale operation has Input spend fragmented across many Accounts, Dealers, Ranches, and Entities with no single ledger, the identical multi-entity legibility problem Terra solves for energy. The agent gives one legible view of forecast spend plus Committed spend against the Spend Budget across every Entity and Account, in the Spend Table and a spend-versus-budget summary, exportable to CSV. Realizes UJ-1, UJ-5.

**Functional Requirements:**

#### FR-13: Show spend across every Entity, Account, Ranch, and Dealer in the Spend Table

A grower can view all Input spend in the Spend Table, filterable by Entity, Ranch, Dealer, and Active Ingredient, with one-click CSV export. Realizes UJ-1, UJ-5.

**Consequences (testable):**
- The Spend Table shows SKUs down, months across, charges in cells, and stays usable (filterable) at 180-plus lines across many Entities and Accounts.
- Every cell traces to its underlying Invoice line.
- One click exports the current filtered view to CSV.

#### FR-14: Track forecast spend and Committed spend against the Spend Budget per Entity

A grower can set or review a Spend Budget per Entity and see forecast spend plus Committed spend tracked against it across all Entities. Realizes UJ-5.

**Consequences (testable):**
- For each Entity with a Spend Budget set, the view shows forecast spend plus Committed spend against budget and flags over-budget Entities.
- A line counts as Committed spend only at its obligating event (a signed Dealer order sheet line, an accepted Prepay, or a posted Invoice not yet in a closed budget period), per the Glossary; a still-projected Bill of Materials line counts as forecast spend, not Committed spend.
- An Entity with no Spend Budget shows spend with budget marked "not set" rather than a fabricated target.
- Over-budget findings attribute the overage to the driving Ranches and Dealers.

### 4.8 Advisor visibility

**Description:** The PCA and Dealer rep sit in the trusted-advisor circle nearly 100 percent of the time and the PCA is the legal gatekeeper for crop-protection recommendations. The agent arms this circle: the grower can grant a PCA read-only visibility into the Spend Table, Findings, and Recommendations, scoped to chosen Entities, revocable at any time. The advisor confirms or disputes flagged lines, feeding the retrospective accuracy signal. Realizes UJ-4.

**Functional Requirements:**

#### FR-15: Grant a PCA read-only, Entity-scoped advisor visibility

A grower can grant a PCA read-only visibility into the Spend Table, Findings, and Recommendations for chosen Entities, and revoke it at any time. Realizes UJ-4.

**Consequences (testable):**
- A granted PCA sees the same Spend Table, Findings, and Recommendations the grower sees, limited to the shared Entities.
- The PCA cannot edit data, set a Spend Budget, or act on a Recommendation; visibility is strictly read-only in v1.
- Revoking visibility ends the PCA's access immediately and leaves the PCA no retained copy of the grower's data.

#### FR-16: Let an advisor confirm or dispute a flagged line

A PCA with visibility can mark a flagged Overpayment or Rebate finding as confirmed-true or disputed. Realizes UJ-4.

**Consequences (testable):**
- A confirm or dispute action is recorded against the specific finding and is visible to the grower.
- Confirmations and disputes feed the retrospective accuracy metric (SM-2).

### 4.9 Human-in-the-loop review queue

**Description:** The agent does not guess work it cannot do confidently. Three kinds of low-confidence work route to an internal Review queue: blurry or unreadable Invoice lines (FR-1), lines whose unit cannot be normalized (FR-5), and ambiguous or non-machine-readable Rebate / Program Pricing terms (FR-9). A Terra ops reviewer resolves the item and the resolved value flows back into the pipeline. This is the human side of the HITL posture and is a different kind of work (internal ops labor) from the rest of the legibility engine. In v1 it is internal-ops-only: there is no grower-facing queue surface, wait time, or SLA. The grower only ever sees the affected line marked "needs review" or "possible, needs confirmation" until it resolves. Realizes the UJ-1 and UJ-2 edge cases.

**Functional Requirements:**

#### FR-17: Route low-confidence lines and ambiguous Rebate terms to a human-in-the-loop Review queue

The agent can route a low-confidence Invoice line, an un-normalizable unit, or an ambiguous Rebate term to the internal Review queue, hold the affected finding out of any asserted dollar figure until a reviewer resolves it, and feed the resolved value back into the pipeline. Realizes the UJ-1 and UJ-2 edge cases.

**Consequences (testable):**
- A line flagged "needs review" (FR-1), an un-normalizable unit (FR-5), or an ambiguous Rebate term (FR-9) creates a Review queue item and does not produce a Market Band comparison or an asserted Rebate dollar figure until it resolves.
- A reviewer resolution (confirmed unit and quantity, normalized unit, or confirmed Rebate term) writes the resolved value back to the line, which then re-enters normalization or the Rebate audit.
- The Review queue is internal-ops-only in v1: no grower-facing queue surface, wait time, or SLA is shown. The grower sees only the line state ("needs review" or "possible, needs confirmation") until resolution.
- A pending Review queue item is never counted toward identified savings (SM-1) or attributed realized savings (SM-1b), and is never surfaced as a confidently asserted Recommendation.

**Out of Scope:**
- A grower-facing review surface, self-service confirmation flow, or any service-level commitment on review turnaround (v1 is internal-ops-only).

### 4.10 POST-MVP features (explicitly not in v1)

*Named here so downstream readers see the destination and never mistake it for v1 scope. None of these ship in the first version. The `action` field of the Recommendation grammar is shaped to support them later.*

- **Live cross-supplier scouting.** Pulling live quotes across local Dealers, Co-ops, and Generic Equivalent channels and lining them up in the same per-unit terms, with the grower's existing Dealer invited to quote. Ships only as supplier participation density is earned. **[NON-GOAL for MVP]**
- **Agentic negotiation and RFQ / reverse auction.** Firing RFQs and negotiating the long tail on a Gain-share basis (the Pactum-style capability, proven elsewhere, never built for the farm). **[NON-GOAL for MVP]**
- **Auto-PO and delivery tracking.** Preparing a one-tap purchase order bounded by grower-set dollar caps, visible to the PCA, with delivery tracked to the Ranch, riding agentic-commerce rails. **[NON-GOAL for MVP]**
- **Attached crop-cycle financing.** Harvest-timed terms and Prepay financing. **[NON-GOAL for MVP]**
- **True delegated auto-buy.** The agent buying within a cap the grower sets, a later setting earned only after retrospective accuracy is proven and the loop is closed enough times, bounded by dollar caps and advisor visibility when it ships. **[NON-GOAL for MVP]**
- **Cross-grower price pooling and a public crowdsourced price benchmark beyond the grower's own normalized spend.** Pooling anonymized per-unit prices across growers into a network Market Band, and any public crowdsourced benchmark built on it. Requires network density that does not exist on day one, and a disclosed privacy boundary (see Data Governance). The v1 Market Band stays single-grower (FR-6). **[NON-GOAL for MVP]**

## 5. Non-Goals (Explicit)

- The agent is **not a store**. v1 does not sell, source, quote, or order any Input. The independent non-seller position is a load-bearing brand promise, not a temporary state.
- The agent does **not negotiate** in v1. No RFQ, no reverse auction, no Gain-share negotiation.
- The agent does **not transact or auto-buy** in v1. Every Recommendation is display-only and human-in-the-loop; no purchase, payment, or external action fires from any tap.
- The agent is **not a Dealer-side SaaS**. It does not help the Dealer capture Rebates (that is AgVend's lane); it audits Rebates for the grower.
- The agent does **not require a Dealer login or store any Dealer or financial credential** the system or the team can read. Ever.
- The agent does **not claim a verified savings number it cannot trace line by line, and does not call identified (pre-action) savings "verified"**. "Verified" is reserved for the loop-closed, attributable subset (SM-1b). No vendor headline; every number is built from the grower's own Invoices.
- The agent does **not bill Gain-share in v1**, because clean Savings Attribution is not yet solved (see §8). v1 is free.
- The agent does **not lead with fuel** or target equipment parts and repair; those are surfaced for completeness or deferred (§4.10, market research §3.4).
- The agent does **not serve Midwest row crops** in v1 (§2.2).

## 6. MVP Scope

### 6.1 In Scope

- Ingest historical Invoices by photo, PDF, or email forward, with vision extraction, zero external calls against fixtures (FR-1).
- Attribute every Invoice line to Ranch, Entity, and Account on the shared data model (FR-2).
- Forecast a per-product Bill of Materials and Buy Window Calendar from the Crop Plan (FR-3, FR-4).
- Normalize every line to a per-unit, same-Active-Ingredient basis and compute a Market Band (FR-5, FR-6).
- Surface the Generic Equivalent where one exists (FR-7).
- Flag Overpayment against the Market Band (FR-8).
- Audit Invoices against Rebate / Program Pricing and flag under-credited Rebates; model Prepay timing (FR-9, FR-10).
- Surface every finding as a display-only Recommendation in the grammar and close the loop predicted-versus-actual after Invoices post (FR-11, FR-12).
- Cross-entity Spend Table and spend-versus-budget tracking, exportable to CSV (FR-13, FR-14).
- PCA read-only, Entity-scoped advisor visibility with confirm/dispute (FR-15, FR-16).
- An internal-ops-only human-in-the-loop Review queue for low-confidence Invoice lines, un-normalizable units, and ambiguous Rebate terms, with no grower-facing surface or SLA (FR-17).
- Mobile-first, plain operator English, the three-views discipline (Buy Window Calendar, Spend Table, Price Band Chart).

### 6.2 Out of Scope for MVP

- Live cross-supplier scouting and real-time quoting. Deferred to a later version; requires earned supplier participation density. **[NOTE FOR PM: this is the headline of the name; we must keep internal messaging honest that v1 is legibility plus audit, not an autonomous buyer.]**
- Agentic negotiation, RFQ, and reverse auction. Deferred; depends on scouting density and trust.
- Auto-PO generation and delivery tracking. Deferred; depends on supplier catalogs becoming machine-readable and on agentic-commerce rails.
- Attached crop-cycle financing and harvest-timed terms. Deferred; avoid the balance-sheet-heavy lending trap on day one.
- True delegated auto-buy. Deferred; earned only after retrospective accuracy is proven and the loop is closed, and only with dollar caps and advisor visibility.
- Cross-grower price pooling and a public crowdsourced price benchmark beyond the grower's own normalized spend. Deferred; needs network scale that does not exist on day one. The v1 Market Band stays single-grower (FR-6).
- Gain-share billing. Deferred until Savings Attribution is solved (§8); v1 is free.
- Dealer system or portal integrations. Deferred; v1 runs on grower-supplied Invoices.

## 7. Success Metrics

*Each SM cross-references the FRs it validates. Counter-metrics counterbalance specific primary metrics so we do not optimize the wrong thing.*

**Primary**

- **SM-1: Identified savings (potential, pre-action).** A per-farm figure of savings the agent surfaced but that are not yet realized or attributed: Overpayment versus the Market Band plus flagged under-credited Rebates, traceable line by line. This is the v1 deliverable. It is explicitly potential, not banked: the grower may already have haggled to that price, or may never act, so this number must never be labeled "verified" or read as attributed and bankable. Target: a defensible identified-savings number on every onboarded farm, built from the grower's own Invoices, not a vendor headline estimate. Validates FR-6, FR-8, FR-9, FR-11.
- **SM-1b: Attributed realized savings (loop-closed, the verified subset).** The subset of identified savings (SM-1) that both closes the loop after the Invoice posts (FR-12) and can be cleanly attributed to the agent rather than the grower's own Dealer haggling. Under-credited Rebate recovery (the agent found a missed credit) is the cleanly attributable case; Overpayment-versus-band is only counted here once attribution is solved (§8, #1). This is the only figure that earns the word "verified," and it is the future Gain-share basis. Target: grows as a share of SM-1 as the loop closes; small and honest before attribution is solved, never inflated by counting pre-action Overpayment. Validates FR-9, FR-12.
- **SM-2: Retrospective accuracy.** The confirmed-true rate on flagged Overpayment and Rebate lines, as confirmed by the grower or PCA, with a low false-positive rate. Target: a high confirmed-true rate, low enough false positives that the grower keeps trusting the flags. Validates FR-8, FR-9, FR-16.
- **SM-3: Activation.** Time from connecting a source (first Invoice ingested) to a legible Spend Table and the first dollar finding. Target: spend made legible and a first finding surfaced the same day a source is connected. Validates FR-1, FR-2, FR-13, FR-11.
- **SM-4: Loop closure.** The share of acted-on Recommendations that receive an after-the-fact predicted-versus-actual result once the Invoice posts. Target: every acted-on Recommendation gets a Loop closure result. Validates FR-12.

**Secondary**

- **SM-5: Coverage.** The share of a farm's Input spend correctly attributed across every Ranch, Entity, and Account, so legibility holds at Batth scale. Target: full attribution coverage with unresolved lines flagged, not dropped. Validates FR-2, FR-13.
- **SM-6: Advisor engagement.** The share of onboarded farms where a PCA accepts advisor visibility and confirms or disputes at least one finding. Target: meaningful PCA participation, evidence the arm-the-advisor posture works. Validates FR-15, FR-16.

**Counter-metrics (do not optimize)**

- **SM-C1: Do not inflate savings by gaming the Market Band.** Watch the gap between SM-1 (identified, pre-action savings) and SM-1b (attributed realized savings), tracked alongside SM-4 (Loop closure). A widening gap that does not convert to attributed realized savings means we are flagging Overpayment against a band set artificially high or on thin data, or claiming savings the grower never actually banked. Counterbalances SM-1. We would rather report a smaller, true number than a larger, gamed one. The word "verified" is reserved for SM-1b. An Active Ingredient with too few points must stay "no reliable band yet" (FR-6) and must not generate identified-savings claims.
- **SM-C2: Do not chase activation speed at the cost of accuracy.** Watch the false-positive rate inside SM-2 as SM-3 (same-day activation) is pushed. Surfacing a fast finding that the grower or PCA disputes burns the trust the whole product runs on. Counterbalances SM-3.
- **SM-C3: Do not let Recommendation volume become the goal.** Count of Recommendations is not a success metric. A flood of low-confidence findings degrades trust. Counterbalances any temptation to optimize FR-11 by volume.

## 8. Open Questions

1. **Savings Attribution method (the load-bearing unknown).** How do we prove, cleanly and auditably, that a given saved dollar is the agent's doing and not the grower's own Dealer haggling? This is the prerequisite for any Gain-share billing and gates the entire monetization model. It must be designed and defensible before we bill anyone. v1 exists in part to build the retrospective, invoice-level track record that makes clean attribution possible.
2. **Per-acre savings assumption.** The 5 to 10 percent capture of the roughly $800/acre fertilizer-and-crop-protection line is directional ([market research, §2.5](../1-analysis/market-research.md)). Validate it against real Batth-shaped Invoices and replace the estimate with a measured number.
3. **Market Band credibility on thin data.** With only the grower's own normalized Invoices feeding the v1 band, how many comparable points are needed before a band is "reliable"? Where is the line that keeps SM-C1 honest? (This thin-data constraint is also the reason cross-grower pooling is on the POST-MVP roadmap, §4.10.)
4. **Review queue cost-to-serve.** Manufacturer programs are idiosyncratic and not machine-readable, so the Rebate audit leans on the internal Review queue (FR-17) early, alongside blurry-Invoice and unit-normalization review. The staffing and cost of that internal ops work is not yet sized; size it before scaling, and keep the queue bounded and measured.
5. **PCA reception of the arm-the-advisor posture.** Pressure-test with two or three real growers and their PCAs that read-only advisor visibility is welcomed, not seen as surveillance.
6. **Invoice extraction accuracy at scale.** What confidence threshold (FR-1) cleanly separates "structured" from "needs review" across messy, inconsistent Dealer Invoice formats?
7. **Crop Plan is net-new, not reused from Tool 1.** The "Crop Plan" the Bill of Materials forecast (FR-3) depends on does not exist in the shared schema yet. Tool 1's `Crop` is minimal (`id`, `name`, `cropCoefficient`, `blocks`, `ranches`, `pumps`), with no program and no growth stage, so there is nothing to reuse and the forecast has no `program` or `growth stage` to read ([architecture §4.6](../3-solutioning/architecture.md)). The open question is therefore not "how complete must the Crop Plan be," it is which path v1 takes: (a) a net-new `CropProgram` model plus a grower-supplied ingestion step (the full agronomic forecast), or (b) a repeat-buy projection from prior-season Invoices first. Architecture §4.6 recommends shipping (b) first and treating (a) as the later path. Either way, a Block with no source data produces no forecast line.

## 9. Assumptions Index

*Every inferred-without-confirmation assumption, surfaced for explicit confirmation. Estimates carried from the source documents are labeled there; these are the PRD's own structural assumptions.*

- From §2.3 / §4: a v1 grower has historical Invoices present in Terra. The Crop Plan, by contrast, is net-new and not reused from Tool 1: Tool 1's `Crop` model is minimal and carries no program or growth stage, so v1 either models a net-new `CropProgram` with a grower-supplied ingestion step or, per the recommended path, scopes the forecast to a repeat-buy projection from prior-season Invoices first ([architecture §4.6](../3-solutioning/architecture.md), §8 #7). A grower with no Invoices cannot be served by the v1 retrospective engine (§2.2).
- From §3 Glossary / §4.3: the v1 Market Band is single-grower, computed only from this grower's own normalized Invoices, with no cross-grower pooling and no network benchmark, and this is disclosed in the view. Cross-grower pooling and any public benchmark are POST-MVP (§4.10).
- From §4.5 / FR-9 / §4.9 / FR-17: ambiguous, non-machine-readable Rebate programs route to the internal-ops-only Review queue and produce lower-confidence findings rather than asserted dollar figures. The Review queue is a real v1 build (internal ops, no grower-facing SLA), and its cost-to-serve is unsized (§8, #4).
- From §4.6 / FR-11: the Recommendation `action` field is shaped to be executable later, but v1 contains no execution path.
- From §4.8 / FR-15: PCA advisor visibility is read-only and Entity-scoped in v1; the PCA is never a paying seat-holder or approver.
- From §6 / §7: Gain-share is not billed in v1; v1 is free, pending the Savings Attribution method (§8, #1).
- From §2.1: the per-acre savings range and capture rate are directional estimates from the market research, to be replaced by a measured number (§8, #2).
- From the Platform cluster: v1 ships inside the existing Terra Next.js app on the shared data model, reusing the Tool 1 OS shell, Findings rail, and credential discipline.

---

## Adapt-In Clusters

### Why Now

Timing is load-bearing and favorable on five fronts at once ([market research, §2.1](../1-analysis/market-research.md); [clone target, Why Now](../0-research/clone-target-and-ai-thesis.md)):

- **Margins are negative,** so willingness to act on savings is at a peak. Net farm income fell about 22 percent from 2022 to 2024, and 2025 per-acre margins went negative for every major row crop ([AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). Almond net returns above total cost swung from +$205/acre (2019) to roughly a $4,280/acre loss (2024) ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)); that loss is net return against the full roughly $5,000 to $6,500/acre cost base, not the inputs line alone (see §1 Vision), and the agent works only the roughly $800/acre input slice within it.
- **Working capital is strained,** so timing and Rebate dollars matter more. 2025 operating loans ran roughly 30 percent larger year over year, first-year interest up 70 to 90 percent, and Chapter 12 bankruptcies hit 315, up 46 percent ([KC Fed](https://www.kansascityfed.org/agriculture/agfinance-updates/larger-operating-loans-boost-farm-lending-activity-in-2025/)).
- **FBN is contracting** out of the specialty lane (2023 to 2025 layoffs, exited international, dropped seed/livestock/fertilizer lines), leaving the specialty segment and the independent non-seller position open.
- **Agentic-commerce rails are arriving** (ACP, Visa and Mastercard agent payments, Ever.Ag freight agents), which makes the POST-MVP auto-PO and delivery legs buildable when their turn comes, even though they are not in v1.
- **A policy tailwind:** a bipartisan Fertilizer Transparency Act would force USDA to publish weekly prices, validating the transparency thesis at the policy level ([Agri-Pulse](https://www.agri-pulse.com/articles/24432-house-bill-aims-to-provide-fertilizer-price-transparency)).

### Monetization

- **Model:** Gain-share, paid only as a share of realized savings, free to start. It removes the single biggest adoption blocker in this segment, "prove the ROI before I pay," because there is no ask until savings are proven ([market research, §5.3](../1-analysis/market-research.md)).
- **The attribution prerequisite:** Gain-share cannot be honestly billed until Savings Attribution is solved (§8, #1). A clean, auditable method to prove a saved dollar is the agent's doing and not the grower's own Dealer haggling is a gate on the entire revenue model, not a detail to settle later. v1 is therefore free and exists in part to build the retrospective, invoice-level track record that makes clean attribution possible.
- **v1 stance:** No billing. v1 audits past Invoices for free and shows the identified savings it would have surfaced (SM-1), and closes the loop predicted-versus-actual (SM-4) to build the attributed, realized number (SM-1b) that a future Gain-share would bill on.
- **Later rails (POST-MVP):** transaction or financing spread, pooled Rebate capture (the GPO mechanic), and private-label margin, all opt-in, with Gain-share staying the core. Avoid the thin-margin trap: lead with software legibility and savings, never balance-sheet-heavy logistics or lending on day one.

### Platform

- **Mobile-first web,** the farmer on a phone in a truck. Next.js (App Router) + TypeScript (strict) + Tailwind, on the existing Terra app, Prisma + Postgres.
- **Terra Tool 2 on the shared data model.** Reuses Farm, Entity, Ranch/Block, Pump (meter), Crop, and the Recommendation grammar, which already supports an Input purchase order as a future `action` type. Clean boundaries (pure logic in `/lib`, a clear data model, a UI layer) so the eventual monorepo move stays mechanical, per [CLAUDE.md](../../../CLAUDE.md).
- **Reuse the Tool 1 OS shell:** the persistent Findings rail, the three-views discipline, the credential discipline, and the value-honest connect-a-source onboarding.
- **Zero external calls in dev and test,** against committed fixture Invoices and a Batth-shaped seed.

### Information Architecture

The three-views discipline carried directly from Tool 1, same data, simplest first:

- **Buy Window Calendar (home).** Each forecast Input's buying window and Prepay close on a month grid, color-coded, with one plain-language action line. Graspable in seconds (FR-4).
- **Spend Table (Excel-style).** SKUs down, months across, charges in cells, filterable by Entity, Ranch, Dealer, and Active Ingredient, one-click CSV export. The bridge for the Excel-brained grower, usable at 180-plus lines (FR-13, FR-14).
- **Price Band Chart.** Per-unit price history and the Market Band over time, behind a tap (FR-6).
- **Findings rail.** The persistent list of pending Recommendations, carried from the Tool 1 OS shell (FR-11).

The data hero leads (the farm and its spend known at a glance). Money is the story but not a lone screaming hero number; values use tabular figures. Plain operator English throughout (blocks, sets, acres, Dealers, Ranches, pumps), never "SKU velocity" or surface jargon. No exclamation marks, no em dashes in user-facing copy, all copy in `/copy` for localization.

### Constraints and Guardrails

**Safety:**
- Human-in-the-loop by default in v1: the agent surfaces and recommends, the human decides. No autonomous action, no purchase, no payment fires from any tap (FR-11).
- When auto-buy ships (POST-MVP), it is bounded by grower-set dollar caps and advisor visibility, and is a later setting earned by proven retrospective accuracy and closed loops, never the day-one default.
- Findings carry confidence; ambiguous Rebate terms and thin Market Bands are labeled, not asserted (FR-6, FR-9), so the agent never claims a dollar it cannot defend.

**Privacy:**
- Never store a Dealer or financial (or utility) credential anywhere the system, the repo, or the team can read it, the Tool 1 discipline carried straight over. v1 requires no Dealer login (FR-1).
- The grower's Invoices and Crop Plan are used to do the grower's work. The v1 Market Band is single-grower (the grower's own Invoices only); no cross-grower pooling happens in v1. If pooling of anonymized per-unit prices is introduced POST-MVP (§4.10), it will be disclosed plainly and bounded so that anything identifying the farm is never pooled, never shown to another grower with the grower's name, and never sold to a Dealer or manufacturer.
- PCA advisor visibility is read-only, Entity-scoped, and revocable, leaving no retained copy on revoke (FR-15).

**Cost:**
- Lead with software-and-savings, not a logistics or lending balance sheet. The Rebate Audit in particular is high-leverage, find-once, low-cost-to-serve.
- The internal-ops-only Review queue for idiosyncratic Rebate programs, blurry Invoices, and unit normalization (FR-17) carries a real cost-to-serve that is not yet sized (§8, #4); keep it bounded and measured before scaling.

### Risk and Mitigations

| Risk | Severity | Evidence | Mitigation |
|---|---|---|---|
| **Channel conflict** with Dealers and Co-ops | High | Big Seven control ~70 percent; FBN faced incumbent hostility ([CropLife](https://www.croplife.com/management/marketingrebate-programs/)) | We are not a seller. v1 leads with the two capabilities that deliver dollars without any Dealer cooperating: legibility on the grower's own Invoices and the grower-side Rebate and Prepay audit. POST-MVP scouting invites the existing Dealer to quote, arming not bypassing. |
| **Trust to delegate spend** | High | Only ~27 percent trust autonomous AI payments (cross-industry, estimate); 53 percent of NA farmers need clear ROI first ([McKinsey](https://www.mckinsey.com/industries/agriculture/our-insights/global-farmer-insights-2024)) | HITL by default; prove retrospective accuracy, then close the loop, then offer one-tap with caps (POST-MVP); auto-buy last and earned. |
| **Data access** | Medium-High | Model needs Invoices and the Crop Plan; FBN data-distrust complaint documented | One-step onboarding (forward or photo Invoices); no Dealer login; never store credentials; radically clear data-use framing. |
| **Supplier liquidity / network density** | Medium | Scouting value depends on Dealer density, thin for CA specialty | Decouple value from the marketplace: v1 legibility and Rebate Audit produce dollars with zero suppliers in network. Build the live-quote layer (POST-MVP) where grower density is highest. |
| **Thin-margin trap** | Medium | Indigo (~94 percent markdown, disputed, estimate), Silo lending blowup ([AgFunder](https://agfundernews.com/no-comment-from-indigo-ag-on-valuation-nose-dive-report)) | Lead with software legibility and Gain-share, not balance-sheet-heavy logistics or lending; stay capital-disciplined. |
| **Savings Attribution unsolved** | High | Gain-share billing depends on it; not yet specified | Do not bill in v1. Build the retrospective, invoice-level, loop-closed track record (FR-12) that makes clean attribution possible; treat attribution as a gating Open Question (§8, #1). |
| **Soft, unaudited market numbers** | Medium | Every FBN/Wexus savings figure is vendor self-reported ([AgWeb](https://www.agweb.com/news/business/fbn-releases-its-2024-ag-chemical-price-transparency-report)) | Build Terra's own provable retrospective number from real Invoices before making any claim; SM-C1 guards against gaming the band. |

### Data Governance

- **What v1 holds:** the grower's Invoices, extracted Input lines, the Crop Plan, the derived Bill of Materials, normalized per-unit prices, the Market Band, Recommendations, Spend Budgets, and PCA visibility grants. All attached to the shared data model (Farm, Entity, Ranch/Block, Account).
- **What is never held:** Dealer, financial, or utility credentials in any form the system, repo, or team can read.
- **Pooling and anonymization:** v1 does no cross-grower pooling. The v1 Market Band is single-grower, computed only from the grower's own normalized Invoices (FR-6). If anonymized per-unit-price pooling is introduced POST-MVP (§4.10), only anonymized per-unit prices may contribute, nothing identifying the farm is pooled, shown to another grower with the grower's name, or sold, and the pooling boundary is disclosed to the grower.
- **Advisor data:** PCA visibility is read-only, Entity-scoped, revocable, with no retained copy on revoke (FR-15).
- **Export and portability:** the grower's data is theirs and exportable to a spreadsheet at any time (FR-13 CSV export), no lock-in.
- **Retention:** retain the grower's Invoices and derived records for as long as needed to keep the Spend Table legible and to close loops on prior-season Recommendations; provide deletion on request. **[NOTE FOR PM: confirm a concrete retention window and a deletion SLA before launch.]**
- **Dev and test discipline:** all development and testing run against committed fixture Invoices and a Batth-shaped seed, zero external calls, no real grower credentials in the repo.
