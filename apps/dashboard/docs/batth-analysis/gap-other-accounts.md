# The Other 56 Accounts: What We Have No Bills For

**Scope:** This document is about the part of Batth Farms we *cannot* see yet. Everything
the pilot has shown so far stands on **one** PG&E account, **4699664587-8**, and **one** bill
PDF. This is about the other ~56 accounts and ~137 meters that the bill PDF does not touch.

**Status of the estimates here:** qualitative and directional. Every dollar in the rest of the
analysis is computed by **deterministic pure functions in `src/lib/energy`** over data we
actually hold. For these other accounts we hold **no bill data and no interval data at all**, so
this document deliberately does **not** put a hard savings number on them. It describes the
*shape* of the opportunity and the *exact* next pull that would turn each signal into a number.
Where I give a range, it is a sized hypothesis, not a finding.

---

## 1. The exact gap, counted from `inventory.json`

| Slice | Meters | Accounts | Entities |
|---|---:|---:|---:|
| Full Excel inventory | 183 | 57 | 6 |
| On the one bill account `4699664587-8` | **45** | 1 | 1 (BATTH, CHARANJIT S) |
| **OTHER — no bills in hand** | **138** | **56** | up to 6 |

(The earlier write-ups round the billed set to "~46" because three billed meters appear on the
bill PDF but are absent from the 183-row Excel; counted strictly *inside* the inventory,
`account == 4699664587-8` is 45 rows. The "~137 other meters" framing in the task is the same
gap; the precise inventory count is 138. I use 138 below.)

**The hard fact about the gap (verified against `normalized/manifest.json` + `meters.json`):**
all 138 other meters carry **`billed: false`, zero `summaries`, and zero `intervals`.** We have
their *identity* (service ID, meter serial, account, rate schedule, lat/long, GPM, crop, ranch,
NEM flags) from the Excel, and nothing about their *dollars or load*. Even the 45 billed meters
only carry bill **summaries** (no intervals) — so interval-grade analysis is missing
everywhere, and *all* billing dollars are missing on these 56 accounts.

**Who the other meters belong to (billing entity, OTHER set only):**

| Meters | Billing entity |
|---:|---|
| 48 | KANWARJIT BATTH & GAGANDIP BATTH |
| 47 | K S BATTH & G S BATTH PARTNERSHIP |
| 22 | BATTH FARMS INC |
| 14 | BATTH, CHARANJIT S (other accounts of the same person) |
| 4 | BATHH FARMS INC (spelling variant — likely the same entity) |
| 2 | BATTH, SURINDER K |
| 1 | (blank) |

So the bill we have covers **one person's one account**. The dollars for **five of the six
legal entities are entirely unseen.** This is the single biggest reason the pilot's headline
numbers understate the farm: they are computed on roughly a quarter of the meters.

---

## 2. Where the opportunity almost certainly is (qualitative)

These are signals visible in the inventory metadata *without* any bill. They are leads to pull,
not booked dollars.

### 2a. Legacy rate spread — strongest free lead
18 of the 138 other meters are still on **closed legacy AG-4 / AG-5 / E-19 schedules**
(`AG5B`, `AG5C`, `AG4C`, `E19P`). Legacy AG-4/AG-5 is exactly the mis-rating pattern the whole
product is built to catch, and these are concentrated in the two big partnership entities:

- `6539944461-4` (KG partnership): P012, P014, P015, P016, P019, P023, P036, P079 — 8 legacy meters on one account.
- `3922545703-3` (KS/GS partnership): P005, P009, P046, P076 — 4 legacy meters.
- `5090219363-5`: P035, P061. `6413523340-7`: P086. `6431815493-3`: E19P. `0096005793-3` (Huron): the two AG5B Huron meters.

**Why this matters and why it is only a lead:** a legacy AG-5 meter *may* be cheaper or more
expensive than the current AG-A/B/C equivalent depending on its load factor and demand shape.
Per the ground truth, **rate-optimization is only trustworthy with 15-minute interval kWh** —
bill summaries carry no kWh, and the engine's AG-C↔AG-B "savings" without intervals are
**sign-ambiguous artifacts** (suppressed by the `no_usage_basis` guard in `rate-lever.ts`). So
the legacy spread is the *highest-value place to point an interval pull*, but I will not assign
it a dollar figure here. The honest claim is: "18 meters on closed schedules across five
accounts — the most likely place a wrong rate is hiding — confirmable only by pulling their
intervals."

### 2b. Orphan-NEM / generation-meter signatures
The orphaned-credit pattern that produced the P031 anomaly is **not unique to the bill account.**
Across the other accounts the inventory shows generation/NEM signatures with their own true-up
months — meters that *should* be drawing or feeding array credit on accounts we have never billed:

