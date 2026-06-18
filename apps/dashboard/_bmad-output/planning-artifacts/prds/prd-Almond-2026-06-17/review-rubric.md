# PRD Quality Review — Almond — Terra's Generative Operator

## Overall verdict

This is a genuinely strong PRD with a rare, earned virtue: it argues *against its own importance* (Almond is "an addition... not the wedge today," §1, §1.1), and that honesty propagates into clean scope, a real thesis, and well-named counter-metrics. It is decision-ready and strategically coherent. The one place it falls short of its own chain-top stakes is Done-ness clarity: several load-bearing FRs (the request-driven PDF FR12, the disambiguation FR3, the surfacing FR21–FR22) lean on adjectives ("sensible structure," "gentle and progressive," "legible") that an engineer or story-writer cannot test, and the headline NFR thresholds are explicitly left unset. Nothing here is broken; the gap is between "a human can act on this" (true) and "a downstream story-creation pass can extract testable acceptance criteria without guessing" (partly true).

## Decision-readiness — strong

A decision-maker can act on this. The central bet is stated as a decision, not hedged: §1 commits "Today, the dashboard is what growers want and need" and "Almond is **not the wedge today — it is an addition**," and §1.1 names the real wedge (physical↔numerical camera fusion) as out of scope. That is the opposite of a smoothed-to-neutral PRD — it deliberately deflates the document's own subject.

Trade-offs name what was given up. The Non-Goals (§6) on mutations explicitly cites the road not taken — "*Notion's agent does take confirmed write actions; we deliberately do not*" — and the addendum's rejected-alternatives section attaches decision IDs (D2, D3, D7, D8, D13) with rationale. The Supabase decision (§11 A6, addendum) is the model case: the objection ("why aren't we on Supabase?") is quoted and answered, not dodged.

The Open Questions (§10) are genuinely open, not rhetorical. Q4 ("Farmer validation — the big one") concedes the entire thesis is unvalidated against a real grower and flags the specific risk (data-first vs findings-first export cut). That is a real open tension surfaced honestly, not a checkpoint. The one soft spot: Q1 and Q3 are partly self-answering (Q1 says storage is "decided" parenthetically; Q3 is "set the numbers with the team"), so the *open* count is really ~2, not 4. Not a defect — just note the list is lighter than it looks.

### Findings
- **low** Two of four Open Questions are near-resolved (§10 Q1, Q3) — Q1 carries its own answer ("Storage decided: ... Vercel Blob"), Q3 is direction-approved pending numbers. *Fix:* move Q1 to a resolved decision and reframe Q3 as a "numbers TBD with team" task so the genuinely-open items (Q2 surfacing, Q4 farmer validation) stand out as the two real risks.

## Substance over theater — strong

Very little furniture. The Target User (§2) explicitly refuses to invent a persona — "this PRD adds no new persona, it serves the existing one better" — which is the anti-theater move; it then ties the *one* persona to a concrete behavioral prediction ("the same growers who will ask Almond to 'just show me my most expensive meter' rather than learn the filter bar," §2). The JTBD (§2.1) are quoted in grower voice and each maps to an FR cluster.

The differentiation is earned, not template-filled: the addendum names actual competitors and what is rejected from each (Notion's confirmed-write agent; Glean/Sierra/Decagon's agent-as-front-door) with a reason Terra diverges (preserve the legibility moat, stay read-only). That is Discovery-surfaced, not a "Differentiation" heading filled for completeness.

NFRs (§8) mostly avoid boilerplate — "Grounding integrity. Fabrication rate is effectively zero" is a product-specific threshold, and "Stays native to a constantly changing dashboard" is a real, Almond-specific constraint with a named mechanism (single canonical key set). The Vision (§1) could not swap into another PRD: it is specifically about an Excel-brained, non-AI-native grower and an assistant deliberately kept quiet. The only mild theater is the Performance NFR, where the substance is present in direction but the numbers are deferred (see Done-ness).

## Strategic coherence — strong

