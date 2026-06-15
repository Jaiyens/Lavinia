---
title: Market & Customer Research
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Market & Customer Research: An AI Purchasing Agent for Farm Inputs

_Tool 2 candidate. This document grounds a possible second Terra tool: a farmer-side AI agent for buying crop inputs (seed, fertilizer, crop protection, fuel). It is research, not a commitment. It uses the same thesis Terra proved on energy: make the mess legible first, then find the money hiding in it._

## Executive Summary

Inputs are the largest controllable cost on a US farm, and right now they are squeezing growers from both ends: prices paid are stuck 20 to 40 percent above pre-2021 levels while prices received have collapsed roughly 50 percent from 2022 peaks. Combined crop inputs (chemicals, fertilizer, seed) were $72.2B, or 28.6 percent of crop farms' total 2024 expenses ([AFBF / USDA NASS](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). For corn, seed plus chemicals plus fertilizer is roughly 73 percent of operating cost ([Southern Ag Today](https://southernagtoday.org/2025/07/07/recent-trends-in-farm-operating-costs/)). When margins go negative, as they did for every major row crop in 2025, a few points saved on procurement is the difference between loss and breakeven, which is exactly why input-cost tools earn attention now.

The procurement system is opaque by design. Most inputs flow through a consolidated ag-retail channel where seven companies control roughly 70 percent of crop inputs and services ([CropLife](https://www.croplife.com/croplife-top-100/the-big-seven-of-the-croplife-100-the-evolution-of-americas-largest-ag-retailers/)), and where retailer economics run on manufacturer rebates and program pricing rather than transparent list-minus-margin. The result is no real price discovery: FBN's self-reported transparency work claims up to 283 percent price variation for the same chemical between farmers and a roughly 15 percent average gap between list price and price actually paid (FBN-sourced, directional, not independently audited) ([FBN](https://www.fbn.com/community/blog/ag-chemical-price-transparency-industry-disruptor)). Farmers describe themselves as "price takers, not price makers" ([AgWeb](https://www.agweb.com/news/policy/ag-economy/farmers-say-they-shoulder-cost-mergers-seed-fertilizer-industries)).

The most important framing correction: AI is not absent from ag-input buying, but an autonomous, farmer-side purchasing agent is. FBN shipped an LLM advisor ("Norm," built on OpenAI GPT-3.5) in April 2023 and raised $50M in July 2025 explicitly to expand AI ([Business Wire](https://www.businesswire.com/news/home/20250728822024/en/FBN-Expands-AI-Powered-Platform-for-Ag-Commerce-Financing-and-Farm-Intelligence)). What does not exist is an agent that forecasts an input bill of materials from a crop plan, scouts live prices across suppliers, audits rebate and prepay contracts against real invoices, negotiates, and prepares a one-tap purchase order. Meanwhile, general agentic B2B commerce is real: Pactum's AI has autonomously negotiated $8B+ in spend for Walmart and Maersk ([Thunderbird/ASU](https://thunderbird.asu.edu/thought-leadership/journals-case-series/case-series-listing/pactums-ai-contract-negotiations)), and OpenAI plus Stripe shipped the Agentic Commerce Protocol in 2025.

The recommended beachhead is California specialty and nut growers, with almonds as the wedge. They carry the largest absolute input bills, suffered the deepest 2024 losses (almond net returns swung from +$205/acre in 2019 to a roughly $4,280/acre loss in 2024) ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)), are systematically under-served by row-crop-centric platforms, and are exactly the customers Terra already reaches through its energy tool. The honest near-term design is human-in-the-loop: make spend legible, prove savings retrospectively, then ask for one-tap approval, never default to autonomous buying.

## The Problem: Input Overspend and Procurement Pain

### Inputs are the money

Inputs are where the savings actually live. Seed, fertilizer, and chemicals are about 29 percent of crop-farm expenses overall and roughly 73 percent of corn operating cost ([Southern Ag Today](https://southernagtoday.org/2025/07/07/recent-trends-in-farm-operating-costs/)). The 2024 US line items (USDA NASS, all-farm): fertilizer, lime and soil conditioners $33.8B; seeds and plants $27.4B; agricultural chemicals $21.7B; fuel about $15.4B to $16.5B, against roughly $477.6B in total farm production expenditures ([USDA NASS Farm Production Expenditures 2024 Summary](https://esmis.nal.usda.gov/sites/default/release-files/qz20ss48r/w6636271r/9p292904f/fpex0725.pdf)).

A precision note matters here, because the research itself contained an arithmetic slip. The widely cited $72.2B / 28.6 percent figure is a USDA construct: combined crop inputs as a share of crop-farm expenses. It is not the simple sum of the three all-farm line items above, which add to roughly $82.9B. Both numbers are real; they answer different questions. We use $72.2B for "crop-input share of crop-farm spend" and roughly $83B for "the sum of the addressable all-farm input lines."

### The cost-price squeeze (why it hurts right now)

Since 2020, input prices climbed sharply: seed +18 percent, chemicals/pesticides +25 percent, fuel +31 to 32 percent, fertilizer +37 percent ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)). Over the same window, row-crop commodity prices fell roughly 50 percent from 2022 peaks. The result: 2025 per-acre profitability is negative for every major row crop, with corn at -$169, cotton at -$379, and soybeans at -$114 per acre ([AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). Net farm income fell from roughly $182B in 2022 to roughly $140.7B in 2024, down about 22 percent.

### Working capital is the hidden half of the problem

Inputs must be financed up front and recouped only at harvest, so the input bill is the working-capital problem. In 2025, farm operating loans averaged roughly 30 percent larger year over year, and first-year interest expense rose 70 to 90 percent ([KC Fed](https://www.kansascityfed.org/agriculture/agfinance-updates/larger-operating-loans-boost-farm-lending-activity-in-2025/)). Chapter 12 farm bankruptcies hit 315 in 2025, up 46 percent ([RFD-TV / AFBF](https://www.rfdtv.com/afbf-sounds-alarm-on-farm-bankruptcies-as-larger-loan-sizes-and-rates-strain-farm-finances-further)).

### Price opacity removes the farmer's leverage

There is no public, real-time price benchmark. USDA still relies on an annual voluntary fertilizer survey, and a bipartisan Fertilizer Transparency Act would force USDA to publish weekly prices ([Agri-Pulse](https://www.agri-pulse.com/articles/24432-house-bill-aims-to-provide-fertilizer-price-transparency)). Into that vacuum, FBN's transparency reports claim up to 283 percent price variation for the same product between farmers and a roughly 15 percent average gap between list and paid price, with a documented example of Roundup PowerMAX 3 paid at $45 to $73/gal against a $60 list (all FBN-sourced and directional, not independently audited) ([DRG/FBN](https://drgnews.com/2023/04/04/farmers-face-extreme-variation-in-the-price-of-inputs/)). FBN's own data also admits the savings are thinner than the headline: the below-average half of buyers got only about 14 percent off list, not 50 percent.

Opacity is reinforced by supplier concentration. Four firms control roughly 77 percent of US nitrogen and effectively all potash and phosphate; Bayer plus Corteva control roughly 70 percent of corn and soybean seed (about 72 percent corn, 66 percent soybean) ([AEI](https://www.aei.org/research-products/report/market-concentration-in-agricultural-industries/), [Farm Action](https://farmaction.us/concentrationdata/)). Seed prices rose roughly 270 percent from 1990 to 2020 (Farm Action; advocacy-sourced, treat the exact figure as an estimate).

### Specialty and nut growers feel it hardest

Specialty growers carry the largest absolute input and labor bills and took the deepest 2024 losses. Average specialty-crop cash expense is about $466k per farm, up 47 percent since 2021, with labor about 40 percent of cost ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)). Almond net returns swung from +$205/acre (2019) to a roughly $4,280/acre loss (2024). Strawberries run near $113,000/acre in cost and navel oranges moved from $1,555/acre (2005) to $4,215/acre (2025); these are region- and year-specific cost-study figures and should not be read as statewide or current-universal numbers (estimate). The almond per-acre stack is the sharpest anchor: UC Davis pegs 2024 Sacramento Valley almonds at $3,720/acre operating cost and $7,800/acre total cost, with fertilizer and crop-protection lines totaling well over $800/acre and irrigation (pump energy, Terra's first wedge) at about $720/acre ([UC Davis 2024 Sample Costs to Produce Almonds](https://coststudyfiles.ucdavis.edu/2024/07/09/2024SacValleyAlmonds7.5.24.%20Final%20draft.pdf)).

## How Farms Buy Inputs Today

### The channel: a consolidated dealer, co-op, and retailer layer

Almost no inputs are bought direct from manufacturers. They flow through a two- or three-step channel: manufacturer to distributor to ag retailer to farm. The retail layer is dominated by the "Big Seven" (CHS, GreenPoint Ag, Wilbur-Ellis, GROWMARK, Simplot Grower Solutions, Nutrien Ag Solutions, Helena), which together supply roughly 70 percent of crop inputs and services ([CropLife](https://www.croplife.com/croplife-top-100/the-big-seven-of-the-croplife-100-the-evolution-of-americas-largest-ag-retailers/)). The 2024 CropLife 100 booked $43.3B in sales, down 7.2 percent year over year ([CropLife 2024](https://www.croplife.com/croplife-top-100/the-2024-croplife-100-weathering-a-rough-year-in-ag-retail/)). Nutrien Ag Solutions is the leader at roughly $14.5B retail sales in 2024 and 2025, with about $3.6B gross margin, roughly 1,800 locations, and 4,000-plus crop consultants ([Nutrien 2024 results](https://www.nutrien.com/news/press-releases/nutrien-reports-fourth-quarter-and-full-year-2024-results-1717)). The others are largely private or co-op: Helena around $1.6B+ across 362 locations, Simplot Grower Solutions serving about 38,000 growers across 260-plus locations, Wilbur-Ellis at $1B+.

### Why pricing is opaque, and where the margin hides

This is the core mechanic. Crop-protection retail runs on manufacturer rebate and program pricing, not transparent list-minus-margin. Marketing programs average about 25 percent of a manufacturer's selling price and exceed 50 percent on some products, while channel margins plus retained rebates total only about 11 to 12 percent. That implies retailers often run a 13 to 14 percent negative up-front margin and only get whole by hitting rebate and volume thresholds at year-end (CropLife trade analysis, not audited financials, so directional) ([CropLife: Marketing/Rebate Programs](https://www.croplife.com/management/marketingrebate-programs/), [CropLife: Playing the Game](https://www.croplife.com/management/crop-protection-rebates-playing-game/)).

The consequence for the farmer is that price discovery is broken. The "real" net price only emerges after year-end rebates and after negotiation, so quotes cannot be compared cleanly. Pricing is deliberately tiered by farm size and sophistication, so smaller or less-savvy growers pay more for identical product. Generic-for-branded substitution can save up to roughly 35 percent (FBN-sourced, directional) but is under-surfaced by retailers whose rebates favor branded products.

### How the decision gets made, and when

The owner-operator decides, but anchored to a trusted local agronomist relationship; agronomic credibility and field service, not just price, drive loyalty ([Purdue](https://agribusiness.purdue.edu/2026/03/04/what-business-are-you-really-in-the-four-economic-models-redefining-agricultural-retail/)). Timing is strategic. A fall strategy positions price early via prepay and on-farm storage (nitrogen is often cheaper in fall); winter and spring are reactive ([MSU Extension](https://www.canr.msu.edu/news/best-practices-for-buying-farm-inputs)). Prepay does three jobs at once: lock price, capture early-order discounts, and deduct expenses before January 1 for tax. But it forces the grower to front cash months ahead and bear counterparty risk if prices fall or product sells out (seed is often gone by Thanksgiving, chemicals by President's Day).

### Equipment and fuel

Equipment repair is the clearest downstream margin pool. Per Deere filings and plaintiff/PIRG estimates, Deere and its dealers make 3 to 6 times more profit on parts and repairs than on new machines, and right-to-repair restrictions cost farmers roughly $4.2B/yr (PIRG estimate) ([PIRG](https://pirg.org/updates/dealership-consolidation-raising-repair-costs-farmers/)). Deere settled a right-to-repair class action for $99M in 2025, agreeing to open diagnostics to farmers and independent shops for about 10 years ([Law Commentary](https://www.lawcommentary.com/articles/john-deere-to-pay-99-million-to-settle-right-to-repair-lawsuit-over-farm-equipment)). Fuel is comparatively transparent: dyed off-road diesel is tax-exempt (about 24 to 40 cents/gal saving) and bought via co-op or distributor keep-full delivery, so volume and delivery fees dominate the math.

## Buyer and Decision-Maker Behavior

### Who actually decides

The farm owner signs off but does not decide alone. Every grower keeps a small "circle of trusted advisors," typically just five to six people, and the ag retailer or dealer agronomist is in that circle nearly 100 percent of the time ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/)). Advisors are decisive on inputs: 74 percent of farmers who get crop scouting from their retailer say the retailer strongly influences their chemical purchases, and advisors touch roughly 80 percent of pest and disease decisions. In California specifically, the licensed PCA (Pest Control Adviser) is the legal gatekeeper for crop-protection recommendations ([California Ag Today](https://californiaagtoday.com/pest-control-adviser-certified-crop-adviser-programs/)). For an input-buying agent, this advisor is both a competitor for trust and the most efficient distribution channel: tools that arm the advisor get adopted faster than tools that try to bypass them.

Engagement scales with farm size: more than 80 percent of crop producers interact with dealer agronomists, but small farms only 43 percent versus 84 percent for large farms ([Purdue](https://agribusiness.purdue.edu/2024/08/28/how-farmers-interact-with-agribusiness-reps/)). A Batth-scale operation (183 meters, multiple entities) sits firmly in the high-engagement tier.

### Trust, loyalty, and switching costs

Relationships beat brands and companies. Across Purdue's 2017 to 2025 Large Commercial Producer surveys, farmers consistently rate "my relationship with the salesperson is more important than my relationship with the company" at 6.8 to 7.0 on a 9-point scale ([Purdue 2025](https://agribusiness.purdue.edu/2025/10/30/how-u-s-farmers-perceive-agricultural-dealers-and-retailers-insights-from-2017-to-2025)). Switching costs are largely relational, the loss of personal bonds, not contractual. Yet loyalty is shallow on price: only about a third of farmers call themselves brand-loyal, and 60 percent would switch brands for a 10 percent discount ([The Grower](https://thegrower.org/news/price-performance-loyalty-which-one-works-you)). In buying-process surveys, 50 percent of farmers could not get pricing data, 41 percent could not compare products, and 36 percent could not get product details ([The Daily Scoop](https://www.thedailyscoop.com/news/retail-business/farm-business-2026-relationship-first-digital-convenience-second)). The wedge is making hidden money and pricing legible, exactly what farmers say they cannot get today, while respecting rather than attacking the trusted advisor.

### Why farmers are skeptical, and what flips them

Skepticism is earned. Prior tools over-promised, and permanent-crop growers feel the downside for two to three years (one Westside almond grower tried deficit irrigation on Extension's advice, got burned, then Extension reversed itself) ([Farmland Info](https://www.farmlandinfo.org/wp-content/uploads/sites/2/2019/09/SpecialityCropGrowersBMPs.pdf)). The dominant barriers: unclear ROI (53 percent of North American farmers are very concerned about demonstrated ROI before investing in agtech), low digital literacy, data-privacy fear, time and labor scarcity, and tool interoperability friction ([McKinsey](https://www.mckinsey.com/industries/agriculture/our-insights/global-farmer-insights-2024)). What flips them: peer and neighbor proof, on-farm trials, fast and visible dollar wins (weeks, not seasons), dead-simple UI, and retrospective evidence using the grower's own numbers. In Terra's own energy lane, Wexus showed one operation 40 percent and roughly $40,000 in annual savings on a single irrigation pump via rate analysis (vendor-stated, single-customer anecdote, not a portfolio average; estimate) ([Wexus](https://wexusapp.com/)).

### What it would take to delegate buying

This is the steepest trust climb. There is no ag-specific data on willingness to let software buy inputs autonomously. The closest analogue is cross-industry: only 27 percent of consumers are confident in fully autonomous AI financial transactions, and fewer than 25 percent of B2B suppliers use agentic AI today (estimate / cross-industry, not farm-specific) ([Trantor](https://www.trantorinc.com/blog/human-in-the-loop-vs-fully-autonomous-ai-agents)). The realistic path for a skeptical, low-literacy grower is staged: prove retrospective accuracy first, then close the predicted-versus-actual loop, then offer human-in-the-loop one-tap approval ("buy this SKU at $X, save $Y"), bounded by dollar caps and advisor visibility, and only much later true delegation. Terra's existing Recommendation grammar (situation, action, dollar impact, one-tap response, after-the-fact result) is already the right shape for this.

## Market Sizing

All figures below are anchors, not precise totals. Software willingness-to-pay tracks a far smaller pool than the input spend it sits on, so the SOM is built bottom-up, not as a slice of the input TAM.

### TAM: the addressable input and energy spend

- US total farm production expenditures: roughly $477.6B (2024), down about 0.9 percent year over year ([USDA NASS](https://esmis.nal.usda.gov/sites/default/release-files/qz20ss48r/w6636271r/9p292904f/fpex0725.pdf)).
- Directly addressable crop-input lines (USDA NASS, all-farm 2024): fertilizer/lime $33.8B + seed $27.4B + ag chemicals $21.7B = roughly $83B.
- Adding fuel (about $15.4B to $16.5B) brings the input-and-energy envelope to roughly $99B/yr.
- **TAM anchor: approximately $83B (inputs) to $99B (inputs plus fuel/energy) of annual US spend the agent could influence.**

The relevant monetizable layer, however, is software and savings capture, not the gross spend. Treat the $83B to $99B as the pool the product attacks, not revenue available to it.

### SAM: California specialty and the chosen segment

- California is the number-one state for farm expenditures at $48.6B in 2024, 10.2 percent of the US total, driven by high-cost specialty crops ([USDA NASS 2025 Highlights](https://data.nass.usda.gov/Publications/Highlights/2025/2025_FarmExpenditures_Highlights.pdf)).
- California agricultural cash receipts were $61.2B in 2024 ([USDA / CDFA via The Ag Center](https://theagcenter.com/news/california-agriculture-surpasses-60-billion-in-production-value-growth-challenges-and-the-road-ahead/)).
- Almonds alone: roughly 1.38M bearing acres (2024), with estimated US almond total annual production cost around $10.85B (AFBF estimate) ([AFBF](https://www.fb.org/market-intel/specialty-crops-need-economic-aid-case-studies-almonds-apples-blueberries-lettuce-potatoes-and-strawberries)).

**SAM build (explicit assumptions):**
- Start from California farm expenditures of $48.6B.
- Assume the addressable input share (fertilizer, seed, crop protection, fuel) is in the same band as the national crop-input share, roughly 20 to 29 percent of expenditures. That yields roughly $9.7B to $14.1B of California input spend (estimate; the share is inferred from national ratios, not a California-specific measurement).
- **SAM anchor: roughly $10B to $14B of annual California specialty and row-crop input spend the agent could serve, with almonds and tree nuts the densest sub-pool.**

### SOM: bottom-up from per-acre and per-farm value

The defensible SOM is priced against realized savings per acre and per farm, not against the input TAM. Two anchors:

**Per-acre anchor (almonds).** UC Davis puts 2024 Sacramento Valley almond operating cost at $3,720/acre, of which fertilizer and crop-protection lines exceed $800/acre ([UC Davis](https://coststudyfiles.ucdavis.edu/2024/07/09/2024SacValleyAlmonds7.5.24.%20Final%20draft.pdf)). If an agent reliably captures even 5 to 10 percent of the chemical-plus-fertilizer line (within the band of FBN's directional savings claims, hedged), that is roughly $40 to $80/acre of grower value. A SaaS or gain-share product could plausibly capture $5 to $20/acre of that as revenue (estimate).

**Per-farm and segment anchor.** California has roughly 1.38M almond bearing acres. Serving even 100,000 to 200,000 acres at $5 to $20/acre of captured value implies roughly $0.5M to $4M of early annual revenue from almonds alone (estimate). Extending across California tree nuts and high-value specialty crops scales that several-fold. These are illustrative ranges built from per-acre economics, not a forecast.

**Software-market reality check.** The software layers these products live in are an order of magnitude smaller than the input spend below them: farm management software roughly $2.8B to $5.5B (2024, wide vendor variance), precision agriculture roughly $10B to $12B globally, broad agtech roughly $15B to $32B depending on definition (all private market-research estimates with inconsistent definitions; treat any single number as an order-of-magnitude anchor) ([Grand View Research](https://www.grandviewresearch.com/industry-analysis/farm-management-software-market), [Expert Market Research](https://www.expertmarketresearch.com/reports/agtech-market)). US ag-product e-commerce is roughly $9B (2025) with inputs about 35 percent of that ([SNS Insider](https://www.snsinsider.com/reports/e-commerce-of-agricultural-products-market-9559)).

### A note on the agentic-commerce tailwind (forecasts, not facts)

Gartner projects AI agents will intermediate roughly 90 percent of B2B buying, about $15T, by 2028, and that SCM software with agentic AI will grow from under $2B (2025) to $53B by 2030 (both Gartner forecasts, inherently uncertain and aggressive) ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2026-04-07-gartner-forecasts-supply-chain-management-software-with-agentic-ai-will-grow-to-53-billion-in-spend-by-2030)). The counter-evidence is the trust and adoption data above (27 percent consumer trust in autonomous payments; under 25 percent supplier adoption), so these forecasts set direction, not a near-term ceiling.

## Segments and Beachhead

### Recommended beachhead: California specialty and nut growers (almonds first)

The beachhead is California almond and tree-nut growers, expanding to broader high-value California specialty crops. The reasoning:

1. **Largest absolute pain, deepest current losses.** Specialty growers carry the biggest input and labor bills (about $466k average cash expense, up 47 percent since 2021), and almonds took the deepest 2024 hit (roughly $4,280/acre loss) ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)). Acute pain shortens the sales cycle.
2. **Structural under-service.** The category leaders (FBN, GROWERS, Growers Edge) are row-crop-centric, with national-average benchmarking that is weak for permanent and specialty crops. An agent tuned to almond, citrus, and produce input economics is largely greenfield.
3. **Distribution Terra already owns.** Terra's energy tool reaches exactly this customer (Batth Farms: roughly 183 meters, 57 PG&E accounts, 6 entities). A purchasing agent can ride that relationship, the same legibility brand, and the same Recommendation grammar, rather than acquiring a cold audience.
4. **The legibility thesis transfers cleanly.** The multi-entity, multi-account spend mess Terra already untangles for PG&E energy exists identically for input spend across co-op and retailer accounts. Making a sprawling operation's full input spend legible (all SKUs, dealers, ranches, entities) before recommending cuts is the wedge no incumbent occupies.

### Why not the obvious alternative (Midwest row crops)

Midwest row crops are the larger raw market and where FBN, GROWERS, and Bushel are strongest, with denser retailer networks. That is precisely why it is the wrong beachhead: it is a crowded, well-served, transactional market where Terra has no distribution and no differentiation. Specialty crops trade a smaller TAM for an open lane and a warm channel.

### Adjacent expansion paths (later, not now)

- **Group buying and rebate capture** (GPO and Dining Alliance model): pool grower volume, auto-collect manufacturer rebates, pay back as a check. Lowest friction, highest trust, no behavior change.
- **Harvest-timed financing** (Faire net-terms model adapted to the crop cycle): the seasonal working-capital squeeze makes pay-at-harvest terms arguably more valuable in ag than in retail.
- **Gain-share autonomous negotiation** (Pactum model): fire RFQs to local dealers and co-ops, negotiate the long tail, and charge only from realized savings, which aligns perfectly with a skeptical operator.

These are the durable monetization rails the analogous-models research surfaces; the standalone "make the farm legible" software layer is necessary but historically not a business by itself. Every durable ag-tech winner bolts a money-moving rail (commerce, financing, warranty, or transaction take-rate) onto the data.

## Key Risks and Unknowns

- **Trust and delegation risk.** Letting software buy is the steepest ask, and the only data we have is cross-industry (27 percent trust autonomous payments). Mitigation: human-in-the-loop with one-tap approval and dollar caps as the default, never autonomous buying on day one. This is an assumption, not a measured fact for farms.
- **Advisor conflict.** The trusted agronomist or PCA is both gatekeeper and a seller of the product being optimized. A tool that threatens that relationship risks rejection. Open question: arm the advisor, or route around them, or both.
- **Channel retaliation and access.** Incumbent retailers fought FBN hard (including a closed Canadian Competition Bureau investigation). Supplier catalogs are not machine-readable, a prerequisite Gartner flags for agent intermediation. Live cross-supplier quoting may be blocked or slow-walked by the channel.
- **FBN is a moving, well-capitalized competitor, and its numbers are contested.** FBN has raised roughly $978M over 12 rounds (Tracxn; PitchBook's higher $1.15B is a single-source outlier, treat as estimate), reached a $3.9B valuation at its November 2021 Series G, and raised $50M in July 2025 with no valuation disclosed ([Tracxn](https://tracxn.com/d/companies/fbn/__fw4xRp4VGbU0dYKDMjwHy_HicO3HL2L1yjqbRg23rKw), [Global AgInvesting](https://globalaginvesting.com/farmers-business-network-closes-300m-series-g-gains-4b-valuation/)). FBN serves 117,000-plus farms and 187M acres (2025, FBN-stated). Its revenue is not publicly disclosed; third-party estimates range from $211M to $400M and conflict with each other (unverified estimates). FBN does use AI (the "Norm" advisor) and is spending to expand it, so any positioning that assumes "no AI in ag procurement" is wrong; the accurate gap is the absence of an autonomous farmer-side purchasing agent.
- **Savings claims are largely unaudited.** Every headline savings and price-variation figure in this space (FBN's 15 to 40 percent, 283 percent variation, 32 percent on ag chem; Wexus's 40 percent on one pump) is vendor-self-reported and directional. Terra must build its own provable, retrospective savings number from real invoices before making any claim. This is both a risk (the market's numbers are soft) and an opportunity (an independently verified savings figure would be differentiating).
- **No public price benchmark exists.** USDA's annual voluntary survey is the only public reference; FBN's benchmark is a walled garden. Building a credible benchmark requires network scale that does not exist on day one, which argues for capturing real invoice and spend data first (the legibility wedge) before promising comparison.
- **Cautionary tales are real.** Indigo Ag reportedly fell roughly 94 percent to a disputed ~$200M from a ~2021 peak of ~$3.5B (Indigo publicly called the $200M figure incorrect; treat as estimate), and Silo's lending blowup paused its product. The repeated failure mode is over-promising a thin-margin "tech-enabled" trade as high-margin tech. Distribution and trust to a skeptical, low-literacy buyer decide winners, not model sophistication.
- **Market-size precision is low.** Agtech and farm-management-software TAMs vary two- to three-fold by vendor and definition. The SOM build here is bottom-up from per-acre economics for exactly this reason; treat the top-down TAM and SAM as order-of-magnitude anchors, not precise totals.

---

_Sources are cited inline. Figures labeled "(estimate)" are forecasts, advocacy-group estimates, vendor self-reports, or inferences from adjacent data rather than verified primary-source facts. Vendor savings claims (FBN, Wexus) are directional and not independently audited._