| Row | Account | Rate | NEM type | True-up | Solar grp | Note |
|---:|---|---|---|---|---|---|
| 11 | 6431815493-3 | E19P | NEM2AG | May | 4433 | generation/agg meter |
| 19 | 3619074535-0 | A1X | NEM2AG | August | 4444 | generation/agg meter |
| 20 | 0730240888-0 | B1 | NEMEXPM | May | 4624 | DEHYDRATOR |
| 23 | 4507020255-6 | A1X | NEM2M | July | 4939 | generation/agg meter |
| 34 | 6863917471-0 | A1X | NEM2AG | May | 5219 | generation/agg meter |
| 49 | 5089901685-6 | AGC | NEMEXP | January | Solar | PUMP 74 |
| 50 | 3372050929-9 | AGB | NEMEXPM | January | Solar | PUMP 26 |
| 51 | 6539944461-4 | AGC | NEMEXPM | December | Solar | PUMP 33 |
| 52 | 9597876494-2 | AGC | NEMEXPM | December | Solar | PUMP 83 |
| 54 | 8922820273-8 | AGC | NEMEXPM | December | Solar | PUMP 34 |

**Why this matters:** P031's anomaly was a load meter sitting on a NEM group getting **zero
allocated credit**, found *because* we had its bill. These 10 are the same *signature* on accounts
with no bill — each is a candidate for the identical "is this service point actually getting its
NEM credit?" check. **42 of the 138 other meters carry a solar flag**, spread across the same
aggregation buckets seen on the bill account (`4433`, `4444`, `5219`, `840kw`, `1092kw`, `Solar`,
`4939`, `4624`). The two real arrays (**840 kW + 1,092 kW = 1,932 kW total — NOT 12,180 kW**;
the older `REPORT.md` line citing 12,180 kW is wrong and is superseded by this ground truth and
by the corrected deep findings) feed an aggregation pool whose allocation we have only partly
seen.

**Honesty caveat, carried straight from the P031 finding:** any orphan-NEM recovery is
**$0 floor, contingent on the Generation Allocation Summary.** NEM aggregation is a **zero-sum
pool** — if the 1,932 kW of arrays are oversubscribed across the whole fleet, re-pointing credit
to one starved meter only moves the deficit and nets nothing. So the right framing for these 10
is: "10 orphan-NEM candidates worth checking; recovery on each is $0 unless the Allocation
Summary shows spare generation." Do **not** stack ten P031s and call it a number.

### 2c. Idle / standby meters bleeding the customer charge
Three other-account meters are explicitly flagged idle in the inventory notes:

- `6539944461-4` P020 — `"not using"`, 100 GPM, HAGC
- `6539944461-4` P081 — `"not using"`, 2500 GPM, HAGC (new well, large — worth confirming)
- `1909940814-8` P144 — `"minimal use"`, 500 GPM, HAGC

Plus the structural idle-rate lever already found on the bill account applies here too: a HAGC
(AG-C, 35+ kW high-use) meter that genuinely runs tiny/flat all year can demote to AG-A1 and
shed the demand column + the higher customer charge (~$271.74/yr/meter of customer-charge delta,
the same deterministic arithmetic used in the bill-account finding). **The trap is identical to
finding #3 in the main report:** AG-C eligibility is a **trailing-12-month ratchet**, so a well
idle *this* month may have pumped 50–110 kW all summer and is correctly locked on AG-C. Without
that meter's 12 months of intervals you cannot tell "structurally tiny" from "idle this week."
These three are leads for an interval pull, not bookable today. A `"not using"` note does **not**
mean a dead shell — on a NEM-aggregation group a 0-kWh meter can be netting, exactly as P017/P018
turned out to be.

### 2d. Dead/abandoned service points (free, no intervals needed)
Among the other meters, status `BAD` / `OLD` appears on a handful (e.g. P142 "need to drill",
P046, the OLD P059). A *genuinely* abandoned, de-energized service point bleeds only the monthly
customer charge and can be removed — and that needs **no interval data**, just confirmation the
array/well is physically gone. But as with the bill account, "BAD" in this Excel often means
"bad pump efficiency" or "needs drilling," not "dead meter," and **meter removal is effectively
permanent** (reconnection + line-extension can dwarf years of saved customer charge). Treat these
as a short manual call-list, not an automated saving.

---

## 3. What to pull, exactly — free first, paid second

The governing principle from the pilot's decision doc holds at fleet scale: **the map and the
metadata are already free; you only spend money where an hour-by-hour curve is the only thing
that converts a claim into proof.** Two ingestion paths exist in the codebase and should be used
in this order.

### Tier 0 — already free, already in hand (do this first, $0)
For all 138 other meters you already have identity, location, rate label, GPM, crop, NEM flag,
and aggregation group from the Excel. That alone lets you:
- map every other-account meter (most have lat/long),
- list the 18 legacy-rate meters and 10 orphan-NEM candidates as "to verify,"
- build the per-entity / per-account meter census the owner has never seen in one place.
No pull needed. This is the legibility win for the other five entities.

