# Category deep-dive: Account / entity / NEMA structure

**Scope.** This category covers the *structural* defects in how Batth Farms' solar-paired meters are
organized across PG&E **accounts**, **legal billing entities**, and **NEM aggregation (NEMA / NEM2A)
arrangements**: cross-entity NEMA eligibility risk, solar arrays fragmented across many accounts/entities,
true-up date misalignment inside one physical array group, entity-name fragmentation, and the one large
zero-credit true-up anomaly (P031 VINES 75HP, $62,795.65).

**Honest framing up front.** This is an **audit-opportunity** category, not a hard-dollar savings category.
Almost every dollar here is **contingent on documents Terra does not yet hold** — specifically the PG&E
**Generation Allocation Summary** (per-SA allocated kWh / allocated %) and the other-entity bills. The
**defensible total is $0** until those documents arrive; the *upside range* is presented as a clearly-labeled
audit ceiling, not a banked claim. The structural defects (cross-entity arrangements, misaligned true-ups,
name typos) are real and worth surfacing for **legibility and dispute-readiness**, but several of them could
*cost* money if PG&E unwinds an arrangement, so they are not netted as savings.

**Who computes this.** All dollar figures below are **deterministic arithmetic** — division, multiplication,
and set membership over the normalized `billing.json` / `inventory.json` fields. No AI is involved in the
pricing. (The only AI anywhere in this pipeline is the bill-PDF **vision extraction** in `src/lib/extract`
that produced `billing.json` upstream; it does not price anything.) The functions named below
(`src/lib/energy/nem.ts`, `analyzeFarm`) are the engine surfaces that *would* host this logic; the numbers in
this doc were reproduced by hand with the exact same arithmetic and are labeled "manual analytic".

---

## Ground-truth guardrails (do not contradict)

- Solar arrays total **1,932 kW** (840 + 1,092), NOT 12,180 kW. The `solarKw` column repeats the group
  nameplate on every member row; summing the column double-counts. There are exactly two physical arrays.
- The bill account **4699664587-8** covers ~46 metered SAs; the Excel inventory covers **183 meters across
  57 distinct PG&E account numbers and ~6 legal entities** (7 distinct `billingName` strings once the typo is
  counted).
- The **P031 VINES 75HP $62,795.65** true-up is a real **zero-credit anomaly** (sibling **P038** is the
  proof). Recovery is **$0-$57k CONTINGENT** on the Generation Allocation Summary; the arrays may be
  oversubscribed (aggregate load > generation), in which case the credit is zero-sum and moving it to P031 just
  moves the bill to another meter. **Never state it as banked.**

---

## The structural map (deterministic, from `inventory.json`)

`inventory.json` has **183 rows**. Grouping by `billingName` (legal entity) and `account`:

| Legal entity (`billingName`)            | rows | distinct accounts |
|-----------------------------------------|-----:|------------------:|
| BATTH,CHARANJIT S                       |   59 |                12 |
| KANWARJIT BATTH & GAGANDIP BATTH        |   48 |                13 |
| K S BATTH & G S BATTH PARTNERSHIP       |   47 |                 6 |
| BATTH FARMS INC                         |   22 |                19 |
| **BATHH FARMS INC** (typo of the above) |    4 |                 4 |
| BATTH,SURINDER K                        |    2 |                 2 |
| (null billingName)                      |    1 |                 1 |
| **Total**                               |**183**|             **57** |

Grouping the 56 solar-flagged meters by `solarGroupLabel` (the physical array / aggregation group) and testing
each group against the **NEMA single-customer-of-record rule** (every account in one NEMA arrangement must be
billed to the *same* customer-of-record — brief-nem-nema §3) and against **true-up alignment**:

| Solar group | meters | accounts | distinct legal entities | NEMA single-COR? | true-up months | aligned? |
|-------------|-------:|---------:|------------------------:|------------------|----------------|----------|
| `1092kw`    |      5 |        2 | 1 (+1 null)             | OK (one entity)  | (none set)     | n/a      |
| `4433`      |     11 |        4 | **3**                   | **VIOLATION**    | May            | aligned  |
| `4444`      |      8 |        5 | **3**                   | **VIOLATION**    | August         | aligned  |
| `4624`      |      1 |        1 | 1                       | OK               | May            | n/a      |
| `4939`      |      4 |        3 | **2**                   | **VIOLATION**    | July           | aligned  |
| `5219`      |     10 |        5 | **4**                   | **VIOLATION**    | May            | aligned  |
| `840kw`     |      8 |        8 | **2**                   | **VIOLATION**    | (none set)     | n/a      |
| `Solar`     |      9 |        6 | **2**                   | **VIOLATION**    | Dec / Jan / Oct| **MISALIGNED** |

