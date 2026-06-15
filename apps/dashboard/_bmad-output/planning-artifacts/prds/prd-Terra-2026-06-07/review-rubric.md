# PRD Quality Review — Terra Tool 1 — PG&E Energy Dashboard

## Overall verdict

This is a strong, unusually disciplined PRD that knows exactly what it is: a runway-bounded
rebuild that must convert one real customer and survive an investor demo, with correctness as
the product's reason to exist. The thesis ("legible before predictive," correctness over
coverage) is stated and then honored all the way down — every lever is demoted to its honest
v1 truth, every fabricated-number temptation is closed off, and the trade-offs (P0 table vs.
P1 map, one account vs. bulk, accuracy vs. prediction) are named as decisions with what was
given up. The main risks are not in what the PRD claims but in two load-bearing unknowns it
correctly flags but does not resolve: the FR-14 back-test tolerance (Open Question 2) and
tariff-fixture sourcing (Open Question 3), either of which can quietly turn the headline
"fully real rate optimization" lever into the qualitative fallback. Done-ness is good but a
handful of FRs lean on un-bounded adjectives ("lightweight," "sub-second," "within tolerance")
that downstream story creation will have to pin down.

## Decision-readiness — strong

The PRD reads as a sequence of decisions, not considerations. Trade-offs are surfaced with the
thing given up stated explicitly, not smoothed to neutral:

- The form-factor reversal is the clearest example. §4.2 and the Cross-Cutting NFRs openly
  contradict the CLAUDE.md "mobile-first / farmer in a truck" default: "desktop/tablet is the
  primary build target (both six-week demos run on a laptop)… Mobile-first is kept as a
  discipline (nothing breaks on a phone), but desktop is the surface actually in the room." That
  is a real decision with a stated reason, not a hedge.
- The P0/P1 cut is named as a decision with a trigger: FR-12 Notes — "FR-12 is P1 — the explicit
  first scope cut if cluster A's parser consumes the runway… FR-9 (table) is P0 and takes
  precedence." A decision-maker knows what gets dropped and when.
- §4.4 refuses to conflate two beats that a weaker PRD would have merged: "Bill-accuracy
  verification (FR-19) is *accuracy, not prediction*… Recommendation result (FR-20) is the true
  close-the-loop." FR-19's consequence even bans the tempting copy: "The copy **never** claims
  prediction or forecast."
- FR-14 Out of Scope records a *rejected* option with its reason: "deriving an 'effective rate'
  from one meter's bill to price another meter (rejected — not transferable, produces misleading
  savings)." Rejections-with-rationale are the surest sign of real decisions.

The `[NOTE FOR PM]` callouts sit at genuine tensions (founder-dependency risk in FR-21, bulk
pipeline in FR-6, demo-framing honesty in FR-20), not safe checkpoints. The Open Questions are
mostly real (see Scope honesty); none are rhetorical-with-an-answer-in-the-next-sentence.

