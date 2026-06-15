---
title: Market Research
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Market Research: Terra Purchasing Agent

**Date:** 2026-06-14
**Author:** Jaiyen
**Research Type:** Market Research
**Subject:** Terra Purchasing Agent, the farmer-side AI input-procurement agent (Terra Tool 2)

---

## Research Overview

This is the formal BMAD market-research artifact for the Terra Purchasing Agent: an AI-native, farmer-side input-procurement agent for California specialty and permanent-crop growers, beachhead almonds and tree nuts. The agent ingests a farm's crop and irrigation plan plus its historical input invoices, forecasts a per-product bill of materials and buying calendar, makes every line of input spend legible against a normalized per-unit market band, scouts live prices across dealers and co-ops and generic-equivalent channels, audits manufacturer rebates and prepay contracts against actual invoices, negotiates on the grower's behalf on a gain-share basis, and prepares a one-tap, human-approved purchase order with delivery tracking and spend-versus-budget control across every entity and account. It is Terra's Tool 2 (Tool 1 is the PG&E energy tool), sold to the same customer on the same shared data model.

This report builds on, and does not merely repeat, the three 0-research source documents (`market-and-customer-research.md`, `clone-target-and-ai-thesis.md`, `competitor-landscape-and-teardown.md`). It restructures their findings into the BMAD market-research template: customer behavior and segments, customer pain points and needs, jobs-to-be-done and decision processes, a competitive analysis matrix, and a bottom-up TAM/SAM/SOM build with explicit assumptions. Every source citation from the research files is preserved. Figures labeled "(estimate)" are forecasts, advocacy-group estimates, vendor self-reports, or inferences from adjacent data, not verified primary facts.

The headline: inputs are the largest controllable cost on a farm, the procurement system is opaque by design, margins went negative in 2025, and the one position no incumbent occupies is the grower's independent, conflict-free buying agent. The detailed synthesis and strategic recommendations are in Section 5 and the Research Synthesis section near the end.

---

## Executive Summary

Crop inputs are where the controllable money lives and where it is hardest to see. Combined crop inputs (chemicals, fertilizer, seed) were $72.2B, or 28.6 percent of crop farms' total 2024 expenses ([AFBF / USDA NASS](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)); for corn, seed plus chemicals plus fertilizer is roughly 73 percent of operating cost ([Southern Ag Today](https://southernagtoday.org/2025/07/07/recent-trends-in-farm-operating-costs/)). The all-farm input line items sum to roughly $83B (fertilizer/lime $33.8B, seeds and plants $27.4B, ag chemicals $21.7B), and adding fuel brings the input-and-energy envelope to roughly $99B ([USDA NASS Farm Production Expenditures 2024](https://esmis.nal.usda.gov/sites/default/release-files/qz20ss48r/w6636271r/9p292904f/fpex0725.pdf)).

