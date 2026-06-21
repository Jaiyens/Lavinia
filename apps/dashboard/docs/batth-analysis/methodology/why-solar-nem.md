# Why "Solar / NEM true-ups" — methodology in plain English

**The lever in one line:** when a solar-paired meter hits its annual NEM true-up, the
solar credit it *should* have earned can fail to land on the bill. We read the printed
true-up dollar off the farmer's own bill, divide it by the kWh it was charged on, and
when that comes out to **full retail** instead of near-zero, the credit never linked.
That is a real billing anomaly worth investigating — but how much of it PG&E would
actually pay back is **contingent**, and we never present it as money already banked.

This explainer covers, for this lever only: how we know the dollar, who computes it
(and where AI is and is not involved), why the money is real, what could make it wrong,
what data we still need, and a two-sentence script for the grower. It is grounded in the
code trace at [`00-how-savings-are-computed.md`](./00-how-savings-are-computed.md) and
the findings at [`../findings-deep-solar-nem.json`](../findings-deep-solar-nem.json).

---

## The one example that anchors everything: P031 / VINES 75HP

- **Meter:** SA `4699664088`, "VINES IRR 75HP", account `4699664587-8`, rate **AG-C**,
  NEM type `NEMEXP`, solar group "Solar".
- **From the printed annual NEM table on the bill:** import **230,223 kWh**, export
  **39,718 kWh**, net **190,505 kWh**.
- **From the December true-up cycle (2025-12-11):** the meter true-up charge is
  **$62,795.65**.

Hold those numbers. Every claim below is arithmetic on them.

---

## (1) HOW we know the dollar — the exact formula in plain words, and the PG&E inputs

### Step 1 — the "did the credit land?" test (effective $/kWh)

Take the true-up charge and divide it by the net kWh it was billed on:

```
effective $/kWh = true-up charge / annual net kWh
                = $62,795.65 / 190,505 kWh
                = $0.3296 per kWh
```

Now compare that to two PG&E rate numbers:

- **Full retail AG-C energy** (the published rate card,
  `fixtures/pge-ag-rate-card.json`): AG-C winter off-peak **$0.15981/kWh**, peak
  **$0.18550/kWh**. So $0.33/kWh is **full retail** — roughly the all-in price you pay
  when you blend energy plus the non-bypassable charges.
- **The NBC floor** — the "non-bypassable charges," ~**$0.023/kWh** — is the small
  per-kWh amount a NEM customer *always* pays even when solar fully offsets them.

$0.3296/kWh is about **14x the $0.023 NBC floor**. Translation in plain words: a
healthy solar meter at true-up should be paying close to the NBC floor, because its
generation credit absorbs nearly all of its usage. P031 is paying *full retail on its
entire net load* — as if it has **no solar credit at all**. The solar is generating; the
**credit just isn't linking to this meter's bill**. We call that "NEMEXP yet near-zero
export" — it is flagged as an export meter but behaves like it has no export credit.

### Step 2 — the recovery range (ceiling and floor)

If we could re-link the credit, how much comes back? We compute a **range**, not a point.

**Ceiling** — the most that could be recovered is the whole true-up minus the NBC floor
(which is never recoverable, you always owe it):

```
ceiling = true-up charge − (NBC rate × annual import kWh)
        = $62,795.65 − ($0.023 × 230,223)
        = $62,795.65 − $5,295.13
        = $57,500.52
```

**Floor = $0.** Here is the honest part. PG&E's NEM **aggregation** (NEMA) credit is a
**zero-sum pool**: the arrays generate a fixed amount of kWh, and that generation is
*allocated* across the meters in the arrangement. If the arrangement's total load
already exceeds its total generation — i.e. the arrays are **oversubscribed** — then
re-pointing credit to P031 just moves the deficit onto another meter. Net to the farm:
**$0**. We genuinely do not know which case we are in until we see the Generation
Allocation Summary (see section 5).

So the honest headline is **"$0–$57k, contingent,"** carried in the findings as
`annualUsd: 0` — never as $57k banked.

### The PG&E rate inputs, named

| Input | Value | Where it comes from |
|---|---|---|
| AG-C winter off-peak / peak energy | $0.15981 / $0.18550 per kWh | `fixtures/pge-ag-rate-card.json` (published AG rate card) |
| NBC floor (non-bypassable charges) | ~$0.023 per kWh | PG&E NEM tariff floor |
| Import / export / net kWh | 230,223 / 39,718 / 190,505 | the **annual NEM table printed on the farmer's own bill** |
| True-up charge | $62,795.65 | the **December true-up line on the farmer's own bill** |

