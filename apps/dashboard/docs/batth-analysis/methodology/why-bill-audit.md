# Why the "Bill audit / billing errors" lever is real — plain-English methodology

**The lever in one line:** find charges PG&E put on a bill that should not be there, and get
them back as a credit or rebill. No pump runs differently, no rate changes. The money is a
correction of a mistake PG&E made.

**What this lever found for Batth right now:** one defensible dollar number —
**$2,071.66/yr** on meter P027 (a solar net-exporter wrongly charged a true-up). Everything
else in this category is currently **$0 banked** and waiting on one missing document (the
PG&E Generation Allocation Summary) or the itemized bill line. That honesty is the point: we
only put a dollar on the board when the printed bill alone proves it.

---

## (1) HOW do we know the dollar number — the formula in plain words

There is no single formula for "bill audit," because a billing error can take several shapes.
Each finding has its own arithmetic, and **all of it is subtraction the grower could check by
hand on his own bill.** The dollar is always `what they charged − what they were allowed to
charge`.

### The one real dollar: P027's wrong NEM true-up — $2,071.66

This is a solar meter that **sent more power to the grid than it pulled** over the year
(import 16,949 kWh, export 39,855 kWh — a net exporter by 22,906 kWh), yet PG&E billed it a
**+$2,461.49 true-up** as if it owed them at the end of the solar year.

In plain words:

> A net exporter should owe close to nothing. The most PG&E is legally allowed to keep from a
> net-exporting solar customer is the **non-bypassable charge (NBC)** — a small per-kWh fee on
> the power they *imported* that even solar customers must pay (grid upkeep, public programs).
> So: take the full true-up they charged, subtract the legitimate NBC floor on the imported
> kWh, and the rest is the disputable error.

The arithmetic:

```
disputable = trueUpUsd − (annualImportKwh × NBC_rate)
           = $2,461.49 − (16,949 kWh × $0.023/kWh)
           = $2,461.49 − $389.83
           = $2,071.66
```

**The PG&E rate inputs used:**
- **trueUpUsd = $2,461.49** — read **verbatim off P027's own printed bill**. Not modeled.
- **annualImportKwh = 16,949** — read off the same bill's NEM summary.
- **NBC_rate ≈ $0.023/kWh** — the non-bypassable-charge floor. This is the one *rate-card*
  input. We deliberately leave the legitimate NBC portion ($389.83) **with PG&E** and only
  bank the excess above it. The tell that something is wrong: the effective rate PG&E charged
  this meter is `$2,461.49 / 16,949 = $0.1452/kWh`, about **6.3× the NBC floor** — a
  net-exporter is being billed as if its export credit never reached its own account.

### The other findings (why they are $0 today, and the formula that would price them)

The category total is honest because four of the five findings sit at **$0 banked**:

- **VINES 75HP $62,795.65 zero-credit true-up** — a *real* anomaly (an AG-C/NEMEXP meter
  that received none of its solar arrangement's allocated credit; sibling meter P038 proves
  the arrangement *can* zero out). But recovery is **$0 to ~$57,500 and CONTINGENT** on the
  Generation Allocation Summary. If the 1,932 kW of arrays are oversubscribed, crediting this
  meter just debits another — zero-sum. **We bank $0** and present it as a tracked anomaly,
  never as money in hand. Formula once we have the document:
  `recovery = trueUpUsd − allocatedGenerationCredit(SA)`.
- **HAGA2 "demand over-rate" — FALSIFIED, $0.** A prior pass thought two meters were
  over-charged ~$795/yr on demand. We checked the *itemized* demand line: they bill
  ~$21.89–$22.02/kW, the **same** $21.43/kW their peers pay. The earlier "peer rate" was a bad
  ratio (it divided a two-sub-line demand total by a single end-of-cycle peak). No error
  exists. We killed our own finding.
- **AG-B meters showing a demand line — $0, needs the itemized bill.** AG-B tariff has *no*
  demand charge, so a demand line on an AG-B meter would be 100% disputable (~$950/yr
  ceiling). But the parsed unit math does not reconcile, and the rates look like AG-A2 rows,
  so the *extractor probably mislabeled* a charge. We bank $0 until we read the literal bill
  line.
- **VINES 75HP 111.52 kW demand (wrong-multiplier candidate) — $0.** Billed peak is 1.56× the
  electrical ceiling of a 75 HP motor — the signature of a wrong CT/PT multiplier. But that
  cycle is flagged `needs_review` and a "75HP" descriptor is not connected load, so we assert
  no dollar until we see the multiplier and 15-min interval peak.

**Bottom line for (1):** the only number we stand behind is `$2,461.49 − $389.83 = $2,071.66`,
and every input in it is either off P027's own printed bill or the published NBC floor.

---

## (2) WHO computes it — the function, and "this is arithmetic, not AI"

**The dollar is computed by deterministic, pure functions in `src/lib/energy/` — not by AI.**

- P027's net-position and the NBC floor: **`summarizeNemMonths()` + `solarBillFloor()` in
  `src/lib/energy/solar-nem.ts`**. Pure arithmetic, no model, no network.
