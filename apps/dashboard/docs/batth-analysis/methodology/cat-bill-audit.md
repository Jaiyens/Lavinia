# Category Deep-Dive: Bill Audit / Billing Errors

**Lever:** PG&E dispute. No operational change. The grower keeps running the farm
exactly as today; the recovery is a credit/rebill from PG&E correcting a charge
that should not have been billed (or should have been smaller).

**Scope of the dollars.** Every dollar in this file comes from **account
`4699664587-8`** (CHARANJIT S BATTH), the only account in the bill PDF. That
account has ~46 metered SAs; the latest cycle is **2026-02-11 to 2026-03-12
(winter)**. The Excel inventory's 183 meters across ~57 accounts are NOT priced
here (no bills for them). Solar arrays total **1,932 kW (840 + 1,092)** per ground
truth, not the 12,180 the solarKw column would sum to.

**Source files.**
- Billing facts: `docs/batth-analysis/normalized/billing.json` (re-derived from the
  cent-reconciled vision extraction `fixtures/extract/batth-account-4699664587.json`).
- Inventory join: `docs/batth-analysis/normalized/inventory.json`.
- Rate inputs: `brief-pge-ag-rates.md`, `brief-demand-charges.md`, `brief-nem-nema.md`.

---

## How these dollars would be computed (and where AI is / is not involved)

Every figure below is **deterministic arithmetic**. The ONLY AI anywhere in this
pipeline is the **bill-PDF vision extraction** in `src/lib/extract` (it turns the
114-page PG&E PDF into structured JSON line items). Once the line items exist,
nothing downstream uses a model:

| What it prices | Exact engine / function | AI? |
|---|---|---|
| Re-derive a posted bill from the dated tariff card + the meter's own billed TOU/demand, and report the signed deviation vs PG&E's print | `verifyBill()` in `src/lib/energy/bill-verify.ts`, which delegates to `backTestMeter()` / `cycleFromPeriod()` / `priceCycleCents()` in `src/lib/energy/rate-lever.ts` + `rates.ts` (integer-cents, AR-6) | No. Pure function. |
| Per-meter demand $/kW from the itemized demand line (`amount / kW`) | `effectiveDemandRate()` in `src/lib/energy/demand.ts` | No. |
| NEM monthly net position (net consumer vs net exporter), annual import/export | `summarizeNemMonths()` in `src/lib/energy/solar-nem.ts` | No. |
| The non-bypassable-charge floor a NEM meter still owes after credits | `solarBillFloor()` in `src/lib/energy/solar-nem.ts` | No. |
| Whether a NEMA SA actually received its allocated generation | `auditAllocation()` in `src/lib/energy/solar-allocation.ts` (requires the Generation Allocation Summary as input) | No. |

For this deep-dive the arithmetic is simple enough that it is shown inline ("manual
analytic" matching the functions above); the production engine that would emit each
as a `DraftRecommendation` is named in each finding's `computedBy`.

**`needsData` honesty.** Most candidates here are flagged `needs_review` in
`billing.json` (the parser reconciled the cycle's printed *total* but the demand /
NEM sub-lines do not internally reconcile, i.e. `parsedRatePerKw x parsedKw` does
not equal the printed line amount). A bill-audit dispute is asserted against PG&E,
so where the structured extraction is the only evidence we mark `needsData` =
`other-account-bills` (the itemized PG&E bill line) or `pge-allocation-summary`
(the NEMA Generation Allocation Summary), and we do NOT bank the dollars until that
document confirms the charge.

---

## Enumeration: every instance of the bill-audit lever

### FINDING 1 — P027 net-exporter charged a $2,461 true-up (DEFENSIBLE, the only banked dollars)

**Meter:** `4697755484` (P027, "PUMP # 27", AG5C, NEM2AA, ranch CHATEAU FRESNO),
true-up month 5 (May).

**The anomaly.** P027 is a clear **net exporter** over its relevant period yet was
charged a positive annual NEM true-up:

```
annualImportKwh_printed = 16,949
annualExportKwh_printed = 39,855
annualNetKwh_printed    = -22,906   (negative => net EXPORT)
true-up billed          = $2,461.49
```

A net exporter on NEM2/NEM2A should owe **at most** the non-bypassable-charge (NBC)
residue on its gross import and otherwise receive a credit (or low-rate Net Surplus
Compensation). It should not carry a $2,461 charge. Per `brief-nem-nema.md`, the
diagnostic is the effective $/imported-kWh:

```
effective $/import = 2,461.49 / 16,949 = $0.1452 / kWh
```

That is ~6.3x the ~2.3 cents/kWh NBC floor, i.e. the export credit is not fully
reaching this meter's own bill (allocation/enrollment break, or a sign error in the
true-up that ignored the export side). The monthly rows confirm the sign mess: e.g.
the `2025-07-10..2025-08-10` row reads `net = -12,759` (export) yet `$ = +2,698.20`
(a charge) — a negative-net month billed as a positive charge.

