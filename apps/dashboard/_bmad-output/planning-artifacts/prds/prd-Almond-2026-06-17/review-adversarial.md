# Adversarial Review — Almond "Generative Operator" PRD (2026-06-17)

**Reviewer stance:** Hostile. The job is to find where this PRD fools itself, not to be fair. I read `prd.md`, `addendum.md`, and I went into the actual codebase (`src/lib/almond/*`, `src/lib/dashboard/csv.ts`, `src/lib/dashboard/lens.ts`, the `useQueryState` call sites, `prisma/schema.prisma`, `package.json`) to check the load-bearing claims. Several of them do not survive contact with the code.

**Verdict:** This is a well-written document that has talked itself into believing the build is mostly *reuse* and the safety boundary is mostly *settled*. Both beliefs are false. The grounding-to-generation gap, the "request-driven export" promise, and the "single source of truth" navigation claim are the three places the doc is lying to itself, and all three are load-bearing for the demo it wants to give.

---

## CRITICAL

### C1. The grounding guarantee does NOT survive the jump from chat to generated artifacts. The tools return capped summaries; a 183-row spreadsheet cannot be assembled from them without either fabrication or a net-new bulk path the PRD never admits to.

**Where:** FR8 ("No skill fabricates a number... when the data isn't present, the skill... says so"); FR13 ("a full meter spreadsheet is complete (no silent row caps)"); NFR Grounding integrity ("Fabrication rate is effectively zero — artifacts and answers are tool-sourced"); §1.2 ("every farm fact comes from a tool; it never fabricates").

**The attack:** The PRD treats "grounded in tools" as a property that transfers from chat to artifacts for free. It does not. I read the actual tool layer (`src/lib/almond/tools.ts`) and the shaping (`src/lib/almond/shape.ts`):

- `listMeters` is `z.object({ ... limit: z.number().max(50) })` and `summarizeMeters` does `filtered.slice(0, limit)` with **a default limit of 25** (`shape.ts:144-148`). The model literally cannot see 183 meters through this tool. It sees at most 50, and 25 by default, already summarized.
- `getFarmOverview`, `listFindings`, `getRatesSummary`, `getReconciliation` return *aggregates and top-N*, not row-level data.

So when a grower says "export all 183 meters as a spreadsheet," there is no honest path where the *model* composes those rows from tool output. Two outcomes, both bad:
1. The model emits rows from the truncated/summarized data it saw → the spreadsheet is **silently incomplete** or, worse, the model **interpolates the missing 158 rows** → direct violation of FR8 and FR13, and exactly the "shared-with-a-lender PDF that is subtly wrong" failure mode (C3).
2. The export skill bypasses the model and pulls rows directly from `loadMetersForFarm` → fine, but then **the model is not "grounding" the artifact at all**; it's just picking a skill, and the entire "generative, request-driven" framing (FR11/FR12) collapses to "the model chooses one of N pre-built deterministic exporters." That is a *much* smaller, much safer feature than the doc describes — and the doc never says which architecture it is buying.

**This is the central unresolved decision in the whole PRD, and it is presented as already-solved.** "Grounded" is doing enormous unearned work.

**Fix:** Pick the architecture explicitly and write it into the FRs: **the model selects a skill and parameters; the skill's body is deterministic code that pulls full rows from the dashboard loaders (not from prior tool output) and renders them.** The model never emits a data cell. Add an FR: "No artifact cell is authored by the model; every numeric/row value is produced by deterministic skill code reading the loaders directly. The model's only output is skill choice + non-data framing copy." Then the grounding claim is actually true. Until that sentence exists, FR8/FR13/the NFR are aspirational.

---

### C2. "The content is whatever the grower asks for" (request-driven/generative PDF) is an unbounded, untestable promise. You cannot QA "whatever."

