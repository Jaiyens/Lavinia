---
title: Domain Research: Agricultural-Input Procurement
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Domain Research: Agricultural-Input Procurement

**Date:** 2026-06-14
**Author:** Jaiyen
**Research Type:** Domain Research (industry, competitive, regulatory, technical, synthesis)
**Subject product:** Terra Purchasing Agent (Terra Tool 2), the farmer-side AI input-procurement agent

---

## Research Overview

This report studies the domain a farmer-side input-procurement agent has to live inside: how crop inputs (seed, fertilizer, crop protection, fuel) actually get bought in the United States, where the money hides on the way from manufacturer to field, what rules govern the products being bought and the act of buying them, and which technologies make an autonomous buying agent possible now. It is the domain layer beneath the three research files already in this folder (the clone-target and AI thesis, the market and customer research, and the competitor teardown). Those files answer "is there a business here and who do we copy." This file answers "what does the ground we are building on actually look like."

The headline findings: the input-distribution chain is short on steps but deep on hidden margin, and the margin hides in three places on purpose (manufacturer rebate and program pricing, size-and-sophistication zone pricing, and prepay timing). The regulatory landscape splits cleanly in two: heavy, real rules on the products (FIFRA and EPA at the federal level, the California Department of Pesticide Regulation and its restricted-material permit and licensed-adviser system at the state level), and a thin, fast-moving set of rules on the act of agentic buying (no ag-specific agent law yet, but emerging payment-rail standards like the Agentic Commerce Protocol, Visa Intelligent Commerce, and Mastercard Agent Pay). The technical trends are real but earlier than the hype: autonomous B2B negotiation is proven at scale outside agriculture (Pactum, Keelvar), ag freight execution agents exist (Ever.Ag Roger), but supplier catalogs are mostly not machine-readable and trust to delegate spend is low. The synthesis section turns this into a list of what the domain makes possible for our product versus what it makes hard.

The full executive summary, key findings, and strategic recommendations are in the Research Synthesis section near the end. Every factual claim is cited inline to the sources already gathered in the 0-research files. Figures that are vendor self-reports, advocacy estimates, or forecasts are labeled "(estimate)."

---

## Domain Research Scope Confirmation

**Research Topic:** Agricultural-input procurement (the buying of seed, fertilizer, crop protection, and fuel by US farms, with a California specialty and tree-nut focus)

**Research Goals:** Map the input-distribution value chain and where margin hides; document the regulatory landscape that governs both the products and the act of agentic buying; survey the technical trends (agentic AI, RFQ and reverse-auction tooling, ag freight agents, agentic-payment standards) that make a buying agent buildable; and synthesize what the domain makes possible versus hard for Terra's farmer-side purchasing agent.

**Domain Research Scope:**

- Industry and value-chain analysis: the manufacturer-to-distributor-to-retailer-to-farm chain, channel concentration, and the rebate, zone-pricing, and prepay mechanics where margin hides.
- Competitive landscape: the input marketplaces and transparency plays, the incumbent ag-retail channel, ag-fintech, and the adjacent procurement-tech players, with the white space identified.
- Regulatory environment: FIFRA and EPA pesticide rules, California DPR permits and restricted-material rules, the proposed Fertilizer Transparency Act, and the emerging agentic-commerce and agentic-payment standards.
- Technology trends: agentic AI in procurement, RFQ and reverse-auction tech (Keelvar, Pactum), ag freight agents (Ever.Ag Roger), and the payment rails (ACP, Visa, Mastercard).
- Synthesis: what the domain enables and what it makes hard, with implementation considerations and risk.

**Research Methodology:** This is a synthesis of the three 0-research files in this folder, which were themselves built from public sources (USDA NASS, AFBF, CropLife, Purdue agribusiness surveys, UC Davis cost studies, company filings, and trade press). Claims are cited inline to those sources. Where a number is a vendor self-report, an advocacy-group estimate, or a forecast, it is labeled "(estimate)." The honest posture throughout: the input opacity is real and severe, but the moat for our product is execution, the independent non-seller position, and Terra's shared data model, not secret technology.

**Scope Confirmed:** 2026-06-14

---

## Table of Contents

1. Research Introduction and Methodology
2. Industry Overview and the Input-Distribution Value Chain
3. Where the Margin Hides (Rebates, Zone Pricing, Prepay)
4. Competitive Landscape and Ecosystem
5. Regulatory Framework and Compliance Requirements
6. Technical Trends and Innovation Landscape
7. Research Synthesis: What the Domain Makes Possible vs Hard
8. Risk Assessment and Implementation Considerations
9. Source Documentation and Confidence Notes

---

## 1. Research Introduction and Methodology

### Why this research matters now

