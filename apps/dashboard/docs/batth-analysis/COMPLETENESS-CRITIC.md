# Batth Analysis — Completeness Critic

**Role:** adversarial completeness review of everything under `docs/batth-analysis`.
**Date:** 2026-06-21.
**What I read:** the 5 top docs (`SAVINGS-METHODOLOGY.md`, `DATA-DICTIONARY.md`,
`DECISION.md`, `REPORT.md`, `BUY-LIST.md`), `dashboard-surfacing.md`, the 3 `brief-*.md`,
the 2 `gap-*.md`, all 16 `methodology/*.md`, all 7 `findings-deep-*.json`, all 6 shallow
`findings-*.json`, the normalized dataset (`inventory.json`, `billing.json`,
`manifest.json`, `meters.json`, 186 `by-meter/*.json`), and a sample of the 183 `meters/*.md`
dossiers. I re-derived the disputed numbers directly from the JSON.

**Verdict:** the *deep* doc set (the 5 top docs + `methodology/*` + `findings-deep-*.json` +
`dashboard-surfacing.md` + `gap-*.md` + the 183 dossiers) is internally strong, ground-truth-
compliant, and well-cited. **The damage is concentrated in (1) the 6 leftover shallow
`findings-*.json` files, (2) `REPORT.md`, and (3) an unreconciled headline-dollar gap between
the master doc and the deep findings JSON.** These are stale/superseded artifacts that were
never deleted or marked, and they actively contradict the ground truth this analysis is built
to protect. Fix the prioritized list below before any of this is shown or shipped.

---

## TOP 5 GAPS (prioritized — fix these first)

### GAP 1 — The 6 shallow `findings-*.json` files are stale, un-traced, and violate ground truth. DELETE or mark SUPERSEDED.
The non-`deep` findings files are a pre-deep first pass that was never removed. They:
- carry **NO `formula` and NO `computedBy`** on any finding (every `findings-deep-*.json`
  has both), so they are un-auditable by the analysis's own standard;
