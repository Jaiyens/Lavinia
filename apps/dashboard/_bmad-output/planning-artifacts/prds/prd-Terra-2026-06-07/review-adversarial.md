# Adversarial Review — Terra Tool 1 PRD (2026-06-07)

_Reviewer posture: cynical, adversarial. Goal: surface the ways this PRD could mislead the
6-week build or blow up either demo (Batth conversion + investor seed) before July 20.
Findings are organized by severity. Each cites a PRD/addendum/research location. This review
does not soften findings and does not rewrite the PRD._

---

## Overall verdict

**HIGH RISK to the stated plan as written.** The PRD is unusually honest about its own
fault lines (it names most of the hard assumptions and even pre-writes the fallbacks), but
that honesty masks a structural problem: **the two load-bearing "fully real" claims —
one-cent reconciliation on a 101-page scanned image bill, and a back-test that reconciles a
recomputed bill to ground truth — are each gated by guardrails that, if they fail, collapse
the build to a screen full of "needs review" with no dollar numbers.** The PRD treats the
guardrails as safety nets. They are equally tripwires that can erase the demo's substance
while leaving the deadline intact. The single biggest hidden assumption is that
vision/LLM extraction of a faint, skewed, handwriting-overlaid, bilevel 200-DPI scan will
hit cent-exact reconciliation often enough to populate a convincing screen *within the
runway* — and there is no evidence in the PRD that this has been demonstrated even once on
even one page. Everything Batth-facing rides on that.

The investor demo is comparatively de-risked (badged seed, inventory-driven, content task
not new build), so it survives most parser failures. The **Batth conversion demo does not** —
it depends on the one thing (real extraction) the PRD has not yet proven.

---

## CRITICAL

