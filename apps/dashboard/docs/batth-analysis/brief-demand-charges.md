# Brief: PG&E Agricultural Demand Charges & Demand-Reduction Strategy for Irrigation Pumps

*Prepared 2026-06-21. Audience: Terra product/engineering. Purpose: ground the "demand-charge finding" in how PG&E actually bills ag demand, the operational levers a grower can pull, and why 15-minute interval data (not the monthly bill) is the only thing that can prove the opportunity.*

---

## 1. What a "demand charge" is and how PG&E measures it

A demand charge bills you for your **peak rate of power draw (kW)**, separately from the total **energy (kWh)** you consume. It is the utility recovering the cost of the wires, transformers, and generation capacity that must be sized for your worst moment, not your average.

**The measurement mechanic (the load-bearing fact):**

- PG&E meters power on a rolling **15-minute interval**. For each interval it computes the *average* kW over those 15 minutes. ([PG&E TOU Rate Plans][pge-tou], [PG&E Business & Ag TOU PDF][pge-560])
- Your **maximum demand** for the billing month is the single **highest of all those 15-minute averages** — one interval, on one day, sets the charge for the whole month. ([PG&E Understand Your Bill][pge-bill], [Exro][exro])
- Because it is a 15-minute *average*, a momentary spike does not fully count, but **15 minutes of two big pumps running together does**. This is why coincidence — not instantaneous inrush alone — is what you manage.

**Why it hurts so much:** a single bad 15-minute interval can set 30–50% of the monthly bill. The USDA/Forest Service primer makes the point vividly: it costs the same to run a 100 W bulb during the one peak 15-minute interval as to run that bulb for **223 hours** at any other time — an effective ~$29.60/kWh during the peak interval vs. ~3.3¢/kWh otherwise. ([USDA Forest Service / MTDC][usda], [Exro][exro]) Demand-related charges are commonly **30–70% of a commercial/ag customer's electric bill**. ([USDA Forest Service / MTDC][usda])

**Ratchets:** some demand tariffs carry a "ratchet" — the year's highest demand sets a *floor* for billed demand in following months. PG&E's ag schedules are primarily month-by-month maximum-demand, but the ratchet concept matters because it means **a single uncontrolled peak event can keep billing you long after the day it happened.** ([USDA Forest Service / MTDC][usda])

---

## 2. PG&E agricultural rate schedules & the demand component

PG&E's modern ag rates are the **AG-A** and **AG-B / AG-C** families (TOU), with **AG-1, AG-4, AG-5, AG-R, AG-V retained as legacy schedules.** ([PG&E TOU Rate Plans][pge-tou], [PG&E Ag Rate insert][pge-aginsert])

**Eligibility / who has a demand charge:**

- Customers with a metered **maximum demand of 35 kW or greater** in any month over the trailing twelve months are eligible for (and typically land on) **Schedule AG-B or AG-C** — i.e., the demand-charged ag rates. Below ~35 kW, growers sit on the smaller schedules where the demand component is minimal or absent. ([PG&E Business & Ag TOU PDF][pge-560], [PG&E Ag Rate insert][pge-aginsert])
- **AG-B vs AG-C is fundamentally a demand-vs-energy trade:** AG-C is the schedule that carries a **Summer Peak Demand Charge plus a Demand Charge Limiter** (a cap that protects against random demand spikes — described as roughly a $0.50/kWh-equivalent cap). AG-B pushes more cost into volumetric energy and has a lighter demand component. **The choice between them depends on load factor** (see §5). ([PG&E Business & Ag TOU PDF][pge-560], [Nectar PG&E guide][nectar])
- AG-4 / AG-5 (legacy) are the TOU multi-tier schedules (sub-tiers A/B/C by voltage/metering) that mid-size and larger operations (roughly 35–500 kW and up) historically used, and they reward shifting irrigation to off-peak/night pumping. ([Nectar PG&E guide][nectar], [PG&E Ag-5 tariff][pge-ag5])

**Typical $/kW magnitude (order-of-magnitude anchors).** PG&E does not publish a single "the ag demand charge is $X" number — it varies by schedule, voltage, season, and is updated frequently. The cleanest published anchor is **legacy Schedule AG-1**, which states its demand component explicitly:

| AG-1 demand component | Summer | Winter |
|---|---|---|
| Maximum Demand (Rate B, metered 15-min peak) | **$23.00 / kW** | $17.28 / kW |
| Connected Load (Rate A, self-reported nameplate) | $13.88 / kW | $9.53 / kW |

