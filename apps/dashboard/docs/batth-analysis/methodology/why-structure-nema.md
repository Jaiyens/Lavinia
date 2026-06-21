# Why the "Account / entity / NEMA structure" dollar number is what it is

**Plain-English methodology for one lever.** This explains the structure / entity / NEMA
findings the way you can say them out loud to Batth and to an investor. It is grounded in the
code trace (`methodology/00-how-savings-are-computed.md`) and the finding records
(`findings-deep-structure-nema.json`).

**The one-sentence honest headline:** for this lever the **net banked savings today is $0**.
Every finding here is a **structural defect we can prove from Batth's own bills** (an orphaned
solar meter, entities spanning one array, a typo splitting one company into two, true-up dates
that cannot all be legitimate), but the **recoverable dollars are contingent on one PG&E
document we do not yet hold** — the Generation Allocation Summary — so we present these as a
**dispute-ready audit**, not as money in hand.

---

## (1) HOW do we know the dollar number — the formula in plain words + the rate inputs

This lever has **one priced anomaly** and **four un-priced structural flags**. Be precise about
which is which.

### The one priced anomaly: P031 / VINES IRR 75HP zero-credit true-up

The headline number is **$62,795.65** — and that is **not our estimate, it is the number
PG&E printed on Batth's bill** for meter `4699664088` (P031), true-up dated 2026-03-26. We read
it verbatim from the bill; we did not model it.

What we *compute* from it is whether that true-up is **legitimate or an error**, using one
division:

- **Effective rate = true-up dollars / net imported kWh** = `$62,795.65 / 190,505 kWh = $0.3296/kWh`.
- That `$0.33/kWh` is the **full retail AG time-of-use rate**. It is roughly **14x** the
  "non-bypassable charge" floor of about **$0.023/kWh** — the small per-kWh public-program
  charge that even a perfectly-credited solar meter can never avoid.

In plain words: **this meter was charged as if it had no solar at all.** A meter sitting under
a 1,900 kW solar fleet should true up near zero per kWh, not at full retail. So the bill is
telling us P031 received essentially **zero generation allocation** from the array group.

Then we bound what is **recoverable**, honestly, between a floor and a ceiling:

- **Floor = $0.** The non-bypassable portion (`190,505 kWh x $0.023 = ~$4,382`) is **never
  refundable** — it is owed no matter what. And if the arrays are already fully subscribed by
  the other meters, moving credit to P031 just moves the same shortfall to a sibling. That is
  zero-sum, and the defensible number stays $0.
- **Ceiling = ~$57,000.** That is the true-up minus the non-bypassable floor
  (`$62,795.65 - $4,382 = $58,414`, rounded down for surviving minimum/demand line items) —
  **but only if** the Generation Allocation Summary shows P031 was absent or at 0% **and** the
  array group had unallocated kWh sitting unused.

**The proof it is a real error, not normal under-crediting:** P031's sibling **P038**
(`4699664743`) is in the **same** solar group, on the **same** bill account `4699664587-8`, in
the **same** NEM export family — and it carries an even larger raw deficit (124,117 kWh
imported, zero exports) yet trued up to **$0.26** (= $0.000002/kWh, fully allocated). **The
allocation mechanism that correctly zeroed P038 exists on this exact account and simply did not
reach P031.** That is the signature of an orphaned / dropped meter, not a legitimate charge.

**The rate inputs used:**
- The true-up dollars and the import/export/net kWh: **read verbatim from Batth's printed PG&E
  bills** (`billing.json`), not modeled.
