---
title: Brainstorming Session - Terra Purchasing Agent
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Brainstorming Session Results

**Facilitator:** Jaiyen (self-run, playing both facilitator and participant)
**Date:** 2026-06-14

## Session Setup

**Topic.** The Terra Purchasing Agent: an AI-native, farmer-side input-procurement agent for California specialty and permanent-crop growers (beachhead: almonds and tree nuts). It is Terra's Tool 2, sitting next to the PG&E energy tool on the same shared data model. The one-liner we are pressure-testing: "The purchasing agent that buys your farm's inputs for less, and shows you exactly how much it saved."

**Goals.**
1. Generate a wide field of product names and a buyer-agent persona name (8 to 12 candidates, then a recommendation).
2. Find the killer first feature, the wedge that gets the foot in the door.
3. Brainstorm onboarding hooks, trust-building mechanics, gain-share pricing variants, and the risks to design around.
4. Organize everything into themes, immediate opportunities, future innovations, and moonshots.
5. End with a prioritized "what to take into the brief."

**Inputs read first.** The three research files in `0-research`: the clone-target-and-AI thesis (copy FBN's transparency wedge, beat it on six AI axes FBN structurally cannot follow), the market and customer research (inputs are the largest controllable cost, margins negative, trusted-advisor circle of 5 to 6 people with the PCA in it nearly always), and the competitor teardown (FBN's gaps, the white space, the analogous money-moving rails from Ramp, Faire, GPOs, and Pactum).

**Constraints held the whole way.** Legibility before action. Retrospective before predictive. One recommendation equals one situation plus one concrete action plus the dollar impact plus a one-tap response plus an after-the-fact result. Human-in-the-loop by default with dollar caps and advisor visibility. Plain operator English. Mobile-first. Arm the grower and their PCA, never try to replace them. The moat is execution plus the independent (non-seller) position plus Terra's shared data model, not secret tech.

**Selected approach.** Run four named techniques in sequence, generate wide, then converge. The four: First Principles Thinking (rebuild the value from bedrock), Role Playing (the skeptical grower, the dealer rep, the PCA), Assumption Reversal (flip the load-bearing assumptions), and SCAMPER (systematic feature and model variants). Naming gets its own focused riff inside the SCAMPER pass.

---

## Technique 1: First Principles Thinking

_Strip the product to bedrock truths, then rebuild. What do we actually know for certain, and what falls out of that?_

**Bedrock truths I will not argue with (all from the research):**