**Where:** FR12 ("a clean PDF whose **content is whatever the grower asks for** ... rather than one rigid template"); addendum D8 ("The report is 'whatever the farmer asks for' — request-driven and generative... with sensible defaults rather than one fixed shape"); FR11 (spreadsheet "request-driven," "Almond shapes the rows and columns from the request").

**The attack:** "Whatever the grower asks for" is not a spec; it is the *absence* of a spec. Concretely:
- What is the test suite? You cannot enumerate "whatever." NFR Determinism says "generated artifact bytes are verified by tests" — verified against *what fixture* when the output shape is unbounded per request? You can only byte-test a *fixed set* of skills/templates. The moment output is truly generative, your byte tests cover a measure-zero slice of the input space.
- What stops the model from inventing a layout that overclaims? "Sensible defaults" is hand-waved. A grower asks "make me a PDF proving I'm saving $40k" — does Almond render a $40k hero, violating hero-not-money-loudest (which FR12 *also* asserts it won't)? FR12 contains its own tension: fully generative *and* guaranteed to never lead with a screaming number. You can't guarantee a layout property over a generative layout space.
- At Batth scale a generative PDF could be asked to render 183 meters × 12 bills. "Sensible defaults" must include pagination, totals, per-entity grouping — none specified. "Stays readable and printable" (FR13) is asserted, not designed.

The doc rejected "a single rigid PDF template" (D8) as if rigidity were the enemy. For a skeptical grower sending a doc to a *lender*, rigidity is the feature. A small, fixed, audited set of report types is buildable, testable, and trustworthy. "Generative whatever" is none of those.

**Fix:** Replace "whatever the grower asks for" with **a closed, named set of report skills for v1** (e.g. `meter-table-report`, `mis-rated-savings-report`, `single-meter-report`, `bill-schedule-report`), each a fixed, byte-tested template that takes *parameters* (which meters, which date range), not free-form layout. The model maps the request → skill + params. That is "request-driven" in the only sense you can ship and QA. Defer true generative layout to v2 behind farmer validation. Rewrite FR12 and kill D8's framing.

---

### C3. The shared-with-a-lender wrong-PDF failure mode is named as a counter-metric but has zero mechanism behind it.

**Where:** §9 counter-metrics ("Fabrication / overclaim rate — must stay ~0; any artifact stating a number not in the data is a critical failure"); UJ-2 (the lender PDF); FR19 (coverage footer).

**The attack:** The doc correctly identifies the nightmare — a grower forwards a Terra PDF to their bank, and a number is subtly wrong — and then provides **only a footer** (FR19, coverage/as-of) as the defense. A coverage footer says "billing data is 82% complete." It does **nothing** about a *fabricated or mis-summarized* figure within the 82% that *is* present. The footer guards completeness, not correctness. C1 shows the model can produce incorrect cells; FR19 would still happily stamp "82% complete" on a PDF whose savings total is wrong. The counter-metric "must stay ~0" has no enforcing mechanism — it's a hope, not a control.

There is also no provenance: when a grower (or you, in support) is staring at a wrong number months later, nothing ties each figure back to the source row/bill that produced it. "Fabrication rate effectively zero" is unmeasurable as written — you have no way to *detect* a fabricated cell after the fact, so you can't even compute the counter-metric you committed to.

**Fix:** (1) Adopt C1's "no model-authored cells" rule — this is the actual mechanism for ~0 fabrication. (2) Add an FR for **artifact provenance**: every figure in an export traces to a stored source (meter id, bill period) so a disputed number is auditable. (3) Make the lender-facing PDF carry an immutable generated-on + data-as-of + "generated by Terra from PG&E billing data, not financial advice" line, and store the exact bytes (the addendum's immutability decision supports this — connect it explicitly to the overclaim counter-metric).

---

## HIGH

### H1. "Read-only but agentic" leaks: navigation that sets shared URL state is an action with consequences, and the doc's "undo is just back" dismisses it.

