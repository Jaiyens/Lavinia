---
name: Terra
status: final
sources:
  - {planning_artifacts}/prds/prd-Terra-2026-06-07/prd.md
  - {project-root}/_bmad-output/project-context.md
  - {project-root}/docs/product-ux-research.md
  - {planning_artifacts}/pge-billing-cycle-problem-analysis-2026-06-17.md
  - {planning_artifacts}/ux-designs/ux-billing-cycle-2026-06-17.md
updated: 2026-06-17
---

# Terra — Experience Spine

> Tool 1 (PG&E energy) built as the first agent inside a farm operating system. Multi-surface: mobile core, tablet/desktop power surface. `DESIGN.md` is the visual identity reference; this spine owns how it works. North star: the grower *feels he can see his whole farm and knows what is happening on it.* Spine wins on conflict with any mock or upstream doc.

## Foundation

Multi-surface. **Mobile is the core** (the grower is on a phone in a truck); **tablet/desktop is a power surface** (the dense table and three-zone layout). No third-party UI system is named; Tailwind + CSS-variable tokens from `DESIGN.md`. Server Components by default; the shell, lenses, drawer, and findings rail are one app.

**Planner, not live meter.** PG&E data lags ~1 day. Nothing in this experience promises real-time spike detection or "run your pumps now."

## Information Architecture

The shell is a three-zone **inverted-L + copilot**. The same shell wraps every agent; today only the Energy agent is live.

| Zone | Surface | Reached from | Purpose |
|---|---|---|---|
| Agent rail | Home | App open (session) | Cross-agent roll-up; today ≈ the Energy dashboard |
| Agent rail | Energy | Rail / Home | The PG&E tool: hero + lenses + findings |
| Agent rail | Water / Labor (coming) | Rail | Visible-but-disabled; sells the OS, not yet built |
| Center | Lens: Chart | Default face of Energy | TOU-stacked cost over time + YoY |
| Center | Lens: Table | Lens toggle | Dense sortable/filterable meter table |
| Center | Lens: Map | Lens toggle | Geotagged meters, pins colored by $-at-risk |
| Center | Lens: Calendar | Lens toggle | Billing-cycle close per meter: forecast (scheduled) + posted (actual) closes, grouped by ranch/entity |
| Home | Next-close line | Below findings | One quiet line: the soonest upcoming close + count this week. Not a card; Rate Fix stays the hero |
| Overlay | Meter drawer | Any bar / row / pin | One meter's full detail; shared across lenses |
| Overlay | Open-cycle standing sheet | Tap a scheduled (forecast) close | Where this open cycle stands: highest pull so far, "as of [date]"; no dollar figure |
| Right | Findings rail | Persistent | Agent findings: money, rate fixes, propose→approve |
| Entry | Login | Cold open, no session | Google SSO / magic link |
| Entry | Connect data | New / no data | Onboarding: pick a source, choose accounts |
| Entry | Sample | "Tour a sample" | Badged representative dashboard, no commitment |

- **Left rail lists agents, not features.** Desktop = left rail; mobile = bottom tab bar.
- **Center shows one lens at a time** over a single meter dataset, with a compact KPI strip above it. Chart is the default.
- **Right rail is persistent** on every agent screen; on mobile it collapses to a peeking bottom sheet.
- **Home = the Energy dashboard today**, and grows a thin cross-agent strip above the hero when a second agent ships (keyed off `Recommendation.tool`).

