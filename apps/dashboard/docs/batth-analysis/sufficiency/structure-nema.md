# Data sufficiency + savings projection: Account / entity / NEMA structure

**Lever:** Account / entity / NEMA structure (cross-entity NEMA eligibility, solar-credit
allocation across aggregated meters, the P031/VINES 75HP zero-credit true-up, net-exporter
giveaways, entity-name fragmentation, true-up-date misalignment).

**One line:** This lever is **blocked on a PG&E document (the Generation Allocation Summary /
Form 79-1202) plus the other 56 accounts' bills**. Buying 15-minute interval data does **not**
unblock it. We can build the full *structural legibility* picture for free from the inventory +
the one in-hand bill, and we can compute the P031 audit **range** of **$0-$57k** deterministically,
but the recovery dollar stays **honest-blank / contingent** until the allocation document settles it.

Verdict token: **`blocked-pge-doc`**.

---

## 1. What the engine is (deterministic, not AI)

The dollars and shares for this lever are produced by **pure functions in `src/lib/energy`**, with
**no AI in the pricing path**. The only AI anywhere upstream is the bill-PDF vision extraction in
`src/lib/extract` that produced `normalized/billing.json`; it reads the bill, it does not price
anything.

The exact functions:

| Function | File | What it computes for this lever |
|---|---|---|
| `allocateArray(arrayId, arrayName, meters[])` | `src/lib/energy/solar-allocation.ts` | Usage-proportional **share** of each array's credits per benefiting meter: `share_i = cumulativeKwh_i / sum(cumulativeKwh)`. Meters with no billed usage return `share: null` (not-on-file), never a fabricated zero, never a divide-by-zero. **Computes a SHARE (%), never a dollar.** |
| `auditAllocation({ result, listedButUnlinked, recordedShares? })` | `src/lib/energy/solar-allocation.ts` | The two honest gaps: `dropped_meter` (a meter the master sheet links to an array but is absent from the computed allocation) and `mismatched_share` (computed share diverges from a PG&E-recorded share by more than `ALLOCATION_TOLERANCE_PP = 5` percentage points). **Carries NO `impactUsd`.** The mismatch branch fails closed when no recorded share is on file. |
| `classifyProgramType({ benefitingMeterCount, nemType })` | `src/lib/energy/solar-allocation.ts` | Labels each array `nem` / `nema` / `vnem`. Pure token in, token out. |
| `summarizeNemMonths(months[])` | `src/lib/energy/solar-nem.ts` | Sums deduped printed NEM months into a net-kWh position (`net_credit` / `net_zero` / `net_consumer`). Used for the net-exporter findings (P027, P004). |
| `solarBillFloor(lineItems[])` | `src/lib/energy/solar-nem.ts` | Splits a meter's billed line items into the non-offsettable floor (`demand + nbc + service`) vs the solar-offsettable energy. Feeds the **NBC-floor** arithmetic for the P031 audit ceiling. |

The P031 effective-$/kWh, NBC-floor, and audit ceiling in `findings-deep-structure-nema.json` /
`findings-deep-solar-nem.json` are this same arithmetic, written as a **manual analytic** (the
findings cite `src/lib/energy/nem.ts`, which is the documentation name for the
`solar-allocation.ts` + `solar-nem.ts` pair; there is no separate `nem.ts` file). All of it is
deterministic; none of it is AI.

---

## 2. Exact required inputs (read from the engine signatures)

For the allocation engine to produce a **recoverable dollar** (not just a share or a flag), it
needs all three of:

1. **`AllocationMeterInput.cumulativeKwh` for EVERY benefiting meter on each array** — the summed
   `BillingPeriod.totalKwh` per meter. This is the denominator of the usage-proportional share. It
   is per-meter billed kWh (a single summary number per meter), **not** intervals. For the 56-meter
   solar fleet this means we need billed kWh on **all 8 array groups across all their accounts**.
2. **`AllocationRecordedShare.recordedShare` per meter** — PG&E's / the statement's *recorded*
   allocation split. This comes **only** from the **Generation Allocation Summary / Form 79-1202**.
   Without it, `auditAllocation` cannot raise a `mismatched_share` finding at all (it fail-closes,
   by design, rather than invent a baseline). **This is the document the whole lever is gated on.**
3. **`listedButUnlinked` membership** — which meters list an array code but are missing from the
   computed allocation (the `dropped_meter` check). This is buildable now from the Excel inventory's
   `solarGroupLabel`, but it only *flags* a gap; it cannot *price* it.