Source: PG&E Schedule AG-1 tariff (Cal. P.U.C. Sheet No. 50593-E). ([PG&E AG-1 tariff][pge-ag1])

So the working mental model: **on a demand-charged ag schedule, a kW of *coincident* peak costs on the order of ~$15–25/kW/month in summer.** A farm whose pumps stack up to a 600 kW coincident peak instead of a 400 kW staggered peak is paying for ~200 extra kW — on the order of **$3,000–$5,000+ per summer month** for nothing but bad timing. (Illustrative, using the AG-1 summer maximum-demand anchor; confirm the grower's exact schedule rate before quoting.)

> **Caveat for the product:** the *exact, current* per-kW AG-B/AG-C/AG-4/AG-5 figures live in PG&E's binary tariff PDFs and change with every rate case. Treat the numbers above as magnitude anchors; pull the live tariff sheet (or the grower's actual bill line item) for any dollar figure shown to a farmer. PG&E also added a ~$24.15/month fixed charge and rates rose again in March 2026. ([NRG / PG&E 2026 rate change][nrg])

---

## 3. The operational levers a grower can pull

These are ordered from "free / operational" to "capital."

### A. Stagger / sequence pump starts (the highest-leverage, lowest-cost lever)
Demand is set by the **coincident** peak — the worst 15-minute window when the most pumps overlap. If a farm runs many large pumps and they all kick on in the same window (common after a power blip, a shared schedule, or a "start everything at 6am" habit), the meter sees the *sum* of their kW. **Staggering starts so no two or three big pumps overlap within the same 15-minute interval collapses the coincident peak toward the largest single pump rather than the sum.** ([USDA Forest Service / MTDC — "duty cycling" / preventing simultaneous operation][usda], [Pumps.org / ag pump study][pumps]) This is the classic load-sequencing / duty-cycling control: physically prevent N big loads from running at once.

### B. Soft-starters / VFDs to cut inrush
A large motor started **direct-on-line (DOL)** draws **6–7× its full-load current** as inrush. ([Mingch soft starter][mingch-current], [Southern Irrigation][southern]) That inrush, if it lands inside a peak interval, inflates demand. A **soft starter** ramps voltage up smoothly to cut the inrush; a **VFD** ramps frequency and holds current near full-load current. ([Mingch VFD vs soft starter][mingch-vfd], [Southern Irrigation][southern], [Precision Electric][precision]) A documented pump-station case dropped peak demand **from ~60 kW to ~30 kW** after VFDs, because pumps no longer slammed on at full load together. VFDs additionally cut *energy* — a small speed reduction on a turbine pump can cut pump energy by **as much as 30%** (affinity laws). ([BPA Variable Frequency Drives][bpa]) Note: a VFD/soft-start mainly helps the *inrush* contribution; it does **not** fix two pumps running coincidentally at steady-state full load — that still needs staggering (lever A).

### C. Shift irrigation to off-peak / super-off-peak windows
PG&E ag TOU rates have a June–September summer season with the highest prices in the peak window (and **no partial-peak period** on ag schedules). ([PG&E Business & Ag TOU PDF][pge-560]) Moving pumping to night / super-off-peak both (a) cuts the energy rate and (b) — where the schedule's demand charge is a *peak-period* demand charge (as on AG-C) — moves the demand-setting load out of the charged window entirely. Even partial shifting helps: extension guidance cites that shaving ~**20% of peak-hour pumping** adds up materially. ([Revel Energy][revel], [USDA Forest Service / MTDC][usda])

### D. Improve load factor (the strategic frame that ties it together)
**Load Factor = average demand ÷ peak demand = monthly kWh ÷ (peak kW × hours in the period).** ([EnergyCAP][energycap], [Wikipedia load factor][wiki-lf]) A farm that runs its pumps in short, overlapping, spiky bursts has a **low load factor** and pays a high *effective* $/kWh because the same kWh is spread over a needlessly high peak kW. Flattening the profile — staggering, off-peak shifting, avoiding simultaneous starts — **raises load factor, which by construction lowers the peak kW and therefore the demand charge**, and can even move the farm into a cheaper rate class. ([EnergyCAP][energycap], [Integrity Energy][integrity]) Improving load factor *is* controlling peak demand; they are two views of the same number.

---

## 4. Why 15-minute INTERVAL data — not the monthly bill — is required to prove the opportunity

This is the core of Terra's wedge, so it's worth being precise.