- The general bill-audit comparator (does a month's *dollars* jump while *usage* did not):
  **`billAudit()` in `src/lib/energy/bill-audit.ts:74`**.
- The contingent VINES allocation case would be priced by **`auditAllocation()` in
  `src/lib/energy/solar-allocation.ts`** — but only once the Generation Allocation Summary is
  the input.
- The AG-B-no-demand check recomputes the bill from the tariff card via **`verifyBill()` in
  `src/lib/energy/bill-verify.ts`**; the demand-rate sanity check is **`effectiveDemandRate()`
  in `src/lib/energy/demand.ts`**.

**This is arithmetic, not AI.** A grep for any LLM/gateway call across the entire
`src/lib/energy/` directory returns nothing (the code trace proves this in §0 of
`00-how-savings-are-computed.md`). These functions import only string copy and each other —
no model client, no network, no clock. They are unit-tested (`bill-audit.test.ts`,
`solar-nem.test.ts`, `demand.test.ts`). The subtraction `$2,461.49 − $389.83` would give
`$2,071.66` whether or not any AI existed.

**Where AI touched this — and only this:** the **only** AI in the whole pipeline is the
**bill-PDF vision extraction** in `src/lib/extract/` (`reader.ts`, a Claude model via the
Vercel AI Gateway). Its job is narrow: **read a scanned bill image and turn it into structured
numbers** (the $2,461.49 true-up, the 16,949 import kWh, the rate name). It **never computes a
savings or dispute dollar.** And those numbers are not trusted until a *deterministic* one-cent
gate (`reconcileBill` in `reconcile.ts`) confirms the extracted line items sum to within one
cent of the printed bill total; a page that fails is withheld as `needs_review`, never shown.
So AI *read* the bill; deterministic code did the *math*. The two never cross.

---

## (3) WHY the money is real — the mechanism PG&E would actually honor

This lever is **not a model disagreeing with PG&E.** It is the bill **disagreeing with itself
or with PG&E's own tariff.** That is exactly what a utility billing dispute is built to
correct, and the recovery is a **PG&E-issued credit or rebill** — the same instrument PG&E
uses every day to fix its own posting errors. No operational change is required of the farmer.

For P027 specifically: the printed bill shows a meter that exported far more than it imported,
yet was billed a positive true-up. Under NEM rules, a net annual exporter cannot owe a retail
true-up — at most they owe the non-bypassable charges. The export credit clearly **failed to
post to this SA's own bill.** When Batth (or we, on his behalf) brings PG&E P027's bill
alongside its Generation Allocation Summary, PG&E reconciles the allocation and **issues a
credit** for the mis-applied amount. That is a routine NEM-aggregation correction, not a
favor.

The reason we are **honest about the ceiling** ($2,071.66, not the full $2,461.49): the NBC
portion is *genuinely owed*, so we leave it on PG&E's side of the line. We bank only what the
tariff says PG&E was never entitled to.

---

## (4) WHAT could make it wrong — the confidence

**P027 confidence: medium.** What is rock-solid: the **direction** is unambiguous on the
printed bill — it is a net exporter (export 39,855 vs import 16,949) that was charged a
positive true-up, and the monthly rows confirm the wrong-sign pattern (e.g. a month that net
*exported* 12,759 kWh was billed +$2,698.20). What we cannot yet pin to the dollar: the
**exact** recovery depends on P027's **Generation Allocation Summary / Form 79-1202**, which
shows how the shared solar generation was allocated across the aggregated meters. The $2,071.66
is the disputable *ceiling above the NBC floor*; the realized credit could land lower if part
of that true-up turns out to be a legitimate allocation artifact.

**The category-wide honesty rule that protects the number:** we only bank a dollar the printed
bill proves on its own. That is why:
- VINES 75HP ($62,795.65) is **$0 banked** — recovery is contingent and could be zero-sum.
- HAGA2 is **$0** — we falsified our own earlier $795 claim when the itemized line didn't
  support it.
- The AG-B demand line is **$0** — the parse may be a mislabel; we read the literal line first.

So the failure modes are guarded: an extraction error is caught by the one-cent reconciliation
gate; an over-claim is caught by the "bank only what the bill proves" rule; and the one
medium-confidence number is explicitly framed as a *ceiling pending one document.*

---

## (5) WHAT data we still need, and what it unlocks

| Data we need | Unlocks | Today's status |
|---|---|---|
| **P027 Generation Allocation Summary / Form 79-1202** | Confirms the $2,071.66 and pins the exact credit | Pending; number stands as a ceiling without it |
| **VINES 75HP Generation Allocation Summary** | Could unlock **$0 up to ~$57,500** on the $62,795.65 true-up — or confirm it is zero-sum | Pending; **$0 banked** until then |
| **Itemized bills for the AG-B meters** (the literal demand line) | Up to ~$950/yr if the line is truly labeled "Demand" under AG-B; else it's just a parser fix | Pending |
| **15-min interval kWh + CT/PT multiplier for VINES 75HP** | Confirms the wrong-multiplier theory; ~$556/cycle if a 2× error is proven | Pending |
| **Bills for the other ~57 accounts / 183 meters** | The entire bill audit today is **only account 4699664587-8 (~46 metered SAs)**; the rest of Batth's sprawl is unpriced for lack of bills | Not yet pulled |

The single highest-leverage document is the **Generation Allocation Summary** — it both
*confirms* P027 and is the only thing standing between $0 and a potential five-figure VINES
recovery.

---

## (6) The 2-sentence script for the grower (operator English)

> "PG&E billed your Pump 27 a $2,461 solar true-up even though that meter sent more power to
> the grid than it pulled all year, so it should owe almost nothing — about $2,072 of that
> charge is wrong and we can get it back as a credit. We just need PG&E's allocation summary
> for that meter to lock in the exact dollar, and the same document could unlock a much bigger
> correction on your VINES 75 horse pump."