Crop inputs are the largest controllable cost on a US farm and the prices are squeezing growers from both sides. Combined crop inputs (chemicals, fertilizer, seed) were $72.2B, or 28.6 percent of crop-farm total expenses, in 2024 ([USDA NASS via AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). The all-farm USDA line items add to roughly $83B (fertilizer and lime $33.8B, seeds and plants $27.4B, agricultural chemicals $21.7B), and adding fuel (about $15.4B to $16.5B) brings the input-and-energy envelope to roughly $99B per year ([USDA NASS Farm Production Expenditures 2024](https://esmis.nal.usda.gov/sites/default/release-files/qz20ss48r/w6636271r/9p292904f/fpex0725.pdf)). For corn, seed plus chemicals plus fertilizer is about 73 percent of operating cost ([Southern Ag Today](https://southernagtoday.org/2025/07/07/recent-trends-in-farm-operating-costs/)).

The timing is forced. Input prices sit roughly 20 to 40 percent above pre-2021 levels while commodity prices fell about 50 percent from 2022 peaks, pushing every major row crop to a negative 2025 per-acre margin (corn -$169, cotton -$379, soybeans -$114) ([AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). Net farm income fell roughly 22 percent from 2022 to 2024, operating loans ran about 30 percent larger year over year, and Chapter 12 farm bankruptcies hit 315 in 2025, up 46 percent ([KC Fed](https://www.kansascityfed.org/agriculture/agfinance-updates/larger-operating-loans-boost-farm-lending-activity-in-2025/)). In a negative-margin year, a few points off the input bill is the difference between a loss and a breakeven, which is exactly when a savings tool earns attention. Understanding how the buying actually works, and where it leaks money, is the prerequisite for building an agent that finds those points.

### Research methodology

- **Research scope:** the input-distribution value chain, the margin mechanics, the competitive field, the product and commerce regulations, and the agent-enabling technology, framed for a California specialty and tree-nut beachhead (almonds first).
- **Data sources:** the three 0-research files in this folder, drawing on USDA NASS, AFBF, CropLife, Purdue agribusiness surveys, UC Davis cost studies, company filings and press releases, and trade press. All citations are inline.
- **Analysis framework:** value-chain mapping, the standard domain-research structure (industry, competitive, regulatory, technical, synthesis), and a deliberate honesty pass on every vendor-sourced figure.
- **Time period:** current focus (2024 to 2026 data) with historical context where it explains structure.
- **Geographic coverage:** US national for structure and channel, California-specific for the regulatory and beachhead detail.

### Research goals and achieved objectives

- Mapped the manufacturer-to-farm chain and located the three places margin hides on purpose.
- Documented the product-side regulatory load (FIFRA, EPA, California DPR, the PCA system) and the commerce-side rules (the proposed Fertilizer Transparency Act, agentic-payment standards).
- Surveyed the agent-enabling technology and graded how ready each leg is.
- Produced a synthesis of domain enablers versus domain blockers, with risk and sequencing.

---

## 2. Industry Overview and the Input-Distribution Value Chain

### The chain is short on steps, long on opacity

Almost no inputs are bought direct from the manufacturer. They move through a two- or three-step channel: manufacturer to distributor to ag retailer to farm. The retail layer is the gate, and it is consolidated. Seven retailers (the "Big Seven": CHS, GreenPoint Ag, Wilbur-Ellis, GROWMARK, Simplot Grower Solutions, Nutrien Ag Solutions, Helena) together supply roughly 70 percent of crop inputs and services ([CropLife](https://www.croplife.com/croplife-top-100/the-big-seven-of-the-croplife-100-the-evolution-of-americas-largest-ag-retailers/)). The 2024 CropLife 100 booked $43.3B in sales, down 7.2 percent year over year, a sign the downturn is squeezing the channel too ([CropLife 2024](https://www.croplife.com/croplife-top-100/the-2024-croplife-100-weathering-a-rough-year-in-ag-retail/)).

Nutrien Ag Solutions is the leader, at roughly $14.5B retail sales in 2024 and 2025, about $3.6B gross margin, roughly 1,800 locations, and more than 4,000 crop consultants, around 20 percent of US ag retail ([Nutrien 2024 results](https://www.nutrien.com/news/press-releases/nutrien-reports-fourth-quarter-and-full-year-2024-results-1717)). The rest are largely private or co-op: Helena around $1.6B-plus across 362 locations, Simplot Grower Solutions serving about 38,000 growers across 260-plus locations, Wilbur-Ellis at $1B-plus.

### Supplier concentration upstream compounds it

The opacity is not only at the retail gate. Upstream, four firms control roughly 77 percent of US nitrogen and effectively all potash and phosphate, and Bayer plus Corteva control roughly 70 percent of corn and soybean seed (about 72 percent corn, 66 percent soybean) ([AEI](https://www.aei.org/research-products/report/market-concentration-in-agricultural-industries/), [Farm Action](https://farmaction.us/concentrationdata/)). Seed prices rose roughly 270 percent from 1990 to 2020 (Farm Action, advocacy-sourced, treat the exact figure as an estimate). Concentrated supply plus a concentrated retail gate plus no public price benchmark is the structural recipe for a farmer who calls himself a "price taker, not a price maker" ([AgWeb](https://www.agweb.com/news/policy/ag-economy/farmers-say-they-shoulder-cost-mergers-seed-fertilizer-industries)).

### The value chain, component by component

- **Manufacturers (basic producers and formulators):** seed genetics, off-patent and patented active ingredients, fertilizer feedstock. Margin here is protected by patents and brand, and increasingly by the rebate programs they run downstream (below).
- **Distributors / wholesalers:** move product to retail; the layer FBN and direct-buy plays try to buy nearer to, cutting the retailer.
- **Ag retailers (the Big Seven and regional co-ops):** the gate and the relationship. This is where the farmer's trusted agronomist sits, where custom application happens, and where the rebate and zone-pricing mechanics live. Retail economics run on hitting manufacturer rebate and volume thresholds at year-end, not on transparent list-minus-margin (see Section 3).
- **The farm (the buyer):** the owner-operator decides, but anchored to a five-to-six-person circle of trusted advisors in which the dealer agronomist (or, in California, the licensed PCA) sits nearly 100 percent of the time ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/)).

### Industry dynamics and seasonality

Buying is strategic and front-loaded. A fall strategy positions price early via prepay and on-farm storage (nitrogen is often cheaper in fall); winter and spring are reactive ([MSU Extension](https://www.canr.msu.edu/news/best-practices-for-buying-farm-inputs)). Seed is often gone by Thanksgiving and chemicals by President's Day, so timing and counterparty risk are real. Inputs are bought up front and recouped only at harvest, which makes the input bill the farm's working-capital problem and makes harvest-timed financing as valuable in ag as net-60 terms are in retail.

### Equipment and fuel sit slightly apart

Equipment repair is the clearest downstream margin pool: Deere and its dealers reportedly make 3 to 6 times more profit on parts and repairs than on new machines, and right-to-repair restrictions cost farmers roughly $4.2B per year (PIRG estimate); Deere settled a right-to-repair class action for $99M in 2025 ([PIRG](https://pirg.org/updates/dealership-consolidation-raising-repair-costs-farmers/), [Law Commentary](https://www.lawcommentary.com/articles/john-deere-to-pay-99-million-to-settle-right-to-repair-lawsuit-over-farm-equipment)). Fuel is comparatively transparent: dyed off-road diesel is tax-exempt (about 24 to 40 cents per gallon saving) and bought via co-op or distributor keep-full delivery, so volume and delivery fees dominate the math. For our product, fuel and equipment are adjacent, not the wedge; the wedge is crop protection and fertilizer where the opacity is deepest.

### Market structure summary

- **Market concentration:** high at both ends (four-firm dominance in nutrients and seed; seven-firm dominance in retail).
- **Geographic distribution:** California is the number-one state for farm expenditures at $48.6B in 2024, 10.2 percent of the US total, driven by high-cost specialty crops ([USDA NASS 2025 Highlights](https://data.nass.usda.gov/Publications/Highlights/2025/2025_FarmExpenditures_Highlights.pdf)). California input spend is roughly $10B to $14B per year (estimate, inferred from national input-share ratios applied to California expenditures), with almonds and tree nuts the densest sub-pool.
- **Vertical integration:** the retail layer integrates agronomy advice, custom application, financing, and private-label product, which is precisely what makes it both sticky and conflicted.

---

## 3. Where the Margin Hides (Rebates, Zone Pricing, Prepay)

This is the core mechanic of the domain and the heart of the product opportunity. Crop-protection retail does not run on transparent list-minus-a-known-margin. It runs on three overlapping forms of hidden margin, and the farmer cannot see any of them clearly at the point of sale.

### 3.1 Manufacturer rebate and program pricing

Crop-protection retail runs on manufacturer rebate and program pricing. Marketing programs average about 25 percent of a manufacturer's selling price and exceed 50 percent on some products, while channel margins plus retained rebates total only about 11 to 12 percent. That implies retailers often run a 13 to 14 percent negative up-front margin and only get whole by hitting rebate and volume thresholds at year-end (CropLife trade analysis, not audited financials, so directional) ([CropLife: Marketing/Rebate Programs](https://www.croplife.com/management/marketingrebate-programs/), [CropLife: Playing the Game](https://www.croplife.com/management/crop-protection-rebates-playing-game/)).

The consequence for the farmer: the "real" net price only emerges after year-end rebates and after negotiation, so quotes cannot be compared cleanly at the time of buying. The rebate stack has tiers, thresholds, early-fill milestones, and product-mix requirements. Tools that decode this exist, but only on the retailer side. AgVend's Program Management helps the seller capture rebates ([Tracxn](https://tracxn.com/d/companies/agvend/__gB1NIy7MYN1NMw3_XZqIe2pVcxCmU9ORpkhrs9lsuGQ)). Nobody audits the rebate stack for the grower against the grower's actual invoices. That grower-side audit is greenfield, and the reason it stays greenfield is that it directly reduces the margin retailers earn from opacity.

### 3.2 Zone pricing (price discrimination by farm size and sophistication)

Pricing is deliberately tiered by farm size and sophistication, so smaller or less-savvy growers pay more for identical product. This is not an accident or a glitch; it is the channel's price-discrimination engine, and it is the thing FBN's transparency reports made visible. FBN's self-reported work claims up to 283 percent price variation for the same chemical between farmers (2023 report), up to 468 percent in the 2024 report, and a roughly 15 percent average gap between list price and price actually paid, with a documented example of Roundup PowerMAX 3 paid at $45 to $73 per gallon against a $60 list (all FBN-sourced and directional, not independently audited) ([FBN 2024 via AgWeb](https://www.agweb.com/news/business/fbn-releases-its-2024-ag-chemical-price-transparency-report), [DRG/FBN](https://drgnews.com/2023/04/04/farmers-face-extreme-variation-in-the-price-of-inputs/)). FBN's own data admits the below-average half of buyers got only about 14 percent off list, not the headline figure, so the spread is real but the savings are thinner than the loudest claim.

There is no public, real-time price benchmark to anchor against. USDA still relies on an annual voluntary fertilizer survey ([Agri-Pulse](https://www.agri-pulse.com/articles/24432-house-bill-aims-to-provide-fertilizer-price-transparency)). In buying-process surveys, 50 percent of farmers could not get pricing data, 41 percent could not compare products, and 36 percent could not get product details ([The Daily Scoop](https://www.thedailyscoop.com/news/retail-business/farm-business-2026-relationship-first-digital-convenience-second)). Zone pricing survives because the information needed to defeat it does not exist in one place for the farmer. A normalized, per-unit, same-active-ingredient market band built from real invoices is exactly the thing that dissolves it.

### 3.3 Generic-equivalent substitution

A related margin pool: branded-versus-generic. Generic-for-branded substitution (same active ingredient, off-patent) can save up to roughly 35 percent (FBN-sourced, directional) but is under-surfaced by retailers whose rebate programs favor branded chemistry. The agronomic-trust question is real (growers hesitate on private-label generics without an independent agronomist blessing it), which is why surfacing the generic equivalent is a recommendation to be made carefully and, ideally, alongside the grower's PCA rather than around them.

### 3.4 Prepay and contract timing

Prepay does three jobs at once: lock the price, capture early-order discounts, and deduct the expense before January 1 for tax. But it forces the grower to front cash months ahead and to bear counterparty risk if prices fall or product sells out ([MSU Extension](https://www.canr.msu.edu/news/best-practices-for-buying-farm-inputs)). Prepay is therefore a timing-and-price-risk optimization, not just a discount: the right answer depends on the price outlook, the storage available, the tax position, and the working-capital window. Nobody models this for the grower today. An agent that reconciles every prepay and early-fill contract against the actual invoices, and models prepay timing against price risk, is auditing a margin layer that is otherwise invisible until year-end.

### 3.5 Where this leaves the buyer

The net of all three: price discovery is structurally broken for the farmer. The real net price is a function of rebates the farmer cannot see, a zone the farmer was silently placed in, and timing decisions the farmer made without a model. The domain's deepest opportunity, and the reason an independent (non-seller) agent can win trust no incumbent can, is that every player who touches price today is also a seller and therefore profits from keeping these three layers opaque.

---

## 4. Competitive Landscape and Ecosystem

The full teardown lives in the 0-research competitor file; this section summarizes the domain-level structure and the white space.

### 4.1 Five clusters

1. **Input marketplaces and transparency plays:** FBN (the clone target), GROWERS (free farmer RFQ app plus retailer network), Growers Edge (embedded input financing plus a crop-plan yield warranty), Indigo Ag (marketplace and carbon, a cautionary valuation-collapse tale).
2. **Incumbent ag-retail channel:** the Big Seven plus Nutrien Ag Solutions. The thing being disrupted; opaque program pricing is their margin engine.
3. **Ag-fintech and infrastructure:** Bushel (grain-buyer and retailer software plus payments, powering more than 50 percent of US and Canada grain origination), Growers Edge (financing and warranty).
4. **Ag-retail SaaS:** AgVend (white-label retailer engagement and the rebate-tracking Program Management module, used by 30-plus percent of NA ag retail), the closest analog to rebate auditing but built for the seller.
5. **Energy and water legibility (Terra's current lane):** Wexus (PG&E billing plus meter data, rate analysis), the proof that the legibility thesis pays in this exact customer base.

### 4.2 The clone target, in one line

FBN is the right base: it built a real business on the exact wedge (price opacity), at scale (117,000-plus farms, 187M acres, FBN-stated 2025), and its weaknesses are legible. It raised roughly $978M over 12 rounds (estimate; Tracxn), reached a roughly $3.9B valuation at its November 2021 Series G, and raised $50M in July 2025 to expand AI, no valuation disclosed ([Tracxn](https://tracxn.com/d/companies/fbn/__fw4xRp4VGbU0dYKDMjwHy_HicO3HL2L1yjqbRg23rKw), [DigitalCommerce360](https://www.digitalcommerce360.com/2025/07/28/farmers-business-network-fbn-50-million-funding-ai/)). FBN already ships AI: "Norm," a GPT-3.5-based agronomy and crop-marketing chatbot launched April 2023 ([AgFunderNews](https://agfundernews.com/why-farmers-business-network-launched-norm-an-ai-advisor-for-farmers-built-on-chatgpt)). So the accurate gap is not "no AI in ag procurement." It is "no autonomous, farmer-side purchasing agent."

### 4.3 The cautionary cluster (why software alone is not a business)

The pure farm-ops and data layer repeatedly fails to stand alone and gets absorbed by a strategic: Granular to Corteva (about $300M-plus, 2017) and dismantled, Agrible to Nutrien ($63M, 2018), Conservis to TELUS and Rabobank (2021), Climate FieldView existing only to sell Bayer seed and chem ([AgFunder](https://agfundernews.com/nutrien-acquires-agrible-for-63m-to-create-ag-retailer-of-the-future), [Traction Ag](https://www.tractionag.com/traction-ag-acquires-granular-business-to-expand-solution-value/)). Indigo Ag reportedly fell roughly 94 percent to a disputed roughly $200M from a roughly $3.5B 2021 peak (Indigo called the figure incorrect, treat as estimate); Silo's lending blowup paused its product. The domain lesson: "make the farm legible" software is necessary but historically not a business by itself. Every durable winner bolts a money-moving rail (commerce, financing, warranty, rebate-share, or gain-share take) onto the data.

### 4.4 The white space

1. No one makes a complex multi-entity, specialty-crop operation's full input spend legible (all SKUs, dealers, ranches, entities) before recommending cuts, the way Terra does for energy.
2. No farmer-side autonomous purchasing agent exists (demand-forecast-from-crop-plan, live cross-supplier scouting, grower-side rebate and prepay audit, negotiation, and auto-PO are all greenfield for the grower side).
3. Closed-loop verification (predicted versus actual saved after the invoice posts) is not standard in ag procurement.
4. The independent, farmer-aligned position is open: every incumbent that touches price is also a seller and therefore conflicted.
5. Specialty, nut, and produce growers are systematically underserved by row-crop-centric platforms despite the largest absolute input bills and the deepest 2024 losses (almond net returns swung from +$205 per acre in 2019 to roughly a $4,280-per-acre loss in 2024) ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)).
6. The proven monetization rails (crowdsourced benchmarking, pooled rebates, gain-share negotiation, harvest-timed terms) each exist separately and have never been stitched into one farm-scoped, operator-simple, mobile-first agent.

### 4.5 Ecosystem and partnership note

The trusted advisor is both a competitor for trust and the most efficient distribution channel. 74 percent of farmers who get crop scouting from their retailer say the retailer strongly influences their chemical purchases, and advisors touch roughly 80 percent of pest and disease decisions ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/), [Purdue](https://agribusiness.purdue.edu/2024/08/28/how-farmers-interact-with-agribusiness-reps/)). Tools that arm the advisor get adopted faster than tools that try to bypass them. For the agent, this means the PCA and dealer rep are a partnership surface, not just an obstacle.

---

## 5. Regulatory Framework and Compliance Requirements

The regulatory landscape splits in two: heavy, well-established rules on the products being bought, and a thin, fast-moving set of rules on the act of agentic buying. The product rules constrain what the agent may recommend and where; the commerce rules shape how the agent may transact. Both matter.

### 5.1 Product regulation: FIFRA and the EPA (federal)

Pesticides (a category that includes most crop-protection chemistry) are federally regulated under the Federal Insecticide, Fungicide, and Rodenticide Act (FIFRA), administered by the US EPA. Under FIFRA, every pesticide product must be registered with the EPA before it can be sold or distributed, each product carries an EPA-approved label, and "the label is the law": applying or recommending a product inconsistent with its label is a federal violation. Products are classified as either general-use or restricted-use (RUP); restricted-use products may only be purchased and applied by or under the supervision of a certified applicator.

What this means for a buying agent: the agent operates inside a registered-product universe. It cannot recommend or source a product for a use the label does not allow, it must respect the general-versus-restricted-use distinction, and for any restricted-use product the buyer (or the buyer's certified applicator) must hold the right certification. The agent's product catalog and substitution logic (for example, surfacing a generic equivalent) must check label-allowed crop, label-allowed use, and registration status before it ever surfaces a price. This is a guardrail, not a blocker: FIFRA registration is exactly the kind of structured, authoritative product data an agent can ingest and enforce against.

(Note: FIFRA and EPA specifics here are stated at the level the 0-research files establish, that California's PCA system is the legal gatekeeper for crop-protection recommendations; the federal FIFRA registration and restricted-use framework is the well-known statutory baseline beneath it. Confirm exact current label and registration requirements against the EPA before building the enforcement logic.)

### 5.2 Product regulation: California DPR and the PCA system (state)

California regulates pesticides more tightly than the federal floor, through the California Department of Pesticide Regulation (DPR) and the county agricultural commissioners. Two features matter most for the product:

- **The licensed Pest Control Adviser (PCA) is the legal gatekeeper.** In California, a written recommendation from a licensed PCA is legally required before most agricultural pesticide applications ([California Ag Today](https://californiaagtoday.com/pest-control-adviser-certified-crop-adviser-programs/)). This is not just a relationship norm; it is a legal control point. The agent cannot replace the PCA's recommendation function. It can, and should, arm the PCA and the grower (price the products the PCA recommended, audit the rebates on them, scout equivalents for the PCA to approve), but the recommendation-to-apply authority stays with the licensed human.
- **Restricted-material permits and use reporting.** California requires permits for restricted-material pesticides (a state list broader than the federal RUP list) issued by the county agricultural commissioner, and California has the most complete pesticide-use reporting system in the country (full use reporting for agricultural applications). For the agent, the restricted-material permit status of a product and the buyer constrains what can be sourced and to whom; the use-reporting data, where accessible, is a structured signal about what a farm actually applies.

The implication: in California specifically (our beachhead), the agent must treat the PCA as a first-class, in-the-loop actor and must respect restricted-material permit constraints in its sourcing logic. This is a meaningful design constraint and, handled well, a trust advantage: "we work with your PCA, not around them" is both legally correct and exactly the trusted-advisor-circle posture the customer research demands.

(Confirm the current DPR restricted-material list, permit process, and PCA recommendation requirements against DPR before building enforcement; the 0-research files establish the PCA-as-gatekeeper fact, the rest is the well-documented California regulatory structure around it.)

### 5.3 Commerce regulation: the proposed Fertilizer Transparency Act

A bipartisan Fertilizer Transparency Act would require USDA to collect and publish fertilizer prices weekly, replacing today's annual voluntary survey ([Agri-Pulse](https://www.agri-pulse.com/articles/24432-house-bill-aims-to-provide-fertilizer-price-transparency)). For our product this is a tailwind on two levels. First, it validates the transparency thesis at the policy level: lawmakers agree the price opacity is a real harm worth legislating against. Second, if it passes, it would create a public, authoritative fertilizer price benchmark the agent could anchor against, partly solving the "no public benchmark exists" problem that today forces us to build our own from invoices. It is a proposed bill, not law, so treat any timeline as uncertain (estimate), but the direction of policy is toward more transparency, which is the wind at our back.

### 5.4 Commerce regulation: agentic-commerce and agent-payment standards

There is no ag-specific law governing an AI agent that buys inputs. The relevant rules are the emerging, cross-industry standards for letting software transact on a human's behalf:

- **Agentic Commerce Protocol (ACP):** OpenAI and Stripe shipped the Agentic Commerce Protocol in 2025, an open standard for an AI agent to complete a purchase on a user's behalf. This is the kind of rail the agent's auto-PO and checkout legs ride rather than build.
- **Visa Intelligent Commerce and Mastercard Agent Pay:** the card networks are building agent-payment standards that authenticate and authorize an agent to pay within user-set limits. These provide the dollar-cap and authorization primitives a human-in-the-loop buying agent needs (the agent proposes, the human approves up to a cap, the rail enforces the cap).

The honest read: these standards are arriving, not arrived, and they are general-purpose, not ag-tuned. They make the auto-PO and payment legs buildable rather than hypothetical, but the near-term product should treat them as the future delegated-buy layer, not the day-one default. Day one is human-in-the-loop with one-tap approval and dollar caps; the payment standards are what make true delegation safe and auditable later.

### 5.5 Data protection and trust posture

There is no single ag-data privacy statute that governs invoices and crop plans the way a sector-specific law might, but the trust requirement is acute regardless. Farmers distrust handing receipts and field data to a VC-backed third party (a documented FBN complaint). The American Farm Bureau's Privacy and Security Principles for Farm Data (the "Ag Data Transparency" framework, the Ag Data Transparent certification) is the industry norm: grower owns the data, transparent use, no sale without consent, portability. For our product the binding rules are partly self-imposed and partly Terra's own: never store a grower's utility or financial credentials anywhere the agent or repo can read (the Tool 1 credential discipline carries over), frame data use as legibility-for-the-grower, and make data use transparent. The moat here is trust earned by being the independent agent, not a data-harvesting seller.

### 5.6 Regulatory risk assessment

- **Channel and competition risk:** incumbent retailers fought FBN hard, including a now-closed Canadian Competition Bureau investigation. An agent that scouts around the dealer can trigger hostility. Mitigation: include the existing dealer's quote, arm the PCA, position as the grower's agent rather than a bypass.
- **Product-compliance risk:** recommending or sourcing a product for a non-label use, or to a buyer without the required restricted-material permit or applicator certification, is a real violation. Mitigation: enforce FIFRA label and registration, RUP and California restricted-material status, and PCA-recommendation requirements in the sourcing logic before any price is surfaced.
- **Agentic-payment maturity risk:** the payment-rail standards are early. Mitigation: human-in-the-loop with dollar caps as the default; treat delegated auto-buy as an earned later setting.

---

## 6. Technical Trends and Innovation Landscape

The technologies that make a farmer-side buying agent buildable are real, but they are earlier than the hype and unevenly ready. Here is each leg, graded honestly.

### 6.1 Agentic AI in procurement (proven outside ag, absent inside it)

The general-purpose move is real: AI agents that forecast demand, scout prices, audit contracts, and negotiate. Inside agriculture, the most advanced shipped AI is still a chatbot plus a historical benchmark (FBN's Norm). The autonomous farmer-side buying agent does not exist. So the technical trend is not "is agentic procurement possible" (it is, see Pactum and Keelvar below) but "has anyone built it for the farm" (no).

The honest counterweight: full B2B autonomy is being walked back industry-wide toward "AI-assisted workflows." Fewer than 25 percent of B2B suppliers use agentic AI today, and only about 27 percent of consumers trust fully autonomous AI to make financial transactions (cross-industry analogue, not farm-specific, estimate) ([DigitalCommerce360](https://www.digitalcommerce360.com/2026/03/10/agentic-commerce-faces-reality-check-in-b2b-ecommerce/)). Gartner's headline that AI agents will intermediate roughly 90 percent of B2B buying (about $15T) by 2028 is an aggressive forecast, not a measured fact (estimate) ([Gartner via DigitalCommerce360](https://www.digitalcommerce360.com/2025/11/28/gartner-ai-agents-15-trillion-in-b2b-purchases-by-2028/)). Gartner also forecasts SCM software with agentic AI growing from under $2B in 2025 to $53B by 2030 (forecast) ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2026-04-07-gartner-forecasts-supply-chain-management-software-with-agentic-ai-will-grow-to-53-billion-in-spend-by-2030)). Direction, not a near-term ceiling.

### 6.2 Autonomous negotiation (Pactum) and reverse-auction / RFQ (Keelvar)

This is the most proven agentic-commerce capability, just not in agriculture.

- **Pactum (autonomous long-tail negotiation):** Pactum's AI has autonomously negotiated $8B-plus in spend for Walmart and Maersk; in the Walmart deployment roughly 64 to 68 percent of approached suppliers reached agreement, averaging about 3 percent savings plus roughly 35-day term improvements, on a gain-share fee (about 10 to 15 percent of savings) ([Thunderbird/ASU](https://thunderbird.asu.edu/thought-leadership/journals-case-series/case-series-listing/pactums-ai-contract-negotiations)). The mechanic ports directly: give growers comparable-farm price anchors and let an agent negotiate the long tail with local dealers on a gain-share fee, which aligns the agent's incentive with the farmer's.
- **Keelvar (RFQ and reverse-auction bots):** Keelvar runs sourcing RFQs for volatile-priced commodities, cutting cycle time roughly 70 percent and yielding 3 to 25 percent savings per event (estimate). The mechanic ports: fertilizer and chemical pricing is opaque and dealer-quoted, so an agent that fires an RFQ to multiple local dealers and co-ops and runs a reverse auction creates the price competition the channel currently suppresses.

The portability is the point: the negotiation and RFQ technology is built and battle-tested at enterprise scale. The ag-specific work is the domain layer (rebate-aware net-price normalization, restricted-material constraints, the PCA in the loop), not the negotiation engine itself.

### 6.3 Ag freight and logistics execution agents (Ever.Ag Roger)

Delivery reliability is a top-cited reason farmers love FBN ("they deliver when they say they will"). The logistics-execution leg is already being agent-automated in ag: Ever.Ag's "Roger" runs agentic AI for ag freight execution. This proves the delivery-tracking and shipment-to-the-ranch leg of an auto-PO is buildable on existing rails rather than hypothetical.

### 6.4 Agentic-payment rails (ACP, Visa, Mastercard)

Covered in Section 5.4 as regulation; technically, these are the standards that let the agent prepare a one-tap PO, enforce a dollar cap, and (later) execute a delegated buy. ACP (OpenAI plus Stripe, 2025), Visa Intelligent Commerce, and Mastercard Agent Pay together make the payment and authorization leg ride existing infrastructure. Ride them, do not build them.

### 6.5 The blocking technical reality: machine-readable catalogs

The biggest technical blocker is unglamorous: supplier catalogs are largely not machine-readable, a prerequisite Gartner flags for agent intermediation. Live cross-supplier quoting may be blocked or slow-walked by the channel, both technically (no API) and commercially (the dealer does not want to be price-shopped). This is why the sequencing leads with the grower's own invoice data (which the grower can provide) and the rebate and prepay audit (which needs only invoices and contracts), before the live-quote network that depends on supplier cooperation.

### 6.6 Technology adoption strategy (for our product)

- **Lead with the data the grower already has:** invoices and the crop plan. The retrospective legibility and rebate-audit value lands with zero supplier cooperation required.
- **Buy, don't build, the hard rails:** negotiation (Pactum-style), RFQ (Keelvar-style), freight execution (Roger-style), and payment (ACP, Visa, Mastercard). The differentiation is the ag-and-California domain layer on top, not re-implementing a negotiation engine.
- **Stage autonomy:** retrospective accuracy first, then predicted-versus-actual close-the-loop, then human-in-the-loop one-tap with dollar caps, then (much later, as catalogs and payment rails mature) true delegated auto-buy.

### 6.7 Innovation roadmap and risk mitigation

- **Near term:** invoice ingestion, per-unit same-active-ingredient normalization, rebate and prepay audit, demand forecast from the crop plan. All achievable on grower-provided data.
- **Medium term:** live cross-supplier scouting and RFQ where supplier cooperation or scraped public data allows; gain-share negotiation on the long tail; auto-PO with delivery tracking on agent-payment rails.
- **Risk mitigation:** the technical risks (no machine-readable catalogs, immature payment rails, low trust to delegate) all point the same way: do not over-promise autonomy. Prove dollars retrospectively on the grower's own numbers, keep the human in the loop, and let the harder legs mature underneath a product that is already useful without them.

---

## 7. Research Synthesis: What the Domain Makes Possible vs Hard

This is the section the product team should read twice. It turns the domain into a list of enablers and blockers for Terra's farmer-side purchasing agent.

### 7.1 What the domain makes POSSIBLE

1. **A real, large, controllable prize.** Inputs are $72.2B (28.6 percent of crop-farm expense), roughly $83B to $99B addressable nationally, and roughly $10B to $14B in California (estimate). The money is genuinely there and it is the dominant controllable cost ([USDA NASS via AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)).
2. **Three layers of hidden margin to attack.** Rebate and program pricing, zone pricing, and prepay timing are each a distinct, attackable opacity. The grower-side rebate audit and the per-unit price band are greenfield because incumbents profit from keeping them dark.
3. **An open independent position.** Every player who touches price (FBN, Nutrien, the Big Seven) is also a seller and therefore conflicted. A non-seller agent on gain-share can claim a trust position none of them can.
4. **Proven, portable agentic technology.** Negotiation (Pactum, $8B-plus), RFQ and reverse auction (Keelvar), freight execution (Ever.Ag Roger), and payment rails (ACP, Visa, Mastercard) are built and battle-tested outside ag. We assemble, we do not invent.
5. **A policy tailwind.** The proposed Fertilizer Transparency Act validates the thesis and could hand us a public fertilizer benchmark ([Agri-Pulse](https://www.agri-pulse.com/articles/24432-house-bill-aims-to-provide-fertilizer-price-transparency)).
6. **Structured product data to enforce against.** FIFRA registration and labels, the RUP and California restricted-material lists, and California's pesticide-use reporting are authoritative, ingestible data the agent can use both as compliance guardrails and as signal.
7. **Terra's unfair advantages.** Same customer as Tool 1, same shared data model (Farm, Entity, Ranch/Block, Pump, Crop, and the Recommendation grammar shaped to be executable), and the same crop/irrigation plan that drives energy modeling also yields the input bill of materials. Terra is the only player positioned to derive input demand from a farm it already understands.

### 7.2 What the domain makes HARD

1. **Channel conflict and access.** The Big Seven control roughly 70 percent of inputs and have deep relational lock-in (farmers rate the salesperson relationship 6.8 to 7.0 on a 9-point scale, above the company) ([Purdue 2025](https://agribusiness.purdue.edu/2025/10/30/how-u-s-farmers-perceive-agricultural-dealers-and-retailers-insights-from-2017-to-2025)). An agent that scouts around the dealer risks hostility, exactly what FBN met. Arming the dealer and PCA, not bypassing them, is the mitigation.
2. **Trust to delegate spend.** Only about 27 percent trust fully autonomous AI for financial transactions (cross-industry, estimate), and 53 percent of North American farmers are very concerned about clear ROI before buying ag-tech ([McKinsey](https://www.mckinsey.com/industries/agriculture/our-insights/global-farmer-insights-2024)). Human-in-the-loop with dollar caps is the only honest day-one posture.
3. **No machine-readable supplier catalogs.** Live cross-supplier quoting is blocked technically and commercially. The product must deliver value on grower-provided invoice data first.
4. **No public price benchmark yet.** The credible per-unit band requires network scale or invoice density we do not have on day one (and FBN's benchmark is a walled garden). Capture real invoice data first, benchmark second.
5. **The PCA legal gatekeeper (in California).** The agent cannot make the crop-protection recommendation; the licensed PCA must. This is a hard legal constraint, mitigated by designing the PCA in as a first-class actor.
6. **The thin-margin marketplace trap.** Indigo, Silo, and the absorbed farm-ops layers all show that "tech-enabled trade" sold as high-margin tech fails. The mitigation is to lead with software legibility and gain-share savings and bolt a money-moving rail on, not to take on balance-sheet-heavy logistics or lending on day one.
7. **Savings claims are unaudited across the whole domain.** Every headline number (FBN's 15 to 40 percent, the 283 to 468 percent variation, Wexus's 40 percent on one pump) is vendor self-reported. This is a risk (the market's numbers are soft) and an opportunity (an independently verified, invoice-based savings figure would be genuinely differentiating).

### 7.3 The strategic shape this implies

The domain points to one sequence, and it is the same legibility-first arc Terra proved on energy: (1) make the input spend legible from the grower's own invoices and crop plan, retrospectively, with a per-unit same-active-ingredient band; (2) audit the three hidden-margin layers (rebate, zone, prepay) against actual invoices and contracts; (3) forecast the bill of materials from the crop plan; (4) scout prices and fire RFQs where supplier cooperation allows; (5) negotiate the long tail on gain-share; (6) prepare a one-tap, human-approved PO with delivery tracking and dollar caps, with the PCA and dealer in view; and only later, as catalogs and payment rails mature and after the predicted-versus-actual loop is proven, move toward delegated auto-buy. Lead with a fast, visible, verified dollar win on the grower's own numbers. Arm the trusted advisor circle rather than threaten it. The moat is execution, the independent non-seller position, and Terra's shared data model, not secret technology.

---

## 8. Risk Assessment and Implementation Considerations

### 8.1 Implementation framework

- **Phase 1 (legibility, no supplier cooperation needed):** ingest invoices and the crop plan, normalize to per-unit same-active-ingredient terms, audit rebates and prepay against actual invoices, forecast the bill of materials. Compliance guardrails (FIFRA registration and label, RUP and California restricted-material status, PCA-recommendation requirement) enforced in the catalog logic from day one.
- **Phase 2 (scouting and negotiation):** live cross-supplier scouting and RFQ where cooperation or public data allows; gain-share negotiation on the long tail; the dealer's own quote includable so the agent arms rather than bypasses.
- **Phase 3 (transaction and delegation):** one-tap human-approved PO with delivery tracking on agent-payment rails (ACP, Visa, Mastercard) and dollar caps; delegated auto-buy only after the predicted-versus-actual loop is proven and trust is earned.

### 8.2 Risk register (domain-level)

- **Channel retaliation:** likely if positioned as a bypass. Mitigation: include the dealer's quote, arm the PCA.
- **Product-compliance violation:** real and federal/state. Mitigation: enforce FIFRA, RUP, California restricted-material, and PCA-recommendation rules in sourcing; confirm current requirements with EPA and DPR before building enforcement logic.
- **Trust to delegate:** steepest climb. Mitigation: human-in-the-loop, dollar caps, advisor visibility, retrospective proof first.
- **Data access and privacy:** growers distrust third-party data harvesting. Mitigation: legibility-for-the-grower framing, Ag Data Transparent-style principles, never store credentials the agent or repo can read.
- **Supplier liquidity / network density:** thin for California specialty outside the Midwest row-crop footprint. Mitigation: lead with rebate-audit and benchmark value that pays before a live-quote network exists; start where Terra already has customer density.
- **Thin-margin trap:** Indigo and Silo are the warnings. Mitigation: software legibility plus gain-share first, capital-disciplined, no balance-sheet-heavy logistics or lending on day one.

### 8.3 Success factors

- A verified, invoice-based savings number the grower can check line by line (beats every unaudited vendor claim in the domain).
- The PCA and dealer rep treated as first-class actors, not obstacles.
- Mobile-first, plain operator English (blocks, sets, acres, dealers, ranches, pumps), the same discipline as Tool 1.
- A money-moving rail (gain-share first) bolted onto the legibility layer so the product is a business, not just useful software.

---

## 9. Source Documentation and Confidence Notes

### Primary and secondary sources (as cited inline)

- Market and cost structure: USDA NASS Farm Production Expenditures 2024, AFBF market-intel (general and specialty), Southern Ag Today, UC Davis almond cost studies, KC Fed ag-finance updates.
- Channel and margin mechanics: CropLife (Big Seven, CropLife 100, marketing/rebate programs), Nutrien results, AEI and Farm Action concentration data, MSU Extension (prepay), Purdue agribusiness surveys.
- Transparency and price variation: FBN transparency reports (2023, 2024) via AgWeb and DRG, The Daily Scoop buying-process survey, Agri-Pulse (Fertilizer Transparency Act).
- Competitive and funding: Tracxn, DigitalCommerce360, AgFunderNews, GlobeNewswire, Global AgInvesting, Traction Ag.
- Regulatory (California PCA gatekeeper): California Ag Today. FIFRA/EPA and California DPR structure stated at the baseline level the 0-research files establish; confirm exact current requirements against EPA and DPR before building enforcement.
- Technical and agentic: Thunderbird/ASU (Pactum), DigitalCommerce360 and Gartner (agentic-commerce reality check and forecasts), McKinsey (farmer insights).

### Confidence notes

- **High confidence:** the existence and shape of the three hidden-margin layers; channel concentration; the negative-margin macro; the PCA-as-legal-gatekeeper fact in California; the proven-outside-ag status of agentic negotiation and RFQ.
- **Medium confidence (directional / vendor-sourced, labeled estimate inline):** all FBN savings and price-variation figures, Wexus's 40-percent claim, the rebate-percentage breakdown (CropLife trade analysis, not audited financials), the California input-spend SAM (inferred from national ratios), FBN funding and revenue figures (single-source or conflicting estimates).
- **Forecast (not fact):** Gartner's 90-percent-of-B2B and $53B SCM-AI projections; passage and timeline of the Fertilizer Transparency Act.
- **Verify before building:** the exact, current FIFRA/EPA registration and restricted-use requirements and the current California DPR restricted-material list, permit process, and PCA-recommendation rules. The 0-research files establish the PCA-gatekeeper fact; the surrounding federal and state regulatory structure is the well-documented baseline beneath it and should be confirmed against EPA and DPR before the agent's compliance-enforcement logic is implemented.

---

**Research Completion Date:** 2026-06-14
**Source Verification:** All factual claims cited inline to the 0-research sources; vendor self-reports, advocacy estimates, and forecasts labeled "(estimate)."
**Confidence Level:** High on domain structure and mechanics; medium on vendor-sourced figures; verify-before-building on the exact current FIFRA/EPA and California DPR requirements.

_This domain research grounds the Terra Purchasing Agent (Tool 2). The moat it points to is execution, the independent non-seller position, and Terra's shared data model, not secret technology._