**Reading:** six of the eight array groups span **more than one legal billing entity**. Under PG&E's NEM2A
rules a single NEMA arrangement must have **one customer-of-record across every account**. If these groups are
billed as single arrangements, they are **ineligible as configured** — which is both an audit-recovery lever
(if PG&E mis-priced) and an audit-*risk* (PG&E could unwind and re-bill). The `Solar` group additionally
carries **three different true-up months on one physical array** (December, January, October), the textbook
signature of meters that were enrolled / re-arranged at different times.

---

## The lever instances, each with explicit per-meter arithmetic

### Instance 1 — P031 "VINES IRR 75HP" zero-credit true-up ($62,795.65); the one priceable anomaly

From `billing.json` meter SA `4699664088` (growerPumpId P031, descriptor "VINES IRR 75HP NEW 75HP", rate AGB,
nemType NEMEXP, true-up month December, trueUpDate 2026-03-26):

```
annualImportKwh_printed = 230,223
annualExportKwh_printed =  39,718
annualNetKwh_printed    = 190,505   (net import)
nemTrueUpUsd            = $62,795.65
```

**Effective price on the net import (manual analytic, deterministic):**

```
$62,795.65 / 190,505 kWh = $0.3296 /kWh
```

That is **full-retail AG TOU energy pricing** — ~14x the ~2.3 cent/kWh NBC floor. If this meter had merely
been credited and only the non-bypassable charges survived, the residual would be:

```
NBC floor = 190,505 kWh x $0.023 = $4,382   (this is unavoidable cost, NOT recoverable)
```

So this meter **received essentially zero generation allocation** for the year.

**The sibling proof (why this is an anomaly, not just a normal NEMA residual).** SA `4699664743`
(growerPumpId **P038**), same farm, **same `Solar` aggregation group, same bill account 4699664587-8, same
NEMEXP/NEMEXPM family**:

```
P038 annualImportKwh_printed = 124,117
P038 annualExportKwh_printed =       0   (Exports=0, same as P031 -> normal for a benefiting meter)
P038 nemTrueUpUsd            =   $0.26
P038 effective rate = $0.26 / 124,117 = $0.000002 /kWh  -> import was FULLY allocated/zeroed
```

P038 carries an even-larger raw deficit signature (124,117 kWh net import, Exports=0) yet trues up to **26
cents**, while its sibling P031 trues up to **$62,795.65**. The mechanism that zeroed P038 exists and works on
this exact account; it simply **did not reach P031**. This is the strongest single indicator that P031 is
**orphaned from the allocation** (never added / dropped by a mid-year rearrangement / mapped to a generating
meter that produced nothing for it) rather than legitimately under-credited (brief-nem-nema §4 failure mode
(a), §5).

**The dollar range, honestly bounded:**

- **Defensible floor = $0.** The NBC portion (~$4,382) is genuine non-bypassable cost and is *not*
  recoverable. More importantly, if the **Generation Allocation Summary** shows the two arrays are
  **oversubscribed** (aggregate arrangement load > annual generation), then every kWh of credit that lands on
  P031 is a kWh removed from another benefiting meter — **zero-sum**, no net farm recovery.
- **Audit ceiling = ~$57k.** If the Allocation Summary shows P031 absent / at 0% allocation **and** the
  arrangement had spare generation, PG&E could re-allocate and rebill the true-up down toward the NBC floor:
  `$62,795.65 - $4,382 = $58,414`, rounded conservatively to **~$57,000** to leave headroom for minimum/demand
  lines that also survive a credit. This requires (1) the Allocation Summary, (2) confirmation P031 is
  missing/0%, and (3) confirmation the array group had unallocated kWh. **Until all three land, this is $0 in
  the defensible total.**

**computedBy:** `src/lib/energy/nem.ts` (the effective-$/kWh and NBC-floor arithmetic) — deterministic pure
function, no AI; reproduced here as manual analytic. **needsData:** `pge-allocation-summary` (the Generation
Allocation Summary is the document that converts the $0 floor into a recovery number).