- Inputs are the largest controllable cost. Crop inputs were $72.2B, or 28.6% of crop-farm expenses in 2024 ([USDA via AFBF](https://www.fb.org/market-intel/declining-farm-economy-continues-to-pressure-profitability)). On almonds, fertilizer and crop-protection lines exceed $800/acre ([UC Davis 2024 Sample Costs](https://coststudyfiles.ucdavis.edu/2024/07/09/2024SacValleyAlmonds7.5.24.%20Final%20draft.pdf)).
- Price discovery is broken on purpose. The real net price only appears after year-end rebates, so quotes cannot be compared cleanly, and pricing is tiered by farm size and sophistication ([CropLife: Marketing/Rebate Programs](https://www.croplife.com/management/marketingrebate-programs/)).
- The grower does not decide alone. A 5 to 6 person circle of trusted advisors, with the dealer agronomist or California PCA in it nearly 100% of the time, drives input decisions ([GROWERS](https://growers.ag/blog/how-ag-retailers-can-engage-with-a-farmers-circle-of-trusted-advisors/)).
- The grower is skeptical and wants a fast, visible, dollar-shaped proof on their own numbers (53% of North American farmers are very concerned about ROI before buying ag-tech, [McKinsey](https://www.mckinsey.com/industries/agriculture/our-insights/global-farmer-insights-2024)).
- Software that only makes the farm legible is necessary but not a business by itself. Every durable ag-tech winner bolts a money-moving rail onto the data (the Granular / Agrible / Conservis lesson from the teardown).

**Rebuilding from those truths, the ideas that fall out:**

1. **The atom of value is one normalized line.** Not a dashboard, not a chat. One input line item (say, a fungicide active ingredient), normalized to a per-unit, same-active-ingredient band, with "you paid $X, the network median is $Y, here is the gap." Everything else is built up from that atom. If we can render one line truthfully from the grower's own invoice, we have a product. If we cannot, no amount of agent wrapping saves it.

2. **Because the net price hides until year-end, the rebate audit is not a feature, it is a category of truth.** The grower literally cannot know what they paid until the rebate posts. An agent that reconciles every invoice against every tier and threshold is telling the grower something they could not otherwise know. That is a stronger claim than "we found you a cheaper quote," which they can dispute.

3. **The crop plan is the only forward signal nobody else has.** FBN is a catalog of what others paid (backward). Because Terra already models blocks, crops, and pump energy, we can derive the forward bill of materials. The first-principles insight: demand-forecasting is not a nice-to-have, it is the one thing structurally unavailable to a seller-side competitor, because they do not model the farm.

4. **Trust is earned in the past tense.** You cannot ask a skeptic to delegate a future purchase. You can ask them to let you check a past one. So the product must be born retrospective: feed me last season's invoices, I will show you what you overpaid, with no ask attached. The forward agent is something the grower grants later, after the retrospective proof.

5. **The money-moving rail must attach early, but the cheapest, highest-trust rail is the rebate check, not lending.** Pooled rebate capture (the Dining Alliance / GPO move) requires no behavior change and no dealer switch, and the money arrives as a check ([Ramp/HSCA](https://ramp.com/blog/how-group-purchasing-organizations-operate)). That is the rail to attach first, before financing spread or marketplace margin.

**First-principles output, condensed:** the irreducible product is _one normalized input line, rendered truthfully from the grower's own invoice, with the year-end rebate audited in, proven retrospectively before any forward ask._ That is the seed everything grows from.

---

## Technique 2: Role Playing

_Embody the three people in the room. What does each one want, fear, and need to hear?_

### Role: the skeptical grower (the owner-operator, learns line by line in Excel)

- "I have been burned before. Extension told a neighbor to deficit-irrigate, he got hurt, then Extension reversed itself. Two to three years to feel the downside on a permanent crop." So the grower wants: zero-risk first contact, no behavior change, no signing away anything.
- "Do not tell me to consider load management. Tell me a number." Wants a dollar figure on his own meters and invoices, not an industry stat.
- "Who are you, and why are you free? FBN's 'pay or sign up to save money' read like a gimmick." Wants the business model said out loud and honestly: you pay us a slice of what we actually save you, nothing if we save nothing.
- Fear: handing his receipts and field data to a VC-backed third party. Documented FBN complaint. Mitigation idea that surfaced: frame data as the grower's, legible to the grower first, and never store credentials the agent or repo can read (the Tool 1 discipline ports directly).
- **Ideas this role generated:** a "no-strings retrospective" onboarding (upload last season's invoices, get a number, owe nothing); a savings figure that is independently provable from his own invoices, not a vendor average; a one-screen home that shows the farm known at a glance, not a screaming money hero.

### Role: the dealer rep / ag-retail agronomist

- "If this thing scouts around me, I will fight it. FBN got fought, including a Competition Bureau probe." Channel hostility is the real risk.
- But: "If it makes me look good to my grower, I will tolerate it, maybe even use it." The rep sells on relationship and field service, not list price, and 60% of farmers would switch brands for a 10% discount anyway, so the rep already lives with price pressure ([The Grower](https://thegrower.org/news/price-performance-loyalty-which-one-works-you)).
- The rep also leaves money on the table: rebates are complex, and he does not always optimize the grower's tier. If the agent surfaces a rebate the grower was under-credited, the rep can be the hero who fixes it.
- **Ideas this role generated:** let the grower invite their dealer's quote into the scout ("include my guy"), so the agent arms the relationship instead of bypassing it; a dealer-visible mode where the rep sees what the agent sees, positioned as a co-pilot, not an assassin; lead value with the rebate audit (which helps the grower without directly undercutting the rep's price) before live cross-supplier scouting (which does undercut).

### Role: the PCA (California Pest Control Adviser, the legal gatekeeper)

- "By law, a crop-protection recommendation is mine to make. An app cannot write that rec." So the agent must never pose as the agronomic authority on what to spray.
- "But the PCA recommends the product, not the price." There is a clean separation: the PCA owns the what, the agent owns the how-much-and-from-whom. The agent can take the PCA's recommendation as a given input and optimize the purchase of it.
- The PCA could be a distribution channel. Tools that arm the advisor get adopted faster than tools that bypass them. A PCA who can tell their grower "and Terra will make sure you do not overpay for what I am recommending" looks better to their client.
- **Ideas this role generated:** a strict product boundary, the agent reads the PCA recommendation and optimizes procurement of exactly that, never substitutes the chemistry without a human in the loop; a PCA-facing view so the adviser keeps visibility; a generic-equivalent suggestion that is always shown to the PCA for sign-off, never auto-swapped (respects both the law and agronomic trust).

**Role-playing output, condensed:** the product wins by being the grower's price-and-spend agent that respects the agronomic authority of the PCA and can fold in the dealer's own quote. The boundary is sharp: advisors own _what_ to buy, the agent owns _how much and from whom_, and proves it retrospectively first.

---

## Technique 3: Assumption Reversal

_List the load-bearing assumptions, flip each, and see what the flip reveals._

| Assumption | Reversal | What it reveals |
|---|---|---|
| The agent's job is to find a cheaper supplier. | The agent's job is to make the grower's _existing_ supplier defensibly fair. | The first deliverable might be a negotiation brief the grower hands to his own dealer ("here is the median, match it"), not a switch. Lower friction, keeps the relationship, still moves dollars. Ramp's Price Intelligence brief is exactly this shape. |
| Savings come from buying for less. | Savings come from buying the right amount at the right time. | Demand-forecasting + prepay timing can save more than a price cut, because over-buying and mistimed prepay are large hidden leaks. The crop-plan BoM is a savings lever, not just a sourcing input. |
| The grower wants the agent to act for them. | The grower wants to feel _more_ in control, not less. | Frame every agent action as the grower's one-tap decision with a dollar cap, so the agent increases the grower's sense of command rather than removing it. Autonomy is a setting earned later, not a default. |
| Free is the hook. | Free is suspicious to a skeptic. | The honest gain-share pitch ("you pay only from what we save, nothing if we save nothing") may out-convert "free" precisely because it explains why we are aligned with him. Said-out-loud incentive beats free. |
| Network scale is required before the benchmark is credible. | A single grower's _own_ history is a benchmark the day they onboard. | We do not need a big network on day one. "This block paid $X for the same active in March and $Y in September" is internal-variance legibility that needs zero peers. Peer benchmarking is the second unlock, not the first. |
| The dealer is the adversary. | The dealer is the fastest distribution channel. | A PCA- or dealer-co-branded version, where the advisor brings Terra to their grower, could acquire faster than going around them. Arming the advisor is a go-to-market lever, not only a trust posture. |
| Inputs are the product. | Energy (Tool 1) is the wedge that already has the data and the trust. | The cleanest acquisition path is the existing Tool 1 customer. The crop/irrigation plan that drives energy modeling is the same plan that yields the input BoM. Cross-sell beats cold sell. |

**Assumption-reversal output, condensed:** several flips are real features. The "negotiation brief you hand your own dealer" is a softer, higher-trust first action than a switch. Internal-variance legibility removes the network-scale chicken-and-egg. And the dealer/PCA-as-channel flip turns the biggest risk (channel conflict) into a distribution strategy.

---

## Technique 4: SCAMPER

_Seven systematic lenses on the product, its features, and its name. Naming gets its own riff inside the S (Substitute) and C (Combine) passes._

### Substitute

- Substitute the chatbot for an agent that produces _artifacts_ (a normalized spend ledger, a negotiation brief, a one-tap PO), not conversation. FBN's Norm is Q&A; the differentiator is output you can act on.
- Substitute "national average benchmark" for "this farm's own history first, then peers." Removes the cold-start problem.
- Substitute lending (heavy, risky) for pooled-rebate capture (light, high-trust) as the first money-moving rail.
- Substitute "buy from us" for "we work for you and will fold in your own dealer's quote."

### Combine

- Combine the four proven rails the teardown found scattered across other verticals into one farm-scoped agent: crowdsourced benchmarking (Ramp/FBN) + pooled rebates (GPO) + gain-share negotiation (Pactum) + harvest-timed terms (Faire). None are stitched together for the farm today. That combination _is_ the moat-by-execution.
- Combine Tool 1 (energy) and Tool 2 (inputs) into one spend ledger per entity and ranch, so the grower sees total controllable cost in one place. The cross-tool view is something no competitor can build.
- Combine the crop plan with the rebate calendar so the agent says "prepay this fungicide before the early-fill deadline to capture the tier-2 rebate," one situation, one action, one dollar impact.

### Adapt

- Adapt the GPO "CashBack via ACH every quarter" mechanic directly. It is the lowest-friction trust builder in the research.
- Adapt Pactum's gain-share fee (~10 to 15% of realized savings) and reverse-auction RFQ to local dealers.
- Adapt Terra's energy reconciliation (predicted vs actual after the bill posts) into procurement reconciliation (predicted vs actual after the invoice posts). Same close-the-loop grammar.

### Modify / Magnify

- Magnify the rebate audit into the headline. It is the one truth the grower literally cannot compute themselves, and it does not directly attack the dealer's price, so it is the lowest-conflict, highest-credibility wedge.
- Modify the savings claim from "up to X%" (FBN's oversold, unaudited style) to "here is the exact dollar figure from your own invoices, independently provable." An audited number is differentiating in a market full of soft vendor claims.

### Put to other uses

- The normalized spend ledger doubles as the working-capital story for a lender (the financing rail, later).
- The crop-plan BoM doubles as an input for Tool 1's energy/irrigation modeling (cross-tool leverage runs both directions).
- The rebate audit doubles as evidence the grower can take to their dealer to renegotiate, even if they never switch.

### Eliminate

- Eliminate the requirement for a live supplier API on day one. Lead with invoice ingestion (vision/import, the Tool 1 onboarding pattern) and the rebate audit, which deliver dollars before any live-quote network exists.
- Eliminate autonomous checkout from v1. Human-in-the-loop one-tap with dollar caps only.
- Eliminate jargon. No "SKU velocity." Blocks, sets, acres, dealers, ranches, pumps.

### Reverse

- Reverse the onboarding: do not ask the grower to commit, ask them to let you check. Retrospective-first onboarding (covered below).
- Reverse the sales motion: let the PCA or dealer bring Terra to the grower (advisor-as-channel).

### Naming riff (inside Substitute and Combine)

The product needs a name and the in-product buyer-agent persona may want its own name (the way FBN named its advisor "Norm"). Terra's Tool 1 has no mascot, but a buyer agent that acts on the grower's behalf benefits from a trustworthy, plain, slightly old-fashioned name, the steady ranch hand who knows prices. Candidates below, with rationale.

---

## Product and Persona Name Candidates

Two naming jobs: (a) the **product/tool name** (how the farmer refers to the feature, e.g. "Terra Purchasing" or a branded name), and (b) the **buyer-agent persona name** (the named character that does the scouting and negotiating, FBN's "Norm" analog). I will give 8 to 12 candidates spanning both, then recommend.

1. **Hank** (persona). The steady, plain ranch-hand name. "Hank found you a better price on that fungicide." Warm, trustworthy, low-tech, fits the operator voice. Old-fashioned in a good way, like the dependable buyer who has known the dealers for thirty years. Strong persona candidate.

2. **Buck** (persona). Double meaning, a dollar and a ranch name. "Buck saved you $4,200 this season." Plain, masculine-neutral, money-tinged without being salesy. Risk: slightly aggressive, and "buck" can read as gimmicky on the dollar pun.

3. **Cal** (persona). Short for California and for "calculate." A quiet, numerate buyer who knows the state's growers. Clean, neutral, unisex. Fits a California-specialty beachhead. Risk: a little generic.

4. **Tally** (persona). Evokes the running count, the ledger, keeping tally of spend and savings. Plain, bookkeeping-flavored, fits the Excel-brained grower. Reads as competent and honest, not flashy. Strong candidate for a legibility-first product.

5. **Ledger** (product or persona). Names the core artifact, the legible spend ledger across entities and ranches. "Open the Ledger." Honest, no hype, instantly says what it does. Risk: feels like a feature, not a character; better as a product/feature name than a persona.

6. **Almond Buyer / "the Buyer"** (persona). Literal and plain. The grower hires a buyer. "Let the Buyer scout it." Names the job, not a personality. Lowest-risk, most legible. Could pair with a first name (e.g. "your buyer, Hank").

7. **Scout** (persona or feature). Names the killer action, scouting live prices across dealers. "Scout it" becomes a verb. Energetic, plain, action-shaped. Risk: scouting is one capability of several (the rebate audit and forecast are not "scouting"), so it may under-describe the whole.

8. **Terra Procure** (product). Straight, enterprise-clear, sits cleanly next to "Terra Energy" (Tool 1). Honest and boring, which suits a skeptic. Risk: "procure" is mild jargon; a farmer says "buy," not "procure."

9. **Terra Buy / Terra Buying** (product). Plainer than Procure. "Terra Buying made the farm's input spend legible." Operator English. Pairs with a persona name for the agent itself.

10. **The Purchasing Agent** (product, descriptive). Just say what it is. The one-liner already leads with it. Honest, no branding risk, lets the persona (Hank/Cal/Tally) carry the warmth. Strong default if we want zero cleverness.

11. **Bushelwise / Acrewise** (product). "Wise" suffix signals judgment and savings, "acre" grounds it in the farm. Risk: "Bushel" collides with the existing company Bushel; avoid. "Acrewise" is cleaner but slightly cute.

12. **Margin** (product or persona). Names the prize, the few points that decide loss vs breakeven in a negative-margin year. "Margin checks your invoices." Risk: abstract and finance-flavored, may read as too corporate for the truck.

**Recommendation.**

- **Product name: keep it plainly descriptive, "Terra Purchasing Agent" (or "Terra Buying" in operator copy).** It sits cleanly next to the energy tool, says exactly what it does to a skeptic, and carries zero branding risk. The one-liner already leads with "the purchasing agent," so the product name should not fight it.
- **Persona name: "Hank."** A buyer agent acting on the grower's behalf benefits from a named, trustworthy, plain character (the FBN "Norm" lesson), and Hank is the steady ranch-hand buyer who knows the dealers and the prices. It is warm, low-tech, and confident without being salesy, exactly the voice the research demands. **Backups: Tally** (if we want the persona to lean bookkeeper/legibility rather than buyer) and **Cal** (if we want to foreground the California-specialty identity).
- Pairing in copy: "Hank checked your invoices and found $4,200 you can get back." Plain, dollar-shaped, the agent does the work and the grower taps to approve.

---

## Idea Organization

### Theme A: Legibility-first, retrospective, the wedge

- One normalized input line from the grower's own invoice (the atom of value).
- Internal-variance legibility (this farm's own price history) before peer benchmarking, which removes the network cold-start.
- The rebate audit as the headline truth the grower cannot compute themselves.
- An independently provable, audited savings figure (beat the market's soft, unaudited claims).

### Theme B: Trust mechanics and the advisor circle

- No-strings retrospective onboarding (upload last season, owe nothing).
- Gain-share said out loud ("nothing if we save nothing").
- Sharp boundary: advisors own _what_ to buy, the agent owns _how much and from whom_.
- "Include my dealer's quote" and a dealer/PCA-visible mode; arm the advisor, do not bypass.
- Tool 1 credential discipline: never store anything the agent or repo can read.

### Theme C: The forward agent (earned later)

- Demand-forecasting from the crop plan to a per-product BoM and buying calendar (the structurally-unavailable-to-sellers capability).
- Prepay and rebate-deadline timing as a savings lever, not just price.
- Live cross-supplier scouting and gain-share RFQ to local dealers.
- One-tap PO with dollar caps, then delivery tracking, then close-the-loop reconciliation.

### Theme D: The money-moving rail

- Pooled-rebate CashBack (GPO model) as the first, lightest rail.
- Gain-share negotiation fee (~10 to 15% of realized savings) as the second.
- Harvest-timed terms / financing spread and private-label margin as later rails.

### Theme E: Cross-tool leverage (Terra's actual moat)

- One spend ledger across energy (Tool 1) and inputs (Tool 2), per entity and ranch.
- The crop/irrigation plan feeds both energy modeling and the input BoM.
- Same Recommendation grammar, same legibility brand, same customer, warm cross-sell.

### Immediate opportunities (ship-soon, low-friction, high-trust)

1. **Retrospective invoice audit + normalized spend ledger.** Ingest last season's invoices (vision/import, the Tool 1 onboarding pattern), normalize every line to a per-unit, same-active-ingredient band, show "you paid $X vs $Y." Delivers a dollar number with zero behavior change and zero dealer switch.
2. **Grower-side rebate audit.** Reconcile invoices against tiers and thresholds to catch under-credited rebates. The lowest-conflict, highest-credibility wedge; tells the grower something they could not otherwise know.
3. **Negotiation brief you hand your own dealer.** A Ramp-style brief ("here is the median, match it") the grower gives to their existing rep. Moves dollars while keeping the relationship.
4. **Pooled-rebate CashBack rail.** Pool grower volume, auto-collect rebates, pay back by ACH. No switching, money arrives as a check.

### Future innovations (earned after retrospective trust)

1. **Demand-forecast BoM from the crop plan**, with a buying calendar tied to rebate and prepay deadlines.
2. **Live cross-supplier scouting and gain-share RFQ** to local dealers and co-ops.
3. **One-tap human-in-the-loop PO** with dollar caps, advisor visibility, and delivery tracking.
4. **Procurement reconciliation** (predicted vs actual after the invoice posts), the close-the-loop move.
5. **Unified energy-plus-input spend ledger** across entities and ranches (the cross-tool view).

### Moonshots (real-but-distant, do not promise on day one)

1. **True delegated auto-buy** within dollar caps, earned only after sustained retrospective accuracy and a closed predicted-vs-actual loop.
2. **An independent, audited California specialty-crop price benchmark**, the public reference USDA does not provide, built once network density exists.
3. **Agent-to-agent commerce**: the grower's buying agent negotiating directly against dealer-side selling agents over agentic-commerce rails (ACP, Visa/Mastercard agent payments), with the grower approving outcomes, not transactions.
4. **Harvest-timed working-capital rail** that finances the optimized BoM and recoups at harvest (the Faire/Growers-Edge lesson), capital-disciplined and only after the data and trust exist.

---

## Gain-Share Pricing Variants (brainstormed)

The trust posture says gain-share first, "pay only from realized savings," free to start. Variants to take into the brief and test:

1. **Pure gain-share on realized, audited savings.** A percentage (Pactum-style ~10 to 15%) of dollars the grower demonstrably keeps, charged only after the saving is proven against actuals. Most aligned, most skeptic-friendly, hardest to compute cleanly (requires the audited number).
2. **Rebate-share.** A slice of recovered, previously-under-credited rebate dollars (the GPO CashBack model). Cleanest to compute (the rebate either posted or it did not), lowest conflict, good first rail.
3. **Negotiation gain-share.** Fee only on savings from an agent-run RFQ or negotiation event (Pactum/Keelvar pattern), separate from the audit fee. Pay only when the agent actively moved a price.
4. **Capped gain-share / flat-floor hybrid.** A small flat platform fee that is waived or credited up to the first $X of proven savings, then gain-share above. Gives Terra a revenue floor without breaking the "nothing if we save nothing" promise for growers we genuinely cannot help.
5. **Tiered by capability earned.** Free retrospective audit (no fee, builds trust), rebate-share on recovered rebates, gain-share on negotiated savings, transaction/financing spread later. Pricing grows as delegation is earned, mirroring the trust ladder.

**Lean:** lead with **rebate-share (variant 2)** as the first live rail because it is the easiest to prove and the lowest-conflict, keep the **retrospective audit free** as the trust-builder, and layer **negotiation gain-share (variant 3)** once the grower grants forward action. Hold financing/marketplace margin for later.

---

## Risks to Design Around (brainstormed, with the design response)

1. **Channel conflict with the Big Seven (~70% of inputs).** Design response: lead with the rebate audit (does not attack the dealer's price), let the grower fold in their own dealer's quote, offer a dealer/PCA-visible mode, and treat the advisor as a distribution channel. Arm, do not bypass.
2. **Trust to delegate spend (~27% trust autonomous financial AI, cross-industry estimate).** Design response: born retrospective, human-in-the-loop one-tap with dollar caps, autonomy as an earned setting, never a default. Prove the past before asking for the future.
3. **Data access (invoices and crop plan to a third party).** Design response: legibility-for-the-grower framing, transparent data use, and the Tool 1 credential discipline (never store anything the agent or repo can read).
4. **Supplier liquidity / thin California specialty network.** Design response: do not depend on a live-quote network on day one; lead with invoice audit and rebate recovery, which pay dollars before any network exists; start where Terra already has customer density.
5. **The thin-margin marketplace trap (Indigo, Silo cautionary tales).** Design response: lead with software legibility plus gain-share savings, attach the lightest money-moving rail (rebate-share) first, stay capital-disciplined, and do not promise balance-sheet-heavy logistics or lending early.
6. **Oversold, unaudited savings claims (the FBN credibility problem).** Design response: build our own provable, retrospective savings number from real invoices before making any claim; an independently verifiable figure is itself the differentiator.
7. **PCA legal gatekeeping in California.** Design response: the agent never writes the agronomic recommendation; it optimizes the purchase of what the PCA already recommended, and shows generic-equivalent options to the PCA for sign-off rather than auto-swapping.

---

## What To Take Into The Brief (prioritized)

1. **Lead the product with the retrospective invoice audit and the grower-side rebate audit.** This is the wedge: a provable dollar number from the grower's own invoices, zero behavior change, zero dealer switch, lowest channel conflict. Everything else is earned after this lands.

2. **Name it plainly, give the agent a warm persona.** Product: "Terra Purchasing Agent" (or "Terra Buying" in copy). Persona: **Hank**, the steady ranch-hand buyer, with **Tally** and **Cal** as backups. The persona carries trust; the product name carries clarity.

3. **Born retrospective, human-in-the-loop, autonomy earned.** Onboard with a no-strings "let me check last season" flow. One-tap PO with dollar caps and advisor visibility is the forward ceiling for v1. True auto-buy is a moonshot, gated on a closed predicted-vs-actual loop.

4. **Attach the lightest money-moving rail first: rebate-share, with the audit free.** Then negotiation gain-share once forward action is granted. Hold financing and marketplace margin for later. Say the gain-share model out loud ("nothing if we save nothing"), it out-converts "free" for a skeptic.

5. **Treat the advisor circle as a distribution channel, not an obstacle.** Sharp boundary: advisors own _what_ to buy, the agent owns _how much and from whom_. Build "include my dealer's quote" and a PCA/dealer-visible mode. This turns the biggest risk (channel conflict) into go-to-market.

6. **Make Terra's cross-tool data the moat.** One spend ledger across energy (Tool 1) and inputs, per entity and ranch; the crop plan feeds both the energy model and the input BoM. This is the thing no seller-side competitor can copy, because they do not model the farm. Lead the brief with execution, the independent (non-seller) position, and the shared data model as the moat, not secret tech.

7. **Carry the open questions into the brief.** How to compute the audited savings number defensibly; whether to co-brand with PCAs/dealers for distribution; how to source enough live quotes in a thin California specialty network; and where the rebate-share vs negotiation gain-share line sits. These are the decisions the brief and PRD must resolve.
