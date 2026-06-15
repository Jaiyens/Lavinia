---
title: Terra Purchasing Agent - Architecture Decision Records
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Architecture Decision Records: Terra Purchasing Agent (Tool 2)

These are the load-bearing decisions behind the
[architecture](./architecture.md) for the Terra Purchasing Agent, Tool 2 in the
existing Terra repo. Each record captures one genuinely contested choice: the context that
forced it, the decision, the alternatives weighed and set aside, and the consequences we accept.
They are the companion to the [PRD](../2-planning/prd.md) and the
[epic breakdown](../2-planning/epics.md).

Glossary terms (Input, Active Ingredient, SKU, Dealer, Co-op, PCA, Rebate, Prepay, Invoice,
Bill of Materials, Crop Plan, Market Band, Overpayment, Recommendation, Entity, Ranch, Block,
Account, Spend Budget, Findings rail, Review queue) are used as defined in
[PRD section 3](../2-planning/prd.md). Plain operator English throughout, no exclamation marks,
no em dashes. Dollar figures and counts marked "(estimate)" are not yet calibrated.

---

## ADR-001: Extend the shared Prisma schema in-repo, not a separate procurement service

### Context

The Purchasing Agent is Tool 2 landing in the same Next.js app that already ships Tool 1 (the
PG&E energy tool). It needs Farm, Entity, Account, Ranch, Block, and Crop, all of which already
exist in the single `prisma/schema.prisma` and are populated for the design-target grower
(Batth-shape: roughly 6 Entities, 4 Dealers, dozens of Accounts, 180-plus Invoice lines per
season, an estimate). The repo's governing rule is that a second tool extends existing patterns
rather than inventing parallel ones, and that the eventual monorepo split (when Tool 3 starts)
stays mechanical because boundaries are kept clean inside one repo. The open question was
whether procurement data and logic should live in the same schema and app or be split into a
standalone service with its own datastore.

### Decision

Extend the single shared Prisma schema in place. New procurement models (Dealer, DealerAccount,
Invoice, InvoiceLine, Product, ActiveIngredient, RebateProgram, RebateTier, PrepayTerm,
MarketBand, Finding, SpendBudget, BillOfMaterials, BomLine, AdvisorAccess, AdvisorFindingMark,
ReviewQueueItem) live alongside the energy models. Every procurement row is reachable from Farm,
the single scoping root, exactly as energy rows are. Pure procurement math lives in
`src/lib/procurement`, the UI in `src/app/dashboard/purchasing`, mirroring the Tool 1 split. No
new service, no second database, no cross-service API.

### Alternatives considered

- **A separate procurement microservice with its own datastore.** Cleaner blast-radius
  isolation, but it forces a network boundary and a data-sync problem between the two tools over
  shared entities (Farm, Entity, Ranch) that a grower edits in either tool. It would duplicate
  the auth, the credential discipline, and the vision boundary, and it would make a future
  monorepo move harder, not easier, because the split would no longer be "move files" but
  "reconcile two schemas."
- **A separate Prisma schema file inside the same repo.** Avoids a second deploy but still
  splits the scoping root, so a cross-entity Spend Table (FR-13) joining Invoices to Entities to
  Accounts would span two schemas. The shared-model requirement (NFR-6) is specifically that
  Tool 2 reuse Entity, Account, Ranch, Block, and Recommendation as-is, which a split schema
  defeats.

### Consequences

- Procurement and energy share one migration history and one datastore, so a bad procurement
  migration can affect the energy tool. We accept this and mitigate with per-epic, additive
  migrations (a table is added only when the first story that needs it is built).
- The cross-entity Spend Table and the PCA scoped reads become plain Prisma joins, not
  distributed queries.
- The monorepo move stays mechanical: pure math, schema, and UI are already separated by
  directory, so the future split is moving `src/lib/procurement` and the procurement models, not
  untangling a service.
- We carry the existing schema conventions verbatim (PascalCase models, camelCase columns, union
  fields as `String` mirrored by a TS union, integer-cents money), which keeps two agents from
  modeling the same area two ways.