**Arithmetic (the disputable amount).**

```
NBC floor    = 16,949 kWh import x $0.023/kWh = $389.83   (max legitimate residue)
disputable   = 2,461.49 - 389.83             = $2,071.66
```

We bank **$2,071.66** (the charge above the NBC floor), not the full $2,461.49,
because the NBC portion is genuinely owed. Confidence **medium**: the direction is
unambiguous from the printed annual NEM table (net export), but the exact recovery
needs P027's Generation Allocation Summary / Form 79-1202 to confirm the export
credit was mis-applied rather than legitimately allocated elsewhere.

- `annualUsd`: **2071.66**
- `computedBy`: `summarizeNemMonths()` + `solarBillFloor()` in `src/lib/energy/solar-nem.ts` (deterministic; the NBC floor and net-position are pure arithmetic, no AI). Manual analytic shown inline.
- `formula`: `disputable = trueUpUsd - (annualImportKwh x NBC_rate)` where `NBC_rate = $0.023/kWh`
- `needsData`: `pge-allocation-summary` (to confirm full recovery; the $2,071.66 floor stands on the printed bill alone)

---

### FINDING 2 — VINES 75HP $62,795.65 zero-credit true-up (REAL anomaly, $0 banked, contingent)

**Meter:** `4699664088` ("VINES IRR 75HP NEW 75HP (PUMP # 31)", P031 in inventory;
billed AGC, inventory rate AGB; NEMEXP), true-up month 12 (December).

This is the headline anomaly but it is **NOT a banked bill-audit dollar.** It is a
genuine zero-credit event:

```
annualImportKwh_printed = 230,223
annualExportKwh_printed = 39,718      (NEMEXP SA showing low export)
annualNetKwh_printed    = 190,505
true-up billed          = $62,795.65
effective $/import      = 62,795.65 / 230,223 = $0.273 / kWh  (~full retail)
```

The "NEMEXP but near-zero export" status and the ~$0.27/kWh effective rate are the
signature of an orphaned NEMA allocation (the SA is not receiving the arrangement's
allocated generation; see `brief-nem-nema.md` §5). The sibling P038
(`4699664743`, same AGC/NEMEXP profile) trued up to **$0.26** — proof the
arrangement *can* zero out, which is why P031's $62,795 looks like a linkage break.

**Why $0 is banked here.** Recovery is **$0 to ~$57k CONTINGENT** on the Generation
Allocation Summary. If the 1,932 kW arrays are oversubscribed (aggregate load >
aggregate generation), the allocation is zero-sum: crediting P031 would debit
another benefiting meter, and there is no net recovery. We never overstate this as
banked. The NBC floor frames the ceiling:

```
NBC floor      = 230,223 x $0.023 = $5,295.13
above-NBC band = 62,795.65 - 5,295.13 = $57,500.52   (CONTINGENT, not banked)
```