For the P031 audit **ceiling/floor range**, the NBC-floor arithmetic additionally needs the meter's
printed annual NEM table (`annualImportKwh_printed`, `annualExportKwh_printed`,
`annualNetKwh_printed`, `nemTrueUpUsd`) — which we **have** for P031, because P031 is on the in-hand
bill. That is why we can state the **range** now but not the **point recovery**.

---

## 3. What we have for free (bills + meter list), and what's still dark

### From the one in-hand bill (account `4699664587-8`, `normalized/billing.json`, 46 billed SAs)

- **14 NEM-enrolled meters with full printed annual NEM tables** (import/export/net kWh + true-up $).
  These are the structural evidence we can actually price a range on:
  - **P031 / VINES 75HP** (SA 4699664088): true-up **$62,795.65**, net 190,505 kWh -> effective
    **$0.3296/kWh** = full retail, ~14x the ~2.3c NBC floor = essentially **zero allocated credit**.
  - **P038** (SA 4699664743): the **control** — same account, same group, same rate, 124,117 kWh net
    import trued up to **$0.26** (~$0.000002/kWh = fully allocated). This proves the allocation
    machinery works on this exact arrangement and isolates P031 as an enrollment/linkage anomaly.
  - **P027** (SA 4697755484): net **exporter** (-22,906 kWh) yet charged a **$2,461.49** true-up
    (the sign-ambiguous net-surplus giveaway; the recoverable slice of this is booked separately in
    the bill-audit lever at ~$2,072, not here).
  - **P004** (SA 4698660251): net exporter (-16,059.88 kWh), no printed true-up.
  - Plus the 4433/4444/5219 legacy NEM2AA cohort (P003, P052, P028, P017, P018, P062 ...) whose
    true-ups are *correctly billed* TOU residuals — $0 recoverable, but they make the fleet legible.

### From the Excel meter list (`normalized/inventory.json`, 183 meters)

Free, now, with **no PG&E calls**:

- **The whole structural map**: 56 solar-flagged meters across **8 array groups**, **57 accounts**,
  and 6 legal billing entities. We can run `classifyProgramType` and the `dropped_meter` half of
  `auditAllocation`, and surface every structural anomaly as a **legibility / dispute-readiness
  flag** (NOT a dollar):
  - **Cross-entity NEMA risk**: 6 of 8 array groups span more than one legal billing entity
    (NEM2A requires a single customer-of-record). Sign-ambiguous (could be recoverable mis-billing
    OR could *raise* the bill if PG&E unwinds it) -> $0 booked.
  - **Entity-name fragmentation**: `BATHH FARMS INC` (typo, 4 rows) vs `BATTH FARMS INC` (22 rows);
    one null billingName in the 1092kw group. Data hygiene that must be reconciled before the
    cross-entity test is trusted.
  - **True-up-date misalignment**: the `Solar` group carries 3 distinct true-up months (Dec/Jan/Oct)
    on what should be one physical-array anniversary — the textbook staggered-enrollment signature
    that corroborates the P031 orphan diagnosis.

### What is still dark (the block)

- **The PG&E-recorded allocation split** for every array — only on the **Generation Allocation
  Summary / Form 79-1202**. Without it, `recordedShare` is null everywhere and `auditAllocation`
  cannot raise a single `mismatched_share`, and the P031 zero-sum question cannot be answered.
- **Billed kWh + true-up dollars for 42 of the 56 solar meters** that sit on the **other 56
  accounts** (no bills in hand). All 8 array groups except the in-hand fragments are partly or
  wholly dark — see the coverage table below.

---

## 4. What buying interval data adds (answer: nothing for this lever)

This is the load-bearing distinction. The interval buy (~$48-$60 for 5 meters, first pull free,
$12/meter thereafter — see `BUY-LIST.md`) is aimed at **rate optimization and demand-response**,
which are **interval-gated**. The structure/NEMA lever is **document-gated**, a different blocker.

- A 15-minute interval pull on **P031** unlocks only its **demand** component (the Finding-F
  ~$556/cycle multiplier dispute and DR sizing). It does **NOT** unlock the **$62,795.65 allocation
  true-up** — `gap-interval-data.md` states this explicitly: *"P031's $62,795.65 true-up is **not**
  unlocked here (that is the Generation Allocation Summary)... Buying intervals does not move them."*
- The allocation engine is **OOM-safe by construction**: it takes per-meter `cumulativeKwh`
  *summaries*, never the interval series. It literally cannot consume intervals, and it does not need
  them — billed kWh summaries are sufficient for the *share*; the missing piece is the *recorded
  split*, which is a document, not a finer-grained meter read.

So: **interval-buy does not change the verdict, the covered-meter count, or the projected range.**

