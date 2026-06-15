---
title: Product Brief - Terra Purchasing Agent
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Product Brief: Terra Purchasing Agent

## Executive Summary

Inputs are the largest controllable cost on a farm, and right now they are squeezing growers from both ends. Prices paid sit 20 to 40 percent above pre-2021 levels while prices received have fallen roughly 50 percent from 2022 peaks, pushing every major row crop to a negative 2025 per-acre margin and swinging Sacramento Valley almond net returns above total costs from a +$205/acre gain in 2019 to a roughly $4,280/acre loss in 2024 ([AFBF specialty](https://www.fb.org/market-intel/specialty-crops-mounting-cost-pressure-limited-risk-protection)). That loss is measured against total per-acre cost, not against inputs alone: UC Davis pegs 2024 Sacramento Valley almonds near $7,800/acre total cost (of which fertilizer and crop protection are the well-over-$800/acre input line this tool attacks), so a $4,280/acre loss is what is left when an almond price near $1.81/lb no longer covers that full cost stack ([UC Davis 2024 Sample Costs to Produce Almonds](https://coststudyfiles.ucdavis.edu/2024/07/09/2024SacValleyAlmonds7.5.24.%20Final%20draft.pdf)). Combined crop inputs were $72.2B, or 28.6 percent of crop-farm total expenses, in 2024 ([USDA via AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). The buying side of that spend is opaque by design: inputs flow through a channel where seven retailers control roughly 70 percent of crop inputs and where the "real" net price only appears after year-end rebates ([CropLife](https://www.croplife.com/management/marketingrebate-programs/)). The grower is a price taker who cannot cleanly compare two quotes for the same active ingredient.

The Terra Purchasing Agent is the purchasing agent that buys your farm's inputs for less, and shows you exactly how much it saved. It is an AI-native, farmer-side procurement agent for California specialty and permanent-crop growers, starting with almonds and tree nuts. The clone target is Farmers Business Network: we copy the crowdsourced price-transparency wedge that FBN proved at scale, and we beat it on the dimensions FBN structurally cannot follow, because FBN is a seller and we are the grower's independent agent. The first version does not negotiate or buy. It makes the grower's own input spend legible: it ingests historical invoices and the crop plan, normalizes every line to a per-unit, same-active-ingredient market band, and shows "you paid $X versus the band, and you are owed $Y in under-credited rebates." Legibility first, the same thesis Terra proved on PG&E energy in Tool 1.

This is Terra's Tool 2. It serves the same customer on the same shared data model, with the same Recommendation grammar (situation, action, dollar impact, one-tap response, after-the-fact result) already shaped to be executable. The agent earns the right to act the way Tool 1 did: prove the savings number on past invoices, then close the predicted-versus-actual loop, then offer one-tap approval with dollar caps and advisor visibility. True delegated auto-buy is a later setting, earned, not assumed. The moat is execution, the independent non-seller position, and Terra's shared data model, not secret tech.

## The Problem

The farm owner decides on inputs but cannot see what a fair price is. There is no public, real-time benchmark; USDA still relies on an annual voluntary fertilizer survey ([Agri-Pulse](https://www.agri-pulse.com/articles/24432-house-bill-aims-to-provide-fertilizer-price-transparency)). Into that vacuum, FBN's own transparency work reports a roughly 15 percent average gap between list and price actually paid, and wide farm-to-farm variation for the same chemistry: up to 283 percent in the 2023 report and up to 468 percent in the 2024 report. These figures are FBN-self-reported, directional, and not independently audited, and they are softer than the headline implies. By FBN's own data, the below-average half of buyers captured only about 14 percent off list, not the loud "up to 50 percent," so the 15 percent average gap is a real but thin number, not a clean savings promise ([FBN 2024 via AgWeb](https://www.agweb.com/news/business/fbn-releases-its-2024-ag-chemical-price-transparency-report)) (estimate). In buying-process surveys, 50 percent of farmers could not get pricing data and 41 percent could not compare products ([The Daily Scoop](https://www.thedailyscoop.com/news/retail-business/farm-business-2026-relationship-first-digital-convenience-second)).

The opacity is structural. Crop-protection retail runs on manufacturer rebate and program pricing, not transparent list-minus-margin. Marketing programs average about 25 percent of a manufacturer's selling price and exceed 50 percent on some products, so the net price only emerges after year-end thresholds and early-fill milestones are settled ([CropLife](https://www.croplife.com/management/marketingrebate-programs/)). Pricing is deliberately tiered by farm size and sophistication, so a smaller or less-savvy grower pays more for identical product, and a cheaper same-active-ingredient generic is under-surfaced because rebates favor branded chemistry.

The pain is acute now and it compounds. Net farm income fell about 22 percent from 2022 to 2024, 2025 operating loans ran roughly 30 percent larger year over year with first-year interest up 70 to 90 percent, and Chapter 12 bankruptcies hit 315, up 46 percent ([KC Fed](https://www.kansascityfed.org/agriculture/agfinance-updates/larger-operating-loans-boost-farm-lending-activity-in-2025/)). Because inputs are bought up front and recouped only at harvest, the input bill is also the working-capital problem, so both the price and the timing carry real money.

For a Batth-scale operation, the spend is fragmented across many co-op and dealer accounts spanning multiple ranches and legal entities, with no single ledger. The same multi-entity mess Terra already untangles for PG&E energy (roughly 183 meters, 57 accounts, 6 entities) exists identically for inputs. Today the grower copes by leaning on a 5-to-6-person circle of trusted advisors in which the dealer agronomist or, in California, the licensed PCA sits nearly 100 percent of the time ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/)). That advisor is a seller of the product being optimized, which means the person the grower trusts most on price is also conflicted.

## The Solution

The Terra Purchasing Agent makes a farm's full input spend legible, then surfaces the money hiding in it. The first version does four things, all retrospective and all built on the grower's own numbers.

- **Ingest the spend.** Pull in historical input invoices (crop protection, fertilizer, seed, fuel) and the farm's crop and irrigation plan. Terra already models the farm's blocks, crops, entities, and (via Tool 1) its pumps, so the agent can attach every line of spend to a ranch, entity, and account.
- **Make every line legible.** Normalize each line to a per-unit, same-active-ingredient basis and compare it against a market band. Show "you paid $X per unit versus the band of $Y to $Z," and flag the cheaper generic equivalent where one exists. This is the trojan-horse feature growers love, the one even non-buyers use to negotiate with their existing dealer.
- **Audit the rebates and prepay.** Reconcile every invoice against the rebate tiers, thresholds, and early-fill milestones that apply, and flag under-credited rebates the grower is owed. Model prepay timing against price risk and the working-capital window. Nobody audits this for the grower today; the one tool that decodes it (AgVend) is built for the seller.
- **Recommend the buy.** Forecast a per-product bill of materials and buying calendar from the crop plan, and surface buy recommendations in Terra's existing grammar: one situation, one concrete action, the dollar impact, a one-tap response, and an after-the-fact result once the invoice posts.

The experience is plain operator English on a phone in a truck. The data hero leads, the farm known at a glance, with the dollars in the data, not a lone screaming number. Every recommendation closes the loop: after a bill posts, the agent shows predicted versus actual saved, the same reconciliation discipline Terra runs on energy. The product arms the grower and their PCA rather than trying to replace them; the advisor can see what the agent sees.

## What Makes This Different

The differentiation is honest and structural, not a technical secret.

- **Independent, not a store.** Every incumbent that touches input price is also a seller (FBN, Nutrien, the Big Seven) and therefore conflicted. An honest cross-supplier scout and a grower-side rebate audit work against a seller's own margin, so they will not build them. The Terra agent does not sell the inputs, so it can. FBN says "buy from us and save." We say "we work for you, we scout everyone including the dealer who already has your business, and you only pay us from what we save you."
- **AI-native, farmer-side agent.** FBN already shipped an LLM advisor ("Norm," on GPT-3.5, April 2023), so the gap is not "no AI" ([AgFunderNews](https://agfundernews.com/why-farmers-business-network-launched-norm-an-ai-advisor-for-farmers-built-on-chatgpt)). The gap is that no one has built an agent that forecasts the input bill of materials from a crop plan, audits the rebate stack against real invoices, and closes the predicted-versus-actual loop. That is white space.
- **Terra's shared data model.** Farm, Entity, Ranch/Block, Pump, Crop, and the Recommendation grammar already support an input purchase order as an action type. The crop and irrigation plan that drives energy modeling in Tool 1 is the same plan that yields the input bill of materials, so Terra is the only player positioned to derive input demand from a farm it already understands. The customer is warm, not cold.
- **Specialty-crop fit.** The category leaders are row-crop and national-average centric, weak for permanent and specialty crops. An agent tuned to almond and tree-nut input economics, on the customer base Terra already reaches, is largely greenfield. FBN itself is contracting (2023 to 2025 layoffs, exited international, dropped seed/livestock/fertilizer lines), leaving the specialty segment and the independent position open.

The clone-and-beat logic is deliberate: copy the proven price-transparency wedge, beat it on the axes a seller structurally cannot or will not follow. We do not claim a model moat. The market's own savings numbers are soft and unaudited, which is itself the opportunity: an independently verified savings figure built from real invoices would be a thing no incumbent has.

## Who This Serves

The primary user is the farm owner and decision-maker on a California specialty or permanent-crop operation, beachhead almonds and tree nuts. Skeptical, relationship-loyal, low software and AI literacy, learns line by line in Excel, on a phone in a truck. They carry the largest absolute input bills, took the deepest 2024 losses, and are systematically under-served by row-crop platforms. They want a clear ROI before they buy any ag-tech (53 percent of North American farmers are very concerned about demonstrated ROI before investing) ([McKinsey](https://www.mckinsey.com/industries/agriculture/our-insights/global-farmer-insights-2024)), and what flips them is peer proof, a fast visible dollar win measured in weeks, and retrospective evidence in their own numbers.

Success for this grower looks like opening the agent and finding their full input spend in one legible place for the first time, seeing exactly which lines were overpaid and which rebates they are owed, and getting a verified dollar figure they trust because it was built from invoices they recognize.

The secondary user is the trusted advisor, the dealer agronomist or the California PCA, who sits in the grower's circle nearly 100 percent of the time and is the legal gatekeeper for crop-protection recommendations. The agent is built to arm this person with visibility, not to route around them; tools that arm the advisor get adopted faster than tools that try to bypass them.

## Success Criteria

The first version is working when these are true.

- **Dollars saved, verified.** The agent produces a per-farm savings figure built from the grower's real invoices (overpayment versus the per-unit band plus under-credited rebates recovered), independently traceable line by line. Target: a verified, defensible savings number on every onboarded farm, not a vendor headline estimate.
- **Retrospective accuracy.** When the agent flags a line as overpaid or a rebate as under-credited, the grower or their advisor confirms it is correct. Target: a high confirmed-true rate on flagged lines, low enough false positives that the grower keeps trusting the flags.
- **Activation.** Time from connecting a source to a legible spend view and the first dollar finding is short enough to hold a skeptical grower's attention in one sitting. Target: spend made legible and a first finding surfaced on the same day a source is connected.
- **Loop closure.** After a bill posts, the agent shows predicted versus actual on the recommendations it made, the procurement analog of Terra's energy reconciliation. Target: every acted-on recommendation gets an after-the-fact result, building the track record that earns the right to negotiate and, later, to buy.
- **Coverage and trust.** Spend is attributed correctly across every ranch, entity, and account so the legibility holds at Batth scale, and the grower's data is handled with the Tool 1 credential discipline (never stored where the agent or repo can read it).

## Scope

Tight on the legibility wedge. The first version proves the savings number; it does not yet act. The companion PRFAQ is written as a launch announcement for the full destination (forecast, legibility, live scouting, rebate audit, one-tap PO with delivery tracking and gain-share). That destination is the product this brief is building toward, not the first version this brief scopes: in v1, only legibility and the grower-side rebate-and-prepay audit ship, scouting and the one-tap PO arrive as supplier participation and grower trust are earned, and negotiation and auto-buy come later still. Read the PRFAQ as where this goes; read this Scope as what ships first.

**In scope (first version):**

- Ingest historical input invoices and the crop/irrigation plan, attributed to ranch, entity, and account on Terra's shared data model.
- Normalize every spend line to a per-unit, same-active-ingredient basis and benchmark it against a market band; flag the cheaper generic equivalent.
- Flag overpayment versus the band and audit rebates and prepay against actual invoices, surfacing under-credited rebates the grower is owed.
- Forecast a per-product bill of materials and buying calendar from the crop plan.
- Surface buy recommendations in the existing Recommendation grammar, display-only, with a verified savings figure and after-the-fact result once the invoice posts.
- Cross-entity, cross-account spend-versus-budget legibility for a multi-entity operation.
- Mobile-first, plain operator English, advisor visibility.

**Out of scope (later versions):**

- Live cross-supplier price scouting and real-time quoting across dealers and co-ops.
- Agentic negotiation and RFQ / reverse auction on a gain-share basis.
- Auto-PO generation and delivery tracking.
- True delegated auto-buy (earned later by proving retrospective accuracy and closing the loop; bounded by dollar caps and advisor visibility when it ships).
- Attached crop-cycle financing, harvest-timed terms, and private-label margin.
- A public crowdsourced price benchmark beyond the grower's own normalized spend (requires network density that does not exist on day one).

The first version leads with the grower's own legibility and a verified dollar win. The market band starts from the grower's own normalized invoices and what Terra can credibly assemble, not a promised network benchmark, because the benchmark only becomes credible at scale and that scale is earned by capturing real spend first.

## Vision

If this works, the Terra Purchasing Agent becomes the grower's standing buyer for the second-largest controllable cost on the farm, the way Tool 1 is their standing read on energy. Once the savings number is trusted and the loop is closed enough times, the agent earns the next steps in order: it scouts live quotes across dealers, co-ops, and generic channels without the conflict a seller carries; it negotiates the long tail on a gain-share basis so the grower pays only from realized savings; and it prepares a one-tap, human-approved purchase order with delivery tracked to the ranch, with true auto-buy as a later setting bounded by dollar caps and advisor visibility.

Gain-share billing rests on one unsolved prerequisite, and we name it plainly: a clean, auditable method to prove that a given saved dollar is the agent's doing and not the grower's own dealer haggling. Until that attribution method is designed and defensible, the negotiation and auto-buy layers cannot be honestly monetized. Solving attribution is therefore a gate on the entire gain-share revenue model, not a detail to settle later, and the first version exists in part to build the retrospective, invoice-level track record that makes clean attribution possible.

Underneath, Terra accumulates the one asset no incumbent has: real, normalized, multi-entity specialty-crop spend data with verified savings attached, which makes both the benchmark and the negotiation stronger every season. Two of a California grower's largest controllable costs, energy and inputs, become legible and then optimized on one operating system, on one data model, for one customer. The durable rail is the same one every winning ag-tech company eventually bolts onto its data (transparency, gain-share, financing), built here on the independent, farmer-aligned position the sellers cannot occupy.