- `annualUsd`: **0** (defensible-now). Contingent upside $0-$57,500.52.
- `computedBy`: `auditAllocation()` in `src/lib/energy/solar-allocation.ts` would price it once the Generation Allocation Summary is supplied (deterministic, no AI). Cannot price it now.
- `formula`: `recovery = trueUpUsd - allocatedGenerationCredit(SA)`; unknown until the allocation summary is in hand.
- `needsData`: `pge-allocation-summary`

---

### FINDING 3 — "Demand $/kW overbilled vs peers (~$795)" — FALSIFIED, $0 banked

**Meters:** `4699664194` (VINES IRR 15HP, HAGA2) and `4699664794` (FARM SHOP
SWANSON-T31, HAGA2), vs peers `4699664553` and `4699664599` (both HAGA2).

A prior pass flagged these two as billing ~$22/kW demand vs a ~$13.45/kW peer rate
(a "1.6x over-rate", ~$794.54/yr). **Re-checking the itemized line items falsifies
it.** The "$13.45 peer rate" was computed as `structuredDemandUsd / peakKw`, but
the structured demand number is the **sum of two sub-period demand lines** (the
02/11-02/28 line and the 03/01-03/12 line), while `peakKw` is only the
end-of-cycle peak. Dividing one by the other is not a $/kW.

The actual itemized demand lines on the peers both read **$21.43/kW** (the AG-A2
secondary max-demand row):

```
peer 4699664553: itemized demand line 12.584 kW @ $21.43 = $107.87   (structured total $184.16 includes a 2nd sub-line)
peer 4699664599: itemized demand line  7.4236 kW @ $21.43 = $63.64    (structured total $127.81 includes a 2nd sub-line)
```

The two "over-rate" candidates have NO itemized demand line (the parser only
captured a structured aggregate), so their implied rate is:

```
4699664194: $86.41 / 3.948 kW = $21.89 / kW
4699664794: $84.55 / 3.84  kW = $22.02 / kW
```

$21.89 and $22.02 are within rounding of the peer **$21.43/kW** — there is no
1.6x over-rate. The apparent gap was an artifact of dividing a 2-line structured
total by a 1-value peakKw on the peers. **Nothing to dispute.** (Both meters peak
under 4 kW and are AG-A1 demote candidates, but that is the rate-arbitrage lever,
not a billing error, and it is sign-ambiguous without interval data.)

- `annualUsd`: **0**
- `computedBy`: `effectiveDemandRate()` in `src/lib/energy/demand.ts` on the itemized line (deterministic). The falsification is manual analytic.
- `formula`: `effectiveRate = demandLineAmountUsd / demandLineKw`; candidates ~= peers ($21.43/kW). No excess.
- `needsData`: `other-account-bills` (the itemized PG&E demand line for the two candidates would confirm $21.43/kW directly)

---

### FINDING 4 — A demand line on AG-B meters, which has no demand charge per tariff ($0 banked, needs bill)

**Meters:** `4699664429` (FARM SHOP TURKEY-AL7, HAGB) and `4699664416` (P078,
HAGB).

Per `brief-pge-ag-rates.md`, **Schedule AG-B has no demand charge at all**
(energy-only recovery; demand row = "None"). Both meters are genuinely AG-B (their
customer charge bills at $0.91565/day, the AG-B rate). Yet the extraction shows a
demand line:

```
4699664429: structured demand $49.55  (peakKw 5.672)   -- itemized sub-line 5.652 kW @ $13.95 printed as $31.54
4699664416: structured demand $29.69  (peakKw 5.32)    -- itemized sub-line 3.260 kW @ $14.56 printed as $28.48
sum/cycle = $79.24   ;   x12 = $950.88 if recurring
```

If genuine, AG-B forbids any demand charge and the whole line is disputable
(~$950/yr ceiling). **But two things block banking it now:**

1. The parsed unit math does not reconcile: `5.652 x $13.95 = $78.85 != $31.54`
   printed; `3.260 x $14.56 = $47.47 != $28.48`. When `rate x kW` does not equal
   the printed amount, the extraction has mislabeled the line (likely a
   customer/other charge read as demand), so we cannot assert a real demand line.
