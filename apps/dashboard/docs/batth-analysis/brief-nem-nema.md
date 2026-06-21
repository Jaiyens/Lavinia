# Reference Brief: PG&E NEM2 + NEM Aggregation (NEMA / NEM2A)

**Purpose.** Explain how NEM2 net-metering true-up works, how NEM Aggregation (NEMA / NEM2A) shares one
array's credits across multiple load meters, the eligibility/contiguity rules, and the common failure modes
that produce a large annual true-up bill. Then reason about a specific real case (meter `1010427495`,
"VINES IRR 75HP", NEMEXP, December true-up: Exports = 0, ~190,505 kWh net import, ~$62,795 true-up).

> Disclaimer carried from PG&E's own docs: these summaries are not a substitute for the NEM2 tariff. Where a
> number or rule is load-bearing for a customer dispute, confirm against the live tariff sheet
> (`ELEC_SCHEDS_NEM2.pdf`) and the customer's actual Supplemental Billing Report.

---

## 1. How NEM2 net metering and the annual true-up work

- **Monthly netting, annual settlement.** A NEM2 customer is on a 12-month billing cycle. Each month PG&E
  nets energy you consume against energy you export; the dollar balance (charges minus credits) is *carried
  forward* month to month rather than collected. At the end of 12 months you get a **True-Up Statement** that
  reconciles the whole year and shows the final balance due (or a credit). [PG&E NEM Bill; PG&E Solar Bill]
- **Why a balance owed accrues.** If, over the year, you pulled more kWh from the grid than your system
  exported — or your *export credits* (valued at retail TOU energy rates) were worth less in dollars than your
  *import charges* (valued at the TOU rates in effect when you consumed) — the carried-forward balance is
  positive and you owe it at true-up. TOU timing matters: exporting cheap midday kWh and importing expensive
  evening/peak kWh can leave a dollar deficit even when kWh roughly balance. [PG&E NEM Bill; Solar Rights Alliance]
- **Two buckets per the tariff.** Each kWh you *import* is billed at (energy rate **+** non-bypassable
  charges). Each kWh you *export* is credited at the **energy rate only**. So credits can erase the energy
  portion of your bill but never the NBC portion or the minimum/base charges. [Aurora Solar; PG&E NEM Bill]
- **Net Surplus Compensation (NSC).** If you finish the year a *net exporter*, the surplus is paid out at a
  low wholesale-tracking rate (roughly 2-9 ¢/kWh), not retail. You never "bank" retail-value credit past
  true-up. [PG&E NEM Bill] — **and for NEMA, the generating account is permanently ineligible for NSC.**
  [PG&E NEM2A FAQ §IV]

---

## 2. How NEM Aggregation (NEMA / NEM2A) allocates one array's credits across many load meters

NEM2A is a sub-schedule of NEM2 (Special Condition 6) that lets **one customer-of-record** put **one
generating array** behind a single *generating meter* and spread its credits across multiple *benefiting*
(aggregated) load meters on the same/contiguous property. [PG&E NEM2A FAQ §I]

**Roles** [PG&E NEMA Billing Guide, "Key definitions"]:
- **Generating account / meter** — the one meter physically tied to the array. There can be **only one** per
  arrangement. It may or may not carry its own load.
- **Benefiting / aggregated accounts** — every other eligible load meter that receives credit *virtually, via
  billing*. The arrangement must have **at least two SA IDs**.
- **Arrangement** — the generating account + all aggregated accounts, billed together on a common 12-month
  Relevant Period anchored to the interconnection/anniversary date.