### Tier 1 — bill PDFs to vision-extract (FREE; the cheap way to light up dollars)
The **only AI in the product is bill-PDF vision extraction (`src/lib/extract`)** — it turns a
bill image into data rows (rate, charges, NEM table, demand line), never into a savings dollar.
Bills are **not** in the Green Button / UtilityAPI feed, so this is the path that produces *bill
dollars* for an account without paying UtilityAPI.

**Pull these account bill PDFs and vision-extract them (request one recent full cycle each, plus
the true-up cycle where one exists):**

1. **`6539944461-4`** (KG partnership) — the largest single other account; carries 8 legacy
   meters *and* NEMEXPM solar meters (P033) *and* the 1,092 kW array group. Highest dollar density.
2. **`1909940814-8`** (KS/GS partnership) — the other large account, ~30+ meters, many HAGC.
3. **`3922545703-3`** (KS/GS) — 4 legacy AG-5 meters.
4. **`5089901685-6`, `3372050929-9`, `9597876494-2`, `8922820273-8`** — the four AGC/AGB
   NEMEXP(M) "Solar" meters with December/January true-ups: cheapest way to look for a second P031.
5. The A1X / NEM2AG generation meters (`6431815493-3`, `3619074535-0`, `4507020255-6`,
   `6863917471-0`) — these are the *generation side* of the aggregation; their bills are what
   reveal whether the pool has spare credit (the missing input for every orphan-NEM claim).

**Why bills first:** a vision-extracted bill gives you the printed total, the demand-charge line,
and the NEM true-up table per meter — enough to compute the same `retrospective` / `billAudit`
demand-charge backbone the pilot already runs, **at $0 marginal cost.** It does *not* give kWh
intervals, so it still cannot settle a rate switch.

### Tier 2 — UtilityAPI interval pulls (PAID; only where intervals are the sole proof)
Reserve paid UtilityAPI pulls (~$12/meter, first collection free, **not** the ~$2,568
bulk/ongoing quote) for the meters where a 15-minute curve is the *only* way to a number:

- **The 18 legacy-rate meters** — interval kWh is the only trustworthy input to rate-optimization
  (ground truth: bill summaries can't do it; AG-C↔AG-B without intervals is sign-ambiguous). This
  is the highest-value paid pull because it is where a wrong rate most likely hides.
- **The 3 idle/standby HAGC meters (P020, P081, P144)** — 12 months of intervals is exactly the
  evidence that distinguishes "structurally tiny → demote to AG-A1" from "idle this week, ratchet-
  locked." Without it the demotion is unprovable.
- **One or two large-demand pumps per big account** (e.g. P081 @2500 GPM, P084-class wells) — to
  see whether a shaveable coincident demand peak exists, the same play P054 anchors on the bill
  account.

**Crucial sequencing note:** UtilityAPI authorizes by **account**, and per the durable Batth
authorization already on file (UID 587577), one owner-approved authorization covers all the
service points under the accounts that owner controls — so the *access* to these other accounts
may already be re-pullable without new 2FA, but **each account still needs its own owner approval
if it is held by a different legal entity.** Five of these entities are not the bill-account owner.
Sort the pull list by entity, get each entity's one-time approval, then pull bills (free) before
spending on intervals.

---

## 4. Honest uncertainty — what this document is NOT claiming

- **No dollar total for the other 56 accounts.** We have zero bills and zero intervals for them;
  any total would be invented. The counts (138 meters, 18 legacy, 42 solar-flagged, 10 orphan-NEM
  signatures, 3 idle) are facts from the Excel. The *value* of each is a hypothesis pending a pull.
- **Solar is 1,932 kW, not 12,180 kW.** Two arrays, 840 + 1,092. The orphan-NEM opportunity is
  bounded by that real generation, and the aggregation pool may already be **oversubscribed**
  (zero-sum) — so the orphan-NEM recovery floor is **$0** until the Generation Allocation Summary
  is in hand.
- **The legacy-rate spread is a lead, not a saving.** A legacy AG-5 meter can be cheaper than its
  current equivalent. Direction is unknown until intervals exist.
- **"Not using" / "BAD" notes are operator shorthand, not meter status.** On NEM-aggregation
  groups a 0-kWh meter is often netting, not dead. Verify physically before acting; meter removal
  is permanent.
- **Entity boundaries gate access.** The one Batth authorization does not automatically cover the
  Surinder K. account or any entity the owner of `4699664587-8` does not control. Each needs its
  own approval.
- **Savings, when they come, are still deterministic.** Nothing here changes the rule: dollars are
  computed by the pure functions in `src/lib/energy`; the only AI is the bill-PDF vision extraction
  that produces the data rows these other-account bills would feed.

**Bottom line:** the other 56 accounts roughly *triple* the meter count behind the pilot and hold
five of six legal entities the bill has never shown. The fastest, cheapest way to light them up is
**Tier 1 — vision-extract the account bill PDFs for the 8-ish accounts above (free)** — which
produces real per-meter dollars and surfaces any second P031, followed by **targeted paid
UtilityAPI interval pulls only on the 18 legacy-rate meters and the 3 idle HAGC meters**, where a
15-minute curve is the only thing that can settle the claim.
