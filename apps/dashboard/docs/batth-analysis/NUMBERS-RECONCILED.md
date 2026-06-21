# Batth Farms — Reconciled Savings Numbers (single source of truth)

**This supersedes every other dollar figure in this folder** — including SAVINGS-METHODOLOGY.md's
$272/$572 (too conservative — it dropped 5 of 6 idle demotions and the dispute), DECISION.md's ~$5k
(a bit loose), and the moved-aside `_superseded/REPORT.md` ($63,792 — discredited). Reconciled from the
seven traced `findings-deep-*.json` after removing double-counts.

## The honest headline

The cheap, certain money hiding in this **one account's** bill is small: **~$1,800/yr** of reversible
rate fixes, plus **~$2,072/yr** more *if you win one billing dispute*. **Everything large is gated** — it
needs the $60 of interval data, a PG&E document, or the other 56 accounts' bills. The bill does **not**
contain a big pile of guaranteed savings. The demo's value is **legibility + the catch + a credible,
auditable process** — not a five-figure banked number.

## The ledger (deduplicated)

| # | Item | $/yr | Status | Needs |
|---|------|-----:|--------|-------|
| 1 | Demote ~6 truly-idle AG-C/AG-B meters → AG-A1 (reversible rate change) | **~$1,796** | **bankable now**, high conf | nothing |
| 2 | Dispute P027 — a net **exporter** charged a $2,461 NEM true-up | **~$2,072** | winnable **dispute** | PG&E must agree |
| 3 | One low-load-factor AG-A2 meter → AG-A1 | ~$300 | low conf | confirm w/ interval |
| — | **Rate optimization across the fleet (THE #1 lever)** | unquantified | **gated** | $60 interval data → 42/46 meters |
| — | Demand-charge recovery (measured exposure = **$6,058.73**) | unquantified | gated | interval data + DR enrollment |
| — | **P031 / VINES 75HP** NEM true-up ($62,795.65) | **$0–$57k** | contingent | PG&E Generation Allocation Summary |
| — | ~87 more AG-C meters + solar orphans on 56 other accounts | unsized | gated | those accounts' bills |

**Bankable now, no new data, reversible: ~$1,800/yr. With the one dispute won: ~$3,900/yr.**

## Discrepancies resolved (so the docs stop contradicting each other)

- **P072 double-count removed.** The AG-C→AG-A1 demotions were booked in *both* `idle-standby` and
  `rate-optimization`. Counted once (item 1). Rate-optimization therefore adds only the $300 AG-A2 meter,
  not $843.
- **The $795 "demand $/kW over-rate" finding was FALSIFIED** by the adversarial pass (the comparison meters
  were on different rates). Dropped — remove it from any pitch.
- **Demand exposure canonical value = $6,058.73** (round-2 `normalized/billing.json`), not the round-1
  $5,939.40. It is **exposure PG&E correctly billed, not a saving** — recovery is $0 until interval data.
- **P031 is never banked.** $0–$57k, with real zero-sum risk on the 1,932 kW arrays.
- **Demand-charge engine total = $0 recoverable** by design (exposure is note-only without intervals).

## Why this is the honest number — and still a good demo

The savings engine is **deterministic** (see SAVINGS-METHODOLOGY.md) and *refuses to claim what it can't
prove from the data in hand*. On bill data alone, the provable money is small. That refusal is the
credibility: every number is checkable line-by-line against PG&E's rate card, nothing is inflated, and the
big upside is real but honestly gated behind a $60 pull and one PG&E document. Walk in with **"we made your
whole operation legible and already found the things worth chasing,"** not **"here's $60k."** The first earns
a pilot. The second gets you caught.

## What turns the gated money real (in priority order)

1. **$60 of interval data** (5 meters) → unlocks rate optimization, your #1 lever, on up to 42 meters, and
   lets demand-charge recovery be priced. This is the highest-leverage spend.
2. **Pull the Generation Allocation Summary / Form 79-1202** for P031's arrangement → resolves the
   $0–$57k question at zero cost.
3. **Download the other accounts' bill PDFs** (free from PG&E MyEnergy) → your own vision-extraction
   pipeline lights up the other ~137 meters for $0.
