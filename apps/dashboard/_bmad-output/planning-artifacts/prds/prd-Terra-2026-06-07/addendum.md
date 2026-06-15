# PRD Addendum — Terra Tool 1

_Depth the user contributed during discovery that belongs to downstream work
(data model, architecture, fixtures) or earned a place but does not fit the PRD's
main narrative. Captured live; not the PRD itself._

---

## A. Batth master spreadsheet — real-data shape (the rebuild's fixture target)

The grower's master spreadsheet is the **inventory layer** (the meter / entity / ranch
catalog) for customer zero (Batth) — it puts all 183 meters on screen instantly, by
entity and ranch, with real pump names, day one. It is NOT the billing-data source;
billing comes from PG&E bill PDFs (see §C). The spreadsheet's **`SA ID` column is the
join key** linking each PDF's per-service-agreement charges to its inventory row (pump
name, rate, ranch, crop, solar). Not reachable from the build session; structure
documented here so the import path and data model are built to it. One sheet, `All`,
183 meters.

**Hierarchy:** entity → account → meter (and, for rollup, entity → account → ranch → meter).

**Sizing (real counts):**
- **7 billing-name variants** — multiple legal entities plus a couple of typo'd
  duplicates that must be deduped to true entities.
- **57 distinct account numbers** (PG&E account #s).
- **183 meters.**
- **~83 meters on HAGC**; remainder spread across AG5B / AG5C / AG4C (legacy),
  HAGA1 / HAGA2 / HAGB, and one-offs.
- **27 meters flagged Legacy (Y)** — the live wrong-rate surface.
- **~56 meters with solar**, linked to arrays via NEMA codes, per-array True-up.
- **37 ranches.**

**Per-meter fields (column inventory):**
Billing Name · Actual owner · Full Acct # · SA ID · Meter # · Pump ID (e.g. `P017`) ·
Active Rate Schedule · Legacy (Y/N) · Existing descriptor (the real grower name,
e.g. `PUMP # 17`) · lat/long · Solar · NEMA · True-up · Contiguous · GPM · Crop ·
Installed on · Irrigation · RANCH · Status.

**Field notes that shape features / the data model:**
1. **Rate schedule is a populated per-meter field — read it, never infer.** The mix is
   messy and legacy-heavy (see counts). 27 Legacy-flagged meters are a live wrong-rate
   surface to lead with.
2. **Solar/NEMA is real and per-meter.** ~56 meters carry solar; NEMA codes link arrays
   to benefiting meters; True-up is per-array. The data model needs explicit
   **array → benefiting-meter** relationships, not flat meters. (`Contiguous` ties to
   NEMA aggregation's same/adjacent-parcel eligibility.)
3. **37 ranches + a `Status` column (GOOD / BAD / NEW WELL / OLD).** Rollup is
   entity → account → ranch → meter, with **meter/pump health tracked** as first-class.
4. `Actual owner` is distinct from `Billing Name` (legal billing entity vs. real owner) —
   the entity model should carry both.
5. `Existing descriptor` is the grower-facing real name (`PUMP # 17`) — surface this, not
   the synthetic seed names (`Westside Pump 17`), which are disposable per project-context.

_Wexus screen-by-screen analysis and the Product & UX research doc are held by the user
for the Features stage._

---

## B. Resolved corrections (from discovery grounding research)

- **TOU clocks are separate.** AG **rate** TOU peak = **5–8pm year-round** (drives the
  demand-charge math). **4–9pm** = the **PDP/DR event** window (drives DR math/copy). Keep
  them on separate clocks in both math and copy. Surface the retrospective insight: solar
  output collapses before the 5–8pm peak, so a meter can be net-zero on energy and still
  owe the full demand charge.
- **Bayou is PARKED, not primary (changed in discovery, supersedes earlier "Bayou /
  Green Button / Share My Data as the real path").** Bayou responded but isn't functional
  for Batth's accounts yet. The one-account-scope question is moot for now (re-verify
  against the live PG&E flow if/when revisited). The v1 real-data path is **PG&E bill
  PDFs** — see §C. Bayou / Green Button is the *destination* the PDF path normalizes
  toward, not the v1 source. (Batth's 57 accounts span multiple legal entities and likely
  multiple PG&E logins, which multi-account-per-login would not cover anyway.)

---

## C. Real-data ingestion path (v1) — PDF-first, normalized to one billing shape

The v1 real-data path, current as of discovery:

1. **Source = PG&E bill PDFs.** Batth's assistant pulls "download my data" from PG&E
   (the export spans all accounts) and sends the PDFs. v1 ingests those. This is the
   bridge; Green Button / Bayou is the destination.
2. **Two layers, joined on `SA ID`:**
   - **Inventory layer** = the master spreadsheet (all 183 meters, by entity/ranch, real
     pump names, rate, crop, solar) — on screen day one, complete.
   - **Billing layer** = parsed PDF line items (per-service-agreement charges, demand,
     usage, totals), attached to each inventory row via the `SA ID` join key.
3. **One PDF → many service agreements from the start.** Accounts are lopsided (one has
   45 meters, one has 36), so the parser must fan a single PDF out to many SA-level
   charge sets immediately — not a one-bill-one-meter assumption.
4. **Normalize the PDF output AND the future Bayou adapter to one canonical billing
   shape**, so nothing downstream changes when Bayou comes online. The dashboard, math,
   and recs read the canonical shape, never the raw source.
5. **Reconciliation guardrail (trust surface):** a number renders in the product **only
   if** its extracted line items reconcile to the bill's printed total **within one cent**;
   otherwise it is withheld and flagged **"needs review."** Prove the parser on **one
   account before bulk.**
6. **Launch reality:** full inventory is present day one (183 meters); billing data is
   **partial at launch** because PDF parsing starts proven on one account and expands.
   The dashboard must be correct and legible with partial billing coverage — show the
   complete inventory picture while billing fills in.

### C.1 Confirmed bill mechanics (verified against the real Batth account)

- **The bill is a SCAN, not a digital PDF.** This account's "download my data" export is a
  **101-page scanned image PDF — no text layer, bilevel, 200 DPI.** Extraction is therefore
  **vision/LLM → strict JSON**, not text parsing. Scan quality is rough (faint, skewed,
  handwriting overlaid), so **OCR errors are expected** — the one-cent reconciliation
  guardrail (A4 / FR for reconciliation) is the mechanism that catches them.
- **Parser must CLASSIFY page type before extracting.** Page types observed:
  1. payment-confirmation pages,
  2. account summary,
  3. **per-SA summary list** (one line per meter: SA ID, meter #, Pump ID, kWh, $),
  4. **per-SA regular charge detail** (rate schedule, TOU energy split, demand charge),
  5. **per-SA NEM reconciliation tables** (monthly rows + true-up; **NEM meters show
     negative usage**).
- **What the bill carries per service agreement (so read-the-rate AND TOU charts are
  feasible from the scan):**
  - **Rate schedule name printed** (e.g. `AG5B Large Time-of-Use Agricultural Power`) —
    read it from the bill; cross-check against the master sheet's `Active Rate Schedule`.
  - **Meter # + Pump ID**, joined to the inventory row via `SA ID`.
  - **TOU energy split** (Net Peak / Part-Peak / Off-Peak kWh) with charges. **Handle both
    two-tier (current schedules) and three-tier (legacy, e.g. AG5B shows Part-Peak) TOU.**
  - **Demand charge** and **non-bypassable charges** on separate detail pages.
- **History:** a single export **bundles multiple months** (one NEM table showed 7 monthly
  rows), so **YoY is feasible from one download.** The canonical billing shape is
  **multi-period** by design; v1 is not blocked on full history.
- **NOT extractable from the bill:** 15-minute interval data, and **when** the demand peak
  occurred. **v1 demand analysis stays cycle-level** ("$X demand on a Y kW peak") — no
  intra-day curve. (Interval data is a Green Button / Bayou capability, deferred.)
- **Scale reality:** one account = 101 scanned pages; bulk across all 57 accounts is
  **thousands of pages — a real pipeline.** v1 proves the parser on this single account;
  **bulk extraction is explicitly deferred.**