The monthly bill gives you exactly **two numbers** that matter here: total kWh and the single **maximum demand (kW)** for the month. ([PG&E Understand Your Bill][pge-bill], [Y-W Electric][ywelectric]) From those two numbers you **cannot tell**:

1. **When** the peak happened — which day, which 15-minute interval.
2. **What drove it** — which pumps were running in that interval, and whether they were *coincident* (overlapping) or just one big pump.
3. **Whether it was avoidable** — a peak set by one essential 200 kW pump running alone is not a staggering opportunity; a peak set by three 150 kW pumps that happened to overlap for 15 minutes is a ~$X,XXX/month opportunity. **The bill's single kW number is identical in both cases.**
4. **The load factor / shape** — you cannot see the spiky-vs-flat profile that tells you whether staggering or off-peak shifting will move the needle.

Interval data — the per-15-minute kW series, ideally **per meter/per pump for 12 months** — is what lets you:
- **Locate the coincident peak interval** and overlay which meters/pumps contributed to it (the coincidence analysis the bill structurally cannot show). ([DemandQ][demandq], [Northern Electric — coincident billing peak][northern])
- **Attribute** the peak to specific pumps and specific days, so you can name the exact change ("Pump 4 and Pump 17 overlapped 6:15–6:30am on July 12; offset Pump 17 by 20 minutes").
- **Quantify the dollars** of each kW shaved and check **ratchet exposure** across the year. ([DemandQ][demandq], [DOE EM&V Ch.10][doe])
- **Prove it ex-post:** because the demand charge is set by the *single highest interval*, you can only verify a reduction worked by re-reading the interval series next month — a lower monthly kW with no interval evidence is indistinguishable from luck.

In one line: **the bill tells you that you have a peak; only the 15-minute interval data tells you when it happened, which pumps caused it, whether it was a coincidence you can break, and how many dollars breaking it is worth.** ([Exro][exro], [DemandQ][demandq], [DOE EM&V Ch.10][doe])

---

## 5. Realistic % of the demand charge that staggering can recover

There is no single published "staggering recovers X%" figure for PG&E ag farms, so this is a reasoned estimate grounded in the mechanics and the cited sources — flag it as an estimate when shown to a grower.

**Framing the math.** Staggering can, in the limit, reduce coincident peak from "the sum of overlapping pumps" toward "the largest single pump." For a farm running **many large pumps of similar size**, the recoverable demand is the *avoidable overlap*. If a farm's billed peak is set by, say, 3–4 similarly sized pumps that overlap, perfectly de-conflicting them could in principle cut the coincident peak by **40–60%** — but that is the theoretical ceiling and assumes the irrigation schedule has enough slack to never need them simultaneously.

**Realistic, deliverable range:** for a farm running many large pumps with normal operational constraints (water windows, crop demand, labor), staggering plus start-sequencing typically recovers on the order of **15–30% of the demand charge** — call it **~20–25% as a working planning number** for a multi-pump operation, with well-run de-confliction reaching **~30–40%** on farms with severe, fixable overlap. This sits consistently within the literature: demand charges are 30–70% of the bill ([USDA][usda]), peak-shifting/peak-shaving programs target ~20–40% peak reductions ([iFactory peak shaving][ifactory], [Revel ~20% peak-hour][revel]), and case-study sequencing/VFD work has halved station peaks in favorable cases ([BPA][bpa]).

**The honest caveats to ship with the number:**
- The ceiling is set by **how much scheduling slack** the farm has. A farm that genuinely must run everything at once during a heat event has little to recover; one that overlaps out of habit has a lot.
- It is a **demand-charge** reduction, not a total-bill reduction. If demand is ~40% of the bill and you cut demand 25%, that's ~10% off the *total* bill — still real money at AG-1-anchor rates (~$15–23/kW summer).
- **You cannot estimate the % for a specific farm without that farm's 15-minute interval data.** The whole reason the range is a range is that the answer is "show me the coincident peak." This is exactly the loop §4 describes and the product should close.

---

## Sources