**Where:** FR1 (Almond sets `meter|lens|entity|ranch|rate`); FR2 ("Because navigation changes no data, the grower's 'undo' is simply navigating back"); FR4 ("never overridden mid-task"); Glossary ("Navigation action... Non-destructive").

**The attack:** "Changes no data" ≠ "no consequences." The URL state *is* the farmer's working context. I confirmed (`grep useQueryState`) that `entity/ranch/rate/meter/lens` are read by 8+ components — kpi-strip, filter-bar, every lens, the drawer. When Almond sets `entity=Batth LLC&rate=AG-4`, it **silently reconfigures what the farmer is looking at across the entire shell**, including the KPI numbers at the top. For a non-AI-native grower in a truck, "the dashboard rearranged itself and the big numbers changed" is indistinguishable from a mutation. "Just hit back" assumes the grower (a) noticed, (b) understands browser back semantics on a phone PWA, and (c) trusts that back didn't lose anything. The doc's own counter-metric "'Almond moved my screen on me' friction" admits this is real, then FR2 waves it away one section earlier. FR4 ("never overridden mid-task") is asserted with no definition of "mid-task" — if the farmer is mid-scroll and Almond filters, that's an override.

Worse: an export is "read-only on data" but it **emits a durable file the grower will treat as a record and forward to third parties.** That is the most consequential thing in the product. Calling the whole feature "read-only" because it doesn't write to Postgres is a category error that makes the team *underweight* the artifact-correctness risk (C2/C3). The dangerous surface here isn't DB writes; it's *outputs the grower acts on.*

**Fix:** Stop equating "read-only on the DB" with "safe / no consequences." (1) Reframe the boundary as "**no mutation of farm/utility state; navigation is reversible view-state; artifacts are durable outputs requiring correctness guarantees.**" (2) For navigation, require an explicit, visible, one-tap "undo / restore my view" affordance tied to the action chip — don't lean on browser back. (3) Define "mid-task" concretely (Almond may set state only in direct response to the current turn; never while a manual filter interaction is in flight).

### H2. The "single source of truth" navigation claim is hand-waved — the canonical key set does NOT exist as one source in the code today.

**Where:** NFR "Stays native to a constantly changing dashboard" ("Navigation is defined against the single canonical surface contract — the closed URL-state key set... and the lens registry — as one source of truth, so a dashboard change updates Almond's reach in one place"); addendum ("read the *canonical key set + lens registry*... rather than hardcoding routes... if a key/lens is retired, the navigate skill loses it automatically").

**The attack:** I checked. **There is no single source of truth for the key set.** The keys are bare string literals — `useQueryState("entity")`, `useQueryState("ranch")`, `useQueryState("rate")`, `useQueryState("meter")`, `useQueryState("lens")` — duplicated across `filter-bar.tsx`, `meter-table.tsx`, `map-lens.tsx`, `chart-lens.tsx`, `kpi-strip.tsx`, `meter-drawer.tsx`, `calendar-lens.tsx`, etc. `lens.ts` centralizes the lens *values* (`chart|table|map|calendar`) — and even there `available` is a hand-flipped boolean per story — but it does **not** centralize the key *set* (`entity/ranch/rate/meter`), and nothing enforces that the keys are closed. The "closed URL-state key set" the addendum names as the contract is a sentence in a comment, not a module.

So the NFR's promise — "a dashboard change updates Almond's reach in one place" and "Almond must never offer to open a surface that no longer exists... it loses it automatically" — is **false against the current codebase.** If someone adds a `?block=` filter or renames `ranch`, nothing tells Almond, and nothing fails a test. "Automatically" is fiction. This is a build task the PRD has reclassified as an existing property.

**Fix:** Make the claim true *before* relying on it. Add a prerequisite to MVP scope: extract the canonical URL-state contract into one module (the typed key set + per-key parser + lens registry) and refactor the 8+ call sites to consume it. Almond's navigate skill imports *that*. Add a test that fails if a call site uses a raw key string off-contract. Only then can the NFR be asserted rather than wished.