- carry **NO deterministic-vs-AI statement** (all 16 `methodology/*` and all 7 deep files do);
- **perpetuate the 12,180 kW artifact as a load-bearing claim**, not a debunk
  (`findings-account-entity-nema-structure.json`: "12,180 kW array fleet", "5×1092 + 8×840 =
  12,180 kW", a **$120,000** "fragmented arrays" estimate explicitly scaled off it);
- **present P031 recovery as banked headline dollars**, the exact thing the ground truth
  forbids: `findings-solar-nem-trueup.json` has `headlineTotalRecoverableUsd: 57501` and a
  finding `usd: 57501`; `findings-account-entity-nema-structure.json` books `58414` recoverable
  on P031. The deep file (`findings-deep-solar-nem.json`) correctly books P031 at **$0 / contingent**.

Sum of dollar fields in the shallow set (~$351k) vs the deep set ($4,711) vs the master-doc
defensible ($572). Re-derived totals:

| Shallow file | formula? | computedBy? | Σ dollar fields | Worst over-claim |
|---|:--:|:--:|--:|---|
| `findings-account-entity-nema-structure.json` | no | no | **$223,552** | $120k on 12,180 kW; $58,414 on P031 |
| `findings-solar-nem-trueup.json` | no | no | **$63,501** | `headlineTotalRecoverableUsd: 57501` (P031 as banked) |
| `findings-demand-charge-exposure.json` | no | no | **$51,087** | demand booked as recoverable (deep file = $0) |
| `findings-idle-standby-meters.json` | no | no | **$6,447** | over-counts demotable meters |
| `findings-rate-schedule-arbitrage.json` | no | no | **$3,617** | the suppressed AG-C→AG-B artifact |
| `findings-bill-audit-anomalies.json` | no | no | **$2,866** | includes the falsified ~$795 HAGA2 line |

**Run next:** delete the 6 shallow `findings-*.json`, OR prepend a `"_status":"SUPERSEDED by
findings-deep-*.json; do not cite"` and strip the dollar fields. Grep to confirm nothing else
references them.

### GAP 2 — `REPORT.md` still ships the discredited numbers (12,180 kW; $63,792; $41k/$22k P031 double-count). It is superseded but undeleted.
`DECISION.md` line 3 says "This supersedes the auto-generated `REPORT.md`" and lists exactly the
three errors REPORT contains (the 12,180 kW misread, the P031 double-count booked twice as
"$41k + $22k = $63,792", and conflating "investigate" with "bankable"). **But `REPORT.md` is
still in the directory, unmarked**, presenting "$63,792 TOTAL DEFENSIBLE", "12,180 kW", "$41,000"
and "$22,000" as findings. A reader who opens `REPORT.md` first gets the wrong story. It is also
the only top doc still claiming the demand exposure is **$5,939.40** (see Gap 4).

**Run next:** delete `REPORT.md`, or prepend a hard banner: "SUPERSEDED by DECISION.md and
SAVINGS-METHODOLOGY.md — every number in this file is wrong (12,180 kW, $63,792 double-count).
Retained only for provenance." Same treatment for the stale `batth-real-billing.json` if it is
kept (it is the source of the $5,939.40).

### GAP 3 — The headline bankable dollars do not reconcile across docs (8× spread), and there is a residual cross-category double-count of P072.
Three "current" docs give three different bankable/defensible totals for the **same** account
and **same** levers, with no reconciliation table tying them together:

| Source | "bankable now" | "defensible" | basis |
|---|--:|--:|---|
| `SAVINGS-METHODOLOGY.md` (master) | **$271.74** (P072 only) | **~$572** (+ $300 AG-A2) | 1 idle meter banked; everything else "contingent" |
| `findings-deep-*.json` (Σ totals) | — | **$4,711.08** | idle $1,795.94 + rate-opt $843.48 + bill-audit $2,071.66 |
| `DECISION.md` | **~$5,000/yr** | up to ~$8–10k | "6 idle AGC → $1,629" + "$2,867 bill-audit" + "$543 arbitrage" |

The master doc treats only **P072** as bankable and relegates the other 5 idle-AGC demotes,
the 2 AGB demotes, and the **entire $2,071.66 P027 bill-audit** to "contingent." But
`findings-deep-idle-standby.json` books **$1,795.94** (6 AGC×$271.74 + 2 AGB×$82.75 = P075,
P008, P072, P077, 2 unlabeled, plus AGB 4698006011 & P057) as banked `totalAnnualUsd`, and
`findings-deep-bill-audit.json` books **$2,071.66** as banked. These are not "contingent" in the
deep JSON. Pick one ground truth and make every doc agree.

**Residual double-count (the master doc claims "NOT double-counted" — it still is, across the
deep JSON):** `findings-deep-rate-optimization.json` finding R1 books **$543.48 = "PUMP #55 +
P072 × $271.74"**, and `findings-deep-idle-standby.json` separately books **P072 at $271.74**.
**P072's single AG-C→AG-A1 customer-charge differential is counted in both the rate-optimization
total and the idle-standby total.** Same meter, same formula
(`($1.43343 − $0.68895)×365`), two category totals. The two deep files do **not** cross-
reference each other, and `findings-deep-idle-standby.json` has **no `computeNote`/`scope`**
explaining its relationship to rate-opt R1 (every other deep file has a scope/$note). The
master doc's §4 "Why this is NOT double-counted" asserts the two findings "touch different
meters (idle P072 vs. the low-load-factor AG-A2 meter)" — but the idle/rate-opt overlap is
P072 vs P072, not P072 vs the AG-A2 meter. The assertion is about the wrong pair.

Also note: `gap-interval-data.md` agrees with the master doc that only **$543.48 (2 small
pumps)** is defensible-now for idle-AGC and the larger pumps (P075/P008/P077) are "likely >35 kW
in summer; ratchet unobservable" → **not** bankable. So `findings-deep-idle-standby.json`'s
$1,795.94 contradicts both the master doc AND `gap-interval-data.md` from inside the deep set.

**Run next:** add one canonical "RECONCILED TOTALS" table (single source of truth) and make
`findings-deep-idle-standby.json` carry an explicit `scope`/`computeNote` that (a) caps banked
idle-AGC at the 2 small pumps and demotes P075/P008/P077 to contingent, and (b) flags that P072
is shared with rate-opt R1 so it is booked once. Then re-derive every `totalAnnualUsd`.

### GAP 4 — The demand-charge exposure has two different "engine-verified, matches the bills exactly" values ($5,939.40 vs $6,058.73), unreconciled.
- `batth-real-billing.json` (old pipeline) → `totalAnnualDemandChargeUsd_latestCycles = 5939.40`.
  Cited as exact in `REPORT.md`, `DECISION.md`.
- `normalized/billing.json` (new pipeline) → `totalDemandCharge_structuredUsd = 6058.73`.
  Cited as exact in `SAVINGS-METHODOLOGY.md`, `methodology/cat-demand-charge.md`,
  `methodology/why-demand-charge.md`, `methodology/data-bill.md`, `gap-interval-data.md`,
  `findings-deep-demand-charge.json`.

Both are described as "matches the bills exactly." They differ by **$119.33**. No doc explains
the delta (likely the new pipeline picks up a long tail of small structured demand lines — e.g.
the `$0.31`, `$0.38`, `$3.01` rows visible in the JSON — that the old "latestCycles" rollup
dropped). Until reconciled, one of the two "exact" claims is false.

**Run next:** diff the two demand rollups meter-by-meter, document which is correct and why,
then purge the loser (and the doc lines citing it). Almost certainly $6,058.73 is the keeper
and `batth-real-billing.json` / `REPORT.md` / `DECISION.md` need updating.

### GAP 5 — 3 billed meters have data but NO dossier, and the entity/billed/cycle counts drift across docs.
**Missing dossiers:** the 3 billed-not-in-inventory SAs — **4691715828 (PUMP 73)**,
**4697631144**, **4698006011** — have `normalized/by-meter/*.json` cuts (so `by-meter/` = 186 =
183 + 3) but **no `meters/*.md` dossier and no `manifest.json` entry** (both = 183). This is
acknowledged in `DATA-DICTIONARY.md` §7.2, but the dossier set is still incomplete for them —
and they are not inert: `findings-deep-idle-standby.json` books 4697631144 (+$271.74) and
4698006011 (+$82.75), and `gap-interval-data.md` lists 4691715828 and 4697631144 as demotion
candidates. **Findings cite meters that have no dossier.**

**Count drift (same quantities, different numbers across docs):**
- **Billed SAs:** "46 metered SAs" (bill/master/DATA-DICT) vs "45 inventory rows on the account"
  (DATA-DICT §7.1, gap-other-accounts) vs "43 joined" (`meta.billed=true`). All three are
  internally explained, but `DECISION.md`/`REPORT.md` headline "46 billed meters" while the
  engine ran over 43 — worth one reconciling sentence wherever "46" appears as the analyzed set.
- **Entities:** ground truth says **6**; inventory has exactly **6 distinct billing-name
  strings** (incl. the `BATHH` typo) + 1 null-name row; `DATA-DICTIONARY.md` says "~6 (5 after
  folding the typo; +1 null)"; `gap-interval-data.md` says "**7 billing-name strings** (~6 legal
  entities)" — but there are **6** name strings, not 7. Pick "6 billing names = 5 distinct
  entities after folding BATHH, plus 1 null row" and use it verbatim everywhere.