### Findings
- **medium** Open Question 2 is the hinge the headline lever swings on (§9.2, FR-14) — The
  back-test tolerance gates whether FR-14 renders a precise dollar number or falls back to the
  qualitative finding, and SM-4 ("each of the 27 legacy meters carries a back-test-passing
  alternative-schedule finding with a checkable dollar number") is defined as if pass is the
  expected case. The PRD is honest that this is unresolved, but the success metric and the
  "fully real" framing both pre-suppose its resolution. *Fix:* state a provisional tolerance
  band (or an explicit "if N of 27 fall back, the lever still counts as shipped") so SM-4 is not
  silently contingent on an open question.

## Substance over theater — strong

Very little furniture. Most sections that could be theater are doing load-bearing work:

- **No persona theater.** One protagonist (Gagan), and §2.2 actively *demotes* would-be
  personas: the investor is a "viewer… not someone v1 builds features for," Kamran "not a
  separate persona v1 designs UI for." That is the correct move for a single-operator tool.
- **The Vision (§1) is product-specific, not swappable.** It names real magnitudes (183 meters,
  57 accounts, six entities, two arrays, 27 legacy-flagged) and a concrete moment ("the first
  ten seconds… total PG&E spend across the whole operation as the single largest number"). You
  could not drop this paragraph into another PRD.
- **NFRs carry product-specific thresholds, not boilerplate.** "No figure renders unless it
  reconciles to ground truth within tolerance," "Never hardcode a rate or `$/kW`," named fonts
  (Fraunces / Hanken Grotesk / JetBrains Mono), easing `cubic-bezier(0.16, 1, 0.3, 1)`,
  400–700ms. This is the opposite of "system must be scalable/secure."
- **The differentiation claim is grounded, not invented:** "same core analysis, radically
  simpler surface, and an AI layer that runs it across all 183 meters at zero marginal cost"
  (§1) — a specific bet against a named incumbent (Wexus), not template-driven novelty.

### Findings
- **low** "Sub-second navigation" is the one soft NFR (§4.2 NFRs, §7) — It is repeated as a
  craft bar but is an adjective-grade target dressed as a bound. Not theater exactly, but it is
  the least earned NFR in an otherwise concrete set. *Fix:* either tie it to a concrete budget
  (e.g. P95 interaction-to-paint on the 183-meter table) or accept it as a craft aspiration and
  stop listing it among hard bars.

## Strategic coherence — strong

The PRD has a clear thesis and the features follow from it rather than from ease.

- **Thesis stated and bet on:** "Legible first… Legible before predictive. He believes the
  picture first" (§1), and the explicit cluster ordering "A (engine) → B (hero) → C (levers) →
  D (close-the-loop) → E (data-in)" (§4) puts the trust-building engine and legible surface
  ahead of the money levers — coherent with the thesis, not "what's easy first."
- **Prioritization follows the thesis,** including inside the levers: §4.3 demotes everything
  to its honest v1 truth ("rate optimization is the one fully-computed lever; solar/NEM
  contributes a single retrospective insight… pump health is a flag, not a computed efficiency
  number; DR enrollment is legible info only"). The honest-priority list from CLAUDE.md is
  visibly the spine.
- **Success metrics validate the thesis, not activity.** SM-1/SM-2 are binary business
  outcomes (Batth converts; investor signal), and the PRD explicitly avoids vanity metrics
  ("Primary (binary outcomes — no invented targets)"). There is no DAU/MAU tell.
- **Counter-metrics are present and pointed** (SM-C1/C2/C3): "A good-looking number that fails
  reconciliation is worse than 'needs review'," "One defensible rate finding beats six uncertain
  ones." These directly counterbalance the named primaries.
- **MVP scope kind is coherent:** this is a problem-solving + experience MVP (make the mess
  legible, prove correctness), and the scope logic — prove the engine on one account, defer
  bulk — matches that kind rather than a platform/coverage land-grab.

No findings. The thesis-to-feature-to-metric arc is the strongest part of the document.

## Done-ness clarity — adequate

Most FRs carry testable consequences, and several are genuinely sharp: FR-1 ("The 7
billing-name variants dedupe to 6 Entities"), FR-5 ("sum to within $0.01 of the printed
total… outside $0.01 they are withheld"), FR-7 ("biggest cost mover card renders only when a
meter has ≥2 covered periods"), FR-14's back-test gate, FR-15's render gate ("only for meters
that are both solar (NEM) and on a demand-carrying schedule… never renders on a solar meter
with no demand charge"). An engineer can write tests against these.

But this is the dimension downstream story creation leans on hardest, and a few FRs hide a
threshold behind an adjective or an unspecified value:

### Findings
- **high** "within tolerance" is undefined where it gates the headline lever and a success
  metric (FR-14, FR-19, §7) — FR-5's guardrail is crisply "one cent," but FR-14's back-test
  ("reconcile to the actual billed charges within tolerance"), FR-19 ("On match (within
  tolerance)"), and the NFR "reconciles to ground truth within tolerance" all defer the number.
  Open Question 2 acknowledges this, but an FR whose pass/fail consequence depends on an
  undefined bound is not done-clear, and SM-3/SM-4 inherit the ambiguity. *Fix:* once OQ-2
  resolves, replace every "within tolerance" with the concrete band; until then, mark FR-14/FR-19
  as blocked on OQ-2 so story creation does not estimate them as ready.
- **medium** "Lightweight" carries FR-16's done-ness (FR-16) — "presented as a small
  calendar/timing view, not as the home surface, and kept lightweight" gives a placement
  constraint but no testable shape. What renders per meter, what interaction exists? *Fix:* add
  one concrete consequence (e.g. "each meter shows its next cycle-close date on a month grid;
  no editing, no per-cell drilldown").
- **medium** FR-21's "no grower-facing upload UI" is testable but the positive behavior is
  thin (FR-21) — "ingests inventory and billing via an admin/dev import path" has no consequence
  describing success/failure of an import (what happens on a malformed sheet, a duplicate SA ID,
  a page that fails classification). *Fix:* add at least one consequence for the import's own
  error surface, since this path is the only way data enters v1.
- **low** "Concerning cells are color-coded… watch/act earn amber/red" (FR-9) leaves the
  threshold for "concerning" implicit — what makes a cost cell amber vs. red is deferred to the
  Architect (OQ-6) but no rule is stated. *Fix:* name the trigger (e.g. legacy flag = amber,
  failed-reconciliation = a distinct state) or point explicitly to where the rule will be
  defined.

## Scope honesty — strong

Omissions are explicit and worked, not left to inference. §5 Non-Goals is substantial and each
non-goal states *why* it is out, not just *that* it is: "Not a pump-efficiency analytics tool…
no kWh-per-gallon or efficiency number is computed (no runtime/volume data — it would be
invented)." §6.2 separates "deferred but explicit first fast-follow" (Kamran/Jorge ingest path)
from plain out-of-scope, which is exactly the honesty the rubric wants.

- **De-scoping is proposed openly:** the founder-dependency risk (FR-21 Notes, §6.2) is named
  as "a deliberate deferral… not an accident," with the consequence stated bluntly:
  "Concierge-only ingest stalls the product the moment the founder is unavailable."
- **`[NON-GOAL for MVP]`, `[NOTE FOR PM]`, `[ASSUMPTION]` tags are used at the right places.**
  The Assumptions Index (§10) holds seven inference tags, each on something the user did not
  directly confirm (tariff sheets obtainable, SA ID joins cleanly, 7→6 entity dedupe, back-test
  reconciles for main schedules). Open Questions (§9) are real and v1-relevant, with at least
  one correctly parked-as-non-blocking ("Bayou account scope… parked; not v1-blocking").
- **Open-items density is appropriate to the stakes.** 7 Open Questions + 7 Assumptions + ~6
  `[NOTE FOR PM]` callouts on a high-stakes green-light PRD is on the higher side, but each is a
  genuine unknown rather than an unmade decision, and none of the load-bearing build paths
  (engine, dashboard, FR-14 happy path) is itself open. The cluster of unknowns is concentrated
  in tariff sourcing and back-test tolerance, which the PRD correctly flags as the real risk.

### Findings
- **medium** Two assumptions in §10 are load-bearing enough to read as risks, not assumptions —
  "[ASSUMPTION] PG&E's published AG tariff sheets are obtainable…" and "[ASSUMPTION] The
  back-test will reconcile for Batth's main schedules" are both prerequisites for the headline
  lever and SM-4. Filing them as assumptions (vs. surfacing them as the project's top two
  risks) slightly understates that FR-14's "fully real" status is contingent on both holding.
  *Fix:* add a one-line risk note linking these two assumptions + OQ-2 + OQ-3 as the single
  "does the rate lever ship precise or qualitative" risk cluster.

## Downstream usability — strong

This PRD is built to be source-extracted, and for a chain-top PRD that matters.

- **Glossary (§3) is present and used verbatim.** Domain nouns (Meter/Pump, SA ID, Rate
  Schedule, Legacy Schedule, Canonical Billing Shape, Reconciliation, Billing Coverage,
  Benefiting Meters, True-up, Demand Charge, NBC) appear consistently across FRs and UJs.
  "Canonical Billing Shape" is defined once and then referenced (FR-4, FR-8, FR-10, FR-21,
  §7) rather than re-described.
- **IDs are contiguous and resolve.** FR-1…FR-21 with no gaps or duplicates; UJ-1…UJ-3;
  SM-1…SM-5 + SM-C1…SM-C3. Cross-references resolve: FR-13's `result` is referenced by FR-20
  ("via FR-13's `result`"); FR-14's back-test is referenced by FR-19 ("licenses the
  alternative-schedule numbers in FR-14"); FR-10's drawer is reused by FR-12 ("opens the same
  meter drawer (FR-10)"). Each "Realizes UJ-n" tag is accurate.
- **Sections stand alone.** Each FR carries its own behavioral description plus consequences,
  and cross-refs go through Glossary terms or explicit FR IDs rather than "see above."
- **The addendum is correctly used as depth-offload,** not duplication — §A (data shape), §B
  (resolved corrections), §C (bill mechanics) carry the real-data detail the FRs point to
  (FR-2/FR-3 ↔ §C page-type classification; FR-1 ↔ §A counts), and the PRD names where to look.

### Findings
- **low** Ranch-count drift between artifacts (§3, §9.1, addendum §A) — Glossary says "~36–37,
  to confirm," Open Question 1 says "36 vs. 37," addendum §A states a flat "37 ranches." A
  downstream reader pulling the addendum alone would take 37 as settled while the PRD treats it
  as open. *Fix:* make the addendum say "37 (pending confirmation, see OQ-1)" so the two
  artifacts agree on the uncertainty.

## Shape fit — strong

The PRD is correctly shaped for a single-operator B2B tool and has not been over-formalized.

- **UJ density is calibrated, not inflated.** Three UJs, all with the same named protagonist
  (Gagan), each load-bearing: UJ-1 is the conversion moment, UJ-2 the recurring-trust loop,
  UJ-3 the act-on-finding path. For a single-operator tool the rubric warns against UJ overhead;
  here the three map cleanly to the three product beats (legible → close-the-loop → act) and
  every FR ties back to one of them. This is the right amount of journey, not theater.
- **Success metrics are appropriately operational/business rather than user-funnel.** SM-1/SM-2
  are conversion and raise outcomes; SM-3/SM-5 are correctness/clean-demo bars. No attempt to
  manufacture engagement metrics that a single-operator tool could not honestly produce.
- **The capability-spec backbone (clustered FRs with testable consequences) is the dominant
  shape,** with UJs as a thin narrative layer over it — exactly the blend that fits a tool whose
  value is correctness and legibility rather than multi-stakeholder UX.
- **Chain-top obligations are met:** the Glossary, contiguous IDs, canonical-shape seam, and
  per-FR consequences give UX, architecture, and story creation clean extraction points
  (see Downstream usability).

No findings. The shape matches the product.

## Mechanical notes

- **Glossary drift:** minor. "Meter / Pump" used interchangeably by design (declared in §3), so
  not drift. Ranch count is the one inconsistency (37 vs. ~36–37 vs. open) — see Downstream
  usability finding. "NEM2 / NEMA" and "NEMA codes" used loosely but defined together in §3
  ("NEM2 / NEMA (Net Energy Metering 2.0 aggregation)") so a reader can follow.
- **ID continuity:** clean. FR-1…FR-21 contiguous, no gaps/dupes; UJ-1…UJ-3; SM-1…SM-5 +
  SM-C1…SM-C3. All inter-FR cross-references (FR-10, FR-13, FR-14) resolve.
- **Assumptions Index roundtrip:** §10 holds seven `[ASSUMPTION]` entries. Note these are
  presented as a standalone index rather than as inline `[ASSUMPTION: …]` tags echoed at the
  end — the rubric's ideal is inline tags indexed at the end. Here the inferences are indexed
  but not tagged at their point of use in the FRs (e.g. the SA-ID-join assumption underlies
  FR-4 but is not inline-tagged there). Low impact, but a strict roundtrip check would find the
  inline anchors missing.
- **UJ protagonist naming:** every UJ names Gagan and carries its context inline (persona +
  entry state + path + climax + resolution). No floating UJs.
- **Required sections:** all present for the stakes/type — Vision, Target User (JTBD,
  Non-Users, UJs), Glossary, Features (clustered FRs), Non-Goals, MVP Scope (in/out),
  Cross-Cutting NFRs, Success Metrics (+ counter-metrics), Open Questions, Assumptions Index,
  plus a Document Purpose header that names governance vs. project-context and the two companion
  files.