### C-1. The whole Batth-facing build rests on an unproven, possibly-unprovable extraction step, with no spike/proof gate in the runway.
**Location:** §C.1 (addendum, "The bill is a SCAN… 101-page scanned image PDF — no text
layer, bilevel, 200 DPI… OCR errors are expected"); FR-2; §10 ASSUMPTION ("The scanned bill
reliably carries, per service agreement… verified on inspected pages, assumed to generalize
within the account").

The plan's first audience (convert Gagan on his real screen, SM-1) requires real numbers
extracted from *his* bill. That bill is described as the worst-case input for vision
extraction: bilevel, 200 DPI, faint, skewed, handwriting overlaid. The PRD's own language is
"OCR errors are *expected*." The reconciliation guardrail (FR-5) then ensures any
mis-extracted figure is *withheld*, not shown wrong. Combine the two and the realistic
failure mode is not "wrong numbers" — it is **a Batth screen where most cells read "needs
review" and the hero total-spend number can't be computed**, because the hero number
(FR-7) sums covered meters and a single un-reconciled SA on an account poisons the account
total.

There is no milestone in the 6-week runway that says "prove cent-exact extraction on N real
pages by week X, or pivot." §5/§6 defer *bulk* but assume *single-account* success as a
given. The assumption in §10 is doing enormous load-bearing work behind the phrase "assumed
to generalize." This is the single point of failure for SM-1 and SM-5, and it is unscheduled
and undemonstrated.

**Why it's critical, not high:** if this fails, the Batth demo has no real content, and the
PRD provides no fallback for the *conversion* surface (the badged seed only covers the
investor room — §5 "Anonymized-real investor mode" out of scope, and the seed is explicitly
*not* Gagan's data). A failed extraction does not slip the deadline; it guts the deadline's
purpose.

### C-2. The reconciliation guardrail's success condition is internally under-defined and may be mathematically unattainable on a scan.
**Location:** FR-5 ("extracted line items reconcile to the bill's printed total within one
cent"); Glossary "Reconciliation"; §C.1; Open Question 2.

FR-5 demands that **extracted line items sum to the printed total within $0.01**. On a real
PG&E bill the printed per-SA total includes line items that the PRD's extraction list (FR-2:
"TOU energy split with charges, the Demand Charge, and NBCs") does **not** enumerate:
minimum/customer charges, the California Climate Credit, franchise fees, wildfire-fund
charges, taxes, PCIA/other riders, NEMA maintenance fees, balancing-account true-ups. If the
extractor only captures TOU + demand + NBC, the sum **cannot** reconcile to the printed total
to the cent — the missing line items guarantee a gap larger than a penny. So either:
- (a) the guardrail is interpreted as "sum the items we *did* extract against a subtotal we
  also extract" (much weaker than "the bill's printed total"), or
- (b) the guardrail is interpreted literally and **fails on essentially every SA**, pushing
  the entire bill to "needs review."

The PRD does not specify *which total* the cent-check runs against. Open Question 2 admits
the *back-test* (FR-14) may miss the cent for exactly this reason (riders/baseline) but does
**not** apply the same skepticism to FR-5 itself, which Glossary calls "exact to the cent."
SM-3 ("100% of displayed figures tie to the cent") is therefore either trivially true on a
weakened subtotal definition or unachievable on the literal definition. This contradiction
must be resolved before any number is trusted, and it is currently a CRITICAL ambiguity
because the entire trust thesis ("matched it to the cent," FR-19 copy) is built on it.

### C-3. The FR-14 back-test gate can silently downgrade the one "fully real" lever to qualitative-only — erasing SM-4 — and the PRD already half-admits it.
**Location:** FR-14 ("Alternative numbers render only if the recomputed current charges
reconcile to the actual billed charges within tolerance"; "On fail: … qualitative
legacy→current finding without a precise dollar number"); §10 final ASSUMPTION ("its
frequency is unknown until the fixture meets real bills"); Open Question 2 (tolerance
undefined); SM-4.

SM-4 requires **each of the 27 legacy meters** to carry a back-test-passing dollar finding.
But the back-test reconciles a *fixture-recomputed* current bill against the *actually
billed* charges, and the fixture is explicitly bounded (FR-14 out-of-scope) and does **not**
include riders, baseline adjustments, the demand-charge limiter's interaction, PCIA, NBCs
beyond what's modeled, or season-boundary proration. Open Question 2 concedes the recompute
"may miss the cent due to riders/baseline adjustments not in the fixture" — and the tolerance
that decides pass/fail is **undefined** (Open Question 2 again). This is a triple bind:
- If tolerance is tight, most/all 27 meters fail the back-test → fall back to qualitative →
  **SM-4 fails wholesale** (no checkable dollar numbers), and FR-14's headline ("the one
  fully-computed lever") becomes vapor.
- If tolerance is loose enough to pass, the back-test no longer *proves* the math reconciles
  — it proves it's "close," which means the savings number it licenses is **not actually
  cent-trustworthy**, violating the product's stated reason to exist (SM-C1, §7 Correctness).
- The pass/fail frequency is "unknown until the fixture meets real bills" — i.e., the
  central success metric of the whole money story is **unestimated** at PRD time.

A reviewer cannot tell from this PRD whether the rate lever will produce 27 dollar findings,
3, or 0. That is a critical planning gap, not a detail.

---

## HIGH

### H-1. The runway math is not shown, and the in-scope list is not a 6-week scope for "a tiny team."
**Location:** §0 ("~6-week runway to ~July 20"); §6.1 In Scope (FR-1 through FR-21, all 21
FRs).

§6.1 puts **all 21 FRs** in MVP scope. That includes: a page-classifying vision extraction
pipeline over a 101-page scan (FR-2), a NEM reconciliation-table extractor that handles
negative usage and per-array true-up (FR-3), a canonical multi-period billing model (FR-4),
a reconciliation engine (FR-5), a dated versioned tariff fixture plus a back-test engine
across ~8 schedules (FR-14), bill-accuracy recomputation (FR-19), predicted-vs-realized
result tracking (FR-20), a dense sortable/filterable 183-meter table (FR-9), a drawer (FR-10),
a map (FR-12), charts with YoY (FR-8), rollup/filter recompute (FR-11), plus the full
agrarian-luxury design system at sub-second nav. The only declared cut is FR-12 (map, P1).
There is **no estimate, no week-by-week, no team size** stated anywhere. "~6-week runway"
and "tiny team" (from the task framing, not contradicted by the PRD) against 20 P0 FRs where
one of them (FR-2) is research-grade is the textbook way a deadline holds while the content
hollows out. The PRD names the parser as the runway-eater ("if cluster A's parser consumes
the runway," FR-12 note) — i.e., it *knows* the parser can eat everything — but still books
the full feature set. The honest read: the parser eats the runway, FR-12 is cut, and then
**FR-3/FR-19/FR-20/FR-8-YoY are the next things to silently slip**, none of which are marked
as cuttable.

### H-2. FR-19 / FR-20 / SM-4 require real Batth billing that the v1 ingest path may not deliver in time, and FR-20 cannot close inside the runway by design.
**Location:** FR-19; FR-20 + its `[NOTE FOR PM]` ("Do not script the demo as if a loop has
already closed"); FR-14 back-test; FR-21 ("one account proven before bulk").

FR-19 (bill-accuracy verification) and FR-14 (rate back-test) both require *real reconciled
Batth billing* for at least the meters being shown — i.e., they depend entirely on C-1
succeeding. FR-20 (predicted-vs-realized) explicitly **cannot demonstrate a closed loop in
v1**: it needs a *new* bill to post *after* a recommendation is accepted, and the PRD's own
note tells the team not to pretend otherwise. So FR-20 ships as a permanently-"pending"
widget at demo time — real engineering effort for a feature that, on demo day, shows nothing
but the word "pending." That is fine as honesty but it means FR-20 is **demo-inert**: it
consumes runway (H-1) while contributing zero to either SM-1 or SM-2 in the window that
matters. Building it now, before bulk ingest exists to ever feed it, is a misallocation the
PRD does not flag.

### H-3. The SA-ID join is assumed clean across two heterogeneous sources, and a single mismatch breaks rollups silently.
**Location:** §10 ASSUMPTION ("The bill's SA ID matches the master sheet's SA ID for every
meter, making it a clean join key"); Glossary "Service Agreement / SA ID" ("The join key");
FR-4; FR-11.

The entire billing-to-inventory linkage rides on SA ID matching exactly between a
**hand-maintained master spreadsheet** and a **vision-extracted scan**. Two independent
failure sources stack: spreadsheet typos/format drift (the sheet already has typo'd
billing-name duplicates per §A — so SA IDs are plausibly dirty too) and OCR misreads of the
SA ID on a faint scan. The PRD does **not** specify what happens on a join miss. If billing
extracts cleanly but the SA ID is off by one OCR'd digit, the figure reconciles to the cent
(C-2 aside) but attaches to the **wrong meter or no meter** — a *reconciled* number landing
in the wrong row, which the one-cent guardrail will **not** catch because reconciliation
checks sums, not identity. This is an honesty trap the guardrails do not cover: a
cent-perfect number on the wrong pump. FR-11 rollups would then be quietly wrong while every
cell "ties to the cent." No FR has a testable consequence for "SA ID present on bill but not
in inventory" or vice versa.

### H-4. The hero number's honesty depends on coverage scoping that conflicts with "trust the picture first."
**Location:** FR-7 ("hero card is total PG&E spend, scoped to the covered period," "the
indicator reads 100% on the fully-loaded representative seed"); FR-11 ("Money rollups count
only covered (reconciled) meters"); UJ-1 climax ("every number shown reconciles to his real
bill"); §C.1 "Launch reality… billing data is partial at launch."

On the **representative seed**, coverage is 100% and the hero number is whole. On **Gagan's
real screen**, billing is partial (one account proven, FR-21), so the hero "total PG&E spend"
is the sum of *only the covered meters* — a fraction of his real operation. The conversion
thesis (UJ-1) is "his *entire* energy footprint in one correct place" and "**total PG&E spend
across the whole operation as the single largest number**" (§1). But the largest number on
Gagan's actual screen will be total spend across **one account of 57**, with a coverage
indicator reading something like "X of 183 meters loaded." That is honest, but it is **not
the promised emotional payload**: Gagan opens it, sees a number that is obviously not his
whole bill, and the "someone finally put my *whole* picture in front of me" moment — the
thing the PRD says converts him (§1) — does not land, because the inventory is complete but
the *money* (the largest element, the hero) is mostly missing. The PRD's two demo surfaces
have **opposite coverage profiles**, and the conversion narrative is written for the seed's
profile, not Gagan's.

### H-5. "Every finding traces to data visible on the dashboard" plus "no fabricated numbers" makes several levers conditional in ways that can empty the recommendation feed.
**Location:** FR-13 ("A finding with no dollar impact and no impactNote is not shown"); FR-14
fail path (qualitative, no dollar); FR-15 (renders *only* for solar + demand-carrying
AG-C-family meters); FR-17 (no efficiency number, flag only); FR-18 (info only, no rec);
§4.3 priority.

Stack the gates: DR generates no rec (FR-18). Pump health generates no dollar rec (FR-17).
Billing-cycle timing is a calendar, not really a rec (FR-16). Solar/NEM insight only fires on
solar-AND-AG-C meters (FR-15) — and per research §3 + §1, **only AG-C among the defaults
carries a demand charge**, so the intersection of "solar" and "on a demand-carrying schedule"
could be a *small* set of Batth's ~56 solar meters (many may be on HAGC/legacy, not AG-C
family). So the feed's substance is **almost entirely FR-14** (rate optimization). If
FR-14's back-test fails for most of the 27 (see C-3), the rate findings drop to qualitative,
which (FR-13) may not even render as feed items if they lack an `impactNote`. The realistic
worst case: **a recommendation feed with very few dollar findings, or none** — directly
undercutting "where money is hiding" (§1, the second beat that does the converting). The
PRD's lever demotions are individually defensible but collectively they put all the
feed's eggs in the one basket (FR-14) most at risk (C-3).

### H-6. NEM extraction (FR-3) is scoped as if equal to FR-2 but is materially harder, and is not marked cuttable.
**Location:** FR-3 ("monthly rows and the annual True-up… including negative usage…
per Array"); §C.1 page-type 5 ("per-SA NEM reconciliation tables… NEM meters show negative
usage").

NEM reconciliation tables are multi-row, multi-month, sign-sensitive (negative usage that
must *not* be floored at zero — FR-3 consequence), and per-array. Extracting these correctly
from a scan is strictly harder than extracting a single TOU split, and getting a sign wrong
silently corrupts solar economics (and FR-15's insight). Yet FR-3 sits in §6.1 In Scope with
no P-level and no cut flag, unlike FR-12. ~56 of 183 meters are solar (§A), so this is not an
edge case — it's ~30% of the fleet. If the parser is already the runway risk (H-1), FR-3 is
the most likely place for a quiet correctness failure that the cent-guardrail (sum-based)
won't necessarily catch on a reconciliation table whose "total" is a rolling credit, not a
charge.

---

## MEDIUM

### M-1. Tariff fixture sourcing is an open question that gates the only real lever, with no owner or deadline.
**Location:** Open Question 3 ("sourcing and refresh cadence TBD"); §10 ASSUMPTION 1
("obtainable and can be encoded"); FR-14.

FR-14 needs dated, versioned PG&E ag tariff values (customer charge, TOU energy by season,
demand charge, limiter) for ~8 schedules, sourced from published tariffs with effective
dates. This is hand-transcription of regulatory documents that "change every rate case"
(research §1) and "weren't extractable" during research. It is the *input* to C-3's
back-test. If a single $/kWh or the demand-charge limiter (~$0.50/kWh, research §1) is
transcribed wrong, every back-test for that schedule fails or, worse, passes with a wrong
number. This is gated as an Open Question, not a scheduled deliverable with an owner — yet
nothing in FR-14 works until it exists and is correct. It belongs in the critical path, not
the open-questions appendix.

### M-2. "Sub-second navigation across cards, table, drawer, and map" on 183 meters × multi-period billing is asserted, not budgeted.
**Location:** FR-9 NFR / §7 Performance ("sub-second navigation"); FR-11 ("recomputes both the
cards and the table to that subset").

183 meters, each with multi-period canonical billing, rendered in a dense sortable/filterable
table with live recompute of rollups on filter change, on a stack (Next.js/Prisma/SQLite per
CLAUDE.md) — sub-second is achievable but not free, and the PRD treats it as a given. With
the design system's "one orchestrated motion moment per view" overlaid, there's real work in
keeping filter/sort interactions snappy. Low blast radius (it's the seed, fully loaded, so
demo perf is testable in advance), hence medium — but it's an unbudgeted bar.

### M-3. The 35 kW eligibility threshold and once-per-12-months constraint are stated as copy/notes, but the *data to evaluate eligibility* may not be on the bill.
**Location:** FR-14 ("Eligibility respects the 35 kW threshold; notes the once-per-12-months
switch constraint"); research §1 ("rated capacity ≥ 35 kW, OR … metered max demand hit ≥ 35 kW
in any of the last 12 months"); FR-2 out-of-scope (no interval data, cycle-level demand only).

Eligibility for AG-B/AG-C turns on **rated capacity OR max demand in any of the last 12
months**. v1 has cycle-level billed demand for *covered* periods only (partial billing), and
no rated-capacity field is listed in the §A column inventory (GPM yes, kW rating no). So
"the finding respects the 35 kW threshold" may not be *evaluable* from available data for
many meters — the system would be asserting eligibility it can't actually verify, or
suppressing valid findings it can't confirm. Either way the consequence "respects the 35 kW
threshold" is **not cleanly testable** as written, because the input isn't guaranteed present.

### M-4. "Both demos run on a laptop" plus "mobile-first as a discipline" is a hedge that can produce two half-built form factors.
**Location:** §4.2 NFR / §7 ("desktop/tablet is the primary build target… mobile-first as a
discipline so nothing breaks on a phone"); CLAUDE.md ("growers open this on a phone in a
truck"); UJ-1 ("opens the dashboard on his phone, first session").

UJ-1 — the conversion journey — explicitly has Gagan on **his phone**. The dashboard NFR
makes **desktop primary** because the demos run on a laptop. These aren't contradictory but
the runway pressure resolves them badly: under time pressure the team builds the desktop
table well and ships a "simplified sortable list" mobile core. If Gagan's *actual first
session* (UJ-1 entry state) is on his phone in the truck, he meets the simplified surface,
not the dense table "he lives in" (FR-9). The PRD's own conversion journey contradicts its
own form-factor priority. Medium because both demos in-window are on a laptop, so the
*scheduled* demos are safe — but the real conversion moment described in UJ-1 is not.

### M-5. FR-7 "biggest cost mover" and FR-8 YoY require ≥2 periods, but history depth is an open question and partial billing may not supply two covered periods per meter.
**Location:** FR-7 ("renders only when a meter has ≥2 covered periods; otherwise hidden");
FR-8 (YoY toggle); Open Question 5 ("which months/periods the Batth export actually bundles…
Empirical, confirm during ingest"); §C.1 ("one NEM table showed 7 monthly rows").

The multi-period story rests on the single export bundling multiple months. Evidence is
*one* NEM table with 7 rows — that's the **NEM reconciliation** table (solar meters), not a
guarantee that *regular* per-SA charge-detail pages carry multiple periods for non-solar
meters. If the regular charge pages are single-period, then YoY (FR-8) and biggest-mover
(FR-7) have no data for the ~127 non-solar meters and quietly hide — shrinking the dashboard's
apparent richness on exactly the meters that make up most of the fleet. This is flagged as an
open question, correctly, but the dashboard's "richness" is being designed before the data to
fill it is confirmed.

### M-6. "Both demo surfaces… already supported by the isDemo resolution, zero new build" understates the seed's content burden.
**Location:** §6.1 ("both already supported by the isDemo resolution, zero new build"); §10
ASSUMPTION 5 ("The representative seed can be populated into a complete, believable money
story (content task, not new build)").

"Zero new build" is true for the *resolver*. But the investor demo (SM-2) needs a seed that
tells "a complete, believable money story" — a back-test-passing rate finding, a coherent
solar/NEM insight, plausible demand exposure, a hero total that holds up to a sophisticated
investor's scrutiny. Fabricating a seed that is internally consistent across rate math,
TOU splits, NEM allocations, and demand charges — such that the *same engine* that runs on
Batth produces sensible numbers on the seed — is a non-trivial content+data task, not the
trivial thing "zero new build" implies. And if the seed's numbers are hand-tuned to look
good rather than run through the real engine, that's an honesty trap (the investor demo
shows engine output that isn't actually engine output). The PRD waves this off in one line.

---

## LOW

### L-1. "Working title — confirm" and the ranch count (36 vs 37) are unresolved trivia that shouldn't gate anything but signal the doc is pre-final.
**Location:** §0 title note; Open Question 1 (36 vs 37 ranches); Open Question 7. Addendum §A
says **37 ranches** flatly while OQ-1 calls it unresolved — a minor internal inconsistency.
Low impact, but the addendum and PRD disagree on a stated count.

### L-2. DR enrollment "info only" still asserts the bill carries enrollment status, which may not be reliably extractable.
**Location:** FR-18 ("If the bill shows program enrollment (e.g. PDP), it is displayed as
info"). Whether PDP/CBP enrollment is legibly printed per-SA on the scan is unverified (not in
the §C.1 confirmed-mechanics list). If it isn't reliably there, FR-18 shows nothing — harmless
(it's info-only) but the "displayed as info" consequence isn't testable until confirmed.

### L-3. FR-16 billing-cycle timing depends on a serial code → meter-read-schedule lookup whose input (serial code) isn't in the §A column inventory.
**Location:** FR-16 ("derived from its serial code via the 2026 meter-read schedule fixture");
§A column list (Meter #, Pump ID, SA ID listed; "serial code" not explicitly listed). If the
serial/rotation code that drives cycle-close isn't a column in the master sheet (or extractable
from the bill), FR-16's per-meter cycle dates can't be derived. Low because FR-16 is a demoted
lightweight lever, but the input's presence is unconfirmed.

### L-4. The "isDemo / dashboardFarm" plumbing referenced in memory may not match the PRD's two-surface model cleanly.
**Location:** §6.1 ("isDemo resolution"); user memory (`dashboard-rebuild`, `scenario-meters`)
notes the seed currently sources synthetic scenario meters (Westside Pump 17, Dairy Field Pump
4) while §A says surface the *real* descriptors and treat synthetic names as disposable. Minor
risk of the seed carrying disposable synthetic names into the investor demo if the rebuild
doesn't replace them. Low, but a known seam.

---

## Cross-cutting honesty-trap summary (the ways a number could reach the screen untrustworthy despite the guardrails)

1. **Cent-perfect, wrong meter (H-3):** SA-ID OCR/typo misjoin attaches a reconciled figure
   to the wrong pump; sum-based reconciliation never catches identity errors.
2. **Reconciled to a weakened total (C-2):** if FR-5 checks extracted items against an
   extracted subtotal rather than the printed grand total, "ties to the cent" (SM-3) is true
   but excludes the line items that make the bill the bill.
3. **Back-test "passes" on loose tolerance (C-3):** if OQ-2's tolerance is set generously to
   get the 27 findings to render, the licensed savings number is "close," not exact —
   contradicting the cent-trust thesis while wearing its badge (FR-19 copy "matched it to the
   cent").
4. **Hand-tuned seed presented as engine output (M-6):** the investor screen shows numbers
   that look engine-derived but were authored for believability.
5. **Eligibility asserted without the input (M-3):** "respects the 35 kW threshold" rendered
   when rated capacity / 12-month max demand isn't actually available to check.

Each of these passes the literal guardrails while violating the spirit the PRD names in §7
("No fabricated numbers… nothing inferred is presented as if measured") and SM-C1.

---

## What the PRD gets right (so the build doesn't over-correct)

- It correctly identifies the parser as the runway risk and pre-commits FR-12 as the first
  cut. The instinct is right; the cut list is just too short (H-1).
- The guardrail-first posture (FR-5, FR-14 back-test, "needs review" over fake numbers) is the
  correct trust architecture *if* the success/failure thresholds are defined (C-2, C-3, OQ-2).
- Separating FR-19 (accuracy, live every cycle) from FR-20 (close-the-loop, pending in v1) and
  warning the team not to fake a closed loop is unusually disciplined.
- The lever demotions match the honest-priority thesis and avoid the classic "six shallow
  levers" trap (SM-C2). The risk is the opposite over-concentration (H-5).

The fix is not to soften the guardrails — it's to (a) **prove extraction on real pages and
define both tolerances (FR-5, OQ-2) before week 2**, (b) **expand the explicit cut list
beyond FR-12** so the deadline holds without silently hollowing FR-3/19/20/YoY, and (c)
**reconcile the conversion narrative (whole-operation hero) with Batth's partial-coverage
reality (H-4)** so the demo that's supposed to convert Gagan is built for the screen he'll
actually see.