- The **$0.023/kWh non-bypassable-charge floor**: a published PG&E rate-card value. (Note: the
  P031 effective rate itself needs **no** rate card — it is the bill's own dollars divided by
  the bill's own kWh.)

### The four un-priced structural flags ($0 each, on purpose)

These are **boolean / counting checks over Batth's account roster**, not dollar models. They
each return **$0** because their dollar sign is genuinely unknown until we see more data:

1. **Cross-entity NEMA eligibility:** for each of the 8 solar array groups, count the distinct
   legal billing entities. **6 of 8 groups span more than one entity** (group 5219 spans 4).
   PG&E's NEM2A aggregation rule requires a **single customer-of-record** per arrangement, so
   >1 entity is a **violation flag**. No dollar — it could be recoverable mis-billing **or** a
   structure PG&E unwinds and re-bills *higher*. Sign-ambiguous, so $0.
2. **True-up date misalignment:** within the "Solar" group, count distinct true-up months. It
   holds **3** (December, January, October). One physical array under one arrangement can have
   only **one** 12-month anniversary, so 3 means members were enrolled or re-arranged at
   different times. A misaligned date is not itself a charge, so $0 — but it **corroborates**
   the P031 orphan story.
3. **Entity-name fragmentation:** count distinct billing-name strings. `BATHH FARMS INC` (a
   one-character typo, 4 accounts) is almost certainly the same legal entity as `BATTH FARMS
   INC` (22 rows); one row has a **null** billing name. Pure data hygiene, $0 — but it directly
   poisons the cross-entity test above, so it must be fixed before that test is trusted.
4. **Net-surplus giveaway:** flag meters whose annual net kWh is negative (net exporters).
   **P027 and P004** finished as net exporters while sibling meters owe true-ups — and P027 was
   *still* billed a $2,461.49 true-up despite exporting more than it imported. The dollar value
   of that wasted-vs-reallocated surplus is **uncomputable without 15-minute interval kWh**
   (you need the time-of-use timing) and the Allocation Summary, so $0.

---

## (2) WHO computes it — and "this is arithmetic, not AI"

**Deterministic pure functions compute every number on this lever. There is no AI in the math.**

- The P031 effective-rate and non-bypassable-floor arithmetic is the kind of pure NEM math in
  `src/lib/energy/nem.ts` (effective-$/kWh, net-sign classification) — and for this report it
  was reproduced as a hand-checkable manual analytic (a division and a subtraction you can do
  on a napkin).
- The four structural flags are produced by `analyzeFarm`'s structural grouping —
  **distinct-entity-per-group counts, distinct-true-up-month counts, distinct-name-string
  counts** — plain set-counting over the account roster. No model, no network, no clock.
- This matches the codebase law proven in the code trace: a grep across `src/lib/energy` and
  `src/lib/recommendations` for any LLM/gateway call returns **nothing**
  (`00-how-savings-are-computed.md` §0). The energy files import only string copy and each
  other.

**Where AI was involved — and only there:** the **only** AI anywhere near this lever is the
**bill-PDF vision extraction** in `src/lib/extract` (Claude via the Vercel AI Gateway). It did
exactly one job: it **read** the scanned PG&E bills and turned the printed numbers — the
$62,795.65 true-up, the import/export/net kWh, the SA ids — into the structured rows in
`billing.json`. It **read the bill; it did not price anything.** And before any of those
numbers were trusted, a **deterministic one-cent reconciliation gate** required each bill's
line items to sum to within a penny of the printed total. So the chain is: **AI reads image to
numbers -> deterministic gate trusts the numbers -> deterministic arithmetic divides and
subtracts.** AI and dollars never touch.

---

## (3) WHY the money is real — the mechanism PG&E would actually honor

This is the part that makes the P031 finding more than a spreadsheet curiosity.

**The mechanism is NEM2A generation allocation.** Under PG&E's aggregated net-metering, the
kWh a solar array generates is **allocated across the enrolled meters** in the group, and each
meter trues up against its **own allocated share**. A correctly-allocated meter under a big
array trues up at essentially the non-bypassable floor (near zero per kWh). P031 trued up at
**full retail** — meaning it received **no allocation**.

**Why PG&E would honor a correction:** because the proof is **internal to their own billing on
their own account.** Sibling P038, on the same account and same array group, got the allocation
P031 did not. We are not asking PG&E to accept our model of how solar *should* work — we are
showing them that **their own system allocated correctly for one meter and skipped the meter
right next to it.** That is a billing-error dispute backed by their own data, which is the kind
of thing utilities reconcile. The lever PG&E actually pulls is re-running the allocation (or
correcting the roster) so P031's share lands where P038's already did.

**Be honest about the ceiling, though.** PG&E only owes the difference **if there were
unallocated kWh to give P031.** If the array was already fully subscribed by the other meters,
correcting P031 means **taking credit from a sibling** — the fleet's total bill does not drop,
it just moves. That is why the defensible floor is **$0** and the headline must be framed as
"a confirmed allocation error worth up to ~$57k *pending the allocation document*," never "$62k
we are owed."

---

## (4) WHAT could make it wrong / the confidence

**Confidence on this lever is LOW on every finding** — deliberately, and the records say so.
The findings are *structurally certain* (the defects are real and proven from the bills) but
*dollar-uncertain* (the recoverable amount is gated on missing data). What could move the
number:

- **The arrays could be oversubscribed (zero-sum).** This is the single biggest risk. If every
  generated kWh is already credited to some meter, P031's recovery is **$0**, because helping it
  hurts a sibling. We cannot rule this out without the Allocation Summary. This is exactly why
  we never bank the $62,795.65.
- **The non-bypassable residue is never recoverable.** At least ~$4,382 of the true-up is owed
  no matter what. The recoverable ceiling is always below the printed true-up.
- **The cross-entity flags are sign-ambiguous.** A multi-entity group could be (a) recoverable
  mis-billing, (b) a **stale Excel artifact** (the billing names come from Batth's master
  spreadsheet, which has at least one typo and one null), or (c) a legitimate structure PG&E
  could **unwind and re-bill higher**. We do not know the sign, so we flag, we do not net.
- **The entity-name typo poisons the entity test.** `BATHH` vs `BATTH` can make a single-entity
  arrangement *look* multi-entity (or hide a real multi-entity one). Until the names are
  reconciled against PG&E's roster, the cross-entity count is provisional.
- **The net-export "savings" have no computable dollar.** Valuing P027/P004 surplus needs
  time-of-use interval kWh we do not have. Bill summaries carry no interval kWh. Any AG-C ->
  AG-B rate "savings" an engine might emit for these meters **without intervals** is a
  **sign-ambiguous artifact** and is excluded on purpose.

---

## (5) WHAT data we still need and what it unlocks

Two documents convert this from a $0 dispute-ready audit into a quantified claim:

1. **The PG&E Generation Allocation Summary** (`needsData: pge-allocation-summary`). This is the
   keystone. It shows, per array group, **how the generated kWh was split across meters** and
   whether any went unallocated. It would:
   - **Confirm or kill the ~$57k P031 ceiling** — by showing P031 absent / at 0% **and**
     whether the group had unallocated kWh (recoverable) or was fully subscribed (zero-sum, $0).
   - Explain the true-up-date spread (which members re-enrolled and when).
   - Tell us whether P027/P004 surplus was **wasted at the low net-surplus rate** or **already
     reallocated** to a deficit sibling.
2. **The other-entity bills + the Form 79-1202 NEMA roster** (`needsData: other-account-bills`).
   Terra currently holds the bills for account `4699664587-8` (~46 metered SAs). The Excel
   inventory covers **183 meters across ~57 accounts / ~6 entities** — so most accounts have no
   bill behind them yet. These would:
   - Let us **size** the cross-entity NEMA exposure instead of just flagging it.
   - **Reconcile the entity names** (typo, null) against PG&E's customer-of-record records, so
     the single-customer-of-record test becomes trustworthy.

Until both arrive, the honest posture is: **the defects are proven, the dollars are pending.**

---

## (6) The 2-sentence script for the grower (operator English)

"On your P031 vines pump, PG&E charged you a $62,795 solar true-up at the full retail rate, the
same as if that meter had no panels behind it at all, while the pump right next to it on the
same account and the same array trued up to twenty-six cents. That is a billing error we can
prove from your own bills, so we are pulling PG&E's allocation summary to dispute it; depending
on how much of your array is already spoken for, the money back runs from nothing up to about
fifty-seven thousand, and I will not call a dollar of it yours until that document confirms it."