→ Composition reference: `mockups/` (rendered at Finalize). Spine wins on conflict.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md.Brand & Style`. Plain operator English; the grower's words, not the meter's.

> **kW is cut from every surface; "demand charge" becomes "one short spike."** (Ruling 2026-06-17, makes the relay/billing-cycle language canonical.) The bill terms "demand charge" / "kW" survive **only** as a faint sub-label inside the meter drawer's evidence rows, never on home, findings, the calendar, or any headline.

| Do | Don't |
|---|---|
| "Pump 21 pulled hard for about 15 minutes. That one spike set $2,783 of this month's bill." | "Pump 21 set a 279 kW peak / $2,783 in demand charges." "Coincident peak demand exceeded threshold." |
| "A $62,795 solar true-up posted in March." | "NEM annual reconciliation event detected" |
| "3 meters look mis-rated." | "Rate optimization opportunities available!" |
| "We could not read this meter from the bill. Confirm it." | "OCR extraction error" |
| "Connect PG&E, or drop in a bill." | "Authorize your utility data integration" |
| Blocks, sets, hours, acres, pumps, ranches. | kW, "15-minute interval," "AG-A1 tariff schedule" on the surface. |
| "Sandhu Ranch bill closes Friday the 20th." | "Meter-read date" / "billing cycle close" / a serial code. |
| "Highest pull so far this cycle was Tuesday." | "Max demand" / "peak kW" / "coincident peak." |
| "Expected — PG&E may read on a slightly different date." | A false-precise forecast presented as certain. |
| "as of [the last read we have]" on any cycle-standing figure. | "as of yesterday" hard-coded, or implying a standing figure is live. |
| Plain sentences. No em dashes. | Exclamation marks. Salesy verbs. Jargon. |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Agent rail | Shell | Active agent highlighted. Future agents non-interactive, tagged "coming." Mobile → bottom tab bar. |
| KPI strip | Above lens | 3 compact cards (spend, spike risk, biggest mover). Tap a card filters/scrolls the lens to its driver. Never a lone hero number. No projected/forecast bill card (no projection model on this runway; planner, not live meter). |
| Lens toggle | Center | Chart default. Switching lenses never loses the active entity/filter or the open drawer. |
| Cost chart | Chart lens | Click a bar → drawer for that meter/period. TOU stack + YoY toggle. |
| Meter table | Table lens | Sort by any column; filter by entity / ranch / rate. Row click → drawer. Concerning values tinted `alert`. CSV export respects active filter. |
| Meter drawer | All lenses | Opens from any bar / row / pin. Same content regardless of source lens. Closes to the lens it came from, state intact. |
| Farm map | Map lens | Zoomable. Pin color = $-at-risk (green → clay). Tap pin → drawer. Renders from inventory even on partial data. |
| Calendar lens | Calendar lens | Month grid of cycle closes, grouped by ranch/entity. **Actual (posted) and scheduled (forecast) closes are never conflated** — actual = solid; scheduled = hollow/"expected" (`AR-14`, enforced in `calendar.ts`). A "today" marker separates past from forecast. Tap an actual close → drawer; tap a scheduled close → open-cycle standing sheet. Forecast closes carry one blanket PG&E caveat ("may read on a slightly different date"), shown once, not per chip. Never present a demo (MR-xx) forecast as posted truth. |
| Next-close line | Home | One sentence below findings: soonest upcoming close (ranch + plain **expected** date) + count this week, framed as a forecast, not a certainty. Escalates to a second `watch` clause (typography + clay, never red) **only when an open cycle is "running hot" — defined as peak-to-date above that meter's trailing-cycle median by a ratified margin, from a tested pure function, suppressed when fewer than 3 prior cycles exist (no threshold ⇒ no escalation, never a guess)**. "→" deep-links the Calendar lens with that month preselected. Never blank — falls back to "Next is [Ranch] on the 3rd." |
| Open-cycle standing sheet | Overlay (from a scheduled close) | "Highest pull so far this cycle was [date]" with an explicit "as of [the latest read we hold]" label — the real held date, **never the literal word "yesterday"**; if that read is more than ~2 days stale the sheet says so plainly rather than implying freshness. Retrospective and day-lagged, never live or projected. **The one steer asserts no future fact and is shown only when the read is ≤1 day old and the cycle is still open** ("this cycle's peak isn't locked until it closes Friday, so easing off before then still helps"); suppressed when staler or the window has effectively passed — never "run/don't run now." Traces to the drawer. **No dollar figure** — the cycle surface sells getting ahead, not savings. |
| Finding card | Findings rail | Situation + action + dollar impact + severity + one-tap response. v1 displays/records the response; never executes. Resolving a finding traces to data visible on the dashboard. |
| Connect-source picker | Onboarding | PG&E authorization / Upload bills / Upload spreadsheet. Need ≥1. Add accounts iteratively. |
| Bottom sheet | Mobile findings | Peeking summary ("N findings · ~$X ↑"); drag/tap to expand to full rail content. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold open, valid session | Shell | Straight to the dashboard. No splash, no re-onboard. |
| Cold open, no session | Login | Google SSO / magic link only. |
| Logged in, no data | Connect data | Route to the source picker, not a dead end. |
| Reveal (data landing) | Home | One orchestrated staggered reveal: KPI strip, then chart, then map pins settle. Not a gimmick; the dashboard assembling itself. Honors reduced-motion (instant). |
| Partial import | Lens + drawer | Show what we have; unreadable fields flagged in the drawer with "Confirm it," never blank-faked. Map renders known pins; unlocated meters listed in a "no location yet" tray. |
| Couldn't read a bill | Confirm step | Surface the specific fields; let the operator correct inline. |
| Representative (demo) data | Whole shell | Persistent "Representative data" badge; never presented as the grower's own. A real connected farm outranks and replaces it. |
| Empty findings | Findings rail | "Nothing needs you right now." Calm, not an empty-state apology. |
| Filtered to zero | Table / map | "No meters match." Clear-filter affordance. |
| Live pull pending | Findings rail / header | "PG&E is connecting. Your bills are already in." Async honesty; never block the dashboard on the LOA. |
| Unresolvable cycle serial | Calendar lens | No scheduled chip for that meter; it appears only when a real bill posts. Never invent a close. KPI counts only resolvable meters; footnote "plus N we can't forecast yet." |
| No interval data this cycle | Standing sheet | Drop the "highest pull so far" line and any steer; keep only "this cycle closes Friday the 20th." Silence beats a fabricated peak. |
| Forecast close (any) | Calendar lens | Always "expected," carrying PG&E's blanket "may shift a day" caveat. A demo (MR-xx) forecast is never styled as posted truth; **provenance (real B–Z vs demo MR-xx) rides as a structural field on the calendar model, not inferred from the shell badge alone**, so a synthetic forecast can never render pixel-identical to a posted close. |
| Cycle data lag | Standing sheet | The "as of" date = the latest interval we hold, computed, never assumed "yesterday." |
| Focus | All inputs | Native focus; hairline → `primary` per `DESIGN.md`. |

## Interaction Primitives

- Tap / click to act. One primary action per screen.
- The lens toggle and the drawer are the two core moves; everything drills into the one drawer.
- Map: pinch/scroll to zoom, tap a pin to drill. Table: tap a header to sort, a row to drill. Chart: tap a bar to drill.
- Mobile findings: drag the bottom sheet up to expand, down to peek.
- Long-press reserved for system text selection.
- **Banned:** carousels, autoplaying hero animations on every open (the reveal fires once per data-landing, not per visit), badge-count anxiety, push re-engagement, real-time "spike now" alerts.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

- Every interactive element labeled with role + state for screen readers. The lens toggle announces the active lens; the drawer announces the meter it opened. **A calendar chip announces its meter/ranch and "posted" vs "expected"; the next-close line announces as a link to the Calendar lens (and reads its `watch` clause when present); the standing sheet announces as a dialog with its meter title and "as of [date]."**
- **Color is never the only signal.** $-at-risk on map pins and table cells pairs the `alert` clay with a value/label; severity pairs color with a text badge. A grower who cannot distinguish green from clay still reads the dollars. **Forecast vs posted closes differ by shape and text, never color/fill alone: scheduled chips are hollow and carry an "expected" token; posted chips are solid and carry a dated value in their accessible name. Every cycle-standing figure carries its "as of [date]" as text.**
- Tabular figures and `DESIGN.md` type scale must stay legible at the largest dynamic-type setting; no truncated dollar values. **Dates and the next-close sentence (not only dollars) must wrap and stay legible at the largest type; no truncated close dates or "as of" labels. A phone day-cell that would otherwise pack chips below 44pt collapses to a single count chip opening a day list, never shrinks the chips.**
- Reduce Motion: skip the staggered reveal and lens transitions; render final state immediately.
- Tap targets ≥ 44pt. Focus traversal follows reading order: KPI strip → lens → findings rail (→ drawer when open).
- Plain-language microcopy is itself an accessibility floor for a low-software-literacy operator.

## Onboarding & Connection (invented — product-specific)

Value-honest, operator-operable. The dashboard is the pitch; onboarding just gets data in. **Not** a scripted reveal.

1. **Identify** — farm name + contact. Operable by the operator (Jaiyen) on behalf of the grower.
2. **Connect a data source** — pick how, choose how many accounts:
   - **Connect PG&E** (Share My Data authorization / LOA) → pulls authorized accounts, stays current.
   - **Upload bills** (one per account) → we read meters, rates, cost, and location off each.
   - **Upload meter-master spreadsheet** → bulk inventory across accounts (optional accelerator).
   - Gate = one real source (PG&E authorization **or** billing). No PG&E? skip it. No spreadsheet? optional. Add accounts anytime.
3. **Confirm** — only what we could not read; correct inline.
4. **Land in the dashboard.** The grower decides by using it.

- The **LOA is an upgrade, not a toll** ("so you never upload a bill again"), surfaced after value, never as the entry gate. In v1, bill upload is the workhorse; the live pull (PG&E authorization / Bayou) may be staged. `[OPEN]`
- We never ask the grower to type address/city/zip/phone that is printed on the bill they upload.
- "Tour a sample" opens the badged representative dashboard with zero commitment.

## The Findings Rail (invented — agentic)

The persistent right rail is where the agent earns trust beside the data.

- Each finding follows the grammar: **situation + action + dollar impact + severity + one-tap response + after-the-fact result.**
- Findings **trace to data visible on the dashboard** — a finding about Pump 21 highlights its map pin / table row when focused.
- v1 **displays and records** the response; the action is shaped to be executed by the agent later but never runs now.
- Severity: `act` (clay), `watch` (typography only), `info` (muted). The rail is calm by default; it is not a to-do list.

## Map & Geometry (invented — product-specific)

- Pins come **from the bill**: PLSS legal descriptions ("NW NE 33-16-19" → Section/Township/Range/aliquot centroid via BLM PLSS) and street addresses (geocoded). No Bayou needed for geometry.
- Pin **color = dollars at risk / attention**, not vanity health. Tap → the shared drawer.
- Meters without resolvable location appear in a "no location yet" tray, never silently dropped.
- The map renders fully from inventory on day one and on partial-billing data.

## Inspiration & Anti-patterns

- **Lifted from Stripe / Linear / Ramp:** card → chart → table → drawer hierarchy; the inverted-L shell; a persistent copilot rail for findings.
- **Lifted from Wexus (the energy substance):** TOU-stacked cost charts, per-meter disaggregation, the geotagged meter map.
- **Rejected — the attached future-vision mock's density:** the 12-widget wall (five stat cards + NDVI + map + alerts + weather + cameras) and vanity metrics (soil %, crop health %). We keep its skeleton (shell + map + drill-in), not its skin.
- **Rejected — Wexus onboarding:** signup → verify → password → legal form → "come back in days," with value shown never. We invert: value (the dashboard) is immediate; the LOA is an opt-in upgrade.
- **Rejected — a scripted "watch your farm appear from one bill" reveal:** wrong for a post-demo or operator-led signup. The dashboard sells itself; no theater.

## Responsive & Platform

- **Mobile core:** bottom tab bar (agents) · full-width KPI strip + lens (chart / map / simplified sortable list) · meter drawer as a full-height sheet · findings as a peeking bottom sheet. The dense multi-column table degrades to a simplified sortable list.
- **Tablet/desktop power surface:** the full three-zone inverted-L; the dense table in its full width; findings rail always visible.
- The map and drawer behave identically across surfaces; only the chrome (rail vs tab bar, rail vs sheet) changes.

## Key Flows

### Flow 1 — Returning grower, morning (Gagan, in his truck, before the crew starts)

1. Gagan opens Terra. Valid session.
2. Straight to his dashboard — no login, no re-onboard.
3. The Chart lens shows this cycle's cost, TOU-stacked.
4. The findings rail shows one line: "Pump 21 pulled hard for about 15 minutes. That one spike set $2,783 of this month's bill."
5. He taps it; the map pin for Pump 21 glows clay.
6. **Climax:** in under ten seconds, on a phone, Gagan knows the single most expensive thing happening on his farm today and where it is. He feels in control before the crew clocks in.

Failure: data still syncing → yesterday's numbers show with a quiet "PG&E is connecting" note; never a blank screen.

### Flow 2 — Operator sets up a new farm on-site (Jaiyen, at Gagan's kitchen table)

1. Jaiyen opens Terra, Get started.
2. Enters Gagan's farm name and contact for him.
3. Connect data → Upload bills. Drops in Gagan's PG&E PDF (one account, ~46 meters).
4. We extract meters, rates, costs, and locations; the confirm step flags two meters with no resolvable location; Jaiyen leaves them in the tray.
5. The dashboard lands: the map fills with pins across Caruthers, the spend lands, the table fills.
6. **Climax:** Jaiyen turns the phone to Gagan and Gagan sees *his own farm* — every pump, on a map, with the $62,795 true-up already flagged in the rail. The pitch is the product.

Failure: an unreadable scan → the confirm step lists the fields; Jaiyen corrects inline; nothing is blank-faked.

### Flow 3 — Find the money (Gagan, evening, reviewing on the iPad)

1. Gagan opens the Map lens.
2. One pin is clay among the greens.
3. He taps it; the meter drawer opens on "Vines IRR 75HP."
4. The drawer shows the $62,795 solar true-up that posted in March and the cost trend that led to it.
5. He taps the finding's one-tap response to flag it for his accountant.
6. **Climax:** the line item that used to surface only as a mystery $62k jump on a 114-page paper bill is now a single legible pin he found himself. He decides he wants this.

Empty state: nothing at risk → map all green, rail reads "Nothing needs you right now."

### Flow 4 — Go deeper (Gagan, a week later, on his phone)

1. Gagan opens the findings rail.
2. "Want this to update itself every month? Connect PG&E."
3. He taps it; the Share My Data authorization is presented for e-sign.
4. He signs; the rail shows "PG&E is connecting. Your bills are already in."
5. **Climax:** he never has to photograph a bill again, and he learned that *after* the product already proved itself — not as the price of entry.

Failure / async: the live pull takes days → the dashboard keeps working on the uploaded bills; the header carries the honest "connecting" state until it backfills.

### Flow 5 — Steer toward a close (Gagan, mid-week, coffee before the crew)

1. Gagan opens Terra. Below the day's findings, one line: "Next bill close: Sandhu Ranch, this Friday the 20th. 3 more close this week." One clause is clay: "One meter is pulling harder than usual this cycle."
2. He taps the line; the Calendar lens opens on this month. Past closes are solid; Friday's are hollow, marked "expected."
3. He taps the hollow Sandhu chip. The standing sheet: "Stratford Pump 6, closes Friday the 20th. Highest pull so far was Tuesday the 17th," with a quiet "as of [the last read we have]." Because that read is current and the cycle is still open, one line below: "This cycle's peak isn't locked until it closes Friday, so easing off before then still helps."
4. He doesn't open a bill, doesn't learn a new word, doesn't see a dollar figure he'd argue with.
5. **Climax:** Gagan closes the phone and tells the foreman to ease Stratford off Thursday afternoon. For the first time he steered *toward* a bill instead of opening the mail to find out what it already cost him. He feels ahead of PG&E.

Failure: serial unresolvable or no interval data → the sheet still shows the close date; it just stays silent on standing rather than guessing.