- Reuse is real but two assumed reuses do not hold and are corrected in the architecture, not
  here: (1) the energy `Crop` is NOT a Crop Plan (it has no program or growth-stage schedule),
  so the BoM forecast cannot "consume" an existing Crop Plan and the Crop Plan is a net-new
  modeling requirement and an Epic-1/3 blocker (architecture section 4.6); (2) the energy `Ranch`
  has no `entityId` (Entity is reached through `Account`), so a line's Entity is Account-routed
  via `DealerAccount.entityId` and its Ranch is an orthogonal dimension that need not agree
  (architecture section 4.5). Both are corrections to what "reuse the shared model" was assumed
  to give, not changes to this decision to extend the one schema in place.

---

## ADR-002: Vision-extraction-first Invoice ingestion, not Dealer-API integration

### Context

The tool's first job is to make a grower's input spend legible from their own Invoices. The two
ways to get that data are to extract it from the documents the grower already has (photo, PDF,
forwarded email) or to integrate directly with Dealer and Co-op systems through credentialed
APIs. Credential discipline is a hard product law (NFR-1): the agent must never request or store
a Dealer, financial, or utility credential, and must never hold a Dealer login. Tool 1 already
solved the structurally identical problem for PG&E bills with a vision-extraction pipeline
(`src/lib/extract`) that turns a photographed financial document into Zod-validated structured
data, routes unreadable pages to `needs_review`, and runs at zero external calls in dev and CI.

### Decision

Ingest Invoices by vision extraction first: photo, PDF, or email forward becomes a Zod-validated
canonical Invoice with attributed lines, through a `src/lib/procurement/ingest` pipeline that
mirrors the Tool 1 bill pipeline beat for beat (split, read through an injected InvoiceReader
boundary, validate against `InvoiceLineSchema`, normalize and attribute, persist idempotently).
The reader defaults to a stub fed committed fixtures and constructs the live AI Gateway reader
only when a key is present. There is no Dealer-login field anywhere in the schema, actions, or
UI.

### Alternatives considered

- **Direct Dealer or Co-op API integration.** It would yield cleaner structured data with no
  extraction error, but it requires storing Dealer credentials (violating NFR-1 outright), there
  is no common Dealer API across a fragmented ag-retail market, and it would gate the whole tool
  on per-Dealer integration work the grower cannot self-serve. It also reintroduces exactly the
  credential-storage risk the product forbids.
- **Grower master-spreadsheet import only.** A useful fallback for multi-account farms, but it
  depends on the grower keeping a clean spreadsheet, which the target grower largely does not,
  and it cannot capture a Rebate term or a Prepay close printed on an Invoice.
- **A paid third-party purchase-data aggregator.** Removes our extraction burden but
  reintroduces a credential or data-sharing dependency and a cost-to-serve we do not control,
  and it does not fit the single-grower, no-pooling stance in ADR-003.

### Consequences

- Extraction is imperfect, so the honest-coverage guardrail (ADR-006) is mandatory: a line the
  model cannot read above the confidence threshold is held out of every asserted number.
- We own one new prompt and one new Zod schema, not a new dependency or a new credential store.
- Onboarding is self-serve from day one (snap a photo, forward an email) with no Dealer
  cooperation required.
- Spreadsheet import and email forward remain supported secondary paths; the architecture leaves
  room for them without changing the canonical Invoice shape.

---

## ADR-003: Single-grower Market Band in v1, not cross-grower pooling

### Context