**The allocation formula (this is the crux of the case below)** [PG&E NEMA Billing Guide, "Energy allocation
methodology"]:
- Only **net export** from the generating system feeds the allocation: *"the exported energy that is used in
  the allocation methodology is equal to the exported energy from the generating system minus the energy
  needed to serve the load tied to the [generating] meter ... not the total power exported."*
- Each month the exported kWh are **reallocated across all SA IDs in proportion to cumulative usage**. By the
  12th period (true-up): *"each SA ID ... will have been allocated a percentage of the exported generation
  credits equal to the percentage of its respective cumulative usage divided by the sum of all the usage in
  the arrangement."* The heaviest-load meter gets the largest share of credit.
- A separate **Supplemental / Generation Allocation Summary** report lists, per SA ID, its consumption, its
  **allocated percent**, and **allocated generation credit (kWh)**. This is the document that proves whether a
  given meter was actually inside the arrangement and what share it got.

**Key billing consequence:** credit moves to load meters as **allocated kWh**, not as exports on the load
meter itself. **A benefiting load-only meter shows Exports = 0 by design** — the exports live on the
*generating* meter. Each benefiting meter is then "treated like a NEM2 account until true-up." [PG&E NEM2A FAQ
§IV; NEMA Billing Guide]

---

## 3. Eligibility / contiguity rules (NEM2A) [PG&E NEM2A FAQ §I]

- **Single customer-of-record** named on the PG&E bill for *every* account in the arrangement.
- All parcels **solely owned, leased, or rented** by that same customer.
- Parcels must be **contiguous or adjacent** — touching, or in an *unbroken chain* of otherwise-contiguous
  parcels under the same ownership/control. A parcel split by a **street, highway, or public thoroughfare** is
  still "contiguous" if otherwise contiguous and same-ownership. A third-party easement does **not** break
  contiguity. PG&E verifies this with **parcel maps** at interconnection (Form 79-1202).
- **Sizing rule:** the array's annual output (kWh) must **not exceed** the aggregated annual load of all
  accounts in the arrangement (sized to recent annual usage + reasonable future load). No hard kW cap under
  NEM2. [PG&E NEM2A FAQ §III]
- **NBCs still apply on full metered usage:** *"NBC charges will apply to the load accounts based on their
  full metered usage"* — PPP, Nuclear Decommissioning, CTC, DWR Bond. [PG&E NEM2A FAQ §IV]
- **Any membership change forces an early true-up** and restarts the 12-month clock (adding/removing a
  benefiting account, account-type change, ESP/CCA change, panel/transformer upgrade). [PG&E NEMA Billing Guide,
  "Important reminders"]

---

## 4. Common failure modes that cause a large annual true-up

| # | Failure mode | What it looks like on the bill | What confirms it |
|---|---|---|---|
| (a) | **Load meter not actually enrolled as a benefiting account** → gets **zero** allocated generation. It is billed as a plain full-retail account. | High net import, **0 allocated kWh / 0% allocated percent**, effective $/kWh near full retail (not the ~2.3¢ NBC floor). | The meter's SA ID is **absent** from the Generation Allocation Summary / Supplemental Report, or shows **0% allocation**. Compare the arrangement's Form 79-1202 roster against the billed SA ID. |
| (b) | **Array undersized / under-producing / offline** (zero or low exports system-wide). | The *generating* meter's exports are low/zero; every benefiting meter is under-credited. | Generating-meter interval/export data shows production far below the ~1,500-1,900 kWh/kW·yr expected for a Central Valley array; inverter/PI fault logs; production-meter read. |
| (c) | **Allocation under-serves a heavy load meter.** Because credit is split *pro-rata by cumulative usage across the whole arrangement*, a meter only ever gets `its_usage / total_arrangement_usage` of the credit. If total arrangement load > total generation, every meter is under-credited; a spiky/seasonal heavy meter can still owe. | Meter shows a **non-zero but partial** allocation %, residual import charges at true-up. | Allocation Summary shows the meter's % share, and arrangement total usage > arrangement total generation — so 100% offset was impossible for anyone. |
| (d) | **NBCs (and minimum/demand charges) can't be offset.** Even a perfectly credited meter still owes ~2.3¢/kWh × full metered usage, plus base/demand charges. | A residual bill roughly equal to (NBC rate × imported kWh) + minimum/demand, *after* energy is zeroed out. | True-up balance ≈ NBC rate × full metered kWh; energy line nets to ~0 but NBC/min/demand lines remain. |

The diagnostic that **separates (a) from (b)/(c)/(d)** is the **effective $/kWh on the net import**:
- ≈ **2.3 ¢/kWh** → failure (d): only NBCs survived; the meter *was* credited.
- ≈ **full retail TOU ag rate (~25-35 ¢/kWh)** → failure (a): the meter received **essentially no
  allocation** and was billed as an un-aggregated full-retail account.

---

## 5. The specific case — meter `1010427495` ("VINES IRR 75HP", NEMEXP, December true-up)

**Given:** Exports = 0; ~190,505 kWh **net import** for the year; ~**$62,795** true-up. Farm has large arrays
(1,092 kW + 840 kW groups ≈ **1,932 kW** combined) feeding NEMA groups.

### Two facts that drive the diagnosis

1. **Effective price.** `$62,795 / 190,505 kWh ≈ $0.33/kWh.` That is **full retail ag TOU energy pricing**,
   *an order of magnitude above the 2.3¢/kWh NBC floor* (which would be only ~$4,380 on this usage). **This
   meter received essentially zero generation credit** — its energy was **not** offset. This rules out
   failure (d) as the main driver and rules out (c) as sufficient (a partially-credited meter could not land
   near full retail).

2. **The array is not the bottleneck.** A 1,932 kW array in the Central Valley should produce roughly
   **2.9-3.7 million kWh/year** (1,500-1,900 kWh/kW·yr) — ~15-19× this one meter's 190,505 kWh load. Unless
   the *entire* array fleet was offline (which would also crater every other meter on the farm and is easy to
   falsify), there was *more than enough* generation to fully offset this load. This argues **against** a
   systemic under-production story (b) being the cause for *this* meter specifically.

3. **Exports = 0 is expected for a benefiting meter, but the NEMEXP tag is the tell.** In a healthy NEMA
   arrangement, a *load* meter correctly shows Exports = 0 (exports live on the generating meter). **But this
   SA carries a "NEMEXP" (NEM Export) designation** — i.e., it is configured/labeled as an *export/generating*
   service agreement — and yet reports **0 exports** and pure import. A meter that is supposed to be on the
   export side of the arrangement but shows zero exports and full-retail import is the signature of a
   **metering/enrollment linkage break**: the SA exists in PG&E's system with an export profile but is **not
   actually wired into the arrangement's allocation** (or the array tied to it is not reporting to it).

### Most likely explanation (ranked)

1. **(a) Enrollment / arrangement-linkage failure — most likely.** This meter is **not receiving the
   arrangement's allocated generation credit**: either it was never added (or was dropped) as a benefiting SA
   ID on the active Form 79-1202 roster, or a mid-year change forced an early true-up that **re-pointed the
   allocation and left this SA orphaned**, or the NEMEXP SA is mis-mapped to a generating meter that produced
   nothing for it. Result: billed as a full-retail standalone account → the ~$0.33/kWh effective rate. The
   "NEMEXP but Exports = 0" status is the strongest single indicator.
2. **(c) Pro-rata under-allocation — contributing, not sufficient.** If total arrangement load exceeds total
   generation (over-aggregation / array undersized vs. *aggregate* load), every meter is under-credited and a
   heavy irrigation meter like a 75 HP vineyard pump can carry a residual. But this alone can't reach full
   retail; it would layer *on top of* (a).
3. **(b) Localized production loss — possible secondary.** If the specific array group meant to feed this
   meter's group was offline/curtailed for much of the season while the rest of the fleet ran, this meter
   could be starved even though farm-wide nameplate looks ample. Falsify by checking that *other* meters in
   the same NEMA group were credited normally.
4. **(d) NBC residue — minor.** Real but small (~$4.4k of the $62.8k). Not the story.

### What would CONFIRM each, from the bill / meter data

- **(a) Not enrolled / orphaned SA** — pull the **Supplemental / Generation Allocation Summary** for the
  arrangement and check whether SA ID `1010427495` appears with a non-zero **allocated percent** and
  **allocated generation kWh**. If it is **absent or 0%**, (a) is confirmed. Cross-check the **active Form
  79-1202** roster and the interconnection/anniversary date for a **mid-year rearrangement / early true-up**
  that reset the clock and dropped this SA. Confirm the December true-up date matches the arrangement's
  Relevant Period (a mismatched true-up month is itself evidence the SA isn't in the group).
- **(b) Array offline/under-producing** — pull the **generating meter's** annual export/interval data and the
  inverter/production-meter logs for the 1,092 kW and 840 kW groups. Confirmed if measured production is far
  below ~1,500-1,900 kWh/kW·yr or shows extended zero-output windows. Check whether **other benefiting meters
  in the same group** were also under-credited (systemic) vs. only this one (points back to (a)).
- **(c) Pro-rata under-service** — from the Allocation Summary, compute this SA's `usage / Σ arrangement
  usage`; compare arrangement **total generation vs. total load**. Confirmed if its allocated % is well below
  what full offset of its 190,505 kWh would require *and* arrangement load > generation (so no meter could be
  fully covered).
- **(d) NBC floor** — confirmed if, after the energy line is netted to ~0, the residual ≈ (NBC rate × full
  metered kWh) + minimum/demand charges. Here the residual is ~$0.33/kWh, **far above** the NBC floor, so (d)
  is **not** the driver.

---

## 6. Bottom-line summary (most likely cause + cheapest fix)

The numbers point hardest at **failure mode (a): the VINES IRR 75 HP meter (`1010427495`) is not actually
receiving the NEMA arrangement's allocated generation credit** — its ~$0.33/kWh effective true-up rate is
full retail (≈14× the 2.3¢ NBC floor), and the farm's ~1,932 kW of arrays produce far more than this meter's
190,505 kWh load, so the credit *exists* but isn't reaching this SA. The "NEMEXP, Exports = 0" status is the
tell that the service agreement is mis-linked/orphaned from the allocation (never added, dropped by a mid-year
rearrangement that forced an early true-up, or mapped to a generating meter producing nothing for it). **The
cheapest fix is administrative, not capital:** pull the **Generation Allocation Summary / Supplemental Report
and the active Form 79-1202 roster**, confirm SA `1010427495` is missing or at 0% allocation, then file a
corrected **Form 79-1202** to (re)enroll this meter as a benefiting account in the right NEMA arrangement and
request PG&E **rebill/recalculate the true-up** with the corrected allocation — recovering most of the
~$62,795 with no new hardware. (If, instead, the Allocation Summary shows the SA present but the *array group*
read near-zero exports, the fix shifts to repairing/bringing the offline array group back online and disputing
the affected period.)

---

## Sources

- PG&E, *NEM Aggregation (NEM2A) Frequently Asked Questions* (rev. 08/2021) — eligibility, contiguity,
  generating vs. aggregated accounts, monthly allocation, NBCs on full metered usage, early-true-up triggers:
  https://www.pge.com/content/dam/pge/docs/about/doing-business-with-pge/NEM2A-FAQ.pdf and
  https://www.pge.com/nemafaq/
- PG&E, *Net Energy Metering Aggregation (NEMA/NEM2A) Billing Guide* — exact allocation methodology
  ("exported energy minus generating-meter load"; "percentage ... equal to ... its respective cumulative usage
  divided by the sum of all the usage"), Supplemental / Generation Allocation Summary report, important
  reminders / early-true-up list:
  https://www.pge.com/assets/pge/docs/account/billing-and-assistance/nema-billing-guide.pdf
- PG&E, *Net Energy Metering (NEM) Bill* (Understand Your Bill) — monthly tracking, true-up, NSC, NBC bucket:
  https://www.pge.com/en/account/billing-and-assistance/understand-your-bill/net-energy-metering-bill.html
- PG&E, *Solar Bill / Solar Billing Plan* — credits not applied to non-bypassable or demand charges:
  https://www.pge.com/en/account/billing-and-assistance/understand-your-bill/solar-bill.html and
  https://www.pge.com/en/clean-energy/solar/getting-started-with-solar/solar-billing-plan.html
- PG&E, *Electric Schedule NEM2* tariff sheet (Special Condition 6 = NEM2A):
  https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_NEM2.pdf
- PG&E, *Schedule AG* (agricultural TOU rates AG-A/AG-B/AG-C):
  https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_AG.pdf
- Aurora Solar, *The ultimate guide to NEM 2.0: non-bypassable charges explained* — NBC components (PPP, ND,
  CTC, DWR Bond), ~2.3¢/kWh, charged on every imported kWh, never offset by exports:
  https://aurorasolar.com/blog/the-ultimate-guide-to-nem-2-0-part-1-non-bypassable-charges/
- Solar Rights Alliance, *Understanding Your True-Up Statement* — TOU-timing reasons a dollar balance accrues
  even when kWh net out: https://solarrights.org/blog/2025/09/26/understanding_your_true_up_statement/
- CPUC, *Net Energy Metering* program page (NEMA/SB 594 background):
  https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/demand-side-management/net-energy-metering