---

## 5. Meter coverage (now vs with interval-buy vs total)

Scope of "covered" = solar-flagged meters this lever reasons about. There are **56** of them across
8 array groups; the in-hand bill carries the printed NEM table for **14**.

| Array group | Meters | Accounts | Entities | On in-hand bill |
|---|---:|---:|---:|---:|
| 4433 | 11 | 4 | 3 | 8 |
| 4444 | 8 | 5 | 3 | 1 |
| 5219 | 10 | 5 | 4 | 1 |
| Solar | 9 | 6 | 2 | 4 |
| 840kw | 8 | 8 | 2 | 0 |
| 1092kw | 5 | 2 | 2 | 0 |
| 4939 | 4 | 3 | 2 | 0 |
| 4624 | 1 | 1 | 1 | 0 |
| **Total** | **56** | — | 6 | **14** |

- **Covered now (free):** **14** solar meters — those with a printed annual NEM table on the in-hand
  bill. Structural *flags* (cross-entity, fragmentation, misaligned true-ups) cover all **56** as
  legibility, but only the 14 carry priceable evidence; the P031 **range** rests on 14, with P038 as
  the in-hand control.
- **Covered with the interval-buy:** still **14**. The interval buy adds no NEM-table coverage and no
  recorded-split coverage for this lever. (It helps other levers, not this one.)
- **Total in scope:** **56** solar meters. Full coverage needs the other 56 accounts' bills (lights
  up the other 42 solar SAs for $0 via the vision pipeline) **and** the Generation Allocation Summary
  (supplies `recordedShare` to make the audit produce recoverable dollars).

`metersCovered` for the structured record: `now: 14, withBuy: 14, total: 56`.

---

## 6. Projected ANNUAL $ range (projected, pending the PG&E document)

All figures are deterministic arithmetic on the in-hand bill, expressed as a **range**, **NOT
banked**, and **NOT moved by interval data**.

| Bound | Annual $ | Basis |
|---|---:|---|
| **Low** | **$0** | The defensible floor. NEMA allocation is a **zero-sum pool**: the 1,932 kW of named arrays (840 + 1,092) may be oversubscribed across the whole fleet, so re-pointing P031's credit only recovers cash if the Generation Allocation Summary shows **spare** unallocated generation. The NBC residue (~$4,382 = 190,505 kWh x ~$0.023) is unavoidable and never recoverable. If the arrangement is already fully subscribed, recovery is exactly $0. |
| **Likely** | **~$28,000** | Midpoint placeholder, **explicitly a coin-flip pending the document.** The control case (P038 zeroed a 124,117 kWh import to $0.26 on the same account/group) makes a *partial-to-full* P031 re-allocation plausible, but the zero-sum risk is real and unquantified. Treat "likely" as "expected value under maximum uncertainty," not as a defensible claim. |
| **High** | **~$57,000** | The audit **ceiling**: `trueUpUsd - NBC_rate x annualImportKwh = 62,795.65 - 0.023 x 230,223 = $57,500.52`, rounded down to ~$57k for surviving min/demand lines. Reached **only if** the Generation Allocation Summary shows P031 absent / 0% allocated **AND** the array group had unallocated kWh to re-point. |

**Why the range is this wide and stays "pending":** the entire spread between $0 and $57k is decided
by **one document we do not hold** — the Generation Allocation Summary / Form 79-1202. The bill alone
proves the *anomaly* (P031's $0.33/kWh effective rate next to P038's $0.000002/kWh) but cannot prove
*recoverability* (whether there is spare generation to re-allocate). This is a one-time recovery on a
single annual true-up, not a recurring annual saving; it is reported as an annual-equivalent figure
because the true-up is annual.

The cross-entity NEMA, fragmentation, net-exporter, and true-up-misalignment findings all carry
**$0** by design: each is sign-ambiguous or pure data hygiene, and the engine refuses to multiply a
share by a dollar (the FR10 honest-blank law).

---

## 7. Verdict

**`blocked-pge-doc`.** The recoverable money on this lever is gated on the **PG&E Generation
Allocation Summary / Form 79-1202** (to supply the recorded allocation split and resolve the zero-sum
question), and the full-fleet picture additionally needs the **other 56 accounts' bills** (free from
PG&E MyEnergy, lights up the other 42 solar SAs via the vision pipeline at $0). **Buying interval data
does not unblock this lever** — the interval pull on P031 only touches its demand/DR component, never
the allocation true-up. What we have for free is the complete *structural legibility* map of all 56
solar meters and a deterministic, auditable **$0-$57k range** on P031, clearly labeled contingent and
never banked.