The headline finding is the Overpayment flag: a line priced above the typical range for its
Active Ingredient. The most statistically powerful way to build that range is to pool price
points across many growers. But the buyers are competing California farms purchasing the same
Inputs from the same regional Dealers, and pooling their prices into a shared band that informs
each grower's buying raises a real antitrust concern (a price-signaling mechanism among
competitors) and a privacy concern (one grower's negotiated price is sensitive business data).
The product principle is to show the grower their own numbers before anything else, and a
gaming risk (SM-C1) means an asserted figure must be defensible.

### Decision

Compute the Market Band from a single grower's own normalized price points only, in v1. The
`band.ts` function signature accepts only the grower's own normalized lines, which makes
cross-grower contamination a type error rather than a policy anyone can forget. Below a
configured minimum comparable-point count (an estimate, to be calibrated) the band returns
`no_reliable_band_yet`, a first-class state that structurally blocks any Overpayment finding. No
external price source is ever an input.

### Alternatives considered

- **Cross-grower pooled band (anonymized or aggregated).** Far stronger statistics and the
  obvious long-term moat, but the antitrust exposure (competitors' prices feeding each other's
  buying decisions) and the privacy exposure (a grower's negotiated price leaving their farm)
  make it the wrong v1 default. It would need legal review and an explicit opt-in data-sharing
  governance model the product does not yet have.
- **Third-party market-price index.** Removes the pooling concern but reintroduces a paid data
  dependency and a number the grower cannot trace to their own Invoices, weakening the
  provable-lineage stance (ADR-005) and the honest-number law.

### Consequences

- The band is weak early, especially for a grower with few comparable purchases of a given
  Active Ingredient. We accept this and make `no_reliable_band_yet` honest and visible rather
  than fabricating a band.
- Overpayment findings only appear once a grower has enough of their own points, which delays
  the headline value for new or low-volume Active Ingredients. The Rebate audit (a cleaner,
  self-contained finding) carries early value instead.
- Cross-grower pooling stays a deliberate post-v1 decision gated on legal review and an explicit
  data-sharing governance model, not an accident of implementation.
- The minimum comparable-point count is the SM-C1 honesty line and an open calibration question
  (estimate); it is a single config constant in `band.ts`.

---

## ADR-004: Reuse the display-only Recommendation grammar, with a procurement Finding evidence object beside it

### Context

Tool 1 already has a shared Recommendation grammar (`{ id, farmId, tool, situation, action,
impactUsd, severity, status, ... }`) with an `action` shaped to be executable later but only
displayed in v1. Procurement findings (Overpayment, under-credited Rebate, Generic Equivalent,
Prepay timing, over-budget) need to surface in the same Findings rail as energy findings and
respond to the same one-tap interaction. But a procurement finding also carries data the shared
grammar does not model: a confidence score and an immutable data lineage that backs its dollar
figure (the gain-share prerequisite, ADR-005). The question was whether to extend the shared
Recommendation model with procurement-specific fields or to keep the grammar untouched and add a
parallel record.

### Decision

Reuse the Recommendation grammar verbatim with `tool = "purchasing"`, and introduce a separate
procurement `Finding` model beside it. The `Finding` carries `findingType`, `impactCents`,
`confidence`, `state` (`asserted | needs_confirmation | review`), and `lineageJson`; it is the
traceable evidence object. The `Recommendation` is its grower-facing surface, built through the
existing `draftRecommendation` helper. `action.label` is plain operator English, `action.kind`
carries the machine verb a later version could execute (`claim_rebate`, `swap_generic`,
`prepay`, `flag_line`), and `action.execute` stays `null` in v1.

### Alternatives considered

- **Extend the shared Recommendation model with confidence and lineage columns.** It avoids a
  second table, but it bloats a grammar that Tool 1 and every future tool share, pushing
  procurement-specific concerns (a per-finding lineage blob) into a model that energy findings do
  not need, and it couples the shared grammar to procurement's evolution.
- **A wholly new procurement-specific recommendation model.** Maximum freedom, but it forks the
  Findings rail, the one-tap status machinery, and the loop-closure code (`result.ts`), forcing a
  second implementation of everything the grammar already gives us and breaking the single
  cross-tool feed.

### Consequences

- The shared `Recommendation` type stays unchanged, so the Findings rail and one-tap status
  (`done | dismissed | overridden`) work for procurement with no new machinery. Loop closure
  reuses the `result.ts` PATTERN (the frozen-prediction snapshot on `Recommendation.result` plus
  the realized number derived at read time, and the honesty law) but NOT the `result.ts`
  function: that function is hard-specialized to PG&E (it matches the first reconciled
  `BillingPeriod` carrying `printedTotalCents` after acceptance), whereas procurement closure
  matches a later crediting `InvoiceLine` by the Finding's lineage keys. A new pure
  `firstCreditingInvoiceLineAfter` is written for procurement; see architecture section 7.2.
- Confidence and lineage live on `Finding`, exactly where the honesty and gain-share concerns
  need them, without leaking into the cross-tool grammar.
- There is a one-to-optional-one relation to maintain (`Finding.recommendationId`); a run never
  persists a Recommendation without an asserted `Finding` behind it.
- The executable hook (`action.execute`) exists for a later agentic OS but is provably unused in
  v1 (a guard test asserts it is `null` for every procurement Recommendation).

---

## ADR-005: Capture immutable per-Finding savings-attribution lineage now, as the gain-share prerequisite

### Context

The load-bearing monetization unknown ([PRD section 8, #1](../2-planning/prd.md)) is proving that
a saved dollar is the agent's doing and not the grower's own haggling. The eventual business
model (SM-1b) is gain-share billing, which is only defensible with an invoice-level,
line-traceable record of what the agent found, what it was worth, and what actually happened
afterward. v1 does not bill and does not solve the attribution method, but if it does not capture
the evidence at the moment a finding is produced, that evidence is gone. The risk is asserting a
dollar that cannot later be defended (NFR-4).

### Decision

Every `Finding` carries a `lineageJson` recording, immutably, the exact inputs that produced its
figure: the source Invoice line ids, the Active Ingredient, the band inputs with `sampleCount`
and `computedAt` (or, for a Rebate finding, the program, the tier, and the threshold-crossing
line set), the confidence, and the `asOf`. At loop closure (FR-12), when a later relevant Invoice
posts, the crediting-Invoice line ids are appended. The lineage is append-only evidence, never
recomputed in place, so a past claim stays reconstructable even after a band recomputes. The word
"verified" is reserved for the loop-closed, attributable subset and is a derived view state,
never stored on an unclosed finding.

**Persistence rule (the part that makes "immutable" true under re-run).** This decision is only
real if the run that produces Findings does not delete them. The established Terra run pattern
this design otherwise mirrors, `run-rate-lever.ts`, is delete-pending-and-recreate
(`prisma.recommendation.deleteMany({ status: "pending" })` then `createMany`). Applied to
`Finding` rows literally, that would DELETE and recreate exactly the rows whose `lineageJson`
must survive a recompute, destroying the evidence this ADR exists to protect. So the rule is
explicit: a `Finding` is **never deleted on re-run.** Findings are immutable-on-create and
re-keyed by a lineage natural key (`farmId`, `findingType`, the source `invoiceLineId` or
program + tier, and the band `computedAt` or `asOf`); a re-run upserts by that key and never
overwrites an existing `lineageJson`. If inputs changed enough to constitute a different claim,
that is a NEW Finding (a new natural key) and the prior one stays on the ledger. Only the
surfaced pending `Recommendation` is delete-recreated, as `run-rate-lever.ts` does, because it
carries no historical claim. (Equivalent and acceptable: snapshot the prior `lineageJson` to an
append-only ledger before any in-place recompute; the upsert-by-natural-key default is simpler
and is the one chosen.) A DB integration test asserts that a recompute preserves every prior
Finding row and its lineage and rebuilds only the pending Recommendation surface.

### Alternatives considered

- **Capture lineage only later, once a gain-share model exists.** Cheaper now, but the inputs
  that back a figure (the band sample that existed the day the finding fired) are ephemeral; a
  recomputed band overwrites them, so a retroactive lineage would be a reconstruction, not a
  record. That is precisely what a billing dispute would tear apart.
- **Recompute lineage on demand from current data.** Avoids storing a blob, but it cannot
  reproduce the historical inputs and conflates "what we knew then" with "what we know now,"
  which is the opposite of an auditable track record.

### Consequences

- Findings carry a denormalized, append-only JSON evidence blob that is never mutated; storage
  cost is trivial at Batth-scale (estimate) and the auditability is the point.
- The procurement run cannot use the `run-rate-lever.ts` delete-pending-and-recreate pattern on
  `Finding` rows; it upserts Findings by lineage natural key and delete-recreates only the
  pending Recommendation surface. This divergence from the energy run pattern is deliberate and
  guarded by a DB integration test. Loop closure appends crediting-line ids to the existing
  lineage rather than rewriting it.
- Under-credited Rebate recovery becomes the first cleanly attributable case (a missed credit is
  unambiguously the agent's find), which is why it leads the value story over Overpayment, whose
  attribution method is still unsolved.
- The attribution method that converts identified savings (SM-1) into attributed realized savings
  (SM-1b) remains an open product question (estimate); this decision guarantees the evidence
  exists when that method is chosen, not that the method is decided.
- Identified savings and attributed realized savings are kept distinct in the data: a
  Recommendation marked done without a posted Invoice counts only toward identified savings.

---

## ADR-006: Make the human-in-the-loop Review queue a first-class, internal-only entity

### Context

Vision extraction over messy Dealer Invoices will produce unreadable lines, units that cannot be
normalized, and ambiguous Rebate terms. The honest-number law (NFR-4) and confidence-carrying
findings (NFR-9) require that none of this low-confidence work ever leak into an asserted dollar
figure. There needs to be a defined place for that work to wait and be resolved by a human, and a
defined gate that keeps it out of every number until it is. The product constraint is that the
grower must never be handed a queue, a wait time, or an SLA; they should only ever see a plain
state on the affected line.

### Decision

Model the Review queue as a first-class `ReviewQueueItem` entity, internal-ops-only. A line below
the extraction confidence threshold, one that fails Zod validation, one whose unit cannot be
normalized, or a Rebate term that is not machine-readable creates a `ReviewQueueItem` and is held
out of every Market Band comparison and every asserted figure until resolved. A resolved item
writes its `resolvedValueJson` back to the line, which re-enters the pure normalization or Rebate
audit and clears the grower-facing state. The grower sees only the `lineState` /
`Finding.state` on the affected line (`needs review`, `possible, needs confirmation`); there is
no grower-facing queue, wait time, or SLA. The queue surface is an admin route outside the grower
app.

### Alternatives considered

- **Best-effort auto-resolution with no human queue.** Simpler to build, but it forces the
  system to either guess (fabricating a number, violating NFR-4) or silently drop the line
  (losing the grower's data). Both are disallowed.
- **A grower-facing review task list.** Keeps the human in the loop but pushes our extraction
  failures onto the grower as a chore and a wait, breaking the plain, low-friction product
  promise.
- **A transient flag with no entity.** A boolean on the line with no queue record makes the work
  invisible to ops, unmeasurable, and impossible to route or audit; the Review-queue depth is a
  metric we need to watch (it sizes the unsized cost-to-serve).

### Consequences

- Low-confidence work is structurally incapable of producing an asserted figure, which is how
  the honesty guarantee holds by construction rather than by reviewer diligence.
- The queue introduces an internal-ops cost-to-serve that is real and currently unsized
  ([PRD section 8, #4](../2-planning/prd.md), estimate); the Review-queue depth and the
  `needs_review` counts are the operational signals to watch before scaling.
- Resolution is closed-loop: a resolved item re-enters the same pure pipeline, so a corrected line
  becomes a normal number with no special-casing downstream.
- The grower experience stays clean: a line is either a number or a plainly-stated unknown, never
  a task assigned to them.

---

## ADR-007: Scope the v1 LLM/agent layer to read-only and bounded extraction, not autonomous action

### Context

The product is named an "agent," and the Recommendation `action` field is deliberately shaped to
be executable later. The repo already has Almond (Epic 6), a farm-scoped, read-only,
tool-calling assistant. The temptation is to let the agent act: claim a Rebate, place a Prepay,
send an RFQ, negotiate with a Dealer. But human-in-the-loop is a hard default (NFR-3), there is no
external write surface allowed in v1 (no transaction, no purchase, no payment, no Dealer login),
and the calculation that backs every dollar must be deterministic and provably correct, not an
LLM output. The question was how much the LLM and agent layer should do in v1.

### Decision

Confine the LLM to exactly two bounded, already-proven roles, and keep the calculation engine
deterministic pure code. First, extraction: the vision read proposes Invoice structure through
the `generateObject` plus Zod boundary, and Zod and the confidence gate decide what is
trustworthy enough to enter the numbers; the model never computes a band, an Overpayment, or a
Rebate figure. Second, an optional read-only assistant modeled on Almond (farm-scoped,
tool-calling, `getSpend`, `listInvoices`, `getMarketBand`, `listProcurementFindings`), which
mutates nothing and surfaces no figure the pure engine did not already compute. No autonomous
action, negotiation, purchase, or external write exists anywhere in the agent layer.
`action.execute` stays `null`.

### Alternatives considered

- **An autonomous procurement agent (auto-claim Rebates, auto-Prepay, RFQ, auto-PO).** The
  long-term vision, but it violates the v1 human-in-the-loop default and the no-external-write
  law, and it would put money and Dealer relationships at the mercy of LLM reliability before the
  track record (ADR-005) even exists to justify it.
- **An LLM that computes the findings (band, Overpayment, Rebate math) directly.** Faster to
  prototype, but it makes the load-bearing dollar figures non-deterministic and untestable,
  defeating the provable-correctness core and the honest-number law. The math must be pure,
  unit-tested code.

### Consequences

- The grower keeps full control: every action is a one-tap status change, never an execution.
- The dollar figures are deterministic and unit-tested; the LLM's reach is bounded to proposing
  structure (gated by Zod and confidence) and answering read-only questions.
- The agentic and scouting legs are explicitly post-MVP (Epic 8): the executable hook exists on
  the grammar but is unused, enforced by a guard test, so the future is reachable without being
  present.
- The optional assistant is a clean extension of an existing pattern and adds no new external-write
  risk; if shipped it stays strictly read-only, mirroring the display-never-execute law.

---

## ADR-008: Multi-entity scoping with farmId as the single root and double-scoped advisor reads

### Context

The design-target grower runs several legal billing Entities (Batth-shape: roughly 6, an
estimate) under one Farm, and a PCA (the crop advisor) may be granted read-only visibility into
some but not all of those Entities. Every read must be scoped so one grower can never see
another's data and a PCA can never see beyond what was granted. The product also requires that
revoking a PCA's access be immediate and leave no retained copy of the grower's data, and that a
PCA can confirm or dispute a finding but never edit, set a budget, or act. The existing pattern
(Almond) carries a single resolved `farmId` in its dependencies so the model can never read
another farm.

### Decision

Scope every read by `farmId`, the single existing scoping root, and never trust a
client-supplied `farmId`. A PCA read is scoped twice: by the granting Farm and by the
`AdvisorAccess.scopedEntityIds`, filtered at the query through a scoped loader so an out-of-scope
or revoked Entity is never returned. The PCA holds no data copy because all reads are live and
server-side, which makes revoke immediate and copy-free by construction. The PCA can call only
read tools and the confirm/dispute write (`AdvisorFindingMark`); no edit, budget, or act path
exists for an advisor. The email-forward ingestion webhook resolves the farm from the
authenticated forwarding address, never from a client-set field.

### Alternatives considered

- **A single farm-wide scope with no per-Entity advisor filtering.** Simpler, but it cannot
  honor a PCA grant limited to a subset of Entities, and it would expose Entities the grower did
  not choose to share.
- **Give the PCA a copy or an export of the shared data.** Easier read performance, but it makes
  revoke meaningless (the copy persists), violating the portability-and-governance requirement
  (NFR-7) that revoke leaves no retained copy.
- **Row-level security in Postgres instead of application-level scoping.** Stronger in principle,
  but it diverges from the established repo pattern (every loader takes `farmId` explicitly) and
  would be a parallel mechanism two agents could implement inconsistently; we keep one scoping
  discipline.

### Consequences

- Every loader takes `farmId` explicitly (and a PCA loader takes `farmId` plus the granted Entity
  ids); there is no global query and no implicit scope, which is the single discipline both
  agents follow.
- Revoke is immediate and copy-free by construction, satisfying the governance requirement
  without a cleanup job.
- The PCA surface is strictly read-plus-mark; the absence of any advisor edit, budget, or act
  path is enforced by the absence of those tools and handlers, not by convention.
- Application-level scoping carries the usual risk that a missing `farmId` filter leaks data; we
  mitigate with the explicit-`farmId`-per-loader rule and DB integration tests asserting that
  AdvisorAccess scopes reads and that revoke is immediate.

---

## Decision summary

| ADR | Decision |
|---|---|
| ADR-001 | Extend the shared Prisma schema in-repo, not a separate procurement service |
| ADR-002 | Vision-extraction-first Invoice ingestion, not Dealer-API integration |
| ADR-003 | Single-grower Market Band in v1, not cross-grower pooling |
| ADR-004 | Reuse the display-only Recommendation grammar, with a procurement Finding evidence object beside it |
| ADR-005 | Capture immutable per-Finding savings-attribution lineage now, as the gain-share prerequisite |
| ADR-006 | Make the human-in-the-loop Review queue a first-class, internal-only entity |
| ADR-007 | Scope the v1 LLM/agent layer to read-only and bounded extraction, not autonomous action |
| ADR-008 | Multi-entity scoping with farmId as the single root and double-scoped advisor reads |
