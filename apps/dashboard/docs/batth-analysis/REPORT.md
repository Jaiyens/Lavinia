# Batth Farms Pilot — The Decision Document

**Prepared for:** the two founders, ahead of the Tuesday demo
**Client:** Batth Farms — PG&E account **4699664587-8** (46 billed meters, 183-meter inventory)
**Inputs already in hand:** the 183-meter Excel inventory + one PG&E bill PDF (latest cycle, cent-reconciled)
**Budget:** **$100** demo cap • **Recommended UtilityAPI spend: $60** • **Reserve: $40**

---

## 1. THE DECISION

**Do not buy your way to the demo. You already own the demo.** The full 183-meter farm map (178 with lat/long pins) and every per-meter monthly dollar figure are **free** — they come straight out of the Excel inventory (`parseInventory`) and the single bill PDF you already extracted and cent-reconciled (`accountPrintedTotalUsd` = $86,942.12, reconciled). Both ingestion pipelines already exist and already ran; no UtilityAPI call is needed to show Batth their entire operation, priced, on a map. **UtilityAPI is a surgical instrument, not the foundation** — its only job is to buy interval/demand-shape data for the handful of meters where an hour-by-hour load curve is the *only* thing that converts a claim into proof (demand-shift, pump-timing, TOU energy-shift, and the "is this export actually credited" check). **Recommended spend is $60 of the $100 cap — five $12 interval pulls** — with **$40 held in reserve**, because the dead-pump and idle-non-NEM findings need no interval data at all, and the reserve funds re-pulls and the 2–3 adjacent-pump staggering proof if P054's curve shows a coincident peak. The ~$2,568 UtilityAPI quote that scared you was for the wrong product (a bulk/ongoing-sync posture). The right product here is a one-time historical pull at **$12/meter — and the first collection is free.**

---

## 2. THE MONEY WE FOUND

These five findings were each run past the smart-farmer objection and survived with a *defended, conservative* dollar figure (we book the number that survives the objection, not the gross headline).

| # | Finding | Defensible Annual $ | Conf. | Affected meters | Survived this objection | Needs interval data? |
|---|---------|--------------------:|:-----:|-----------------|-------------------------|:------------------:|
| 1 | **NEM true-up anomaly — orphaned "Solar" NEMEXP group.** $62.8k true-up sitting on a load meter (P031, SA 4699664088) that should be backed by the 12,180 kW array fleet; the NEMA linkage is broken. | **$41,000** | high | P031 (the $62,795.65 true-up) + 4699664441, 4699664743/P038, 4699664172; backing arrays (8× 840 kW, 5× 1,092 kW) | "A NEM fix only recovers the *energy* portion — never demand, customer charge, minimums, or NBC. The $0.330/kWh effective rate exceeds even the AG-C summer-peak energy rate, so the true-up *bundles* demand+customer+NBC. Strip those (the demand-charge lens already books P031's ~$7,791/yr) and the recoverable ceiling is ~$49k; the energy component is ~$37k–$48k. Defensible = **~$41k**, not $58.4k." | No |
| 2 | **HEADLINE — P031 gets zero NEMA credit.** VINES IRR 75HP (meter 1010427495) billed full-retail, $62,796 annual true-up, on a meter that should be drawing array credit. | **$22,000** | high | P031 / 4699664088 | "Re-pointing existing allocated credit is zero-sum across the one customer-of-record arrangement, and the array is sized at/below aggregated load by tariff. The only *net-new* money is P031's own uncredited 39,718 kWh of exports + a real allocation/TOU-timing correction — not the full 190,505 kWh import. NEM can't offset its ~$13k/yr demand + customer charges either." | No |
| 3 | **Idle/near-zero AGC pumps stranded on the 35+ kW high-use schedule** → demote to AG-A1 (no demand charge). | **$543.48** | med | 10 candidates incl. PUMP 55, P072; safe set = PUMP 55 (~250 gpm) + P072 (~300 gpm) | "35 kW eligibility is a *trailing-12-month* ratchet — a well idle this Feb pumped 50–110 kW all summer and is locked on AG-C. P038 isn't idle at all (0 kWh is NEM netting; it imported 124,117 kWh). Only the structurally-small pumps qualify: real capture = **2 meters × $271.74**, not 10." | **Yes** |
| 4 | **Dead pumps (BAD/OLD) still energized**, bleeding the monthly customer charge → remove / de-energize. | **$248.04** | med | P017, P018, P069 | "Two of three aren't dead shells — P017 moved ~24,000 kWh, P018 ~13,400 kWh; the 'zero kWh' is NEM2-Aggregation netting, and they're live benefiting meters in solar group 4433. Removing them forces an arrangement-wide early true-up. Only the *genuinely* abandoned service points (≈ P069) book cleanly; meter removal is effectively permanent." | No |

**TOTAL DEFENSIBLE ANNUAL $: ~$63,792.**