The timing is forced. Input prices sit 20 to 40 percent above pre-2021 levels (seed +18 percent, chemicals +25 percent, fuel +31 percent, fertilizer +37 percent) while commodity prices fell roughly 50 percent from 2022 peaks, pushing every major row crop to a negative 2025 per-acre margin (corn -$169, cotton -$379, soybeans -$114) and net farm income down about 22 percent from 2022 to 2024 ([AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). Working capital is strained in parallel: 2025 operating loans averaged about 30 percent larger year over year, first-year interest rose 70 to 90 percent, and Chapter 12 bankruptcies hit 315, up 46 percent ([KC Fed](https://www.kansascityfed.org/agriculture/agfinance-updates/larger-operating-loans-boost-farm-lending-activity-in-2025/)). In a negative-margin year, a few points off procurement is the difference between loss and breakeven, which is exactly when a savings tool gets adopted.

The procurement system is opaque by design. Seven companies control roughly 70 percent of crop inputs and services, and retail economics run on manufacturer rebates and program pricing rather than transparent list-minus-margin ([CropLife](https://www.croplife.com/croplife-top-100/the-big-seven-of-the-croplife-100-the-evolution-of-americas-largest-ag-retailers/)). The "real" net price only emerges after year-end rebates and negotiation, so quotes cannot be compared cleanly, and pricing is deliberately tiered by farm size and sophistication. FBN's transparency work claims up to 283 percent (2023) and 468 percent (2024) price variation for the same chemistry between farmers and a roughly 15 percent average list-to-paid gap (FBN-sourced, directional, not independently audited) ([AgWeb](https://www.agweb.com/news/business/fbn-releases-its-2024-ag-chemical-price-transparency-report)).

The honest competitive correction: AI is not absent from ag-input buying, but a farmer-side autonomous purchasing agent is. FBN shipped an LLM advisor ("Norm," GPT-3.5) in April 2023 and raised $50M in July 2025 to expand it ([DigitalCommerce360](https://www.digitalcommerce360.com/2025/07/28/farmers-business-network-fbn-50-million-funding-ai/)). What does not exist anywhere is an agent that forecasts a bill of materials from the crop plan, scouts live cross-supplier quotes, audits the rebate stack for the grower, negotiates, and prepares the purchase order. General agentic procurement is proven (Pactum has autonomously negotiated $8B+ for Walmart and Maersk on a gain-share fee) ([Thunderbird/ASU](https://thunderbird.asu.edu/thought-leadership/journals-case-series/case-series-listing/pactums-ai-contract-negotiations)); it has simply never been built for the farm.

The recommended beachhead is California specialty and nut growers, almonds first. They carry the largest absolute input bills, took the deepest 2024 losses (almond net returns swung from +$205/acre in 2019 to a roughly $4,280/acre loss in 2024) ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)), are systematically under-served by row-crop-centric platforms, and are the exact customers Terra already reaches through its energy tool. The defensible go-to-market is legibility first, human-in-the-loop, with one-tap approval and dollar caps: prove retrospective savings on real invoices, close the predicted-versus-actual loop, and earn the right to act before ever defaulting to autonomous buying.

## Table of Contents

- 1. Market Research Introduction and Methodology
- 2. Market Analysis and Dynamics (TAM / SAM / SOM)
- 3. Customer Insights and Behavior Analysis (Segments, Behavior, Pain Points, Jobs-to-be-Done, Switching Triggers)
- 4. Competitive Landscape and Positioning (Competitive Analysis Matrix)
- 5. Strategic Market Recommendations
- 6. Go-to-Market and Sequencing
- 7. Risk Assessment and Mitigation
- 8. Research Synthesis and Key Findings
- 9. Methodology, Sources, and Confidence
- 10. Appendices and Data Tables

---

## 1. Market Research Introduction and Methodology

### 1.1 Why this research, now

Inputs are the largest controllable cost on a US farm, and in 2025 they are squeezing growers from both ends: prices paid stuck 20 to 40 percent above pre-2021 levels while prices received collapsed roughly 50 percent from 2022 peaks ([AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). When margins go negative, willingness to act on procurement savings peaks. At the same time, the buying system gives the farmer no leverage: there is no public real-time price benchmark, the channel is consolidated and rebate-driven, and the "real" net price is hidden until year-end. That combination, an acute, dollar-quantifiable pain plus a structurally opaque market, is the textbook setup for a legibility-first tool, the same thesis Terra already proved on PG&E energy.

### 1.2 Scope

- **Product under study:** Terra Purchasing Agent, a farmer-side AI procurement agent (clone-and-beat target: Farmers Business Network).
- **Geographic focus:** California, beachhead almonds and tree nuts, expanding to broader high-value California specialty crops. National figures are used as anchors where California-specific data does not exist.
- **Customer:** the farm owner / decision-maker and their circle of trusted advisors (PCA, dealer rep), at Batth scale (roughly 183 meters, 57 PG&E accounts, 6 legal entities) and down.
- **Business purpose:** product development and market entry for Terra's Tool 2.
- **Out of scope:** detailed product spec (lives in the PRD), and any reliance on live grower credentials (research and fixtures only, per Terra's credential discipline).

### 1.3 Methodology

- **Build-on, not repeat.** This artifact synthesizes the three 0-research source documents into the BMAD template, adds an explicit bottom-up sizing build, formal segments, a jobs-to-be-done frame, switching-trigger analysis, and a competitive matrix.
- **Source posture.** Every claim is cited inline to the source already used in the research files. Where a figure is a vendor self-report, advocacy estimate, or forecast, it is labeled "(estimate)" and treated as directional.
- **Honesty checks.** Three corrections from the source research are carried forward: (a) the $72.2B / 28.6 percent figure is a USDA share-of-crop-farm construct, not the sum of the all-farm line items (which is roughly $83B); (b) FBN does use AI, so the gap is "no autonomous farmer-side buying agent," not "no AI"; (c) every headline savings number in this space is unaudited and directional, so Terra must build its own provable retrospective savings figure from real invoices.

### 1.4 Research goals and what was achieved

**Original goals:** size the opportunity, define the customer and their buying behavior, frame the jobs-to-be-done and switching triggers, and map the competitive field for a farmer-side AI purchasing agent.

**Achieved:**
- A defensible, bottom-up SOM built from per-acre economics (Section 2), not a naive slice of the input TAM.
- Four named customer segments with the beachhead chosen and justified (Section 3).
- A jobs-to-be-done and decision-journey model grounded in the trusted-advisor circle and prepay calendar (Section 3).
- A competitive analysis matrix and white-space read (Section 4).
- An honest risk register tied to mitigations (Section 7).

---

## 2. Market Analysis and Dynamics

All figures below are anchors, not precise totals. Software and savings willingness-to-pay tracks a far smaller pool than the input spend it sits on, so the SOM is built bottom-up from per-acre value, not as a slice of the input TAM.

### 2.1 Market drivers and dynamics

- **The cost-price squeeze (the demand driver).** Since 2020: seed +18 percent, chemicals/pesticides +25 percent, fuel +31 to 32 percent, fertilizer +37 percent, against commodity prices down roughly 50 percent from 2022 peaks ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)). 2025 per-acre profitability is negative for every major row crop ([AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). Net farm income fell from roughly $182B (2022) to roughly $140.7B (2024), down about 22 percent.
- **Working capital is the hidden half.** Inputs are financed up front and recouped only at harvest. 2025 operating loans averaged about 30 percent larger year over year, first-year interest up 70 to 90 percent, Chapter 12 bankruptcies up 46 percent to 315 ([KC Fed](https://www.kansascityfed.org/agriculture/agfinance-updates/larger-operating-loans-boost-farm-lending-activity-in-2025/), [RFD-TV / AFBF](https://www.rfdtv.com/afbf-sounds-alarm-on-farm-bankruptcies-as-larger-loan-sizes-and-rates-strain-farm-finances-further)).
- **Opacity by design (the leverage driver).** No public real-time price benchmark exists; USDA relies on an annual voluntary fertilizer survey, and a bipartisan Fertilizer Transparency Act would force USDA to publish weekly prices ([Agri-Pulse](https://www.agri-pulse.com/articles/24432-house-bill-aims-to-provide-fertilizer-price-transparency)). Supplier concentration reinforces it: four firms control roughly 77 percent of US nitrogen and effectively all potash and phosphate; Bayer plus Corteva control roughly 70 percent of corn and soybean seed ([AEI](https://www.aei.org/research-products/report/market-concentration-in-agricultural-industries/), [Farm Action](https://farmaction.us/concentrationdata/)).
- **Agentic-commerce rails are arriving (the enabling driver).** OpenAI plus Stripe's Agentic Commerce Protocol, Visa Intelligent Commerce, Mastercard Agent Pay, and Ever.Ag's "Roger" ag-freight agent make the auto-PO and delivery legs buildable rather than hypothetical.

### 2.2 The pricing and business-model mechanic (where the margin hides)

This is the core mechanic the agent attacks. Crop-protection retail runs on manufacturer rebate and program pricing, not transparent list-minus-margin. Marketing programs average about 25 percent of a manufacturer's selling price and exceed 50 percent on some products, while channel margins plus retained rebates total only about 11 to 12 percent, implying retailers often run a 13 to 14 percent negative up-front margin and get whole only by hitting year-end rebate and volume thresholds (CropLife trade analysis, directional) ([CropLife: Marketing/Rebate Programs](https://www.croplife.com/management/marketingrebate-programs/), [CropLife: Playing the Game](https://www.croplife.com/management/crop-protection-rebates-playing-game/)). Consequences for the grower: price discovery is broken (the real net price appears only after the year ends), pricing is tiered by farm size and sophistication so less-savvy growers pay more for identical product, and generic-for-branded substitution that can save up to roughly 35 percent is under-surfaced by retailers whose rebates favor branded products (FBN-sourced, directional, estimate).

### 2.3 TAM: the addressable input and energy spend

- US total farm production expenditures: roughly $477.6B (2024), down about 0.9 percent year over year ([USDA NASS](https://esmis.nal.usda.gov/sites/default/release-files/qz20ss48r/w6636271r/9p292904f/fpex0725.pdf)).
- Directly addressable crop-input lines (USDA NASS, all-farm 2024): fertilizer/lime $33.8B + seed $27.4B + ag chemicals $21.7B = roughly $83B.
- Adding fuel (about $15.4B to $16.5B) brings the input-and-energy envelope to roughly $99B/yr.

**TAM anchor: approximately $83B (inputs) to $99B (inputs plus fuel/energy) of annual US spend the agent could influence.** The monetizable layer is software and savings capture, not the gross spend; treat $83B to $99B as the pool the product attacks, not revenue available to it.

### 2.4 SAM: California specialty and the chosen segment

- California is the number-one state for farm expenditures at $48.6B in 2024, 10.2 percent of the US total, driven by high-cost specialty crops ([USDA NASS 2025 Highlights](https://data.nass.usda.gov/Publications/Highlights/2025/2025_FarmExpenditures_Highlights.pdf)).
- California agricultural cash receipts were $61.2B in 2024 ([USDA / CDFA via The Ag Center](https://theagcenter.com/news/california-agriculture-surpasses-60-billion-in-production-value-growth-challenges-and-the-road-ahead/)).
- Almonds alone: roughly 1.38M bearing acres (2024); estimated US almond total annual production cost around $10.85B (AFBF estimate) ([AFBF](https://www.fb.org/market-intel/specialty-crops-need-economic-aid-case-studies-almonds-apples-blueberries-lettuce-potatoes-and-strawberries)).

**SAM build (explicit assumptions):**
1. Start from California farm expenditures of $48.6B (2024, measured).
2. Assume the addressable input share (fertilizer, seed, crop protection, fuel) sits in the same band as the national crop-input share, roughly 20 to 29 percent of expenditures (assumption: inferred from national ratios, not a California-specific measurement; estimate).
3. That yields roughly $9.7B to $14.1B of California input spend.

**SAM anchor: roughly $10B to $14B of annual California specialty and row-crop input spend the agent could serve, with almonds and tree nuts the densest sub-pool.**

### 2.5 SOM: bottom-up from per-acre and per-farm value

The defensible SOM is priced against realized savings per acre and per farm, not against the input TAM.

**Per-acre anchor (almonds).** UC Davis puts 2024 Sacramento Valley almond operating cost at $3,720/acre ($7,800/acre total cost), with fertilizer and crop-protection lines exceeding $800/acre and irrigation pump energy at about $720/acre ([UC Davis 2024 Sample Costs to Produce Almonds](https://coststudyfiles.ucdavis.edu/2024/07/09/2024SacValleyAlmonds7.5.24.%20Final%20draft.pdf)).

**SOM build (explicit assumptions):**
1. Addressable per-acre input line (chemical + fertilizer): roughly $800/acre.
2. Assume the agent reliably captures 5 to 10 percent of that line (within, and hedged below, the band of FBN's directional savings claims): roughly $40 to $80/acre of grower value (estimate).
3. Assume the product captures $5 to $20/acre of that value as revenue (gain-share or SaaS; estimate).
4. Serving 100,000 to 200,000 almond acres at $5 to $20/acre: roughly $0.5M to $4M of early annual revenue from almonds alone (estimate, illustrative range built from per-acre economics, not a forecast).

Extending across California tree nuts and high-value specialty crops scales that several-fold.

**Software-market reality check.** The software layers these products live in are an order of magnitude smaller than the input spend below them: farm management software roughly $2.8B to $5.5B (2024, wide vendor variance), precision agriculture roughly $10B to $12B globally, broad agtech roughly $15B to $32B depending on definition (all private market-research estimates with inconsistent definitions; treat any single number as an order-of-magnitude anchor) ([Grand View Research](https://www.grandviewresearch.com/industry-analysis/farm-management-software-market), [Expert Market Research](https://www.expertmarketresearch.com/reports/agtech-market)). US ag-product e-commerce is roughly $9B (2025) with inputs about 35 percent of that ([SNS Insider](https://www.snsinsider.com/reports/e-commerce-of-agricultural-products-market-9559)).

### 2.6 The agentic-commerce tailwind (forecasts, not facts)

Gartner projects AI agents will intermediate roughly 90 percent of B2B buying (about $15T) by 2028, and that SCM software with agentic AI will grow from under $2B (2025) to $53B by 2030 (both aggressive Gartner forecasts, inherently uncertain) ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2026-04-07-gartner-forecasts-supply-chain-management-software-with-agentic-ai-will-grow-to-53-billion-in-spend-by-2030)). The counter-evidence keeps it honest: fewer than 25 percent of B2B suppliers use agentic AI today, and only about 27 percent of consumers trust fully autonomous AI for financial transactions (cross-industry analogue, not farm-specific) ([DigitalCommerce360](https://www.digitalcommerce360.com/2026/03/10/agentic-commerce-faces-reality-check-in-b2b-ecommerce/)). These forecasts set direction, not a near-term ceiling.

### 2.7 Sizing summary

| Layer | Anchor | Basis | Confidence |
|---|---|---|---|
| TAM | ~$83B inputs / ~$99B inputs + fuel | USDA NASS 2024 all-farm line items | High on line items; the spend pool, not revenue |
| SAM | ~$10B to $14B | CA $48.6B expenditures x 20 to 29 percent input share (estimate) | Medium; share inferred from national ratios |
| SOM (early) | ~$0.5M to $4M/yr from almonds | 100k to 200k acres x $5 to $20/acre captured value (estimate) | Low to medium; illustrative, bottom-up |
| Software-market reality check | FMS ~$2.8B to $5.5B; agtech ~$15B to $32B | Private market-research estimates, inconsistent definitions | Low; order-of-magnitude only |

---

## 3. Customer Insights and Behavior Analysis

### 3.1 Customer segments

Four segments, ordered by fit. The beachhead is Segment 1.

**Segment 1 (beachhead): California permanent-crop growers, almonds and tree nuts first.** Large absolute input bills, deepest 2024 losses, multi-entity and multi-account spend sprawl, systematically under-served by row-crop platforms, and already reachable through Terra's energy tool. Average specialty-crop cash expense is about $466k per farm, up 47 percent since 2021 ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)). A Batth-scale operation (183 meters, 57 PG&E accounts, 6 entities) is the design target.

**Segment 2 (adjacent expansion): broader California high-value specialty (citrus, grapes, produce).** Same opacity and multi-entity legibility problem, same channel, region- and crop-specific cost stacks. Navel oranges moved from $1,555/acre (2005) to $4,215/acre (2025); strawberries run near $113,000/acre (region- and year-specific cost-study figures, not statewide or current-universal; estimate).

**Segment 3 (large, but the wrong beachhead): Midwest row crops.** The larger raw market and where FBN, GROWERS, and Bushel are strongest, with denser retailer networks. It is crowded, well-served, transactional, and Terra has no distribution and no differentiation there. Revisit only after the specialty wedge is proven.

**Segment 4 (the advisor as a channel, not an end customer): PCAs and dealer reps.** The licensed PCA is the legal gatekeeper for California crop-protection recommendations ([California Ag Today](https://californiaagtoday.com/pest-control-adviser-certified-crop-adviser-programs/)). Tools that arm the advisor adopt faster than tools that bypass them, so the advisor is both a trust competitor and the most efficient distribution path.

### 3.2 Customer behavior patterns

- **The owner decides, but not alone.** Every grower keeps a small circle of trusted advisors, typically five to six people, and the ag-retailer or dealer agronomist is in that circle nearly 100 percent of the time ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/)). Advisors are decisive on inputs: 74 percent of farmers who get crop scouting from their retailer say the retailer strongly influences their chemical purchases, and advisors touch roughly 80 percent of pest and disease decisions.
- **Engagement scales with farm size.** More than 80 percent of crop producers interact with dealer agronomists, but small farms only 43 percent versus 84 percent for large farms ([Purdue](https://agribusiness.purdue.edu/2024/08/28/how-farmers-interact-with-agribusiness-reps/)). The Batth-scale beachhead sits in the high-engagement tier.
- **Buying is calendar-driven.** A fall strategy positions price early via prepay and on-farm storage (nitrogen is often cheaper in fall); winter and spring are reactive ([MSU Extension](https://www.canr.msu.edu/news/best-practices-for-buying-farm-inputs)). Prepay does three jobs at once: lock price, capture early-order discounts, and deduct the expense before January 1 for tax. The trade-off is fronting cash months ahead and bearing counterparty risk if prices fall or product sells out (seed often gone by Thanksgiving, chemicals by President's Day).
- **The channel is consolidated.** Almost nothing is bought direct from manufacturers; inputs flow manufacturer to distributor to ag retailer to farm, and the "Big Seven" supply roughly 70 percent of crop inputs and services ([CropLife](https://www.croplife.com/croplife-top-100/the-big-seven-of-the-croplife-100-the-evolution-of-americas-largest-ag-retailers/)).

### 3.3 Psychographic profile of the decision-maker

Plain-spoken, low software and AI literacy, skeptical, learns line by line in Excel. Relationship-loyal: across Purdue's 2017 to 2025 surveys, farmers consistently rate "my relationship with the salesperson is more important than my relationship with the company" at 6.8 to 7.0 on a 9-point scale ([Purdue 2025](https://agribusiness.purdue.edu/2025/10/30/how-u-s-farmers-perceive-agricultural-dealers-and-retailers-insights-from-2017-to-2025)). Yet loyalty is shallow on price: only about a third call themselves brand-loyal and 60 percent would switch brands for a 10 percent discount ([The Grower](https://thegrower.org/news/price-performance-loyalty-which-one-works-you)). Earned skepticism is the dominant trait: prior tools over-promised, and permanent-crop growers feel the downside for two to three years (one Westside almond grower tried Extension-advised deficit irrigation, got burned, then Extension reversed itself) ([Farmland Info](https://www.farmlandinfo.org/wp-content/uploads/sites/2/2019/09/SpecialityCropGrowersBMPs.pdf)).

### 3.4 Customer pain points and needs

**Prioritized by impact and solution opportunity.**

**High priority (the wedge):**
- **No price discovery.** In buying-process surveys, 50 percent of farmers could not get pricing data, 41 percent could not compare products, and 36 percent could not get product details ([The Daily Scoop](https://www.thedailyscoop.com/news/retail-business/farm-business-2026-relationship-first-digital-convenience-second)). Farmers describe themselves as "price takers, not price makers" ([AgWeb](https://www.agweb.com/news/policy/ag-economy/farmers-say-they-shoulder-cost-mergers-seed-fertilizer-industries)).
- **Hidden rebate/prepay money.** The real net price appears only after year-end rebates; nobody audits the rebate stack for the grower (it exists only retailer-side, AgVend Program Management). Under-credited rebates and mis-timed prepay are pure leakage.
- **Fragmented, illegible spend.** A multi-entity operation has input spend scattered across many dealer and co-op accounts with no single ledger, the identical multi-entity legibility problem Terra already solves for PG&E energy.

**Medium priority:**
- **Working-capital strain.** Inputs financed up front, interest costs sharply higher, so timing and rebate dollars matter more than ever.
- **Generic-equivalent blind spot.** Cheaper same-active-ingredient generics (up to roughly 35 percent saving, FBN-sourced, estimate) are under-surfaced by a channel whose rebates favor branded product.

**Lower priority (real at the margins):**
- **Equipment parts and repair.** Deere and dealers make 3 to 6 times more profit on parts and repair than on new machines; right-to-repair restrictions cost farmers roughly $4.2B/yr (PIRG estimate); Deere settled a right-to-repair class action for $99M in 2025 ([PIRG](https://pirg.org/updates/dealership-consolidation-raising-repair-costs-farmers/)). Adjacent, not the wedge.
- **Fuel.** Comparatively transparent (dyed off-road diesel is tax-exempt, about 24 to 40 cents/gal saving); volume and delivery fees dominate the math.

### 3.5 Barriers to adoption

- **Trust to delegate spend (the steepest barrier).** No ag-specific data exists; the closest analogue is cross-industry (only about 27 percent of consumers trust fully autonomous AI financial transactions; fewer than 25 percent of B2B suppliers use agentic AI today) (estimate, not farm-specific) ([Trantor](https://www.trantorinc.com/blog/human-in-the-loop-vs-fully-autonomous-ai-agents)).
- **Unclear ROI.** 53 percent of North American farmers are very concerned about demonstrated ROI before investing in agtech ([McKinsey](https://www.mckinsey.com/industries/agriculture/our-insights/global-farmer-insights-2024)).
- **Low digital literacy and data-privacy fear.** Growers distrust handing receipts and field data to a VC-backed third party (a documented FBN complaint).
- **Advisor conflict.** The trusted agronomist or PCA is both gatekeeper and a seller of the product being optimized; a tool that threatens that relationship risks rejection.
- **Time and labor scarcity, and tool-interoperability friction.**

**What flips a skeptic:** peer and neighbor proof, on-farm trials, fast and visible dollar wins (weeks, not seasons), dead-simple UI, and retrospective evidence using the grower's own numbers ([McKinsey](https://www.mckinsey.com/industries/agriculture/our-insights/global-farmer-insights-2024)).

### 3.6 Jobs-to-be-Done

Framed as the jobs the grower hires a procurement tool to do, mapped to the agent's capabilities and to the gap each fills.

| # | Job (grower's words) | Functional job | Emotional / social job | Who does it today | Agent capability |
|---|---|---|---|---|---|
| 1 | "Show me every dollar I spend on inputs across all my ranches and entities, in one place." | Make fragmented spend legible | Feel in control, not embarrassed in front of the banker | Nobody (spreadsheets, partial) | Spend-vs-budget legibility across entities |
| 2 | "Tell me if I overpaid versus what others pay." | Benchmark price to a per-unit market band | Stop feeling like a price taker | FBN (historical, walled garden) | Normalized per-unit benchmark on the grower's own invoices |
| 3 | "Find me the same thing cheaper, including the generic." | Cross-supplier and generic-equivalent scouting | Save face money without changing what works | Nobody conflict-free (sellers won't surface a rival quote) | Live cross-supplier and generic scouting |
| 4 | "Make sure I actually got the rebate and bought at the right time." | Audit rebates/prepay against real invoices | Avoid being quietly shorted | Nobody grower-side (AgVend is retailer-side) | Grower-side rebate/prepay audit |
| 5 | "Plan what I'll need to buy and when, before the season." | Forecast a bill of materials and buying calendar | Get ahead of the prepay deadline, not caught flat | Nobody (price comparison is retrospective) | Demand forecast from the crop/irrigation plan |
| 6 | "Get me a better price without me having to argue." | Negotiate the long tail | Avoid an uncomfortable conversation with the dealer | Nobody in ag (Pactum proves it elsewhere) | Gain-share agentic negotiation |
| 7 | "Place the order and tell me it showed up." | Execute and track the PO | Trust it without watching it | Manual phone/email | One-tap PO + delivery tracking |
| 8 | "After the bill posts, show me I really saved." | Close the predicted-vs-actual loop | Believe the number, then delegate more | Nobody (no closed-loop verification in ag) | Reconciliation, the procurement analog of Terra's energy reconciliation |

Jobs 1 to 4 are deliverable on day one from invoices alone and are the wedge. Jobs 5 to 8 earn the right to act and unlock delegation.

### 3.7 Customer decision journey

- **Awareness.** Peer and neighbor proof, the energy-tool relationship (warm channel), and a fast legibility hook ("you overpaid by $X versus peers"). Not cold marketing.
- **Consideration.** The grower (and their PCA) wants retrospective evidence on their own numbers, a dead-simple UI, and a clear ROI. 53 percent will not buy agtech without demonstrated ROI.
- **Decision.** Anchored to the trusted-advisor circle; the agent must arm the grower and their advisor, not replace them. Gain-share (pay only from realized savings) removes the financial risk of saying yes.
- **Purchase / action.** One-tap, human-approved PO with dollar caps and advisor visibility. Never autonomous on day one.
- **Post-purchase.** Close the predicted-versus-actual loop after the invoice posts. This is what earns the next, larger delegation.

### 3.8 Switching triggers and switching costs

**Switching costs are relational, not contractual.** The loss is personal bonds with the salesperson (rated above the company), not a contract penalty ([Purdue 2025](https://agribusiness.purdue.edu/2025/10/30/how-u-s-farmers-perceive-agricultural-dealers-and-retailers-insights-from-2017-to-2025)). That is why a tool that includes the existing dealer's quote (arming, not bypassing) lowers the switching barrier instead of triggering it.

**Triggers that flip a grower to act:**
1. A negative-margin season (now), so a few points off procurement is breakeven.
2. A concrete, dollar-quantified "you overpaid by $X" on their own invoice.
3. A 10 percent price gap (60 percent would switch brands for it) ([The Grower](https://thegrower.org/news/price-performance-loyalty-which-one-works-you)).
4. A prepay deadline approaching with cash tight (timing pain is acute and calendar-forced).
5. An under-credited rebate surfaced after the fact (visceral, "I was shorted").
6. Zero financial risk to try (gain-share, free to start).

---

## 4. Competitive Landscape and Positioning

### 4.1 Competitive analysis matrix

The field splits into input marketplaces/transparency plays, the incumbent ag-retail channel they disrupt, ag-fintech, the energy-legibility lane (Terra's Tool 1 turf), and equipment. Funding and scale figures vary by source; vendor self-reports are labeled.

| Company | Cluster | Model | Scale / funding | AI today? | Strengths | Gaps vs the agent |
|---|---|---|---|---|---|---|
| **Farmers Business Network (FBN)** (clone target) | Input marketplace + transparency + fintech | Free member data network monetized via FBN Direct e-commerce, financing, insurance, crop marketing | ~$978M raised over 12 rounds (estimate; Tracxn); ~$3.9B valuation at Nov 2021 Series G; $50M July 2025, no valuation disclosed; 117,000+ farms / 187M acres (FBN-stated) ([Tracxn](https://tracxn.com/d/companies/fbn/__fw4xRp4VGbU0dYKDMjwHy_HicO3HL2L1yjqbRg23rKw), [DigitalCommerce360](https://www.digitalcommerce360.com/2025/07/28/farmers-business-network-fbn-50-million-funding-ai/)) | Yes: "Norm" LLM advisor (GPT-3.5, Apr 2023); July 2025 raise to expand AI | Largest war chest and data moat; transparent national pricing; flags generics; delivery reliability | A seller, not independent (conflicted); row-crop/national-average centric; weak for multi-entity specialty; no demand forecast, live scouting, grower-side rebate audit, or closed loop |
| **GROWERS** | Input marketplace (RFQ) | Free farmer RFQ app + ag-retailer network | NC startup; launched Dec 2022; Midwest network; funding not disclosed | No autonomous agent; compare + transact | Attacks manual quote collection; supplier-neutral | Breadth depends on Midwest retailer density; not full-spend legibility; no audit or forecast |
| **Growers Edge** | Ag-fintech | Embedded input financing + Crop Plan Warranty, sold to retailers/lenders | $25M raised (Apr 2025); warranties on 1M+ acres ([GlobeNewswire](https://www.globenewswire.com/news-release/2025/04/29/3070388/0/en/Growers-Edge-Raises-25M-to-Build-First-Full-Service-Fintech-Platform-for-Agriculture.html)) | Land/climate intelligence; no buying agent | Targets working-capital pain; de-risks adoption via warranty | Financing/warranty focus, not price transparency or procurement comparison; lender-side |
| **Bushel** | Ag infrastructure / payments | Agrifintech software for grain buyers, retailers, farmers; Bushel Wallet | $26M round (2024); powers 3,500+ facilities, >50 percent of US/Canada grain origination ([AgFunder](https://agfundernews.com/grain-trading-platform-bushel-raises-26m-to-build-up-the-holy-grail-of-agrifintech-software)) | Payments/settlement automation | Dominant grain-elevator distribution; charges the agribusiness | Infrastructure/payments layer, not a grower savings product; tied to grain trade |
| **Indigo Ag** | Marketplace / carbon | Carbon programs, marketplace, biologicals | Reported ~94 percent markdown to a disputed ~$200M from a ~2021 peak of ~$3.5B (Indigo called the figure incorrect; estimate) ([AgFunder](https://agfundernews.com/no-comment-from-indigo-ag-on-valuation-nose-dive-report)) | Carbon MRV; underdelivered | Brand, CPG carbon buyers | Cautionary tale; weak core-input traction |
| **Nutrien Ag Solutions** | Incumbent ag-retail | #1 US ag retailer; inputs + agronomy + financing | ~$14.5B retail sales (2024-2025), ~$3.6B gross margin, ~1,800 locations, 4,000+ consultants ([Nutrien](https://www.nutrien.com/news/press-releases/nutrien-reports-fourth-quarter-and-full-year-2024-results-1717)) | HUB digital platform; defensive | Scale, agronomist density, vertical integration, financing | Opaque program pricing (the thing transparency disrupts); a seller |
| **CHS / Helena / Wilbur-Ellis / Simplot / GROWMARK / GreenPoint Ag** ("Big Seven") | Incumbent ag-retail | Co-op/private national integrators | Big Seven ~70 percent of US crop inputs; CropLife 100 booked $43.3B in 2024 (down 7.2 percent YoY) ([CropLife](https://www.croplife.com/croplife-top-100/the-big-seven-of-the-croplife-100-the-evolution-of-americas-largest-ag-retailers/)) | Mostly none farmer-facing | Local agronomist trust, logistics density | Rebate-dependent opaque pricing; price-discriminate by farm size; the channel being disintermediated |
| **AgVend** | Ag-retail SaaS | White-label engagement + e-commerce + Program Management (rebate tracking) sold to retailers | $42.76M Series B (Feb 2025); used by 30 percent+ of NA ag retail ([Tracxn](https://tracxn.com/d/companies/agvend/__gB1NIy7MYN1NMw3_XZqIe2pVcxCmU9ORpkhrs9lsuGQ)) | Program Management is the closest rebate-audit analog | Proves the rebate-data problem is real; deep retail penetration | Retailer-side, not farmer-side; helps the seller capture rebates, not the grower |
| **Wexus Technologies** | Energy/water legibility (Terra's lane) | SaaS/IoT: PG&E billing + SmartMeter + flow data; rate analysis, efficiency financing | Lightly funded (Village Capital $100K, 2018); PG&E-partnered | Rate analysis, alerts; not LLM-led | Direct proof in Terra's lane: self-reports 40 percent / ~$40,000 on one pump (vendor anecdote, estimate) | Thin funding, dated footprint; IoT/hardware-heavy clashes with simple UX; beatable on polish/price |
| **John Deere (+ dealers)** | Equipment / parts | OEM + consolidated dealer channel; margin in parts/repair | Parts/repair 3 to 6x more profitable than new machines (PIRG/plaintiff estimate); $99M right-to-repair settlement (2025) ([PIRG](https://pirg.org/updates/dealership-consolidation-raising-repair-costs-farmers/)) | Telematics, not procurement | Brand, dealer lock-in, recurring parts revenue | Right-to-repair backlash; adjacent, not the input wedge |

**Cautionary cluster (instructive, not direct competitors):** the pure farm-ops/data layer repeatedly fails to stand alone and gets absorbed. Granular went to Corteva (~$300M+, 2017) and was dismantled; Agrible to Nutrien ($63M, 2018); Conservis to TELUS + Rabobank (2021); Climate FieldView exists to sell Bayer seed/chem, not as a standalone P&L ([AgFunder](https://agfundernews.com/nutrien-acquires-agrible-for-63m-to-create-ag-retailer-of-the-future), [Traction Ag](https://www.tractionag.com/traction-ag-acquires-granular-business-to-expand-solution-value/)). The lesson: "make the farm legible" software is necessary but historically not a business by itself. Every durable winner bolts a money-moving rail onto the data.

### 4.2 FBN teardown: clone-and-beat read

FBN is the right clone target: it is the only player that built a real business on the exact wedge (price opacity), at scale, with legible and exploitable weaknesses.

- **What we copy:** crowdsourced price transparency as the trojan horse; direct-from-manufacturer and generic-equivalent sourcing; free membership, monetize the transaction; reliable direct-to-farm delivery; crop-cycle financing. FBN dropped its ~$700/yr fee to $0 in September 2020 to grow the network ([RealAgriculture](https://www.realagriculture.com/2020/09/fbn-drops-membership-fee/)).
- **What farmers love:** the price-transparency report (up to 283 percent in 2023, 468 percent in 2024, both FBN-sourced, directional), and delivery reliability (the most-cited five-star reason) ([AgWeb](https://www.agweb.com/news/business/fbn-releases-its-2024-ag-chemical-price-transparency-report), [FBN](https://www.fbn.com/community/blog/fbn-customer-reviews-delivery)).
- **What farmers complain about:** data distrust handing receipts to a VC-backed third party; savings oversold (the below-average half of buyers got only about 14 percent off list, not the headline 50 percent); generic/private-label agronomic hesitancy; operational fragility (2023 to 2025 layoffs, exited Australia/international, dropped seed/livestock/fertilizer lines, Glassdoor 2.8/5); and the core conflict of interest (FBN is a seller, not an independent advisor).
- **The AI-shaped gaps (the white space):** no autonomous farmer-side buying agent; no demand forecasting from the crop plan; no live cross-supplier scouting (only historical paid prices); no grower-side rebate/prepay audit; no closed-loop verification; conflicted by design; weak for specialty/permanent crops.

### 4.3 Analogous models worth copying (proven mechanics from other verticals)

- **Ramp / Brex (spend management + crowdsourced auto-savings).** The card/ledger is the trojan horse; Price Intelligence benchmarks to the SKU and Ramp reports >$405M saved via AI tools ([Ramp](https://ramp.com/blog/introducing-vendor-management)). Ports to ag: pay for inputs through one rail and the agent has the data to benchmark.
- **Faire (wholesale marketplace + seasonal net terms).** Net-60 unlocked growth (monthly GMV $100K to $1M within three months of 2017 launch) ([Sacra](https://sacra.com/c/faire/)). Ports to ag: harvest-timed terms are arguably more valuable than in retail, with default-risk guardrails (echoing Silo's lending blowup).
- **GPOs / group-buying (Dining Alliance / Buyers Edge).** Free, keep your existing distributors, auto-collect back-end rebates across 175,000+ items, pay CashBack quarterly ([Ramp/HSCA](https://ramp.com/blog/how-group-purchasing-organizations-operate)). The lowest-friction, highest-trust mechanic for a skeptical, low-software farmer.
- **AI procurement agents (Pactum, Keelvar).** Pactum negotiated $8B+ for Walmart and Maersk; in the Walmart deployment about 64 to 68 percent of suppliers reached agreement at about 3 percent average savings plus about 35-day term improvements, on a gain-share fee ([Thunderbird/ASU](https://thunderbird.asu.edu/thought-leadership/journals-case-series/case-series-listing/pactums-ai-contract-negotiations)). The gain-share model is perfect for a skeptical operator.
- **Flexport (operational visibility as the retention moat).** Delivery timing, price-volatility alerts, and a single ledger become the retention layer once savings get a farm in the door.

### 4.4 Positioning and differentiation

**One-liner:** the purchasing agent that buys your farm's inputs for less, and shows you exactly how much it saved.

Positioned as the farmer's independent agent, not a store. FBN says "buy from us and save." Terra says "we work for you, we scout everyone including the people who already have your business, and you only pay us from what we save you." The differentiation rests on six axes FBN structurally cannot or will not follow: (1) demand forecasting from the crop plan; (2) conflict-free cross-supplier scouting; (3) grower-side rebate/prepay audit; (4) agentic gain-share negotiation; (5) auto-PO and delivery tracking; (6) cross-entity spend-vs-budget control.

**Why incumbents structurally can't or won't match this:** (a) conflict of interest, every player that touches price is also a seller, so an honest cross-supplier scout and a grower-side rebate audit work against their own margin; (b) opacity is their business model, the rebate/zone-pricing/prepay maze lets them price-discriminate by farm size, so they will not build the tool that dissolves it; (c) focus, horizontal procurement AI is not built for the farm and ag incumbents are row-crop and national-average centric. The moat is execution plus the independent (non-seller) position plus Terra's shared data model, not secret technology.

### 4.5 Where everyone is weak (the white space)

1. No one makes a complex multi-entity, specialty-crop operation's full input spend legible (all SKUs, dealers, ranches, entities) before recommending cuts.
2. No farmer-side autonomous purchasing agent exists; current AI is a chatbot plus historical benchmarks.
3. Closed-loop verification (predicted vs actual after the invoice posts) is not standard in ag procurement.
4. The independent, farmer-aligned position is open; every incumbent that touches price is a seller.
5. Specialty/nut/produce growers are systematically under-served despite carrying the largest absolute input and labor bills and the deepest 2024 losses.
6. The proven monetization rails (crowdsourced benchmarking, pooled rebates, gain-share negotiation, harvest-timed terms) have never been stitched into one farm-scoped, operator-simple, mobile-first agent.

---

## 5. Strategic Market Recommendations

### 5.1 Market opportunity assessment

The high-value opportunity is the intersection of acute, dollar-quantifiable pain (negative margins, hidden rebates, illegible multi-entity spend) and an open, non-seller position no incumbent can occupy, sold into a customer Terra already reaches. Timing is favorable on four fronts at once: negative margins (peak willingness to act), strained working capital (timing and rebate dollars matter more), arriving agentic-commerce rails (the auto-PO leg is buildable), and a contracting FBN leaving the specialty and independent lanes open.

### 5.2 Strategic recommendations

1. **Lead with legibility, monetize with a money-moving rail.** Make the full input spend legible first (the wedge no incumbent occupies), then attach gain-share savings capture. Pure-software legibility is necessary but historically not a business by itself; every durable ag-tech winner bolts a rail onto the data.
2. **Choose the independent, non-seller position deliberately and defend it.** It is the one thing FBN, Nutrien, and the Big Seven cannot copy without breaking their P&L. Make "we don't sell the inputs" a load-bearing brand promise.
3. **Win the beachhead before the big market.** California permanent crops (almonds first) trades a smaller TAM for an open lane and a warm channel. Do not start in the Midwest row-crop market where Terra has no distribution and no differentiation.
4. **Arm the advisor, don't bypass them.** The PCA and dealer rep are in the decision circle nearly 100 percent of the time and are the fastest distribution path. Include the existing dealer's quote in the scout; give the advisor visibility.
5. **Build a provable, audited savings number.** Every headline figure in this space is unaudited and directional. An independently verified, retrospective savings number from real invoices is itself differentiating, and it is the prerequisite for any delegation.
6. **Reuse the Terra data model.** Farm, Entity, Ranch/Block, Pump, Crop, and the Recommendation grammar (situation + action + impactUsd + one-tap response + after-the-fact result, shaped to be executable) already support an input PO as an action type. The Tool 2 move is mechanical.

### 5.3 Monetization recommendation

Gain-share first (pay only from realized savings), which removes the financial risk of saying yes for a skeptical operator and aligns incentives. Free to start. Layer transaction/financing spread and private-label margin later, and consider pooled rebate capture (GPO model) as the lowest-friction, highest-trust early rail. Avoid the thin-margin marketplace trap (Indigo, Silo): lead with software legibility and gain-share, not balance-sheet-heavy logistics or lending on day one.

---

## 6. Go-to-Market and Sequencing

The buyer is skeptical, low software literacy, and anchored to a five-to-six-person trusted-advisor circle in which the PCA sits nearly 100 percent of the time. Letting software buy is the steepest trust climb, so the path is staged and mirrors Terra's energy playbook.

1. **Legibility (retrospective).** Ingest real invoices; show "you overpaid by $X versus peers" and the full multi-entity spend ledger. Deliverable from invoices alone (Jobs 1 to 4).
2. **Forecast.** Derive the input bill of materials and buying calendar from the crop and irrigation plan Terra already models (Job 5).
3. **Scout and audit.** Live cross-supplier and generic scouting; grower-side rebate/prepay audit against real invoices (Jobs 3, 4).
4. **One-tap PO, human-in-the-loop.** Prepare the PO with dollar caps and advisor visibility; track delivery (Jobs 6, 7). Never autonomous on day one.
5. **Close the loop.** Predicted vs actual after the invoice posts (Job 8). This is what earns the next, larger delegation.
6. **Delegated auto-buy (later).** Only as machine-readable catalogs and supplier APIs mature, and only after retrospective accuracy is proven.

**Channel:** ride Terra's existing California specialty customer base and the energy-tool relationship; lead with the rebate-audit and price-benchmark value (dollars even before a deep live-quote network exists); arm the advisor rather than threaten them.

---

## 7. Risk Assessment and Mitigation

| Risk | Severity | Evidence | Mitigation |
|---|---|---|---|
| **Trust to delegate spend** | High | Only ~27 percent trust autonomous AI payments (cross-industry, estimate); 53 percent of NA farmers need clear ROI first | Human-in-the-loop with one-tap approval and dollar caps as the default; prove retrospective accuracy, then close the loop; auto-buy much later |
| **Channel conflict with dealers/co-ops** | High | Big Seven control ~70 percent; switching costs relational (~6.8 to 7.0/9); FBN faced incumbent hostility (closed Canadian Competition Bureau probe) | Position as the grower's agent that can include the existing dealer's quote; arm rather than bypass the advisor |
| **Data access** | Medium-High | Model needs invoices, dealer accounts, crop plan; FBN data-distrust complaint documented | Legibility-for-the-grower framing; transparent data use; never store financial/utility credentials where the agent or repo can read (Tool 1 discipline) |
| **Supplier liquidity / network density** | Medium | Scouting value depends on retailer-network density, thin for CA specialty outside the Midwest footprint | Start where Terra has customer density; lead with rebate-audit and benchmark value that deliver dollars before a deep live-quote network exists |
| **Thin-margin marketplace trap** | Medium | Indigo (~94 percent markdown, disputed, estimate), Silo lending blowup; pure-software ops layers all absorbed by strategics | Attach a money-moving rail (transparency + gain-share/rebate-share/financing); stay capital-disciplined; avoid balance-sheet-heavy logistics/lending early |
| **FBN is well-capitalized and moving** | Medium | ~$978M raised (estimate); $50M July 2025 to expand AI; 117,000+ farms | Out-trust on independence and the specialty blind spot; do not claim "no AI in ag" (it is wrong); the accurate gap is no autonomous farmer-side buying agent |
| **Soft, unaudited market numbers** | Medium | Every savings/variation figure (FBN, Wexus) is vendor self-reported and directional | Build Terra's own provable retrospective savings number from real invoices before making any claim (also a differentiation opportunity) |
| **No public price benchmark** | Medium | USDA annual voluntary survey is the only public reference; FBN's benchmark is a walled garden | Capture real invoice/spend data first (the legibility wedge) before promising comparison; a credible benchmark needs network scale that does not exist on day one |
| **Market-size precision is low** | Low-Medium | Agtech/FMS TAMs vary 2 to 3x by vendor and definition | SOM built bottom-up from per-acre economics; treat top-down TAM/SAM as order-of-magnitude anchors |

---

## 8. Research Synthesis and Key Findings

1. **Inputs are the money, and the pain is acute now.** ~$83B to $99B addressable nationally; negative 2025 margins and strained working capital make this the moment a savings tool gets adopted.
2. **The market is opaque by design, which is the wedge.** Rebate/program pricing hides the real net price; no public benchmark exists; pricing is tiered by farm size. Legibility is the value no incumbent delivers honestly.
3. **The white space is a farmer-side autonomous purchasing agent.** AI exists in ag (FBN's Norm), but demand-forecast-from-crop-plan, conflict-free live scouting, grower-side rebate audit, agentic negotiation, auto-PO, and closed-loop verification are greenfield.
4. **The defensible beachhead is California permanent crops, almonds first.** Largest absolute pain, deepest losses, structurally under-served, and reachable through Terra's existing energy-tool relationship.
5. **The position is the moat.** Independent (non-seller) status, execution, and Terra's shared data model, not secret technology. Incumbents cannot copy the non-seller stance without breaking their P&L.
6. **Sequencing decides survival.** Legibility first, human-in-the-loop, gain-share, close the loop, then earn delegation. The thin-margin trap and the trust-to-delegate barrier are the two ways this fails; both are sequenced around.

## Strategic Market Impact Assessment

If Terra executes the sequencing, the agent becomes the natural Tool 2: the same legibility-first thesis applied to the next-largest controllable cost, sold to the same customer on the same data model, with a money-moving rail (gain-share) attached. The realistic early prize is modest in absolute dollars (~$0.5M to $4M/yr from almonds, estimate) but strategically decisive: it deepens the wallet with an existing customer, proves the independent-agent position, and builds the proprietary invoice/spend data that no incumbent can assemble conflict-free. The downside is bounded by the gain-share model (no savings, no fee) and the human-in-the-loop default (no runaway autonomous spend).

## Next Steps

1. Validate the per-acre savings assumption against real Batth-shaped invoices (replace the directional 5 to 10 percent capture estimate with a measured number).
2. Confirm the California input-share assumption (the 20 to 29 percent applied to $48.6B) against a California-specific cost-study roll-up to tighten the SAM.
3. Pressure-test advisor (PCA) reception of an "arm, don't bypass" posture with two or three real growers.
4. Carry these findings into the product brief / PRD for Tool 2, reusing the Recommendation grammar as the action type for an input PO.

---

## 9. Methodology, Sources, and Confidence

- **Approach:** synthesis of the three Terra 0-research documents into the BMAD market-research template, with an added bottom-up sizing build, formal segments, jobs-to-be-done, switching-trigger analysis, and a competitive matrix.
- **Source verification:** every claim cited inline to the source already used in the research files. Vendor savings claims (FBN, Wexus) are directional and not independently audited.
- **Confidence levels:** High on USDA line items and the consolidation/opacity mechanics; Medium on the SAM (California input share inferred from national ratios); Low to Medium on the SOM (illustrative bottom-up from per-acre economics); Low on top-down agtech/FMS TAMs (2 to 3x vendor variance).
- **Known limitations:** no ag-specific data on willingness to delegate buying (cross-industry analogue used); FBN revenue is undisclosed (third-party estimates conflict across a $211M to $400M spread); every market savings figure is vendor self-reported.

## 10. Appendices and Data Tables

### Appendix A: US input spend (2024, USDA NASS all-farm)

| Line item | 2024 spend |
|---|---|
| Fertilizer, lime, soil conditioners | $33.8B |
| Seeds and plants | $27.4B |
| Agricultural chemicals | $21.7B |
| Sum of the three addressable lines | ~$83B |
| Fuel | ~$15.4B to $16.5B |
| Inputs + fuel envelope | ~$99B |
| Total farm production expenditures | ~$477.6B |

Source: [USDA NASS Farm Production Expenditures 2024 Summary](https://esmis.nal.usda.gov/sites/default/release-files/qz20ss48r/w6636271r/9p292904f/fpex0725.pdf). Note: the widely cited $72.2B / 28.6 percent is a USDA share-of-crop-farm-expenses construct, not the sum of these all-farm lines.

### Appendix B: Input price inflation since 2020

| Input | Change since 2020 |
|---|---|
| Seed | +18 percent |
| Chemicals / pesticides | +25 percent |
| Fuel | +31 to 32 percent |
| Fertilizer | +37 percent |
| Commodity prices received | ~-50 percent from 2022 peaks |

Source: [AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection), [AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability).

### Appendix C: Almond per-acre cost stack (2024 Sacramento Valley)

| Line | Per acre |
|---|---|
| Operating cost | $3,720 |
| Total cost | $7,800 |
| Fertilizer + crop protection | >$800 |
| Irrigation pump energy (Terra Tool 1 wedge) | ~$720 |

Source: [UC Davis 2024 Sample Costs to Produce Almonds](https://coststudyfiles.ucdavis.edu/2024/07/09/2024SacValleyAlmonds7.5.24.%20Final%20draft.pdf).

### Appendix D: Sizing build summary

| Layer | Anchor | Build |
|---|---|---|
| TAM | ~$83B to $99B | USDA NASS 2024 input lines (+ fuel) |
| SAM | ~$10B to $14B | $48.6B CA expenditures x 20 to 29 percent input share (estimate) |
| SOM (early, almonds) | ~$0.5M to $4M/yr | 100k to 200k acres x $5 to $20/acre captured value (estimate) |

---

**Research Completion Date:** 2026-06-14
**Source Verification:** All facts cited inline; estimates and vendor self-reports labeled "(estimate)" and treated as directional.
**Confidence Level:** High on input line items and market mechanics; Medium on SAM; Low to Medium on SOM.

_This is the formal BMAD market-research artifact for the Terra Purchasing Agent (Tool 2). It builds on the 0-research source documents and serves as the analysis input to the product brief and PRD._