- **Reconciliation:** `DATA-DICTIONARY.md` §8 calls `$86,942.12` "(RECONCILED)" flatly, but
  `normalized/billing.json` shows `sumOfAllCyclePrintedTotalsUsd = 86914.54`,
  `headerVsCycleSumGapUsd = 27.58`, and only **39 of 52 cycles reconciled (22 escalated)**. The
  "cent-reconciled" framing should disclose the 39/52 reconciled split and the $27.58
  header-vs-sum gap.

**Run next:** generate `meters/*.md` + manifest entries for the 3 billed SAs (or state once,
prominently, that they are intentionally dossier-less); add a "$86,942.12 = header running
balance; $86,914.54 = Σ cycle totals; 39/52 reconciled, 22 escalated, $27.58 gap" note; and
normalize the entity/billed-count phrasing across all docs.

---

## Secondary findings (fix after the top 5)

- **`brief-*.md` not validated:** I did not deep-read the 3 `brief-*.md` (demand-charges,
  nem-nema, pge-ag-rates). They are background references; confirm their rate constants
  (e.g. AG-C `$1.43343/day`, AG-A1 `$0.68895/day`, NBC `~$0.023/kWh`) match
  `fixtures/pge-ag-rate-card.json` and the formulas in `findings-deep-*.json`. A mismatch here
  would silently corrupt every idle/rate dollar.