### H3. The export "reuse" story is overstated: the existing CSV path is client-side DOM, the PRD wants server-side generation, and `metersCsv` produces exactly one fixed shape — not "request-driven" columns, and there is no bill-schedule exporter at all.

**Where:** FR10 ("**reusing the existing export logic** (`metersCsv`... ) rather than building a parallel exporter; the `.xlsx` path extends, it does not replace"); FR11 (request-driven columns); addendum "v1 exports lead with... the **meter table** and the **bill-due schedule** (the calendar)"; NFR Performance ("Generation is serverless-safe... server-side").

**The attack:** I read `csv.ts` and the `meter-table.tsx` export trigger:
- `metersCsv(rows)` is pure and reusable — true. But the *export mechanism* is 100% client-side: `new Blob(...)`, `a.href = url`, `a.download` (`meter-table.tsx:179-191`). A **server-side** Almond skill (which the NFR and XLSX/PDF libs require) **cannot reuse any of that**; it can only reuse the ~25-line pure column builder. "Reusing the existing export logic rather than building a parallel exporter" oversells a small win.
- `metersCsv` emits **one fixed 9-column shape** (name, ranch, entity, rate, legacy, cost, demand, status, coverage). FR11's "Almond shapes the rows and **columns** from the request" is the *opposite* of reusing this function — request-driven columns means *not* `metersCsv`. The two FRs contradict.
- The addendum says v1 leads with "the meter table **and the bill-due schedule (the calendar)**." There is **no calendar/bill-schedule exporter in the codebase.** That's net-new, non-trivial (per-meter cycle-close across months), and it's quietly inside "reuse existing export logic." It isn't reuse; it's a new exporter.

So "reuse, don't reinvent" is doing PR work. The honest statement is: reuse the pure CSV column builder for *one* report shape; build new server-side XLSX rendering, a new bill-schedule exporter, and a new server delivery path.

**Fix:** Split FR10 into "reuse `metersCsv`'s pure shaping for the meter-table report" vs "**new** server-side artifact pipeline (XLSX via exceljs, PDF, bill-schedule exporter, Blob delivery)." Drop "rather than building a parallel exporter" — you *are* building a parallel server pipeline; just justify it (serverless, persistence) instead of pretending it's reuse. Reconcile FR11's request-driven columns with C2's closed-skill recommendation.

### H4. FR21 vs FR22 is a real contradiction the doc papers over with the word "progressive."

**Where:** FR21 ("a clear, discoverable **entry**... a persistent entry in the OS-shell rail, a first-run **nudge** in onboarding... extended... starters"); FR22 ("**gentle and progressive, never overbearing**... never blocks, interrupts, or nags. The first run must read as calm and optional, not as 'go talk to the AI.'"); A3 ("elevated entry... must not overbear").

**The attack:** A "first-run nudge in onboarding" *is* an interruption during the one flow where the grower is trying to do something else (connect their account). FR21 wants elevation and a nudge; FR22 forbids nudging ("never... nags," "not 'go talk to the AI'"). These are in tension and the doc resolves it with the adjective "progressive," which is not a mechanism. For the explicitly stated user — "non-AI-native, easily confused or put off by a pushy assistant on first use" — *any* proactive surfacing trends toward the thing FR22 bans. "Elevated but invisible-until-wanted" is close to a contradiction, and the PRD ships it as Open Q2 ("exact gentle-surfacing treatment") — i.e. the central UX risk of the wedge is unresolved and deferred to design.

**Fix:** Decide the bias and state it as a rule, not an adjective: **passive discoverability only in v1** (persistent rail entry + action-flavored starters that appear *when the panel is opened*), and **no proactive onboarding nudge** until farmer validation (Open Q4) says growers want it. That actually satisfies FR22 and de-conflicts FR21. Right now FR21's "nudge in onboarding" directly violates FR22 for the stated persona.

