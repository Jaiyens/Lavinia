# Onboarding audit — `perfect/onboarding`

Exhaustive multi-agent audit of the live farmer onboarding flow (identify → connect → connecting → confirm),
run 2026-06-20 against `night/launch-fixes` HEAD. 72 agents, 8 dimensions (correctness, security, resilience,
data, ux/copy, a11y, live-readiness, tests), every finding adversarially verified against the real code.

- **Raised:** 60 · **Verified:** 50 · **Refuted:** 10
- **Static checks:** `typecheck` clean; onboarding unit tests (geocode, sources, vision) pass.
- Scope: `app/(app)/onboarding/**`, `lib/onboarding/**`, auth-gate / active-farm, `lib/utilityapi`,
  `lib/greenbutton`, `lib/normalize`, `prisma/schema.prisma`.

---

## Implementation status (this branch)

**All 7 blockers + B3 + S1/S3/S4/S5/S8/S10 are implemented and validated** on `perfect/onboarding`.
A second adversarial review of the diff (8 reviewers → verify → synthesize) caught one real defect,
now fixed (see below).

- ✅ **B1** history gate on both paths · ✅ **B2** poll re-arm · ✅ **B3** UtilityAPI fetch timeouts
  (`AbortSignal.timeout`, 25s) · ✅ **B4** `intervalSpan` + 200k-point regression test ·
  ✅ **B5** `bodySizeLimit` + per-file guards · ✅ **B6** `Pump.confidence` + lean `loadConfirmFarm` ·
  ✅ **B7** `0_init` baseline (incl. the two raw-SQL indexes) + deploy/check scripts + runbook.
- ✅ **S1** partial-connect note · **S3** membership gate (3 pages + resume, + tests) ·
  **S4** `?add=1` no-downgrade · **S5** sample-into-real guard + page redirect · **S8** popup-blocked
  inline link · **S10** connecting a11y live-region.