The two numbers that drive the dollar — the true-up charge and the net kWh — are read
**verbatim from Batth's own PG&E bill**, never modeled or invented.

---

## (2) WHO computes it — the function, and "this is arithmetic, not AI"

**This is arithmetic, not AI.** The dollar is produced by **deterministic, pure,
unit-tested functions** in `src/lib/energy`:

- `auditAllocation` + `classifyProgramType` in `src/lib/energy/solar-allocation.ts` —
  classify the NEM program and run the allocation audit.
- `solarBillFloor` in `src/lib/energy/solar-nem.ts` — the effective-$/kWh and floor math.
- `summarizeNemMonths` in `src/lib/energy/solar-nem.ts` — rolls up the printed NEM
  table.
- For real (non-demo) farms these are owned by `runSolarInsight`
  (`src/lib/recommendations/run-solar-insight.ts:62`), the sole `SOLAR_TOOL` owner.

These files import only strings, the recommendation grammar, and each other. **No model
client, no gateway, no network, no clock, no database, no filesystem.** A grep for any
LLM call (`generateText`, `generateObject`, `streamText`, `anthropic`, `openai`,
gateway, etc.) across `src/lib/energy` returns **nothing**. The file headers state the
contract explicitly (`solar-nem.ts:10`: "Pure: no UI, no DB, no clock, no fs").

**Where AI touched this — and only this.** The **only** AI in the entire pipeline is the
**bill-PDF vision extraction** in `src/lib/extract` (`reader.ts`, Claude via the Vercel
AI Gateway). It did exactly one job: it **READ the scanned bill image and turned it into
structured numbers** (the import/export/net kWh and the $62,795.65 true-up line) and
wrote them to `billing.json`. It does **not** compute, estimate, or touch a savings
dollar. And those extracted numbers are hard-gated before they are trusted: a bill is
only marked `reconciled` if its line items sum to **within one cent** of the printed
total (`reconcile.ts`, also pure arithmetic). So the division by 190,505 and the
$57,500.52 ceiling are pure code; the AI only handed that code the numbers off the page.

"Almond" (the chat assistant) is **separate and read-only** — it can *describe* this
finding but has no path to compute or change the dollar.

---

## (3) WHY the money is real — the mechanism PG&E would actually honor

The mechanism is **NEM credit allocation**, and PG&E's own bills give us the proof it
works — and the proof that P031 is broken — on the same account.

**The control case: P038.** Sibling meter SA `4699664743` ("PUMP # 38"), **same account,
same AG-C rate, same "Solar" group** — the closest possible twin to P031. Its printed
annual NEM table: import 124,117 kWh, export 0, net 124,117 kWh. Its December true-up:
**$0.26**.

```
P038 effective $/kWh = $0.26 / 124,117 = $0.0000021 per kWh  (essentially zero)
```

P038 absorbed **virtually all** of a 124,117 kWh import with allocated solar credit and
walked away owing 26 cents. That is the allocation machinery **working correctly on this
exact arrangement**. So P031's $0.33/kWh is **not the tariff** and **not a dead array** —
it is an **enrollment / linkage break** specific to that one meter. PG&E honors NEM
aggregation credit by tariff; if a meter that should be receiving allocated credit is
being billed full retail because of a linkage error, that is a billing correction PG&E
would make — *if and only if* there is spare generation in the pool to allocate. The
mechanism is real and PG&E-honored; whether *cash* comes back depends on the pool
(section 1, floor = $0).

This is why we present it as a **real anomaly to investigate**, with a control case
proving it is anomalous, **not** as guaranteed recovered dollars.

---

## (4) WHAT could make it wrong — and the confidence