### H5. The "addition, not a wedge" honesty is undercut by everything downstream — this is wedge-sized effort dressed as a side feature, with no justification for building it *now*.

**Where:** §1 ("Almond is **not the wedge today — it is an addition**"); §1 ("We build that capability now so it is ready when the growers are, not because it carries adoption on day one"); §2 JTBD, 22 FRs, a Reports area, new schema, new deps, Blob storage, success+counter metrics, a 4-step build plan; Open Q4 ("the whole Almond-as-addition thesis... should be put in front of a real grower **before heavy build**").

**The attack:** The doc says "addition" and "most growers will ignore it at first," then specifies a generative operator with navigation, an extensible skill framework, two artifact engines, a persisted farm-scoped Reports area, Blob storage, immutability, provenance-grade correctness, and a metrics program. That is not the footprint of an addition; it's a product. The tell is Open Q4: the document admits the **core thesis is unvalidated with any farmer** and should be tested "before heavy build" — yet §7.3 lays out the heavy build (nav → spreadsheet → PDF+Reports → surfacing) as if greenlit. You cannot simultaneously hold "we don't know if farmers want this" and "here is the 4-phase build plan and success metrics." One of them is the real position.

The strategic-context section (§1.1) is even more self-undermining: it says Terra's *actual* wedge is camera/physical-to-numerical fusion, which this PRD doesn't build, and then justifies building Almond now because it'll be "the natural surface" for that future data. That's building speculative infrastructure for a wedge that doesn't exist yet, while the stated user "will not arrive asking an assistant to do things." The justification for *now* is thin: "ready when the growers are" is the classic premature-build rationale.

**Fix:** Make the doc honest with itself. Either (a) **gate the build on Open Q4** — ship a thin navigation-only slice + the single meter-table export, put it in front of the two real growers, and *do not* build the generative PDF, Reports area, Blob storage, or skill framework until validation; or (b) admit it's a real bet and drop the "just an addition" framing. As written it claims small and scopes large. Shrink v1 to nav + one fixed export behind validation; everything else is v2.

---

## MEDIUM

### M1. "DECIDED" storage and immutability rest entirely on net-new, unbuilt infrastructure presented as settled.

**Where:** addendum "Reports-area persistence and storage — DECIDED"; A6 ("Decided: ... report files in Vercel Blob"); FR15/FR16; the immutability argument ("store the bytes... Saved reports should be immutable").

**The attack:** I checked: **no `GeneratedReport` model exists in `prisma/schema.prisma`, and none of `@vercel/blob`, `exceljs`, `pdfkit`, `@react-pdf/renderer` are in `package.json`.** "DECIDED" is a *direction*, not a settled implementation, and the doc's confidence ("DECIDED," "Decided") obscures that the entire persistence layer is greenfield. Open holes within the "decided" plan: (1) Open Q1 admits retention/quota at Batth scale is unresolved — a grower generating reports weekly accumulates unbounded Blob objects with no lifecycle. (2) The immutability argument is sound but creates a *new* honesty problem the doc doesn't address: an immutable PDF stored at 82% coverage becomes *stale* as data improves to 95% — the grower's saved lender PDF now silently *under*-claims, and a "refresh" action (mentioned parenthetically) would change a doc the lender already has. (3) "Scoped/expiring URLs" + "re-downloadable later" (FR15) are in tension — an expiring URL is by definition not durably re-downloadable; you need re-minting on each access, which is a real auth path, not a decided one.

**Fix:** Downgrade "DECIDED" to "direction; schema + deps + Blob wiring are net-new work." Add the `GeneratedReport` schema and the three deps to an explicit prerequisites list. Resolve Open Q1 (retention/quota/lifecycle) before FR15 is buildable. Address stale-immutable-coverage: either timestamp+freeze (and accept staleness, document it on the artifact) or version reports — pick one. Replace "expiring URLs that are re-downloadable" with "re-minted scoped URLs per authorized access."

