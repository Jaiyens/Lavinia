---
title: Competitor Landscape & Incumbent Teardown
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Competitor Landscape & Incumbent Teardown

## Purpose and scope

This document maps the players a farm-input purchasing agent would compete with or learn from, tears down the leading clone target (Farmers Business Network), and pulls the portable mechanics out of adjacent verticals (Ramp, Faire, GPOs, agentic procurement). It ends on the white space: where everyone is weak.

The frame matters. The directly addressable money is the controllable input bill. Combined crop inputs (chemicals, fertilizer, seed) were $72.2B, or 28.6% of crop-farm total expenses in 2024 ([USDA via AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). That $72.2B is a share-of-crop-farm construct, not a sum of the all-farm USDA line items; the all-farm lines are fertilizer/lime $33.8B, seeds and plants $27.4B, and ag chemicals $21.7B ([USDA NASS Farm Production Expenditures 2024](https://esmis.nal.usda.gov/sites/default/release-files/qz20ss48r/w6636271r/9p292904f/fpex0725.pdf)). The pain is acute now because input prices sit 20-40% above pre-2021 levels (estimate) while 2025 per-acre margins went negative for every major row crop ([AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). In a negative-margin year, a few points off procurement is the difference between loss and breakeven, which is exactly why input-cost tools get traction now.

A note on honesty before we start: the input opacity is real and severe, but most "ag AI" today is a chatbot plus a price benchmark, not an autonomous buyer. The biggest correction to make against any breathless framing is that FBN already shipped an LLM advisor (Norm) in April 2023 ([AgFunderNews](https://agfundernews.com/why-farmers-business-network-launched-norm-an-ai-advisor-for-farmers-built-on-chatgpt)). The honest gap is "no autonomous, farmer-side purchasing agent," not "no AI."

---

## 1. Landscape Map

The relevant field splits into five clusters: input marketplaces/transparency plays, the incumbent ag-retail channel they disrupt, ag-fintech, the energy-cost-legibility lane (Terra's current Tool 1 turf), and adjacent infrastructure. Funding and scale figures vary by source; where a number is contested or a vendor self-report, it is labeled.

| Company | Cluster | Model | Scale / funding | AI today? | Strengths | Gaps |
|---|---|---|---|---|---|---|
| **Farmers Business Network (FBN)** | Input marketplace + transparency + fintech | Free member data network monetized via FBN Direct e-commerce, financing, insurance, crop marketing | ~$978M raised over 12 rounds (estimate; Tracxn); $3.9B valuation at Nov 2021 Series G, no valuation disclosed in the July 2025 $50M round; 117,000+ farms / 187M acres ([Tracxn](https://tracxn.com/d/companies/fbn/__fw4xRp4VGbU0dYKDMjwHy_HicO3HL2L1yjqbRg23rKw), [DigitalCommerce360](https://www.digitalcommerce360.com/2025/07/28/farmers-business-network-fbn-50-million-funding-ai/)) | Yes: "Norm" LLM advisor (GPT-3.5, Apr 2023), extended to crop marketing; July 2025 raise is to expand AI | Largest war chest and data moat; transparent national pricing; flags same-active-ingredient generics; claims up to 50% savings (FBN-sourced, see caveats) | Row-crop-centric and transactional; weak for multi-entity specialty/nut ops; capital-intensive logistics; it is a seller, not an independent advisor |
| **GROWERS** | Input marketplace (RFQ) | Free farmer RFQ app + ag-retailer network; request and compare offers on seed, chem, fertilizer, fuel | NC startup; app launched Dec 2022; Midwest retail network (SD, IL, IA, WI, MN, MO); funding not disclosed | No autonomous agent; comparison + transact | Directly attacks manual quote-collection; exposes new retailers without picking one supplier | Marketplace breadth depends on retailer density (Midwest row-crop); not a full-spend legibility layer |
| **Growers Edge** | Ag-fintech | Embedded input financing + Crop Plan Warranty (yield guarantee on inputs), sold to retailers/lenders | $25M raised (Apr 2025); warranties on 1M+ acres ([GlobeNewswire](https://www.globenewswire.com/news-release/2025/04/29/3070388/0/en/Growers-Edge-Raises-25M-to-Build-First-Full-Service-Fintech-Platform-for-Agriculture.html)) | Land/climate intelligence; no purchasing agent | Targets the working-capital pain directly; de-risks input adoption via warranty | Financing/warranty focus, not price transparency or procurement comparison; lender-side relationships |
| **Bushel** | Ag infrastructure / payments | Agrifintech software for grain buyers, ag retailers, farmers; Bushel Wallet payments | $26M round (2024, Banc Funds/Cargill/Andersons/Scoular); powers 3,500+ facilities, >50% of US/Canada grain origination ([AgFunder](https://agfundernews.com/grain-trading-platform-bushel-raises-26m-to-build-up-the-holy-grail-of-agrifintech-software)) | Payments/settlement automation; fintech new | Dominant grain-elevator distribution; charges the agribusiness, not the farmer | Infrastructure/payments layer, not a grower savings product; tied to grain-trade volume |
| **Indigo Ag** | Marketplace / carbon | Carbon programs, marketplace, biologicals | Cumulative raise reported inconsistently ($560M+ to >$1B; the Sept 2023 down round itself was ~$250M); a reported ~94% markdown to a disputed ~$200M (Indigo called the figure incorrect) from a ~2021 peak of ~$3.5B (estimate) ([AgFunder](https://agfundernews.com/no-comment-from-indigo-ag-on-valuation-nose-dive-report)) | Carbon MRV; underdelivered | Brand, CPG carbon buyers, grower programs | Valuation collapse signals weak core-input traction; carbon thesis in "trough of disillusionment"; cautionary tale |
| **Nutrien Ag Solutions** | Incumbent ag-retail | #1 US ag retailer; inputs + agronomy + financing (Nutrien Financial, HUB) | ~$14.5B retail sales (2024 and 2025), ~$3.6B gross margin, ~1,800 locations, 4,000+ consultants; ~20% of US ag-retail ([Nutrien](https://www.nutrien.com/news/press-releases/nutrien-reports-fourth-quarter-and-full-year-2024-results-1717)) | HUB digital platform; defensive | Scale, agronomist density, vertical integration, financing | Opaque program pricing (the thing transparency disrupts); downturn margin pressure |
| **CHS / Helena / Wilbur-Ellis / Simplot / GROWMARK / GreenPoint Ag** | Incumbent ag-retail ("Big Seven") | Co-op or private national integrators; inputs + advisory + custom application | Big Seven together ~70% of US crop inputs/services; CropLife 100 booked $43.3B in 2024 (down 7.2% YoY) ([CropLife](https://www.croplife.com/croplife-top-100/the-big-seven-of-the-croplife-100-the-evolution-of-americas-largest-ag-retailers/)) | Mostly none farmer-facing | Local agronomist trust, logistics density, proprietary-product margin | Rebate-dependent opaque pricing; price-discriminate by farm size; the channel a transparency tool disintermediates |
| **AgVend** | Ag-retail SaaS | White-label digital engagement + e-commerce + Program Management (rebate tracking) sold to retailers | $42.76M Series B (Feb 2025); ~$45.5M-$66M total depending on source; used by 30%+ of NA ag retail ([Tracxn](https://tracxn.com/d/companies/agvend/__gB1NIy7MYN1NMw3_XZqIe2pVcxCmU9ORpkhrs9lsuGQ)) | Program Management is the closest analog to rebate auditing | Deep retail-channel penetration; proves the rebate-data problem is real | Retailer-side, not farmer-side; helps the seller capture rebates, not the grower |
| **Wexus Technologies** | Energy/water legibility (Terra's lane) | SaaS/IoT: ingests PG&E billing + SmartMeter + flow-meter data; rate analysis, efficiency financing | Lightly funded (Village Capital $100K, 2018); PG&E-partnered; up to $100K/pump interest-free financing | Rate analysis, alerts; not LLM-led | Direct proof in Terra's exact lane: self-reports 40% / ~$40,000 on one pump (vendor anecdote, see caveats) | Thin funding, dated footprint; IoT/hardware-heavy clashes with dead-simple planner UX; beatable on polish/price |
| **John Deere (+ dealer network)** | Equipment / parts | Equipment OEM + consolidated dealer channel; margin in parts/repair | 82% of Deere locations in 7+ site chains; parts/repair 3-6x more profitable than new machines (PIRG/plaintiff estimate); $99M right-to-repair settlement (2025) ([PIRG](https://pirg.org/updates/dealership-consolidation-raising-repair-costs-farmers/)) | Telematics, not procurement | Brand, dealer lock-in, recurring parts revenue | Right-to-repair backlash; ~$4.2B/yr estimated farmer repair cost from restrictions (estimate) |

**Adjacent ag-software cautionary cluster (not direct competitors, but instructive):** the pure farm-ops/data layer repeatedly fails to stand alone and gets absorbed by a strategic. Granular went to Corteva (~$300M+, 2017) and was dismantled; Agrible to Nutrien ($63M, 2018); Conservis to TELUS + Rabobank (2021); Climate FieldView crossed 220M+ subscribed acres but exists to sell Bayer seed/chem, not as a standalone P&L ([AgFunder](https://agfundernews.com/nutrien-acquires-agrible-for-63m-to-create-ag-retailer-of-the-future), [Traction Ag](https://www.tractionag.com/traction-ag-acquires-granular-business-to-expand-solution-value/)). The lesson Terra must internalize: "make the farm legible" software is necessary but historically not a business by itself. Every durable winner bolts a money-moving rail (commerce, financing, warranty, or transaction take) onto the data.

---

## 2. Deep Teardown: Farmers Business Network (FBN)

FBN is the right clone target. It is the only player that built a real business on the exact wedge a purchasing agent would use (price opacity), at scale, and its weaknesses are legible and exploitable. The research clearly points here over Indigo (valuation collapse, lost the plot), GROWERS (sub-scale), or the incumbents (the thing being disrupted).

### Model

FBN (founded 2014, Charles Baron and Amol Deshpande) is a buyer's cooperative plus fintech wrapped in a data network. The flywheel: aggregate anonymized agronomic and price data from member farms, use that transparency to expose input-cost variation, then capture the resulting demand through its own commerce, lending, and marketing rails.

Revenue lines:
- **FBN Direct** (the engine): e-commerce for crop protection, fertilizer, nutrition, animal health, seed, and supplies; 7,200+ SKUs, direct-to-farm delivery in 24-72h. Margin comes from buying nearer the manufacturer, cutting the retailer, and pushing private-label generics (Willowood USA, Farmers First).
- **FBN Finance**: farm operating lines ($100K-$5M, instant approval up to $1M), plus a regenerative line. Inputs bought on-platform can carry 0% financing, a loop that drives Direct GMV. FBN reports $1B+ in operating lines and $3B total financing originated (FBN-reported milestones, not independently verified).
- **Insurance, crop marketing/grain brokering, and Gradable** (low-carbon grain scoring + sustainability financing).

### Pricing

Originally ~$700/yr (~$800 CAD). FBN dropped the membership fee to free in September 2020 to grow the network ([RealAgriculture](https://www.realagriculture.com/2020/09/fbn-drops-membership-fee/)). It now monetizes transaction margin, financing spread, insurance commissions, and private-label margin instead of subscriptions. The free tier gives Price Transparency, Seed Finder, satellite imagery, and community.

### Revenue, funding, valuation, scale

- **Funding:** ~$978M total raised over 12 rounds (estimate; Tracxn). Note the document-internal inconsistency in the source research: the agtech-landscape section says "$899M" and the teardown section cites PitchBook's "$1.15B." Treat PitchBook's higher figure as a single-source outlier, not fact, and use ~$978M ([Tracxn](https://tracxn.com/d/companies/fbn/__fw4xRp4VGbU0dYKDMjwHy_HicO3HL2L1yjqbRg23rKw)).
- **Series G:** $300M, closed Nov 18, 2021, led by Fidelity (with ADM Ventures, Temasek, T. Rowe Price), at a **~$3.9B valuation** ([Global AgInvesting](https://globalaginvesting.com/farmers-business-network-closes-300m-series-g-gains-4b-valuation/)).
- **Latest raise:** $50M in July 2025 (GV, Temasek, T. Rowe Price, Colle Capital) to expand AI and the marketplace. **No valuation was disclosed.** Any claim of a "$4B valuation in May 2025" is wrong; there was no such raise or re-valuation ([DigitalCommerce360](https://www.digitalcommerce360.com/2025/07/28/farmers-business-network-fbn-50-million-funding-ai/)).
- **Revenue:** FBN does not publicly report revenue. Circulating figures ($211M, ~$100M ARR, $316-400M for 2024, $200M for FY2018) are **unverified third-party estimates** (ZoomInfo, RocketReach, CB Insights) that conflict with each other across a $211M-to-$400M spread. Do not treat any as fact (all estimate).
- **Scale:** 117,000+ farms / 187M acres (FBN-stated, 2025), up from ~33,500 farms at the Series G. Older trackers showing 87,000 farms / 137M acres are stale.

### What farmers love

- **Price transparency is the killer feature.** The 2023 Chemical Price Transparency Report (3,000+ data points, 37 states, 800+ chemistries) showed up to **283% price variation** for the same product between farmers; the 2024 report cited up to **468%** across 33 states (both FBN-sourced, directional, not independently audited). Even non-buyers use it to negotiate with their existing retailer ([AgWeb](https://www.agweb.com/news/business/fbn-releases-its-2024-ag-chemical-price-transparency-report)).
- **Real, if thinner-than-headline, savings.** Testimonials of $40K year one, $100K year two.
- **Delivery reliability.** Of 2,410+ five-star reviews, the most-cited reason is "they deliver when they say they will" ([FBN](https://www.fbn.com/community/blog/fbn-customer-reviews-delivery)).

### What farmers complain about

- **Data distrust.** Growers are uneasy handing receipts and field data to a VC-backed third party; the "pay or sign up to save money" pitch reads as a gimmick to skeptical operators.
- **Savings are real but oversold.** FBN's own report admits the below-average half of buyers got only ~14% off list, not the headline "up to 50%."
- **Generic/private-label hesitancy.** Agronomic trust in Willowood/Farmers First generics versus branded chemistry, with no independent local agronomist relationship.
- **Operational fragility.** A major 2023-2025 retrenchment: layoffs, facility closures, exit from Australia and international, and shutdown of seed, livestock, and fertilizer lines. Glassdoor 2.8/5.
- **Conflict of interest.** FBN is a seller, not the farmer's independent advisor; its "advice" steers transactions.

### The AI-shaped gaps

This is the heart of the opportunity, stated honestly. FBN **does** use AI: "Norm" is a GPT-3.5-based agronomy/crop-marketing chatbot, and the July 2025 raise is explicitly to expand it. So the gap is not "no AI." The gaps are:

- **No autonomous, farmer-side purchasing agent.** Norm is Q&A, not an agent that forecasts demand from a crop plan, scouts live cross-supplier quotes, audits the rebate stack, negotiates, and prepares a PO.
- **No demand-forecasting from the crop plan** to a per-product bill of materials and buying calendar.
- **Live cross-supplier price scouting is absent.** FBN shows aggregated historical paid prices, not real-time quotes against generic equivalents.
- **Rebate/prepay auditing for the grower is missing.** It exists only retailer-side (AgVend Program Management).
- **No closed-loop verification** (predicted vs actual saved on an order after the invoice posts), the procurement analog of Terra's energy reconciliation.
- **Conflicted by design.** Any AI FBN builds drives its own marketplace transactions; an agent that is the farmer's fiduciary, not a seller, can out-trust it.
- **Weak for specialty/permanent crops.** The value is row-crop national-average benchmarking, thin for California almonds and for water/energy/rate-level cost where FBN has little to say.

### Clone-and-beat read

FBN's moat is the data + transparency wedge, not the commerce. A focused competitor exploits three things: (1) FBN spread thin (commerce + finance + insurance + carbon + seed) and is now contracting; (2) the trust/independence gap, since it is a seller; (3) the specialty-crop blind spot. A narrow, deeply legible, farmer-aligned agent that makes the full input spend legible before recommending cuts, and that does not also sell the inputs, could out-trust it on exactly the buyer base FBN underserves.

---

## 3. Analogous Models From Other Verticals

Five proven B2B procurement and spend playbooks port cleanly onto a farm-input agent. The ag-native proof that these mechanics transfer is FBN itself: it claims 15-40% input savings via direct buying plus crowdsourced transparency (FBN-sourced, directional).

**1. Ramp / Brex (spend management + crowdsourced auto-savings).** Ramp's wedge is a corporate card and AP ledger; the moat is Price Intelligence, which normalizes transactions across ~30,000 customers to benchmark a contract down to the SKU, then 90 days before renewal delivers a negotiation brief. Customers cut vendor costs ~16%/yr; Ramp reports >$405M saved via AI tools ([Ramp](https://ramp.com/blog/introducing-vendor-management)). Brex was acquired by Capital One for **$5.15B** (announced Jan 22, 2026; closed Apr 2026), a markdown from a ~$12.3B 2022 peak. **Ports to ag:** the card/ledger is the trojan horse. Pay for fertilizer, chem, fuel, and seed through one rail and the agent has the data to benchmark "you paid $X/ton for UAN vs $Y peer median." The benchmark is only credible at network scale, so data capture must come first.

**2. Faire (wholesale marketplace + seasonal net terms).** Faire's growth unlock was net-60: within three months of launch in 2017, monthly GMV jumped from $100K to $1M ([Sacra](https://sacra.com/c/faire/)). It pairs net-60 with free returns and embedded inventory financing. **Ports to ag:** inputs are intensely seasonal and front-loaded (buy in spring, revenue at harvest), so harvest-timed terms are arguably more valuable than in retail. Faire's lesson on default risk and credit limits is the guardrail (and echoes Silo's lending blowup, which paused its product and forced ~30% layoffs in 2024).

**3. GPOs / group-buying (Vizient, Premier; Dining Alliance / Buyers Edge).** Healthcare GPOs save the US system ~$55B/yr (estimate), with members paying 10-18% less than independent purchasing ([Ramp/HSCA](https://ramp.com/blog/how-group-purchasing-organizations-operate)). The restaurant analog is the cleanest copy: Dining Alliance is free, you keep your existing distributors, and it auto-collects back-end rebates across 175,000+ items, paying CashBack quarterly via ACH. **Ports to ag:** this is the lowest-friction, highest-trust mechanic for a skeptical, low-software farmer. No behavior change, no switching dealers, money appears as a rebate check. A farm agent can pool input volume and harvest manufacturer/co-op rebates, monetizing on a slice of rebate.

**4. AI procurement agents (Zip, Tropic, Levelpath, Pactum, Keelvar).** Two mechanics are most copyable. **(a) Autonomous long-tail negotiation:** Pactum's chatbot has negotiated **$8B+** in spend for Walmart and Maersk; in the Walmart deployment ~64-68% of approached suppliers reached agreement at ~3% average savings and +35-day terms, on a gain-share fee (~10-15% of savings) ([Thunderbird/ASU](https://thunderbird.asu.edu/thought-leadership/journals-case-series/case-series-listing/pactums-ai-contract-negotiations)). **(b) Reverse-auction/RFQ bots:** Keelvar runs RFQs for volatile-priced commodities, cutting cycle time ~70% and yielding 3-25% savings per event (estimate). **Ports to ag:** fertilizer/chemical pricing is opaque and dealer-quoted; an agent that fires an RFQ to multiple local dealers/co-ops, or auto-negotiates on a gain-share fee, aligns incentives perfectly (the farmer pays only from realized savings). Note Ever.Ag's "Roger" already runs agentic AI for ag freight execution, proving the logistics leg is buildable.

**5. Flexport (operational visibility as the retention moat).** Flexport ($2.1B 2024 revenue) won by wrapping freight in end-to-end visibility. **Ports to ag:** delivery timing, price-volatility alerts, and a single ledger of what every ranch and entity bought become the retention layer once savings get a farm in the door, the same legibility thesis as Terra's energy tool.

**The macro tailwind, labeled honestly.** Gartner forecasts (not measured facts) that AI agents will intermediate ~90% of B2B buying, ~$15T, by 2028 (forecast), and that SCM software with agentic AI grows from <$2B in 2025 to $53B by 2030 (forecast) ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2026-04-07-gartner-forecasts-supply-chain-management-software-with-agentic-ai-will-grow-to-53-billion-in-spend-by-2030)). The counter-evidence keeps it honest: fewer than 25% of B2B suppliers use agentic AI today, and only ~27% of consumers trust fully autonomous AI to make financial transactions (cross-industry analogue, not farm-specific) ([DigitalCommerce360](https://www.digitalcommerce360.com/2026/03/10/agentic-commerce-faces-reality-check-in-b2b-ecommerce/)). The realistic near-term design is human-in-the-loop with one-tap approval, not autonomous checkout on day one.

---

## 4. Where Everyone Is Weak (the white space)

Pulling the gaps together, the unclaimed ground is consistent across every cluster:

1. **No one makes a complex multi-entity, specialty-crop operation's FULL input spend legible** (all SKUs, dealers, ranches, entities) before recommending cuts, the way Terra does for energy. FBN benchmarks row-crop chemistry nationally; it has little to say about a Batth-scale almond operation's water, energy, labor, and input stack together.

2. **No farmer-side autonomous purchasing agent exists.** Current AI is a chatbot (Norm) plus historical benchmarks. Demand-forecast-from-crop-plan, live cross-supplier scouting, rebate/prepay auditing, negotiation, and auto-PO are greenfield for the grower side. The one place rebate auditing exists (AgVend) is built for the seller.

3. **Closed-loop verification is not standard.** Predicted-vs-actual on an input order after the invoice posts mirrors Terra's energy reconciliation and is absent in ag procurement tools.

4. **The independent, farmer-aligned position is open.** Every incumbent that touches price is also a seller (FBN, Nutrien, the Big Seven) and therefore conflicted. A tool that does not sell the inputs can claim a trust position none of them can.

5. **Specialty/nut/produce growers are systematically underserved** by row-crop-centric platforms, despite carrying the largest absolute input + labor bills and the deepest 2024 losses (almond net returns swung from +$205/acre in 2019 to a ~$4,280/acre loss in 2024) ([AFBF/UC Davis](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)).

6. **The proven monetization rails have not been combined for the farm.** Crowdsourced benchmarking (Ramp/FBN) + pooled rebates (GPO) + gain-share autonomous negotiation (Pactum) + harvest-timed terms (Faire) each exist separately. None are stitched into one farm-scoped, operator-simple, mobile-first agent.

### What this implies for sequencing

The buyer is skeptical, low software literacy, and anchored to a 5-6-person circle of trusted advisors in which the dealer agronomist (or, in California, the PCA) sits nearly 100% of the time ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/)). Letting software buy is the steepest trust climb. The defensible path mirrors Terra's energy playbook and the procurement-agent reality check: (1) make the input spend legible (retrospective, the grower's own numbers, "you overpaid by $X versus peers"); (2) forecast the bill of materials from the crop plan; (3) scout prices and audit rebates/prepay against real invoices; (4) prepare a one-tap PO with the human in the loop and dollar caps; and only later, as machine-readable catalogs and supplier APIs mature, move toward true auto-PO. Lead with legibility and a fast visible dollar win, augment the trusted advisor rather than threaten them, and close the loop after the invoice posts before asking for any delegated action.