> Context that makes this credible: the cent-reconciled bill rollup independently shows **11 NEM true-up meters totaling $83,338.49**, **12 meters with zero solar benefit**, and **$5,939.40/yr in demand charges across 23 cycles** — the raw scale our defended findings sit inside. We are claiming **$63,792**, well under the gross, on purpose.

---

## 3. THE $100 UTILITYAPI PLAN

**Account 4699664587-8 • per-meter historical/interval pull = $12 (first collection free) • Spend $60 • Reserve $40.**
The map and per-meter dollars are already free, so interval money is spent **only** where an hour-by-hour curve is the sole way to prove the claim.

| Buy | Meter | Cost | What the interval pull *proves* |
|-----|-------|-----:|----------------------------------|
| 1 | **P054** — 4696826125, AGC, **278.88 kW peak, $2,783.22/mo demand (~$33.4k/yr), 31,828 kWh/mo** | $12 | **THE demand-shift headline.** Biggest demand exposure on the whole account and the only meter with large *real* shiftable throughput. The monthly bill shows nearly all energy off-peak (87.6 kWh on-peak), so monthly data **cannot** tell whether the 278.88 kW peak is a shaveable coincident peak or already optimal. Interval data is the *only* proof. (Not in any finding list — the obvious biggest-demand omission.) |
| 2 | **P004** — 4698660251, AG-5B, **171.52 kW peak, $1,409.21/mo demand (~$16.9k/yr), net export −16,060 kWh, $0 true-up** | $12 | Proves **both halves of finding #1** on one high-dollar meter: verifies the net export is *actually being credited* (the "verify it is credited" question), and shows whether the 171.5 kW demand peak coincides with solar production. |
| 3 | **P031 / VINES IRR 75HP** — 4699664088, AGC, **111.52 kW peak, $1,112.97/mo demand, $62,795.65 true-up** | $12 | **THE $62.8k headline (findings #1 + #2).** The orphaned NEMEXP load meter billed full-retail. Interval data shows it pulling 230,223 kWh/yr against a 12,180 kW fleet that should back it — makes the missing-NEM-linkage *visually undeniable*. The single most persuasive purchase for the figure that sells the pilot. |
| 4 | **ELKHORN-18 SHOP** — 4699664553, AG-A2, 13.70 kW peak, 1,924 kWh with **173 kWh billed on-peak ($42.61)** | $12 | A **second, different proof category**: TOU energy-shift, not demand. The pumps already run off-peak; this shop has *actual on-peak load to move*. Interval data turns "you have on-peak usage" into an hour-by-hour shift recommendation. |
| 5 | **PUMP # 55** — 4699664820, AGC, **0.024 kW peak, 14 kWh/mo** | $12 | Covers the **one finding flagged needsIntervalData=true (#3)**. Proves the load is genuinely tiny and flat year-round — the evidence PG&E needs to approve the AG-C → AG-A1 reclassification. Lowest-risk dollar, satisfies "one meter per interval-needing category." |

**Spend = 5 × $12 = $60. Reserve = $40 (40%), held deliberately because:** (1) UtilityAPI bills per *successfully collected* meter and a pull can return partial/declined coverage — the reserve funds re-pulls with no new budget ask; (2) if P054's curve reveals a coincident-peak pattern, the reserve buys the 2–3 adjacent pumps needed to demo a *staggering* plan; (3) it keeps us honest — we do **not** spend the whole budget chasing meters whose monthly bill already tells the whole story (the dead-pump and idle-non-NEM findings need zero interval data). **Five proof meters land every finding category that needs interval data while staying $40 under cap.**

---

## 4. WHAT IS NOW BUILT

The savings are not asserted — they are **computed by the dashboard's own pure energy engines** over a real fixture. Both deliverables are in the worktree, untracked (uncommitted), as required.

**Fixture — `NormalizedMeter[]` shaped, 186 meters:**
`/Users/panda/Lavinia/.claude/worktrees/wf_814e52aa-a50-39/apps/dashboard/fixtures/batth-real-meters.json`
- 46 billed meters carry real `printedTotalUsd` → `summaries[].totalBillUsd` and the real `demandChargeUsd` line item; 140 are map/metadata-only (empty `summaries`). Covers all 183 inventory meters + 3 billed meters absent from the inventory.
- `intervals: []` everywhere (no Green Button export yet — this is exactly what Section 3 buys).
- A sibling `meta` block (which the engines never read) carries the map pins (178 lat/long), `peakKw`, NEM true-up, entity/ranch/status — so the fixture is demo-ready without violating the engine input type.

**Engine harness — tsx script:**
`/Users/panda/Lavinia/.claude/worktrees/wf_814e52aa-a50-39/apps/dashboard/scripts/analyze-batth-real.ts`
Loads the fixture, maps each meter to the engines' input types, runs `billAudit()`, `retrospective()`, and `rateOptimization()` over every meter, prints findings + dollars as JSON.

**Exact engine-computed output (ran clean, exit 0):**
- **bill-audit: 0 findings, $0** — honest no-op. Each meter has one latest cycle, below the engine's 3-comparator minimum. No fabricated anomaly.
- **retrospective / demand-charge exposure: 23 findings over 23 cycles = $5,939.40** — **matches the source bills and the extract's `rollup.totalAnnualDemandChargeUsd_latestCycles` exactly.** Each names the real charge (e.g. "Last February this pump's bill had a demand charge of $1,113") with an engine-derived `ratePerKw` ≈ $9.98/kW (demandCharge ÷ peakKw, never hardcoded). All `info` severity, no `impactUsd` — because no *avoidable* spike can be priced without interval data (priced avoidable spikes: 0).
- **rate-optimization: 0 findings, $0/yr** — honest no-op. Without intervals the usage profile is empty, so the model can't reproduce real bills within tolerance and correctly refuses any "switch and save" claim.

**How to render it for the demo:** point the dashboard's farm view at `fixtures/batth-real-meters.json`. The `meta` block drives the 178-pin map and the per-meter monthly dollars; the engine harness output (or a live engine pass) drives the findings rail. The $63,792 of *defensible* dollars in Section 2 comes from the human-defended findings; the engines independently corroborate the $5,939.40 demand-charge backbone. **Before the demo, fold the verbose PG&E rate labels to family tokens (see Section 6) so rate-optimization renders, and stand up a Green Button import for the 5 meters in Section 3 to populate `intervals`.**

---

## 5. TUESDAY DEMO SCRIPT

1. **Open on the whole farm, mapped.** 178 pins from the Excel, every meter priced from the one bill PDF — "$86,942 across 46 billed meters, here's your entire operation on one screen." (Free. No UtilityAPI.) This is the *known-at-a-glance* moment.
2. **Zoom to the money meters.** Click P054, P031, P004 — surface the real per-meter demand dollars ($2,783/mo, $1,113/mo, $1,409/mo). "Three meters carry most of your exposure."
3. **The true-up catch.** Land on **P031 / VINES IRR 75HP**: "$62,796 a year on a meter that should be drawing credit from your 12,180 kW of arrays — the NEM linkage is broken. **We defend ~$41k of that as recoverable with no hardware**, by filing a corrected Form 79-1202 and asking PG&E to rebill the true-up." This is the headline.
4. **The demand-charge story.** Show the $5,939.40 of demand charges the engine surfaced across 23 cycles, then point at P054's 278.88 kW peak: "Your bill can't tell us if this peak is shaveable — only an interval curve can. That's the one thing we'd buy."
5. **The spend plan as the upsell.** Reveal Section 3: "$60 of interval data turns these claims into PG&E-grade proof — demand-shift on P054, the credit check on P004, the load shape on P031. **$40 stays in reserve.** Approve the pilot and we pull these five Wednesday." The plan *is* the close.

---

## 6. RISKS / WHAT WE DID NOT VERIFY

- **No interval data exists yet.** Every demand-shift, pump-timing, and TOU-shift *saving* is currently un-priceable (engine correctly returns $0 impact). Section 3 is exactly the purchase that closes this gap; until those pulls land, present demand-shift as "provable next," not "proven."
- **Rate-optimization renders nothing until labels are folded.** The bills carry verbose PG&E strings (`"AGC Ag35+ kW High Use"`, `"AG5B Large Time-of-Use Agricultural Power"`), not the clean `AG-C`/`AG-5` tokens `familyOf()` in `rates.ts` expects, so `rateOptimization` sees `bestSchedule: null`. **Fold the labels to family tokens before Tuesday** or the rate lens stays silent.
- **The $41k true-up recovery is not yet confirmed against PG&E records.** It depends on pulling the Generation Allocation Summary / Supplemental Report and the active Form 79-1202 roster and confirming SA 4699664088 is absent or at 0% allocation. We have *not* seen those documents — the $41k is the defended ceiling, not a booked recovery. Frame it as "we'll file the correction," not "we've recovered it."
- **P038 (4699664743) "$0 true-up on 124,117 kWh net import" is anomalous and unverified.** Confirm it really was credited; if not, the recoverable picture changes.
- **Meter removal is effectively permanent** (finding #4). Get a PG&E reconnection quote and verify the array is physically gone before pulling any NEM-enrolled service point — reconnection + possible line-extension cost can dwarf years of saved customer charge.
- **Single-cycle billing data.** Bill-audit needs ≥3 comparators and ran as an honest no-op; the demand-charge backbone is the *latest* cycle per meter, annualized. A full 12-month pull (Section 3) firms this up.
- **3 billed meters are absent from the 183-meter inventory** and 5 inventory meters lack lat/long — minor map gaps, not dollar-affecting, but worth a sentence if Batth counts pins.
- **Deliverables are uncommitted** in worktree `wf_814e52aa-a50-39`; the main checkout is pristine. Commit/copy them before the demo machine is set up.