### M2. The offline stub cannot exercise the generative skills, so the "zero external calls, deterministic CI" guarantee quietly weakens exactly where the new risk lives.

**Where:** NFR Determinism ("model boundary stays injected... dev/CI make zero external calls... New skills must be exercisable by the stub"); addendum ("New skills must be exercisable by the stub so e2e/CI stay offline").

**The attack:** I read `responder.ts`. The current stub (`composeStubAnswer`) is a hardcoded **regex intent classifier** (`classifyIntent`: `/\brate|tariff/`, `/find|opportunit|save/`, etc.) returning one canned grounded sentence per intent. It does **not** do tool-calling; it does **not** select skills; it does **not** navigate or generate. For the new world, "exercisable by the stub" means the stub must now decide *navigate vs export-spreadsheet vs generate-report* and produce a real artifact — i.e. you must hand-write a deterministic skill-router that mirrors what the model does. That's fine for *export* (deterministic anyway), but it means your CI is testing **your fake router**, not the model's skill selection. The genuinely risky behavior — *does Opus pick the right skill and the right meters from a fuzzy request* — is by construction **never tested offline**, and the doc's "deterministic, zero external calls" framing makes it sound like it is. The model's skill-selection correctness (the thing that causes wrong-target exports, a named counter-metric) has no offline test.

**Fix:** State plainly that the stub validates *skill execution* (deterministic, fully tested) but **not model skill-selection**, and add a separate, explicit (keyed, non-CI) evaluation harness for selection correctness against a fixture of fuzzy requests → expected skill+params. Don't let "exercisable by the stub" imply the dangerous part is covered.

### M3. Disambiguation is asserted as a property but the existing resolver only disambiguates by *name collision*, not by the actual Batth ambiguities.

**Where:** FR3 ("when a reference is ambiguous at Batth scale (duplicate meter names across entities), Almond asks... rather than silently opening the wrong one"); UJ-3; counter-metric "Wrong-target rate."

**The attack:** `meterDetail` → `resolveMeterQuery` returns `ambiguous` only when several meters *match by name*. But Batth's real ambiguity is richer: a grower says "Pump 17" and means one of three *different* numbers, or says "the well on the north ranch," or "my biggest pump" — fuzzy references that don't trigger a clean name-collision but absolutely can resolve to the wrong meter. FR3 leans on the existing collision check as if it covers "ambiguous at Batth scale," but it only covers exact-name duplicates. The wrong-target counter-metric is guarded by a narrower mechanism than the FR claims.

**Fix:** Broaden FR3 from "duplicate meter names" to "low-confidence or multi-candidate resolution of any kind," and require the navigate/export skills to surface the candidate set + confidence rather than auto-opening on a fuzzy match. This is also where C1's no-model-authored-cells rule helps: resolution should return real candidate meters, and the grower picks.

### M4. Performance numbers are "felt requirements" with no targets, on a serverless platform where a 183-meter PDF could blow `maxDuration`.

**Where:** NFR Performance ("whole-farm PDF in roughly ten seconds or less... numbers to set"); addendum (avoiding Chromium partly to dodge "extended maxDuration"); §10 Q3.

**The attack:** "~10s or less" for a whole-farm PDF is asserted without having rendered one. Vercel function default timeouts and the addendum's own warning about `maxDuration` mean a 183-meter × multi-bill PDF (with per-meter sections) is a real risk of timing out *even on pure-JS pdfkit*. The doc dodged Chromium's cold-start tax (correct) but then set a latency target it has no basis for and no fallback (streaming? async generation with "we'll save it to Reports when ready"?). For the skeptical grower, a spinner that hangs and then errors is the trust-killer the doc itself names ("a slow operator will not be trusted").

**Fix:** Set a concrete `maxDuration` budget and a fallback: if generation exceeds the budget, switch to async ("Almond is building this; it'll appear in Reports") rather than hanging the request. Benchmark a real 183-meter PDF before committing to ~10s.