- **Review caught + fixed:** the `0_init` squash had silently dropped two raw-SQL indexes
  (`migrate diff` is blind to functional/partial indexes, so `db:migrate:check` falsely showed "no
  drift"); restored verbatim + added a `pg_indexes` assertion + prod runbook step. Also fixed the
  stale "PG&E is connecting" banner that S4 made reachable on a finalized farm.
- **Validation:** typecheck ✅ · lint ✅ · full suite **980+ pass** (1 pre-existing, unrelated Almond
  failure) · `migrate deploy` on empty PG reproduces the schema **and** both raw-SQL indexes ✅.
- **Founder-only (cannot be done from code):** run `migrate resolve --applied 0_init` + the two
  `CREATE INDEX IF NOT EXISTS` on prod (runbook in `prisma/migrations/README.md`); confirm
  `AI_GATEWAY_API_KEY` on the `lavinia` Vercel project (S7); a real Batth-scale connect dry-run (S6).
- **Deferred (accepted/low):** duplicate "PG&E / active" rows on the Account page for a
  twice-add-account farm (cosmetic); spreadsheet-only meters render as confident (intended).

---

## Launch blockers (must fix before a real grower touches it)

### B1 — Non-force PG&E import advances to confirm with zero usable history → connecting↔confirm↔connect bounce
`lib/onboarding/farm.ts` · `_components/pge-connecting.tsx` · `confirm/page.tsx`
The `historyLanded` null-guard is force-only (`farm.ts:1220`: `if (live && opts.force && !historyLanded)`). The
non-force `finish(false)` path applies only the UtilityAPI readiness gate. If UtilityAPI reports meters ready but
every per-meter Green Button XML fetch fails, the import lands identity-only meters, returns non-null, and confirm
bounces back. **Fix:** gate the import return on `hasRealSource` (or `historyLanded`) on BOTH paths.

### B2 — Connecting poll dead-stops permanently when reveal says ready but the import gate disagrees
`_components/pge-connecting.tsx`
When `finish(false)` returns false, the `tick()` early return (lines 99–102) skips the `setTimeout`, so polling is
dead forever (the line-63 "resume polling" comment is wrong). **Fix:** in the `finish()` else branch, reset
`finished.current = false` and bump `setRetryKey(k+1)` so the effect re-arms.

### B3 — No request timeout on any UtilityAPI fetch → one hung socket eats the whole 300s budget
`lib/utilityapi/client.ts` · `lib/onboarding/source.ts`
`utilityApiFetch` (63–73) and the raw Green Button fetch (189–192) pass no `signal`. A hung socket never throws, so
the identity-only fallback can't rescue it and it occupies one of 6 workers; auth/meters reads have no fallback at
all. **Fix:** `AbortController` with a 20–30s timeout on every UtilityAPI fetch.

### B4 — `RangeError` on high-history meters: `Math.min(...intervals)` spread at Batth scale  *(completeness critic)*
`lib/greenbutton/import.ts:281-282`
`new Date(Math.min(...starts.map(d => d.getTime())))` (and the matching `max`) spreads the entire per-meter
intervals array as call arguments. The `createMany` two lines below is already chunked *because* meters are
history-heavy — the min/max is not. A multi-year 15-min meter (100k+ points) throws
`RangeError: Maximum call stack size exceeded`; the per-meter try/catch swallows it and the meter lands
identity-only with zero history, counted in `metersFailed`. **Fix:** replace the spread with a `reduce`/loop over
`getTime()`; add a test with a >40k-interval meter.

### B5 — Server Action 1 MB body cap rejects real uploads before the handler runs  *(completeness critic)*
`next.config.ts` (no `experimental.serverActions.bodySizeLimit`)
A real Green Button export or multi-page bill PDF exceeds the Next.js default 1 MB Server Action body limit, so the
request is rejected at the framework boundary and `useActionState` never receives the calm `ConnectState` error —
the grower sees a silent/opaque failure. The committed fixtures (7–23 KB) mask it. **Fix:** set `bodySizeLimit`
(e.g. `25mb`) plus explicit per-file size guards and an over-limit message.

### B6 — Confirm reloads every pump's full interval history into one server-action response → OOM mid-finalize
`confirm/page.tsx` · `lib/onboarding/farm.ts`
`farmForConfirm` (1898–1916) includes every pump's full intervals with no cap; `confirm/page.tsx:69-94` then
recomputes a verdict already persisted as `Pump.kind`. For 183 meters × ~35k intervals this materializes millions
of rows — the OOM shape the importer was rewritten to avoid. On OOM the connection never flips active and the grower
loops back. **Fix:** persist a `confidence` value on `Pump` during `classifyFarmPumps` and read `Pump.kind` +
confidence at confirm instead of reloading intervals (at minimum, stream the read per meter). *Schema change.*

### B7 — Migration set cannot `migrate deploy` on a fresh DB; `db:migrate` aliased to `db push`
`prisma/migrations/` · `package.json` · `src/test/pg-harness.ts`
No migration creates the base tables / onboarding columns (`Connection.source`, `Farm.isDemo`, `Farm.userId`,
`Pump.coverageState`); the first migration already references `Farm`/`User`, so `prisma migrate deploy` on an empty
DB fails. Masked because `db:migrate` aliases to `prisma db push`. **Fix:** generate a `0_init` baseline via
`prisma migrate diff --from-empty`, `migrate resolve --applied 0_init` against the live pushed DB, point
`db:migrate` at `migrate deploy`, keep `db push` for local/test, add CI that asserts deploy succeeds on an empty DB.
Latent but detonates on any re-provision/recovery. *Needs a live `migrate deploy` dry-run on a throwaway DB.*

---

## Should-fix (this week)

- **S1 — Silent partial PG&E connect.** `finishPgeConnectAction` (`actions.ts:152-157`) collapses the rich
  `ImportUtilityApiIntoFarmResult` (`failedAccounts`/`greenButtonFailed`/`metersFailed`) to `result !== null`,
  discarding every degradation signal. Thread the tallies back to the poller and render a plain, em-dash-free note
  (e.g. "1 of 57 accounts was not shared; 3 meters came in without usage history"). *The typed contract already
  exists end-to-end and is dropped at one line — cheap, high value for a 57-account Batth connect.*
- **S2 — All-or-nothing ready gate** (`client.ts` `readyCountsFromRaw`, `farm.ts` `ready===total`). A few laggards on
  183 meters mean auto-advance never fires until the 30-min cap. Make auto-advance tolerant of partial collection,
  show a determinate "X of Y meters ready," and wire `triggerUtilityApiHistorical` (`client.ts:199-214`, never
  called) to nudge meters that arrive without history.
- **S3 — Page reads gate on `Farm.userId`, writes gate on `FarmMembership`.** The three read pages use
  `findFirst({id,userId})` + `notFound`, contradicting the schema's "`Farm.userId` is advisory." Fail-closed and
  *not* a live Batth lockout today (no second member can exist on a not-yet-finalized farm — see refuted R6), but it
  breaks the multi-user model and the `?add=1` re-entry. Unify all reads + `resumableOnboardingFarm` on
  `canAccessFarm`/membership. Add a test: non-owner member can load connect/confirm; non-member cannot.
- **S4 — `connect ?add=1` re-entry downgrades an active connection to pending** → knocks a finalized farm off the
  dashboard until a new auth completes (and permanently if abandoned). `startUtilityApiForFarm` calls `pgeConnection`
  with no status filter. **Fix:** when `pge_smd` is already active, create a NEW pending connection instead of
  downgrading the live one. (Batth's 57 accounts exercise exactly this.)
- **S5 — Direct/stale visit to `/onboarding/connecting` imports the SAMPLE fixture into a real farm as
  `source=smd`.** A bill-only farm has `externalRef=null` → `utilityApiReveal` returns the sample reveal `ready:true`
  → a back-button/stale-tab visit drives `finish(false)` → imports `loadSampleUtilityApi()` into the real farm.
  **Fix:** require non-null `liveFormUid(conn.externalRef)` before importing; only import the sample via
  `connectSampleAction`.
- **S6 — Large-farm live import runs synchronously inside one server action under the 300s ceiling** (183 meters ×
  2 round-trips / 6 concurrency ≈ 61 waves + 183 transactions + classify sweep). A mid-import kill surfaces as
  `network` and retry re-runs the whole pull. Ideally move ingestion off the request path (poll triggers it
  server-side); if kept synchronous, instrument timing and validate against a real Batth-scale auth before Mon/Tue.
- **S7 — Bill-photo upload silently lands the committed sample identity when `AI_GATEWAY_API_KEY` is unset.**
  Without the key, `readBillPhoto` ignores the uploaded bytes and returns `sample-bill.json` (Olsen Family Farms),
  creating a stranger's meter with no usage → Continue stays disabled with no message. **Fix:** confirm the key is
  set on the `lavinia` Vercel project (RESEND_API_KEY was already unset there); when absent, surface a plain message
  instead of importing the fixture identity.
- **S8 — Popup-blocked PG&E start navigates to the polling screen with no sign-in window open.** `connect()` opens
  `about:blank` synchronously, ignores the post-await `window.open` fallback result, and `router.push('/connecting')`
  runs unconditionally (`pge-card.tsx:24-50`). On a phone with both blocked, the grower lands on a spinner whose copy
  says "sign in to the tab we just opened" — but none opened. **Fix:** after the await, if neither window opened, do
  NOT navigate; render an inline "Open PG&E sign in" anchor tapped within the gesture. *(Also: the connection is
  flipped to `pending` server-side before the popup is confirmed open — see completeness gap.)*
- **S9 — Confirm step renders OLD warm-grey legacy design inside the NEW cool-grey shell, on a dead tree.** The live
  confirm imports `ConfirmClient` from `dashboard/pump-timing/**` (the dead legacy tree CLAUDE.md says not to build
  on). The final step looks like a different product, and any cleanup of the legacy tree breaks the live flow.
  **Fix:** port the confirm UI into `(app)/onboarding/_components` with the new tokens.
- **S10 — Confirm toggles expose no selected state; connecting status changes aren't announced to screen readers.**
  Add `aria-pressed` to field toggles and `role=radiogroup`/`role=radio`/`aria-checked` to the pump pair; wrap the
  connecting status in `role=status aria-live=polite aria-atomic`, give `ConnectError` `role=alert`, add `aria-busy`
  while finishing.
- **S11 — Live multi-account UtilityAPI ingestion + onboarding server actions have ZERO test coverage.**
  `classifyAuthorizations`, `readyCountsFromRaw`, `importUtilityApiIntoFarm` null/force/historyLanded gating, the
  per-meter Green Button string-array path, `metersFailed`, and every server-action auth gate are untested. Add the
  unit + db + failure-injection tests; assert a non-member cannot `saveConfirmation`/`finish`/`upload`.

---

## Polish

- **P1 — Sample-load records `source=smd` on a non-demo farm**, indistinguishable from a real authorization
  (`CONNECTION_SOURCE.sample` is defined but never written). Record `sample` and set `isDemo` so the dashboard badges
  it. Latent landmine for provenance-keyed analytics / LOA upgrades.
- **P2 — Stub geocode pins every meter in a fixed Madera box** (`geocode.ts:13-48`) while confirm copy says "drag
  each pin to its real spot." No lat/lng comes from ESPI/UtilityAPI. Soften the copy to "approximate"; don't imply
  the start position is meaningful; pin placement isn't required to finish.
- **P3 — Provenance/copy bundle.** Route the live-import provenance write through `recordConnectionSource` (no-downgrade
  ranking); report `metersWithUsage`/`metersWithBilling` separately (status currently counts inventory-only as
  connected); make confirm intro source-neutral (says "on your account" even for CSV uploads); hedge "we read it
  right off it" → "we read what we can off it." No em dashes.
- **P4 — `saveConfirmation` doesn't set the active-farm cookie** → a multi-farm operator can land on their old farm.
  Set `terra_active_farm` to the freshly finalized `farmId` before redirect. (No effect on single-farm Batth.)
- **P5 — Wizard a11y/affordance bundle.** Move focus to the step heading on each soft navigation + announce "Step N
  of 3" via a live region; add explicit Back links on connect/confirm; `aria-expanded`/`aria-controls` on the "More
  ways to connect" disclosure; raise disabled-Continue contrast (1.67:1 → ≥4.5:1); fix upload-hint `/70` opacity
  (3.13:1) and "Fastest" badge (3.07:1).
- **P6 — No file-size/type cap on uploads** (`accept` is a client-only hint). Low risk under the 1 MB platform cap,
  but add an explicit byte guard + type check. *(See B5 — the inverse problem, too-small cap, is the bigger one.)*
- **P7 — Em dash in `copy/en.ts:1081`** (`emptyShort: "—"`), the null-cell placeholder on the first post-onboarding
  screen. Hard-rule violation. Replace with `–` or a blank. *(Onboarding step files are clean.)*

---

## Must be verified live / by the founder (cannot be proven statically)

1. **Run `prisma migrate deploy` against a throwaway empty Postgres** — confirm B7 before the Batth DB is
   provisioned the same way.
2. **Confirm `AI_GATEWAY_API_KEY` is set on the `lavinia` Vercel project** — else B-photo upload silently lands the
   sample identity in prod (S7).
3. **A real Batth-scale (~183 meter / 57 account) authorization dry-run** to validate the synchronous import timing
   under the 300s ceiling (S6) and the partial-connect tallies (S1).
4. **The PII angle (completeness):** `uploadBillAction` persists the bill's printed service address (AI-vision
   output, untrusted) verbatim to `meter.location` and feeds it to the geocoder with no validation/cap. Decide
   whether the raw service address should be stored at all given the "never leak grower data" rule.
5. **Identify idempotency (completeness):** `identifyFarmAction` calls `createFarmFromConnection` on every submit with
   no dedupe/rate-limit; a double-submit or back-then-resubmit storms duplicate farms. Dedupe on an in-progress
   membership-keyed farm before create; test the double-submit/back-button path.

---

## What the adversarial pass REFUTED (checked and dismissed — don't re-chase)

- **"Uploads can OOM the function" (×4 findings)** — refuted. Next.js enforces the 1 MB Server Action body cap at
  the framework boundary before `.text()`/`.arrayBuffer()` runs; the request is rejected mid-stream. The *real*
  inverse risk (cap too small) is captured as **B5**.
- **"Forced/partial PG&E pull where `historyLanded` and the confirm gate disagree, bouncing the grower"** — refuted
  on the forced path (`historyLanded ⇒ hasRealSource`, the predicates can't disagree in that direction). The genuine
  edge is the *non-force* path with all Green Button fetches failing — captured as **B1**.
- **"Invited owner/manager can't complete/resume onboarding" (the `Farm.userId` page gate)** — refuted as a *live*
  bug: no second member can be attached to a not-yet-finalized farm (invites require an active `pge_smd` connection
  first), and the behavior is fail-closed. Still worth unifying as defense-in-depth — captured as **S3**.
- **"Reveal poll 429 trips `errorKind=network` and stops polling"** — refuted. `pgeRevealAction` swallows the throw
  and returns `null`; a transient 429 costs one wasted poll and self-heals. Residual is wasted call volume only.
- **"`connectSampleAction` has no try/catch → raw crash"** — refuted. The committed fixture ships via
  `outputFileTracingIncludes`, and the `(app)/error.tsx` boundary renders a calm recoverable screen. Sample path
  isn't the Batth grower's path anyway.
- **"Bill upload `needs_review` → inventory → stranded in prod"** — refuted. With the gateway key set,
  `persistExtraction` creates `BillingPeriod` rows regardless of `coverageState`, so the unlock gate
  (`billingPeriods > 0`) still fires. Narrow residual: a non-bill/unparseable PDF silently resets with no error.