---

### Instance 2 — Cross-entity NEMA eligibility risk (6 of 8 array groups span >1 legal entity)

Deterministic set test over `inventory.json`: for each `solarGroupLabel`, count distinct non-null
`billingName` values.

```
4433: entities {BATTH CHARANJIT S, KANWARJIT & GAGANDIP, K S & G S PARTNERSHIP} = 3   VIOLATION
4444: entities {BATTH CHARANJIT S, KANWARJIT & GAGANDIP, K S & G S PARTNERSHIP} = 3   VIOLATION
4939: entities {KANWARJIT & GAGANDIP, K S & G S PARTNERSHIP}                    = 2   VIOLATION
5219: entities {BATTH FARMS INC, BATTH CHARANJIT S, KANWARJIT & GAGANDIP, K S & G S} = 4 VIOLATION
840kw: entities {KANWARJIT & GAGANDIP, BATTH FARMS INC}                          = 2   VIOLATION
Solar: entities {BATTH CHARANJIT S, KANWARJIT & GAGANDIP}                        = 2   VIOLATION
```

**Arithmetic of the lever:** none. This is a **boolean eligibility flag**, not a priced quantity. Per
brief-nem-nema §3, a NEMA arrangement requires a **single customer-of-record on every account**. Six groups
fail that test as labeled.

**Dollars: $0 defensible, sign-ambiguous upside.** This could mean (a) PG&E already mis-applied NEMA across
entities and there is recoverable mis-billing, OR (b) the arrangement is correctly structured and the Excel
`billingName` is just a stale data-entry artifact, OR (c) PG&E discovers the cross-entity structure and
**unwinds** it, *raising* the bill. Without the per-arrangement roster (Form 79-1202) and the other-entity
bills we cannot sign this, let alone size it. Surfaced as a **dispute-readiness / legibility** finding.

**computedBy:** `analyzeFarm` structural grouping (distinct-entity-per-group count) — deterministic, no AI.
**needsData:** `other-account-bills` + `pge-allocation-summary`.

---

### Instance 3 — True-up date misalignment inside the `Solar` array group (Dec / Jan / Oct on one array)

From `inventory.json`, the 9 members of `solarGroupLabel = "Solar"`:

```
P041  BATTH CHARANJIT S   acct 4699664587-8  NEMEXP   TU=December
P074  BATTH CHARANJIT S   acct 5089901685-6  NEMEXP   TU=January
P026  BATTH CHARANJIT S   acct 3372050929-9  NEMEXPM  TU=January
P033  KANWARJIT&GAGANDIP  acct 6539944461-4  NEMEXPM  TU=December
P083  BATTH CHARANJIT S   acct 9597876494-2  NEMEXPM  TU=December
P031  BATTH CHARANJIT S   acct 4699664587-8  NEMEXP   TU=December   <- the $62,795 anomaly
P034  KANWARJIT&GAGANDIP  acct 8922820273-8  NEMEXPM  TU=December
P038  BATTH CHARANJIT S   acct 4699664587-8  NEMEXPM  TU=December   <- the $0.26 sibling
Office BATTH CHARANJIT S  acct 4699664587-8  NEMS     TU=October
```