Confidence on the P031 finding is **medium** (the JSON's own grading). The anomaly is
solid; the *recovery* is the uncertain part. What could move it:

- **The zero-sum trap (the big one).** If the 1,932 kW of arrays are **oversubscribed**
  across the whole fleet — total load > total generation — then re-pointing credit to
  P031 only steals it from another meter. Recovery floor is **$0**. This is the single
  reason we never bank the number. Only the Generation Allocation Summary resolves it.
- **AG-C → AG-B "rate savings" artifacts.** The rate-optimization engine, run *without*
  15-minute interval kWh, can emit an "AG-C → AG-B savings" number for solar meters that
  is **sign-ambiguous** (it could be a saving or a loss — we can't tell the direction).
  We do **not** claim those. Solar meters are deliberately excluded from the gross-
  consumption rate model, and the bill summaries carry no interval kWh, so this lever is
  honest-blank until intervals arrive.
- **The effective-$/kWh tell relies on the printed net kWh.** If the bill's annual NEM
  table were mis-read, the ratio would be wrong — which is exactly why the one-cent
  reconciliation gate exists, and why P038 acts as a same-account sanity check.
- **The NBC floor (~$0.023) is a representative figure**, not yet pulled from the
  official current tariff sheet; it sets the ceiling, so a different NBC moves $57,500.52
  by a few thousand. The ceiling is an estimate; the *anomaly* does not depend on it.

What is **not** in doubt: P031 paid full retail on its whole net load while its
identical sibling P038 paid 26 cents. That contrast is read straight off two PG&E bills.

A related honest line item: the **legacy NEM2AA cohort** (meters 4433/4444/5219, e.g.
P003 at $7,130.31 true-up) shows high effective $/kWh *only because their net is tiny* —
solar already absorbed ~90%+ of their load, so the residual is the genuine net deficit
plus non-offsettable NBC. Those true-ups (~$20,528 across the cohort) are **correctly
billed**; recoverable = **$0**. Counting them would be double-counting a correct charge.
We don't.

---

## (5) WHAT data we still need — and what it unlocks

Two pulls, in priority order:

1. **The PG&E Generation Allocation Summary** (`needsData: "pge-allocation-summary"`).
   This is the document that says how the arrays' generation is split across the meters
   in the NEMA arrangement. **It is the single thing that collapses the $0–$57k range to
   a number.** If it shows spare generation, P031's recovery is real and we can quantify
   it; if it shows the pool is oversubscribed, recovery is $0 and we close the finding
   honestly. Capacity is not the question — at 1,932 kW the arrays produce roughly
   2.9–3.7M kWh/yr, and P031's whole load is ~5.8% of that, so generation exists in
   abundance. **Allocation, not generation, is the open question**, and only this
   summary answers it.

2. **The other accounts' bills** (`needsData: "other-account-bills"`). The extracted
   bill covers only account `4699664587-8` (~46 metered SAs). The Excel inventory shows
   **183 meters across ~57 accounts / 6 entities**, and **42 solar-flagged SAs across 23
   accounts have no bill on record yet**. Critically, the off-account "Solar"-group
   siblings of P031/P038 (e.g. P033, P083, P034, P074, P026) are exactly the meters whose
   true-up status would answer the zero-sum question directly. Pulling those bills lets us
   price the off-account solar orphans and confirm whether the pool has slack.

3. **15-minute interval kWh** (fleet-wide, the trust input for the rate lever generally).
   Without intervals the AG-C→AG-B solar "savings" are sign-ambiguous artifacts we
   suppress. Intervals make that lever trustworthy and could surface real rate moves on
   the solar meters that we currently refuse to quote.

---

## (6) The two-sentence script for the grower (operator English)

> "Your VINES 75HP meter got billed sixty-three thousand dollars at this year's true-up,
> at full retail price on its whole bill — but your identical Pump 38, on the same
> account and the same solar, was billed twenty-six cents, which is what a working solar
> meter should look like, so something is keeping VINES from getting its solar credit.
> We need PG&E's generation allocation summary to find out whether there's spare solar to
> move onto it — if there is, this could be worth up to about fifty-seven thousand back,
> and if the solar's already fully spoken for it's zero, so we're not counting it as money
> in hand until we see that paper."

---

## Summary

For the Solar / NEM true-ups lever, the dollar is pure arithmetic on two numbers read
straight off Batth's bill: effective $/kWh = true-up charge ÷ net kWh ($62,795.65 ÷
190,505 = $0.33/kWh, ~14x the $0.023 NBC floor and full retail, meaning P031's solar
credit never linked), with a recovery **range** of $0–$57,500.52 (ceiling = true-up −
NBC×import; floor = $0 because NEM aggregation is a zero-sum pool that may be
oversubscribed). It is computed by deterministic pure functions (`auditAllocation`,
`solarBillFloor`, `summarizeNemMonths` in `src/lib/energy`), **not AI** — the only AI
was the bill-vision extractor in `src/lib/extract` that merely **read** the bill image
into numbers and is gated to within one cent of the printed total. The money is real
because PG&E honors NEM aggregation credit and the same-account sibling P038 ($0.26
true-up) proves the machinery works, isolating P031 as a linkage break, not the tariff;
but recovery is **contingent** on the Generation Allocation Summary (still needed, plus
the other 56 accounts' bills and 15-min intervals), so it is carried as $0 and never
overstated as banked.