- **Rate-card provenance honesty:** `00-how-savings-are-computed.md` correctly flags that summer
  energy, partial-peak, AG-C peak demand, and AG-4 figures in the rate card are
  "representative placeholders awaiting the official tariff sheet." None of the booked Batth
  dollars depend on the placeholders (all are winter customer-charge / printed-demand based), but
  no single doc states "every *banked* dollar uses only bill-sourced rate-card values, zero
  placeholders." Add that sentence so the placeholder caveat can't be weaponized against the
  banked numbers.
- **P027 NBC rate is a round number:** `findings-deep-bill-audit.json` computes the $2,071.66 as
  `2461.49 − (16949 × 0.023)`. The `0.023` NBC rate is the same "~$0.023" used elsewhere as an
  approximation; the bill-audit dollar is presented to the cent but rests on an approximate NBC.
  Label it a ceiling (it already says "MEDIUM confidence" in the master doc — make the JSON match).
- **`build-utilityapi-pretty.py` / `_build_billing.py` not executed:** the builders are described
  as re-runnable but I did not run them; if the demand-rollup fix (Gap 4) lands, re-run and
  confirm the JSON regenerates the kept value.
- **AI-vs-deterministic is clear in the deep set, absent in the shallow set:** every
  `methodology/*` and `findings-deep-*` states the boundary; the 6 shallow files state nothing.
  Deleting them (Gap 1) closes this; if any shallow file is kept, it must carry the boundary line.

---

## What is GOOD (do not regress)

- All 7 `findings-deep-*.json` carry `formula` + `computedBy` on every finding. Good.
- All 183 inventory meters resolve to exactly one dossier (124 by pump ID, 59 by SA ID), 0
  missing, 0 orphan — verified against `manifest.json`.
- The 183 `meters/*.md` dossiers correctly **debunk** the 12,180 kW artifact (the ~40 that
  mention it do so as "NOT 12,180 kW").
- P031 is a consistent **$62,795.65** everywhere; the deep solar/structure/bill-audit files
  correctly book its recovery at **$0 / $0–$57k contingent**, never banked.
- `SAVINGS-METHODOLOGY.md`, `dashboard-surfacing.md`, `gap-*.md`, and `methodology/*` are
  ground-truth-clean (1,932 kW; deterministic-not-AI; intervals-gated rate-opt; P031 contingent).
- The demand-charge deep total is correctly **$0** (exposure is note-only, not at-risk savings).

---

## One-paragraph "run next" summary

1) Delete or hard-banner the **6 shallow `findings-*.json`** and **`REPORT.md`** (+ stale
`batth-real-billing.json`) — they carry the 12,180 kW artifact, the $63,792 double-count, and
P031-as-banked. 2) Add **one canonical RECONCILED-TOTALS table** and make
`findings-deep-idle-standby.json` cap banked idle-AGC at the 2 small pumps + flag the **P072
double-count shared with rate-opt R1**, so the deep totals stop contradicting the master doc and
`gap-interval-data.md`. 3) Diff the **two demand rollups ($5,939.40 vs $6,058.73)**, keep one,
purge the citations to the other. 4) Generate dossiers/manifest entries for the **3 billed SAs
(4691715828, 4697631144, 4698006011)** that findings already cite. 5) Normalize the
**entity (6 names / 5 entities + null), billed-SA (46 vs 45 vs 43), and reconciliation (39/52,
$27.58 gap)** phrasing across all docs.