**Arithmetic:** distinct true-up months in the group = **{December, January, October} = 3**. One physical
array cannot have three different anniversary dates if every meter is in one arrangement; differing TU months
mean the members were **enrolled / re-arranged at different times** (each membership change forces an early
true-up and restarts the 12-month clock — brief-nem-nema §3). This is corroborating evidence for Instance 1
(P031's December date may itself be a re-pointed clock that orphaned it) and a standalone legibility flag.

**Dollars: $0 directly.** A misaligned anniversary is not itself a charge; it is a symptom that helps confirm
the Instance-1 recovery and prevents future surprise true-ups. **computedBy:** `analyzeFarm` (distinct
true-up-month count per group) — deterministic, no AI. **needsData:** `pge-allocation-summary`.

---

### Instance 4 — Entity-name fragmentation (`BATHH FARMS INC` typo + a non-Batth entity in the array fleet)

Deterministic distinct-string count over `billingName`:

```
'BATTH FARMS INC'  : 22 rows
'BATHH FARMS INC'  :  4 rows   <- 'BATHH' typo, 4 separate accounts, almost certainly the same legal entity
'BATTH,SURINDER K' :  2 rows   <- a different person; may or may not belong in any aggregation
(null)             :  1 row    <- account 57448094630, sits in the 1092kw group with no billingName
```

**Arithmetic:** none priced. The `BATHH`/`BATTH` split silently fragments one entity into two for any logic
keyed on the name string (rate rollups, NEMA COR test, ownership reports), and the null-name account is the
"phantom" member already noted in the `1092kw` group. **Dollars: $0** — pure data-hygiene / legibility, but it
**directly affects the reliability of Instances 2-3** (a name typo can make a single-COR arrangement *look*
multi-entity, or vice-versa). Flagged so the COR test is not trusted blindly. **computedBy:** `analyzeFarm`
(string-distinct over `billingName`) — deterministic, no AI. **needsData:** `other-account-bills` to confirm
the legal entity behind each account number.

---

### Instance 5 — Net-surplus (NSC) giveaway on net-exporter meters (P027, P004)

Two NEM meters finished the relevant period as **net exporters** (annual net import < 0 = surplus that, at
true-up, is paid out at the low NSC wholesale-tracking rate, never banked at retail — brief-nem-nema §1):

```
P027  SA 4697755484  annualNetKwh_printed = -22,906  (surplus)   true-up still billed $2,461.49
P004  SA 4698660251  annualNetKwh_printed = -16,059.88 (surplus) true-up = (none printed)
```

**Why this is $0 defensible.** These two meters export more than they import on an annual net basis, while
their *sibling* heavy-load meters in the same groups owe true-ups. That pattern is exactly the **allocation
imbalance** NEMA is supposed to fix by moving one meter's surplus to another meter's deficit. But: (1) the
bill summaries carry **no interval kWh**, so the TOU-timing dollar value of these exports is unknown; (2)
whether the surplus is "wasted" at NSC vs. already reallocated to a deficit meter is **exactly what the
Allocation Summary would show**; and (3) P027 still shows a $2,461.49 true-up *despite* net export, which is
itself sign-ambiguous without the per-month TOU detail. Any dollar here is an **interval-data + allocation-
summary** question, so it is **not** added to the total. **computedBy:** `src/lib/energy/nem.ts` (net-sign
classification) — deterministic, no AI. **needsData:** `pge-allocation-summary` (and `interval` to value the
TOU timing).

---

## Why the defensible total is $0

| Instance | Audit ceiling (contingent) | Defensible (banked) | Blocking document |
|----------|---------------------------:|--------------------:|-------------------|
| 1. P031 zero-credit true-up | up to ~$57,000 | **$0** | Generation Allocation Summary |
| 2. Cross-entity NEMA risk   | sign-ambiguous (could be negative) | **$0** | Form 79-1202 roster + other-account bills |
| 3. Solar-group TU misalignment | $0 (symptom) | **$0** | Generation Allocation Summary |
| 4. Entity-name fragmentation | $0 (hygiene) | **$0** | other-account bills |
| 5. NSC net-surplus giveaway | unknown | **$0** | Allocation Summary + interval kWh |
| **Total** | **audit range, headline ~$57k contingent** | **$0** | — |

Every priceable dollar in this category is gated behind the **Generation Allocation Summary** (and, for the
cross-entity questions, the **other-entity bills**). The honest headline is: *"There is a $62,795.65 zero-
credit true-up on one vineyard pump that its own sibling meter proves should be near zero, and the solar fleet
is structured across 6 legal entities in ways that need a NEMA eligibility audit — but the recoverable dollars
are $0 until PG&E's Generation Allocation Summary is in hand."*

---

## Sources / inputs

- `normalized/billing.json` — per-meter NEM true-up, annual import/export/net, cycle detail (vision-extracted
  upstream; arithmetic here is deterministic).
- `normalized/inventory.json` — per-meter entity (`billingName`), account, `solarGroupLabel`, `nemType`,
  `trueUpMonth`, `solarKw`.
- `brief-nem-nema.md` — NEM2A eligibility (§3 single-customer-of-record, contiguity), allocation methodology
  (§2), failure modes (§4), the P031 case walk-through (§5).
- `brief-pge-ag-rates.md` — AG/HAGC rate context for the affected meters.