This PRD has a clear thesis and the features follow from it. The thesis: *the dashboard is the product today; Almond is "the hands" (§1) that lowers friction to value for the grower who is ready, and a latent wedge as growers grow AI-native.* The two new capability classes (Navigate, Generate; §1.2) are not a grab-bag — they are precisely the two things that follow from "stops only answering and starts doing" while preserving the read-only/grounded contract.

Build priority (§7.3) follows the thesis, not ease alone, and says so: "Navigation skills first — lowest risk, highest 'wow,' reuses everything; proves the operator model," then spreadsheet (the Excel-brained grower's first artifact), then PDF + Reports (the shareable proof). The demo arc UJ-1 → UJ-2 is the thesis dramatized.

Success Metrics (§9) validate the thesis rather than measure raw activity: "Value-via-Almond — share of sessions where the grower reaches value through Almond rather than manual UI" measures the friction-reduction claim directly; "Shareable proof" measures the wedge claim (artifacts leaving the product). Counter-metrics are present and sharp — "Fabrication / overclaim rate must stay ~0," "'Almond moved my screen on me' friction" guarding FR4 — which is exactly the discipline the rubric asks for. MVP scope kind is coherent (a platform/experience extension to an existing product) and the scope logic matches.

## Done-ness clarity — thin

This is the weakest dimension and, for a chain-top PRD, the one that matters most. Many FRs are testable, but several load-bearing ones rest on adjectives a story-writer cannot convert to acceptance criteria without inventing the bar.

Testable FRs (good): FR1 enumerates the exact URL-state keys (`meter`, `lens`, `entity`, `ranch`, `rate`); FR6 ("read-only... no skill mutates a finding, a rate, a meter") is a verifiable invariant; FR10 names the exact reuse target (`src/lib/dashboard/csv.ts` `metersCsv`); FR17 (email out of v1) is binary; FR13 has a concrete bound ("no silent row caps... if anything is bounded, the artifact says what was left out"). The NFR "Determinism & testability" gives genuine pass/fail conditions ("dev/CI make zero external calls," "generated artifact bytes are verified by tests").

The problems:

- **FR12 (PDF skill)** is the most under-specified load-bearing FR. "Content is whatever the grower asks for... with sensible structure and defaults rather than one rigid template." For the demo's closer (§7.3) and a lender-facing artifact, "sensible structure" gives a story-writer no acceptance criterion. What sections must a whole-farm PDF contain? What is the default for "the savings found"? Without bounds this cannot be acceptance-tested.
- **FR3 (reference resolution + disambiguation)** says Almond "asks the grower to disambiguate rather than silently opening the wrong one" — testable in spirit, but the trigger condition ("ambiguous at Batth scale") is not defined. Is a partial name match ambiguous? A meter named "Pump 17" in one entity but "Pump 17B" in another? The wrong-target counter-metric (§9) depends on this being precise.
- **FR21–FR22 (surfacing)** are explicitly elevated to "a hard requirement, not a polish item" (FR22) yet specified entirely in adjectives: "gentle and progressive, never overbearing," "calm and optional, not 'go talk to the AI.'" §10 Q2 concedes the actual treatment is undesigned. For a requirement the PRD itself calls hard, there is no testable consequence — no rule like "no more than one nudge per session," "dismissible and never re-shown after dismissal," "no modal/interrupt." This will force the UX/story pass to invent the bar.
- **FR9 (preview-before-generate)** "one short line" is good and testable; fine.
- **Performance NFR (§8)** openly defers the numbers: "Performance (direction approved; numbers to set)... 'roughly ten seconds or less.'" Honest, but it means the felt-speed requirement the PRD calls load-bearing ("a slow operator will not be trusted") has no acceptance threshold yet.

### Findings
- **high** FR12 PDF skill has no testable structure (§5.3 FR12) — "sensible structure and defaults" gives the downstream story pass no acceptance criteria for the demo's closer and a lender-facing artifact. *Fix:* specify the required sections/defaults for the named PDF shapes (whole-farm, one-meter, mis-rated set, savings) — e.g. "whole-farm PDF must contain: farm totals, per-entity rollup, the findings list with dollars, coverage footer" — even if layout stays flexible.
- **high** FR22 surfacing is called a "hard requirement" but specified only in adjectives (§5.6 FR22; §10 Q2) — "gentle and progressive, never overbearing" has no testable consequence, and Q2 admits the treatment is undesigned. *Fix:* add at least one or two bounding rules an engineer can verify (e.g. at most one first-run nudge, dismissible, never a blocking modal, no re-prompt after dismissal), and pass the rest to the UX spec as a named, bounded job.
- **medium** FR3 disambiguation trigger is undefined (§5.3 FR3) — "ambiguous at Batth scale" lacks a rule, yet the wrong-target counter-metric (§9) depends on it. *Fix:* state when Almond must disambiguate vs. resolve (exact-name collision across entities; partial/fuzzy match below a confidence; multiple SA-IDs) so it is testable.
- **medium** Headline performance thresholds are unset (§8 Performance NFR; §10 Q3) — the "felt speed" requirement the PRD calls load-bearing has no acceptance number. *Fix:* set provisional ceilings now (navigation < ~300ms perceived; meter-table export < Ns; whole-farm PDF < 10s p95) so stories have a target to test against, even if tuned later.

## Scope honesty — strong

Omissions are explicit and do real work. §6 is a substantive Non-Goals section, not a formality: mutations, PPTX, email, scheduled agents, chat-first front door, multi-farm, and camera fusion are each named, and the most easily-assumed one (mutations) is justified against the competitor that does it. FR17 promotes "email is out of v1" to a numbered FR specifically "so the boundary is unambiguous" — that is scope honesty as an explicit design move.

The Assumptions Index (§11) roundtrips cleanly: A1–A6 each carry a status (Resolved / Confirmed / Decided / Confirmed direction) and a section pointer, and A1 records the date and the substance of the user resolution. De-scoping is proposed honestly, not done silently — the findings/recommendation export cut is flagged in FR11 and again in addendum "Data-first export scope," tied to Open Q4 for farmer validation rather than quietly dropped.

Open-items density is appropriate to stakes: this is a green-light-to-build PRD, and the genuinely-open count is low (~2 real Open Questions; the rest are direction-approved with numbers TBD). The one structural gap is the absence of inline `[ASSUMPTION: …]` / `[NOTE FOR PM]` tags in the body — assumptions are collected only in §11, so a reader scanning §5 sees confident FRs without the inline marker that this rests on an unconfirmed inference. Minor, because §11 is thorough and cross-referenced; noted because the chain-top convention expects inline tags at the point of inference.

### Findings
- **low** No inline `[ASSUMPTION]`/`[NOTE FOR PM]` tags in the FR body (§5) — assumptions live only in §11, so the request-driven-PDF and data-first-export inferences read as settled fact at the point of use. *Fix:* drop an inline `[NOTE FOR PM]` at FR11 (export cut pending farmer validation) and FR12 (PDF shape generative-by-default) pointing to A1/Q4, so the tension is visible where the decision bites.

## Downstream usability — adequate

For a chain-top PRD feeding UX → architecture → stories, the traceability backbone is mostly solid but has one real gap. The Glossary (§3) is present and the domain nouns (Operator, Skill, Navigation action, Action chip, Artifact/export, Reports area, Grounded, Coverage/as-of) are used consistently across FRs, UJs, and NFRs. FR IDs are contiguous and unique (FR1–FR22, no gaps or dupes). The addendum's Reuse Map is a gift to the architecture pass — every capability points at the exact existing file/Story to extend (`src/lib/dashboard/csv.ts`, `lens.ts`, Story 6.1 tool layer, `dashboardFarm`).

The gap: **there are no FR↔UJ↔SM cross-reference IDs**, and Success Metrics (§9) and User Journeys (§4) carry no IDs at all. UJs are numbered (UJ-1..3) but the SMs are bulleted prose. A story-creation pass cannot mechanically trace "which FR satisfies UJ-2" or "which SM validates FR12" — it must re-derive the mapping by reading. The UJs themselves are well-formed (named protagonist Manjit throughout, context carried inline), and they do informally map to FR clusters, but the links are implicit. For a standalone PRD this would be fine; for an explicit chain-top this is the friction point the rubric warns about.

Each section is reasonably extractable alone — cross-refs go via Glossary terms and section numbers, not "see above" — with one exception: FR11 references "§5.6's data-first instinct and Open Q4," which is correct but means FR11 cannot be fully understood without two hops.

### Findings
- **medium** No SM IDs and no FR↔UJ↔SM traceability (§9, §4) — Success Metrics are unlabeled prose and nothing links FRs to the UJs they serve or the SMs that validate them, so the downstream story pass must re-derive coverage by hand. *Fix:* give SMs stable IDs (SM1..n), and add a light coverage line per UJ ("UJ-1 exercises FR1–FR3, FR10, FR14–FR15") and per SM the FR(s) it measures.
- **low** FR11 requires two hops to read alone (§5.5/§5.6 cross-ref) — it defers its own scope to "§5.6's data-first instinct and Open Q4." *Fix:* restate the one-line rule inline (v1 exports lead with meter table + bill-due schedule; findings export deferred) so FR11 stands alone.

## Shape fit — strong

The PRD is in the right shape and not over- or under-formalized. This is a meaningful-UX product extension on a consumer-grade (single-operator-facing) tool, so the chosen mix — a small set of named-protagonist UJs (Manjit) carrying the demo arc, capability-style FRs, and a blend of operational and user-facing SMs — fits. It does not over-formalize: there is exactly one persona (correctly refusing to mint new ones, §2), three UJs (not a UJ for every FR), and the JTBD list stands in for lighter journeys. It does not under-formalize: the load-bearing demo flow is captured as proper UJs with a protagonist.

The brownfield handling is correct and accurate: §1.2 cleanly distinguishes "Almond today (Epic 6)" from "Almond next (this PRD)," and the addendum's existing-code references check out against the repo's documented structure (the Story 6.1 six-tool layer, `src/lib/dashboard/csv.ts`, `lens.ts`, `dashboardFarm`, the injected `AlmondResponder` boundary, Vercel AI Gateway with `anthropic/claude-opus-4-8`). The strategic-context framing (§1.1) is the right call for shape — it prevents a reader from mistaking this for the company-wedge PRD, which would have demanded far heavier scrutiny. No shape mismatch to flag.

## Mechanical notes

- **Glossary drift:** none material. "Skill," "action chip," "Reports area," "grounded," "farm-scoped" are used in the same case/sense throughout. "Artifact" and "export" are glossed as one term (§3) and used interchangeably in FRs — intentional and consistent.
- **ID continuity:** FR1–FR22 contiguous, unique, no gaps. UJ-1..3 clean. Assumptions A1–A6 clean. Decision IDs in the addendum (D2, D3, D7, D8, D13) are non-contiguous — they reference an external `.decision-log.md` not in this workspace, so continuity can't be verified here; not a defect if that log exists, but the gaps (D1, D4–D6, D9–D12) are invisible to a reader of these two files.
- **Assumptions Index roundtrip:** §11 entries all point to in-body sections and resolve; however the *reverse* roundtrip is incomplete — there are no inline `[ASSUMPTION]` tags in the body, so the index is one-directional (index → body works; body → index requires the reader to already know). See Scope-honesty finding.
- **Cross-refs:** all resolve. FR11→§5.6/Q4, A2→FR13/addendum, A6→addendum storage section, §1.1→§6 camera non-goal, FR7→"Story 6.1 owner-scoping law" all land. The PRD references external artifacts (`prd-Terra-2026-06-07`, `.decision-log.md`, Story 6.1, EXPERIENCE/DESIGN docs by implication) that are outside this workspace and were not verified.
- **UJ protagonist naming:** all three UJs carry the named protagonist Manjit with context inline ("owns a 180-meter almond operation across six entities," "learns line by line in Excel"). No floating UJs. Strong.
- **Required sections:** all present for the stakes (Vision, Target User, Glossary, UJs, FRs, Non-Goals, MVP Scope, NFRs, Success Metrics + counter-metrics, Open Questions, Assumptions Index), plus a well-separated addendum for mechanism. The only missing structural affordance is SM IDs / explicit FR↔UJ↔SM traceability (see Downstream usability).