- PG&E, *Business and Agricultural Time-of-Use Rate Plans* (PG&E-560): [pge.com][pge-560]
- PG&E, *Time-of-Use Rate Plans*: [pge.com/en/account/rate-plans/time-of-use-rate-plans.html][pge-tou]
- PG&E, *Understand Your Bill — Agricultural*: [pge.com][pge-bill]
- PG&E, *Agricultural Customers — best rate plan* insert: [pge.com][pge-aginsert]
- PG&E, *Schedule AG-1* tariff (Cal. P.U.C. Sheet 50593-E): [pge.com][pge-ag1]
- PG&E, *Schedule AG-5* tariff: [pge.com][pge-ag5]
- PG&E 2026 rate change summary (NRG Clean Power): [nrgcleanpower.com][nrg]
- Nectar Climate, *PG&E Rate Optimization Guide*: [nectarclimate.com][nectar]
- USDA Forest Service / MTDC, *Saving Money by Understanding Demand Charges*: [fs.usda.gov][usda]
- Exro, *Demystifying Demand Charges*: [exro.com][exro]
- DemandQ / DemandLab, *Understanding Electric Demand*: [demandq.ai][demandq]
- Northern Electric Cooperative, *Demand & the Monthly Coincident Billing Peak*: [northernelectric.coop][northern]
- DOE, *EM&V Chapter 10: Peak Demand & Time-Differentiated Savings*: [energy.gov][doe]
- Revel Energy, *On-Farm Irrigation Energy Saving Tips*: [revel-energy.com][revel]
- Pumps.org, *Ag Pumps Study Details Surprising Energy Savings*: [pumps.org][pumps]
- BPA, *Variable Frequency Drives* (agricultural): [bpa.gov][bpa]
- Mingch, *VFD vs Soft Starter for Pumps*: [mingchele.com][mingch-vfd]
- Mingch, *How Soft Starters Reduce Starting Current*: [mingchele.com][mingch-current]
- Southern Irrigation, *Soft Starters vs VFDs for Your Pump*: [southernirrigation.com][southern]
- Precision Electric, *VFD for Pumps*: [precision-elec.com][precision]
- EnergyCAP, *What Is Load Factor*: [energycap.com][energycap]
- Integrity Energy, *How Load & Power Factors Affect Your Bill*: [integrityenergy.com][integrity]
- Wikipedia, *Load factor (electrical)*: [en.wikipedia.org][wiki-lf]
- Y-W Electric, *Irrigation Pumping Rate*: [ywelectric.coop][ywelectric]
- iFactory, *Peak Shaving & Demand Response*: [ifactoryapp.com][ifactory]

[pge-560]: https://www.pge.com/assets/pge/docs/account/rate-plans/PGE-560-TOU-Plans.pdf
[pge-tou]: https://www.pge.com/en/account/rate-plans/time-of-use-rate-plans.html
[pge-bill]: https://pge.com/en_US/small-medium-business/your-account/billing/understand-your-bill/agricultural-bill/agricultural-bill-page3.page
[pge-aginsert]: https://www.pge.com/assets/pge/docs/account/billing-and-assistance/bill-inserts/1023-Agricultural-Rate.pdf
[pge-ag1]: https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_AG-1.pdf
[pge-ag5]: https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_AG-5.pdf
[nrg]: https://nrgcleanpower.com/learning-center/pge-rate-increase/
[nectar]: https://nectarclimate.com/rates/pacific-gas-electric-pge
[usda]: https://www.fs.usda.gov/t-d/pubs/htmlpubs/htm00712373/index.htm
[exro]: https://www.exro.com/industry-insights/demystifying-demand-charges
[demandq]: https://www.demandq.ai/demandlab/understanding-electric-demand/
[northern]: https://www.northernelectric.coop/demand
[doe]: https://www.energy.gov/sites/prod/files/2013/05/f0/53827-10.pdf
[revel]: https://revel-energy.com/on-farm-irrigation-energy-saving-tips/
[pumps]: https://www.pumps.org/2022/12/15/ag-pumps-study-details-surprising-energy-savings/
[bpa]: https://www.bpa.gov/energy-and-services/conservation/agricultural/variable-frequency-drives
[mingch-vfd]: https://www.mingchele.com/blog/difference-between-soft-starts-and-vfd-for-pumps/
[mingch-current]: https://www.mingchele.com/blog/soft-starter/soft-starters-for-current-efficiency/
[southern]: https://southernirrigation.com/2024/01/08/efficiency-unleashed-soft-starters-vs-vfds-for-your-pump/
[precision]: https://www.precision-elec.com/vfd-for-pumps/
[energycap]: https://www.energycap.com/blog/what-is-load-factor/
[integrity]: https://www.integrityenergy.com/blog/maximize-efficiency-how-load-and-power-factors-affect-your-energy-bill/
[wiki-lf]: https://en.wikipedia.org/wiki/Load_factor_(electrical)
[ywelectric]: https://www.ywelectric.coop/rates/irrigation-pumping-rate
[ifactory]: https://ifactoryapp.com/blog/peak-shaving-demand-response-factory