2. The $13.95 and $14.56 rates are AG-A2 rows, not AG-B (which has none) — further
   evidence of a label confusion in extraction.

So $0 is banked; this is a "read the actual bill line" item. If a line literally
labeled "Demand Charge / Max Demand" appears under AG-B/HAGB on the real bill, it
is disputable up to ~$950/yr; if it is a mislabeled customer charge, there is no
dispute (fix the parser instead).

- `annualUsd`: **0** (defensible-now). Worst-case recoverable ~$950.88/yr if genuine.
- `computedBy`: `verifyBill()` in `src/lib/energy/bill-verify.ts` would recompute the AG-B bill from the tariff card (which has no demand component) and surface the demand line as the deviation (deterministic, no AI).
- `formula`: `disputable = demandLineUsd` (AG-B permits $0 demand); annualized `x 12` if recurring.
- `needsData`: `other-account-bills` (the itemized PG&E line for these two SAs)

---

### FINDING 5 — VINES 75HP billed 111.52 kW demand, 1.56x a 75 HP motor's ceiling (wrong-multiplier candidate, $0 banked)

**Meter:** `4699664088` (same SA as Finding 2; the demand side, separate from the
NEM true-up side).

The latest cycle bills `peakKw = 111.52` with a $1,112.97 demand line (plus a
$1,711.73 sub-line at 109.6 kW). The descriptor is "75HP". Motor physics:

```
75 HP shaft        = 75 x 0.746            = 55.95 kW
electrical (full)  ~ 55.95 / 0.88 (eff.pf) = 63.6 kW
1.15 service factor ceiling                = 73.1 kW
billed 111.52 kW / 73.1 kW ceiling         = 1.56x
```

Billing 1.56x the electrical ceiling of the nameplate motor is the signature of a
**wrong CT/PT multiplier** (e.g. a 2x multiplier mis-applied). IF a 2x multiplier
error were proven, ~half the demand line (~$556/cycle) would be disputable.

**Why $0.** The cycle is `coverageState = needs_review` (the demand sub-lines do
not internally reconcile against `peakKw`), and "75HP" descriptor is not connected
load — the comparison pump P054 ("100HP") legitimately peaks at 278.88 kW, so a
descriptor below the metered peak is not by itself proof of a multiplier error.
This needs the bill's CT/PT multiplier and 15-minute interval data to confirm the
true metered peak before any dollar is asserted.

- `annualUsd`: **0** (defensible-now). Contingent ~$556/cycle if a 2x multiplier is proven.
- `computedBy`: `verifyBill()` (recompute vs print) + `maxDemand()` in `src/lib/energy/demand.ts` (true 15-min peak from intervals) (deterministic, no AI).
- `formula`: `disputable = demandUsd x (1 - meteredPeakKw / billedPeakKw)` once the true peak and multiplier are known.
- `needsData`: `interval` (true 15-min peak) plus the bill's CT/PT multiplier.

---

## Total

| # | Finding | Meters | annualUsd (banked) | Confidence |
|---|---|---|---|---|
| 1 | P027 net-exporter true-up above NBC floor | 4697755484 | **$2,071.66** | medium |
| 2 | VINES 75HP $62,795 zero-credit true-up | 4699664088 | $0 (contingent $0-$57.5k) | low |
| 3 | HAGA2 "demand over-rate" (FALSIFIED) | 4699664194, 4699664794 | $0 | high (that it is NOT an error) |
| 4 | Demand line on AG-B (no-demand tariff) | 4699664429, 4699664416 | $0 (worst-case ~$951) | low |
| 5 | VINES 75HP 111.52 kW demand multiplier | 4699664088 | $0 (contingent ~$556/cyc) | low |

**TOTAL DEFENSIBLE (banked) annual: $2,071.66** — P027 only. Everything else is
either contingent on a PG&E document we do not yet have (Findings 2, 4, 5) or a
parser artifact that re-checking falsified (Finding 3). We deliberately do NOT add
the $62,795 VINES true-up to the total: it is real but recovery is $0-$57k
contingent on the Generation Allocation Summary, never banked.