---

## LOW

### L1. "Excludes email" is clean, but UJ-2 still routes the lender PDF through the grower's own email — the riskiest distribution (a wrong doc to a bank) happens *outside* any Terra control, and the doc treats that as fine.

**Where:** FR17 (email out of v1); UJ-2 ("It saves to Reports and downloads. Manjit emails it himself"); §9 ("the artifact is the thing that leaves the product and pulls Terra into outside relationships").

**The attack:** The doc *celebrates* that the artifact "leaves the product" into "outside relationships" (lenders, CPAs) while having no control over correctness post-export (see C3). Deferring email doesn't reduce this — the grower forwards it anyway. The doc never asks whether a v1 product should be generating lender-facing financial-adjacent PDFs at all before correctness/provenance (C1–C3) is nailed.

**Fix:** Sequence it: no lender-facing PDF skill ships until C1 (no model-authored cells) + C3 (provenance + disclaimer line) are in. Internal/meter-table exports can ship first.

### L2. "Extensible skill framework" is gold-plating for a v1 the doc says might be ignored.

**Where:** FR5 ("The set is **extensible**: a new skill (PPTX, email, scheduled report) can be added without reworking Almond's core"); §7.1.

**The attack:** Building *for extensibility* (PPTX, email, scheduled reports — all explicit Non-Goals) is exactly the speculative over-build that contradicts the "it's just an addition / validate first" thesis (H5). You don't need a framework to ship navigate + one export; you need two skills. The framework is justified by future skills that Open Q4 says might never be wanted.

**Fix:** Ship two concrete skills with a thin shared interface; don't build the "framework" abstraction until skill #3 forces it. Remove "extensible framework" from v1 scope language.

### L3. Voice law ("no em dashes in generated copy") is unenforceable against a generative model and stated as if guaranteed.

**Where:** FR20 ("no em dashes in any user-facing generated copy (the project copy law)").

**The attack:** Opus will emit em dashes in generated PDF prose unless something strips them. The doc asserts compliance as a property of the persona prompt; prompts don't reliably enforce punctuation. This is minor but it's another "asserted as settled, actually unverified" instance.

**Fix:** Add a deterministic post-process (em-dash strip / normalize) on all model-generated user-facing copy before it lands in an artifact; don't rely on the system prompt.

---

## Counts by severity

- **Critical:** 3 (C1 grounding-to-generation gap; C2 unbounded "whatever" export; C3 wrong-lender-PDF has no mechanism)
- **High:** 5 (H1 read-only leaks; H2 fake single-source-of-truth; H3 overstated reuse; H4 FR21/FR22 contradiction; H5 wedge-sized build dressed as addition)
- **Medium:** 4 (M1 "DECIDED" storage is greenfield; M2 stub can't test skill-selection; M3 narrow disambiguation; M4 unbacked perf target)
- **Low:** 3 (L1 lender-PDF distribution risk; L2 premature framework; L3 unenforceable em-dash law)

**Total: 15 findings.**

## The three things the PRD lies to itself about (read this if nothing else)

1. **"Grounded" transfers from chat to artifacts for free.** It does not. The tools return capped summaries; a correct 183-row export requires deterministic, non-model row generation that the PRD never specifies. Until "no model-authored cells" is a written FR, the no-fabrication guarantee is a wish (C1, C3).
2. **"Whatever the farmer asks for" is a spec.** It isn't; it's the absence of one, and it's untestable and unsafe for lender-facing docs. A closed set of parameterized report skills is the only shippable, QA-able form (C2).
3. **The canonical navigation contract already exists as one source of truth.** It does not — the keys are scattered string literals across 8+ files. The "updates in one place / loses retired surfaces automatically" NFR is false against today's code and is a build task, not a property (H2).

Fix those three and the rest is tractable. Ship them as written and the demo works once and the lender PDF eventually bites.
