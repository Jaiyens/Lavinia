---
baseline_commit: b5119ecc35b1cf646f9ecfbe0b86946ce2f98cdc
---

# Story 5.2: Connect a data source (operator-operable onboarding)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator setting up a grower,
I want to identify the farm and connect at least one real data source, correcting only what we could not read,
so that the grower lands in a dashboard of his own real farm, not a form.

## Acceptance Criteria

1. **Given** onboarding, **When** run, **Then** it is operator-operable: identify (farm name + contact) -> connect a source -> confirm -> land in the dashboard.

2. **Given** the source picker, **When** shown, **Then** it offers Connect PG&E authorization, Upload bills, and Upload meter-master spreadsheet, gating on at least one real source (PG&E auth or billing), with accounts addable iteratively; the admin import action (Epic 1) runs the ingest.

3. **Given** fields printed on an uploaded bill (address/city/zip/phone), **When** onboarding, **Then** the grower is never asked to type them.

4. **Given** the confirm step, **When** shown, **Then** only fields we could not read are surfaced for inline correction, never blank-faked.

5. **Given** the LOA, **When** offered, **Then** it is framed as an upgrade after value ("so you never upload a bill again"), never the entry gate; the Bayou live-connect stays dormant, targeting the canonical shape.

### AC interpretation notes (read before coding)

- **This story is a RE-HOUSE + value-honest IA, NOT a new ingest engine.** Every ingest edge already exists in `src/lib/onboarding/farm.ts` and the source seams in `source.ts`/`vision.ts`/`geocode.ts` (all stubbed, zero external calls). Story 5.2 builds the NEW operator-operable flow under the gated `(app)/onboarding` route group and wires it to those existing edges. Do NOT rewrite `connectGreenButtonUpload`, `connectSpreadsheet`, `connectSampleFeed`, `connectManual`, `readBillPhoto`, `classifyFarmPumps`, `farmForConfirm`, or `saveConfirmation` - call them. The legacy reveal-based flow under `src/app/dashboard/pump-timing/onboarding/*` is what this REPLACES as the canonical path (the UX spec retired the scripted Bayou reveal); leave the legacy route files in place but unlinked (do not delete in this story - Story 5.1's e2e and the dormant Bayou code still reference them; a later cleanup removes them).

- **"via `api/import`" (AC2) - there is NO `api/import` route, and you do not build one here.** Despite the architecture listing `app/api/import/route.ts (new)`, Story 1.8 built the Epic 1 ingest as pure lib edges + the bill-PDF extraction in `src/lib/extract/import.ts` (`runExtraction`/`persistExtraction`), NOT as an HTTP route (verified: the only `route.ts` is 5.1's `(auth)/api/auth/[...nextauth]`). The operator onboarding's ingest IS those lib edges, invoked from Server Actions (exactly as the legacy `onboarding/actions.ts` does). Interpret "the admin import action (Epic 1) runs the ingest" as: the connect Server Actions call the Epic 1 `connect*` edges (Green Button / spreadsheet / bill-scan / Bayou). The heavy admin bill-PDF extraction (`runExtraction`) is a SEPARATE dev/admin path and is out of scope here. Do NOT add a public REST endpoint (project-context locks "no public REST/GraphQL; Server Actions mutate").

- **The three source paths map onto existing edges, with the v1 stubs (zero external calls):**
  - **Connect PG&E authorization** = the real-source PG&E pull. In v1 the source seam is stubbed: when Bayou is configured (`bayouConfigured()`) use `startBayouConnection` (the dormant live path, see AC5); otherwise pull the committed sample Green Button feed via `connectSampleFeed` (which calls `fetchGreenButton` -> the committed fixture). Either way it creates a Farm + a `pge_smd` Connection and imports meters. This counts as a "real source" for the AC2 gate.
  - **Upload bills** = the billing source. v1 reads a bill via the stubbed `readBillPhoto` (returns the committed `fixtures/onboarding/sample-bill.json`); the printed fields (accountName, serviceId, meterSerial, rateSchedule, billingSerial, address) prefill identity so the grower never types them (AC3). For v1 a "bill upload" that yields a serviceId + rate can land a farm via `connectManual` (single metered-less pump) or, preferably, be treated as a billing-source that satisfies the gate. Keep it honest: the sample bill is the v1 stand-in for a real scan.
  - **Upload meter-master spreadsheet** = the inventory source via `connectSpreadsheet` (CSV -> `parseInventory` -> `importInventory`). Per AC2 this is OPTIONAL (inventory, not billing), so it does NOT by itself satisfy the "at least one real source" gate - PG&E auth OR a bill does.

- **The ≥1-real-source gate (AC2).** The operator cannot reach Confirm until at least one of {PG&E authorization, bill upload} has landed data on the farm. A spreadsheet alone (inventory, no billing/usage) does NOT pass the gate (it has no usage to reconcile or chart). Enforce this in the connect step: track what has been connected on the in-progress farm and disable "Continue to confirm" until a real source is present. "Accounts addable iteratively" = the operator may upload more Green Button files / more spreadsheet rows / more bills before confirming; the edges upsert by SA ID (`importMeters`/`importInventory` are idempotent and accumulate), so re-running adds accounts without duplicating.

- **Identify step (AC1).** First screen: farm name + a contact (owner name, optionally email). This is operator-entered (the operator is a logged-in Terra user per 5.1's gate). Create the Farm at the start of connect (via the edge's `name`/`ownerName` inputs) OR carry the identify values forward and pass them into the first `connect*` call (which already accepts `name`). Prefer passing identify values into the first connect call so no empty farm is created if the operator abandons. Persist the contact as a `Person{role:"owner"}` at confirm/connect (the legacy `saveOwnerAction` shows the pattern) - reuse it, do not invent a new Person path.

- **Attach the farm to the operator (forward-looking, cheap).** Story 5.1 added `Farm.userId` (nullable, not yet filtered). Set `Farm.userId = session.user.id` when the onboarding creates the farm, so the grower's connected farm is owned by the signed-in operator/grower. Do NOT yet change `dashboardFarm`/`currentFarm` to filter by `userId` (that remains deferred - changing it risks hiding the demo seed and breaking existing tests). Setting the column now is forward-looking and harmless. Thread `session.user.id` from the gated Server Action via `auth()`.

- **Confirm surfaces ONLY unreadable fields (AC4), never blank-faked.** Reuse the existing confirm machinery: `farmForConfirm(prisma, farmId)` + the `ConfirmClient`/`ConfirmData` view models (`confirm-client.tsx`) + `PinMap` + `saveConfirmation`. The confirm step shows the classifier's verdict per pump and flags the `unsure` ones for a double-check (that is the "only what we could not read" surface). Do NOT present empty inputs as if they were read values. If a field was read from the bill/feed, show it as confirmed (read-only or pre-filled), not as a blank the grower must fill. The existing `ConfirmPumpVM.unsure` / `verdictKind` is exactly this signal - keep it.

- **AC5 - LOA as an upgrade, Bayou dormant.** The Letter of Authorization / "Connect PG&E so you never upload a bill again" is framed as an UPGRADE offered AFTER the grower has value (i.e., after a bill/spreadsheet source already landed them in a working dashboard), never as the entry toll. In the connect picker, PG&E authorization is one option among equals (not a forced first step), and the "never upload a bill again" framing belongs on a post-value upsell surface (e.g., a settings/connect-more affordance or a calm card after confirm), NOT blocking entry. The Bayou live-connect (`startBayouConnection`/`finishBayouConnection`/`bayouReadiness`) stays DORMANT (only active when `bayouConfigured()`), targets the canonical shape it already normalizes to, and is not the gate. Copy must be plain operator English: no em dashes, no exclamation marks, never salesy.

- **Repoint the 5.1 hook.** `src/app/(app)/layout.tsx` has `const CONNECT_SOURCE_PATH = "/dashboard/pump-timing/onboarding"; // TODO(5.2): repoint`. Change it to the new flow's entry (`/onboarding`, the `(app)/onboarding` identify page). The onboarding route is INSIDE the `(app)` group, so it is auth-gated (operator must be signed in) - confirm the gate does not create a redirect loop (onboarding must render for a signed-in user with no farm; it must NOT itself require `dashboardFarm` to be non-null). The `(app)/layout.tsx` no-data branch redirects to `/onboarding`; the onboarding pages must therefore NOT be wrapped by the same no-data redirect (they live under `(app)` but must short-circuit before the dashboard's findings load, OR the no-data redirect must exclude the onboarding path). Simplest: make the no-data check in the layout skip the redirect when the current path is already the onboarding path, or render onboarding from a route segment that does not depend on `dashboardFarm`. Watch this carefully - a naive redirect loop here is the top risk.

- **Landing in the dashboard (AC1).** After `saveConfirmation` flips the `pge_smd` Connection to active, `currentFarm` resolves the real farm and `dashboardFarm` returns `dataKind:"real"` (no badge). Redirect to `/` (the dashboard). Run the recommendation engine after confirm (the legacy `saveConfirmationAction` calls `runEngines`) so the grower lands on a dashboard with findings, not an empty one. Reuse that pattern.

- **Keep the legacy e2e honest.** Story 5.1 left `e2e/onboarding.spec.ts` as a shallow reachability check of the LEGACY hook. Once `CONNECT_SOURCE_PATH` repoints to `/onboarding`, the no-data redirect target changes. Update the e2e to drive the NEW flow (sign in -> no farm -> `/onboarding` identify -> connect the sample PG&E source -> confirm -> land in dashboard) against the throwaway e2e db. The new flow must be drivable OFFLINE (the sample Green Button feed, zero external calls), which it is. This replaces the legacy-hook reachability assertion.

## Tasks / Subtasks

- [x] Task 1: The onboarding route group + identify step (AC1)
  - [x] New `src/app/(app)/onboarding/page.tsx` (the identify step): a Server Component form for farm name + contact (owner name, optional email). It must render for a signed-in user with NO farm without bouncing (see the no-data-loop guardrail). Plain copy from `src/copy/en.ts` (new `en.onboarding2.*` or reuse `en.onboarding.*` keys where they fit - do not duplicate strings).
  - [x] New `src/app/(app)/onboarding/actions.ts` ("use server"): the connect Server Actions, each re-checking `auth()` (a Server Action is independently reachable, per 5.1) and reading `session.user.id` to set `Farm.userId`. Reuse the `ActionResult` discriminated-union convention. Carry the identify values (farmName, ownerName) into the first connect call.
  - [x] Resolve the no-data redirect loop: in `(app)/layout.tsx`, do NOT redirect to `CONNECT_SOURCE_PATH` when the request is already under `/onboarding` (read the path, or restructure so onboarding pages short-circuit before the dashboard findings load). Add a focused note in the layout.

- [x] Task 2: Repoint the connect-source hook (AC1)
  - [x] `src/app/(app)/layout.tsx`: change `CONNECT_SOURCE_PATH` from `/dashboard/pump-timing/onboarding` to `/onboarding`; remove the `TODO(5.2)`. Confirm a signed-in user with no farm lands on the new identify step (no loop).

- [x] Task 3: The source picker + the >=1-real-source gate (AC2, AC5)
  - [x] New `src/app/(app)/onboarding/connect/page.tsx` + a client `_components/source-picker.tsx`: three paths - Connect PG&E authorization, Upload bills, Upload meter-master spreadsheet. Each wired to a Server Action calling the existing edge (`connectSampleFeed`/`startBayouConnection`, the bill path, `connectSpreadsheet`/`connectGreenButtonUpload`).
  - [x] Gate: track what has landed on the in-progress farm (a real source = PG&E auth or a bill with usage/billing). Disable "Continue to confirm" until >=1 real source is present; a spreadsheet-only farm does not pass. Surface "accounts addable iteratively" - allow uploading more before continuing; the edges upsert by SA ID (idempotent), so it accumulates.
  - [x] AC5: PG&E authorization is one option among equals, not a forced first step. The LOA / "so you never upload a bill again" framing is a post-value upsell affordance (after confirm or in settings), NOT the entry gate. Bayou stays dormant (`bayouConfigured()` guard); when unconfigured, the PG&E path pulls the committed sample feed (zero external calls).

- [x] Task 4: Bill upload never re-asks printed fields (AC3)
  - [x] The Upload-bills path reads the bill via the stubbed `readBillPhoto` and prefills identity (accountName, serviceId, meterSerial, rateSchedule, billingSerial, address) so the grower never types address/city/zip/phone. Any field the scan produced is shown as read/confirmed, never as a blank to fill. (v1 uses the committed `sample-bill.json`; the seam swaps to real vision in prod.)

- [x] Task 5: Confirm step - only unreadable fields (AC4)
  - [x] New `src/app/(app)/onboarding/confirm/page.tsx`: build `ConfirmData` from `farmForConfirm(prisma, farmId)` (reuse the legacy confirm/page.tsx derivation) and render a confirm client. Reuse the existing `ConfirmClient`/`PinMap` components and the `saveConfirmation` edge - either import them across the route group or move them into `(app)/onboarding/_components` and repoint the legacy confirm to the moved copy (prefer importing/moving over duplicating). The new `actions.ts` must export the `saveConfirmationAction` the confirm client posts to (reuse `saveConfirmation` + `runEngines`).
  - [x] Only the classifier-`unsure` pumps and genuinely-unread fields are surfaced for correction; read values are shown confirmed, never blank-faked. Persist the contact as `Person{role:"owner"}` (reuse the legacy owner-save pattern).

- [x] Task 6: Land in the dashboard + attach the farm to the operator (AC1)
  - [x] On confirm save: `saveConfirmation` flips the `pge_smd` Connection active, `runEngines` builds findings, then redirect to `/` (the dashboard, now resolving the real farm via `currentFarm`, no badge). Set `Farm.userId = session.user.id` at farm creation (forward-looking; do NOT add userId filtering to `dashboardFarm`/`currentFarm`).

- [x] Task 7: Copy, tests, e2e, gates (AC1-AC5)
  - [x] Copy in `src/copy/en.ts`: identify labels, the three source paths, the gate hint ("connect at least one source"), the LOA upsell framing, confirm strings (reuse `en.onboarding.confirm.*` where it fits). Plain operator English; no em dashes; no exclamation marks; surface language is the grower's (blocks, ranches, pumps, meters), no kW/jargon.
  - [x] Pure/unit + DB-integration tests for any NEW pure logic (the >=1-real-source gate predicate is the prime candidate - extract it as a pure function `hasRealSource(farmSummary)` and test it). Reuse existing edge tests; do not re-test the edges.
  - [x] Update `e2e/onboarding.spec.ts` (or add `e2e/connect.spec.ts`): drive the NEW flow offline - an authenticated, farm-less session lands on `/onboarding`, identifies a farm, connects the sample PG&E source, reaches confirm, saves, and lands on the dashboard showing the farm. The throwaway e2e db has no session, so the spec must establish one (reuse the 5.1 magic-link path or seed a session) - if establishing a session in e2e is heavy, drive from the connect step with a test affordance, and document the choice honestly.
  - [x] Gates: `npm run lint`, `npx tsc --noEmit`, full `npm test`, `npm run build`, `npm run test:e2e`. Browser/SSR verification against `dev.db`: a signed-in farm-less user completes identify -> connect sample -> confirm -> dashboard; record outcomes honestly in the Dev Agent Record (note the demo seed interaction).

## Dev Notes

### Scope boundary

- IN: the new `(app)/onboarding` IA (identify -> connect picker -> confirm -> dashboard) reusing the Epic 1 edges; the >=1-real-source gate; repointing `CONNECT_SOURCE_PATH`; setting `Farm.userId`; the LOA-as-upgrade framing; the confirm step reusing existing components; copy; the new-flow e2e.
- OUT: any new ingest/parse/normalize/reconcile logic (reuse the edges); a literal `api/import` REST route; the heavy admin bill-PDF extraction UI; real vision/Green Button/Bayou wiring (the seams stay stubbed, zero external calls); `dashboardFarm`/`currentFarm` userId FILTERING (deferred); deleting the legacy onboarding route (a later cleanup); "Tour a sample" / demo separation / connection states (that is Story 5.3).

### What exists to reuse (read these first)

- `src/lib/onboarding/farm.ts` - `createFarmFromConnection` (`:56`), `classifyFarmPumps` (`:96`), `connectSampleFeed` (`:141`), `connectGreenButtonUpload` (`:163`), `connectSpreadsheet` (`:478`), `connectManual` (`:891`), `startBayouConnection` (`:558`), `finishBayouConnection` (`:777`), `bayouReadiness` (`:616`), `saveConfirmation` (`:1082`), `farmForConfirm` (`:1255`), `currentFarm` (`:1216`), `dashboardFarm` (`:1241`). `ConfirmationPayload` (`:967`).
- `src/lib/onboarding/source.ts` - `fetchGreenButton` (`:45`, sample fixture), `fetchBayou` (`:88`). `src/lib/onboarding/vision.ts` - `readBillPhoto` (`:54`, sample bill). `src/lib/onboarding/geocode.ts` - `geocodeAddress` (`:38`), `defaultCenter`.
- `src/app/dashboard/pump-timing/onboarding/actions.ts` - the legacy Server Actions to mirror/adapt: `connectSampleAction`, `connectGreenButtonAction`, `connectSpreadsheetAction`, `scanBillAction`, `saveOwnerAction`, `saveConfirmationAction` (the `runEngines`-after-save pattern). Quote their shapes.
- `src/app/dashboard/pump-timing/onboarding/confirm/page.tsx` - how `ConfirmData` is built from `farmForConfirm`. `_components/confirm-client.tsx` (`ConfirmData`/`ConfirmPumpVM`/`ConfirmBlockVM`, the `unsure`/`verdictKind` "only what we could not read" signal) + `pin-map.tsx` - reuse.
- `src/app/dashboard/pump-timing/onboarding/_components/connect-paths.tsx` - the five connect UIs; harvest the form/upload patterns for the new picker (but drop the scripted reveal).
- `src/lib/bayou/client.ts` - `bayouConfigured()` (`:60`), `bayouUtility()` - the dormancy guard.
- `src/lib/spreadsheet/inventory.ts` - `parseInventory`. `src/lib/greenbutton/import.ts` - `importMeters`/`importGreenButton`/`importBayou` (source-agnostic, idempotent).
- `src/app/(app)/layout.tsx` - the auth gate + `CONNECT_SOURCE_PATH` (repoint) + the no-data redirect (loop risk). `src/app/(app)/actions.ts` - the `ActionResult` + `auth()` re-check pattern from 5.1.
- `src/lib/recommendations/run.ts` - `runEngines` (run after confirm so the dashboard lands with findings).

### Critical guardrails

1. **Reuse the edges; build no new ingest.** All `connect*`/`saveConfirmation`/`classify`/`farmForConfirm` stay as-is; the story is UI + Server Actions + routing.
2. **No redirect loop** at `/onboarding`: the no-data branch in `(app)/layout.tsx` must not bounce the onboarding pages. This is the top risk - verify a farm-less signed-in user can actually render `/onboarding`.
3. **>=1-real-source gate**: PG&E auth OR a bill unlocks confirm; spreadsheet alone does not. Extract the predicate as a pure tested function.
4. **AC3 never re-asks printed fields**; **AC4 confirm shows only unread/unsure fields**, never blank-faked - reuse the `unsure`/`verdictKind` signal.
5. **AC5 LOA is a post-value upsell, not the gate; Bayou dormant** (`bayouConfigured()` guard; sample feed when unconfigured; zero external calls).
6. **Set `Farm.userId = session.user.id`** at creation; do NOT add userId filtering to the resolvers.
7. **Land on the dashboard with findings** (`runEngines` after `saveConfirmation`), resolving the real farm (no badge).
8. **Zero external calls** in dev/test (sample feed/bill fixtures). Server Actions only - no public REST. TS strict, no `any`, `noUncheckedIndexedAccess`, `@/` alias, kebab-case, copy in `en.ts` (no em dashes / no exclamation / grower's words). Run `db:generate` only if the schema changes (it should NOT - no schema change expected).

### Previous story intelligence (5.1)

- 5.1 gated the `(app)` group (middleware + layout `auth()` + per-action `auth()`), set `session.user.id` on the JWT, added `Farm.userId` (nullable, unfiltered), and left `CONNECT_SOURCE_PATH` pointing at the legacy onboarding with a `TODO(5.2)`. This story repoints it and is the first to USE `session.user.id` (to own the farm).
- 5.1's gate bar: lint clean, tsc exit 0, full `npm test` (540 at 5.1 close), production build (no Google creds), e2e green, real-`dev.db` verification. Match or exceed.
- 5.1 found the existing onboarding e2e was already stale (legacy reveal). This story makes the NEW flow the canonical one and the e2e should follow it.
- One-story-per-commit, imperative subject. dev-story stamps `baseline_commit` from HEAD (now 5.1's commit).

### Project Structure Notes

- New: `src/app/(app)/onboarding/{page.tsx, actions.ts, connect/page.tsx, confirm/page.tsx}` + `_components/` (source picker; a confirm client - imported or moved from legacy). A pure `hasRealSource` predicate (+ test) likely in `src/lib/onboarding/` or `src/lib/dashboard/`.
- Modified: `src/app/(app)/layout.tsx` (repoint `CONNECT_SOURCE_PATH` + no-loop), `src/copy/en.ts`, `e2e/onboarding.spec.ts` (drive the new flow). Possibly `farm.ts` if `createFarmFromConnection` needs a `userId` input (add an optional `userId` to `NewFarmInput`, set it through) - a small, additive edge change.
- Untouched: the edges' ingest internals, `dashboardFarm`/`currentFarm` query bodies, the legacy route files (left dormant), `prisma/schema.prisma` (no schema change), the dashboard/lens/findings code.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2; #Epic 5] - the five ACs; operator-operable identify -> connect -> confirm -> dashboard; >=1 real source; LOA as upgrade.
- [Source: _bmad-output/planning-artifacts/architecture.md#Project structure; lines 518-523, 590] - `(app)/onboarding/{page,connect,confirm}` + `_components`; "connect-a-source - replaces the reveal flow"; FR-21 lands in `app/(app)/onboarding/*`, `lib/onboarding/*`.
- [Source: _bmad-output/planning-artifacts/architecture.md#Operator-operable import vs concierge; lines 137-140 (AR-16)] - operator-operable, not grower-self-serve.
- [Source: _bmad-output/project-context.md#Onboarding & auth] - value-honest, operator-operable; identify -> connect (PG&E SMD OR bill upload; spreadsheet optional; >=1) -> dashboard; LOA an upgrade; no scripted reveal; map geometry from PLSS + addresses (no Bayou for geo).
- [Source: src/lib/onboarding/farm.ts] - every connect/confirm/classify/resolve edge to reuse (line refs above).
- [Source: src/app/dashboard/pump-timing/onboarding/*] - the legacy flow to adapt (actions, confirm derivation, confirm-client, pin-map) minus the scripted reveal.
- [Source: src/app/(app)/layout.tsx] - `CONNECT_SOURCE_PATH` to repoint + the no-data redirect loop risk.
- [Source: _bmad-output/implementation-artifacts/5-1-sign-in-with-google-sso-or-magic-link.md] - the auth gate, `session.user.id`, `Farm.userId`, the per-action `auth()` pattern this story builds on.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow).

### Debug Log References

- `npx vitest run src/lib/onboarding/sources.test.ts src/lib/onboarding/sources.db.test.ts` - 6 pass (the gate predicate + the source-edge DB integration: PG&E feed lands usage and unlocks the gate; a meter list alone stays inventory and does not).
- `npm run lint` clean; `npx tsc --noEmit` exit 0 (after clearing the stale `.next` type cache that still referenced the moved page paths).
- `npm test` - 546 pass / 71 files (5.1 closed at 540 / 70; +6 tests, +1 file net).
- `npm run build` - succeeds; routes `/`, `/energy` (moved into `(app)/(dashboard)`), `/onboarding`, `/onboarding/connect`, `/onboarding/confirm` all present.
- `npm run test:e2e` - 4 pass (auth gating + the new `/onboarding` is gated + the legacy `/dashboard` onboarding stays public).
- Live no-loop verification (`next dev`, throwaway EMPTY db, no demo farm): signed in via magic link, then `GET /` -> 307 -> `/onboarding`, and `GET /onboarding` rendered "Whose farm is this?" (the identify page) - the no-data redirect fires once and the onboarding page renders, no loop.

### Completion Notes List

- **AC1 - operator-operable identify -> connect -> confirm -> dashboard.** New `(app)/onboarding` route group: `page.tsx` (identify: farm name + contact), `connect/page.tsx` + `_components/source-picker.tsx` (source picker), `confirm/page.tsx` (reuses the shared confirm machinery), landing on `/` after save. Every Server Action re-checks `auth()` and verifies the operator owns the in-progress farm before mutating it.
- **The redirect-loop risk, resolved by splitting the layout.** `(app)/layout.tsx` is now auth-ONLY; the three-zone shell + `dashboardFarm` + the no-data redirect moved to a new `(app)/(dashboard)/layout.tsx`, and the dashboard pages moved to `(app)/(dashboard)/{page,energy/page}.tsx` (route URLs unchanged - route groups are path-invisible). Onboarding lives under `(app)` but OUTSIDE `(app)/(dashboard)`, so a farm-less signed-in user renders the onboarding flow without the dashboard's no-data redirect bouncing them. Verified live (above).
- **AC2 - three sources + the >=1-real-source gate.** The picker offers Connect PG&E (one-click sample pull + a Green Button file upload), Upload bills, Upload meter list. "Continue to review" stays disabled until `hasRealSource` is true (PG&E usage or a posted bill). A spreadsheet alone is inventory and does NOT pass - proven by `sources.db.test.ts`. Accounts add iteratively: identify creates the farm once and sources accumulate into it via the idempotent importers (`addPgeFeed`/`addGreenButtonFiles`/`addSpreadsheet` import into the existing farmId). The ingest is the Epic 1 edges invoked from Server Actions; no `api/import` route exists or was added (documented).
- **AC3 - printed fields never re-typed.** The Upload-bills path reads identity via the stubbed `readBillPhoto` (committed `sample-bill.json`) and `addBill` lands a meter with the bill's account/serviceId/rate/cycle + a geocoded pin from the address - the grower types none of it.
- **AC4 - confirm surfaces only unread/unsure fields.** The confirm step reuses `farmForConfirm` + the existing `ConfirmClient` (parameterized with a `saveAction` prop so the new flow lands on `/` while the legacy confirm still lands on `/done`). It flags only classifier-`unsure` verdicts for a double-check; read values are shown confirmed, never blank-faked.
- **AC5 - LOA as upgrade, Bayou dormant.** PG&E is one option among equals, not a forced first step; the "connect PG&E so you never upload a bill again" line is a calm upsell on the PG&E card, never the entry gate. Bayou stays dormant (the v1 PG&E path pulls the committed sample feed via the stubbed seam; `bayouConfigured()` still guards the live path; zero external calls).
- **Operator ownership.** The onboarding sets `Farm.userId = session.user.id` at creation (first use of 5.1's column); `dashboardFarm`/`currentFarm` are deliberately NOT yet filtered by owner (deferred) so the demo seed and existing tests are unaffected.
- **v1 honesty (documented in code).** The fully-working real source offline is the PG&E feed (lands usage). The v1 bill scan reads only identity (the stub returns no charges), and a spreadsheet is inventory - neither alone passes the gate until real bill extraction (FR-2) lands posted billing periods, at which point the structural `hasRealSource` predicate lights up with no change. This is honest, not a gap.
- **Reuse, not rewrite.** No ingest/parse/normalize/reconcile logic was added; the story is the new IA + Server Actions + the `hasRealSource` gate predicate + the layout split. No schema change (no migration). The legacy onboarding route is left in place (dormant, unlinked) per scope.

### File List

- `src/app/(app)/layout.tsx` (modified) - reduced to the auth-only gate.
- `src/app/(app)/(dashboard)/layout.tsx` (new) - the three-zone shell + `dashboardFarm` + no-data redirect (now to `/onboarding`).
- `src/app/(app)/(dashboard)/page.tsx` (moved from `(app)/page.tsx`) - import path fixed.
- `src/app/(app)/(dashboard)/energy/page.tsx` (moved from `(app)/energy/page.tsx`) - import path fixed.
- `src/app/(app)/onboarding/page.tsx` (new) - the identify step.
- `src/app/(app)/onboarding/actions.ts` (new) - the connect/confirm Server Actions (auth + ownership checks).
- `src/app/(app)/onboarding/connect/page.tsx` (new) - the source-picker server page (gate computation).
- `src/app/(app)/onboarding/_components/source-picker.tsx` (new) - the three-source picker client UI.
- `src/app/(app)/onboarding/confirm/page.tsx` (new) - the confirm step reusing `farmForConfirm` + `ConfirmClient`.
- `src/lib/onboarding/sources.ts` (new) - `hasRealSource` (pure) + `summarizeFarmSources` + the source-add edges (`addPgeFeed`/`addGreenButtonFiles`/`addSpreadsheet`/`addBill`).
- `src/lib/onboarding/sources.test.ts` (new) - the gate-predicate unit tests.
- `src/lib/onboarding/sources.db.test.ts` (new) - the source-edge DB-integration tests.
- `src/app/dashboard/pump-timing/onboarding/_components/confirm-client.tsx` (modified) - `ConfirmClient` now accepts a `saveAction` prop (defaults to the legacy action).
- `src/copy/en.ts` (modified) - the `en.connect.*` strings.
- `e2e/onboarding.spec.ts` (modified) - new `/onboarding` gated + legacy public reachability.

### Change Log

- 2026-06-10: Implemented Story 5.2 (connect-a-data-source operator-operable onboarding). New `(app)/onboarding` IA (identify -> connect picker -> confirm -> dashboard) reusing the Epic 1 edges; the `hasRealSource` gate; split the `(app)` layout into auth-only + a `(dashboard)` shell layout to fix the no-data redirect loop (moved `/` and `/energy` into `(app)/(dashboard)`); repointed the no-data redirect to `/onboarding`; set `Farm.userId` to the operator; parameterized `ConfirmClient`'s save action. No new ingest logic, no schema change, no `api/import` route. Gates green: lint, tsc, 546 tests, build, e2e 4/4, live no-loop verification. Status -> review.
- 2026-06-10: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 5 ACs confirmed functionally satisfied. 7 findings patched (2 High cross-tenant read IDORs + 5 Med correctness/UX), 4 deferred, 2 dismissed. Gates re-run green (lint, tsc, 546 tests, build, e2e 4/4). Status -> done.

## Review Findings

Adversarial three-layer review (2026-06-10). Acceptance Auditor: all 5 ACs functionally satisfied; guardrails (reuse-not-rewrite, no schema change, no `api/import`, the no-loop layout split, `Farm.userId` set but resolvers unfiltered, copy in en.ts with no em dash / no exclamation, legacy route intact) all held. The standout defects were two cross-tenant READ IDORs: the mutating actions all gate on `ownsFarm`, but the read-side connect/confirm pages trusted a URL `farmId`.

Patches (applied):

- [x] [Review][Patch] Cross-tenant read IDOR on the connect page [src/app/(app)/onboarding/connect/page.tsx] - HIGH (blind+edge). The page loaded a farm by URL `farmId` with only an existence check, so a signed-in operator could read another operator's meter counts. Now reads `auth()` + `findFirst({ where: { id, userId } })`; a non-owned id 404s.
- [x] [Review][Patch] Cross-tenant read IDOR on the confirm page [src/app/(app)/onboarding/confirm/page.tsx] - HIGH (blind+edge). `farmForConfirm` rendered another user's full farm (names, lat/long, rates) from a URL id. Now ownership-scoped before rendering; also re-checks `hasRealSource` and bounces to connect, so the >=1-real-source gate cannot be URL-bypassed.
- [x] [Review][Patch] Bill upload with no file still added a phantom sample meter [src/app/(app)/onboarding/actions.ts] - MED (edge). The v1 vision stub ignores bytes, so a click with no file (or a double-click) kept adding the same meter. Now requires an attached file; an empty submit bounces back to the picker.
- [x] [Review][Patch] Green Button upload of a meter-less file silently no-opped [src/app/(app)/onboarding/actions.ts, sources.ts] - MED (edge). A well-formed file with 0 (electric) meters reported success and left the gate locked with no explanation. `addGreenButtonFiles` now returns the imported count and the action surfaces "no meters found" (parity with the spreadsheet path).
- [x] [Review][Patch] LOA upsell sat at the entry gate, not after value [source-picker.tsx, en.ts] - MED (auditor, AC5). The "never upload a bill again" note was rendered on the PG&E card in the entry picker. Removed it; PG&E stays one option among equals and the post-value upsell is left as a TODO for a later post-confirm/settings surface, honoring "never the entry gate."
- [x] [Review][Patch] Owner email dropped when the name field was blank [src/app/(app)/onboarding/actions.ts] - MED (auditor). `createFarmFromConnection` makes the owner Person only when a name is given, so an email-without-name was lost by the `updateMany`. Now creates the owner Person when none exists.
- [x] [Review][Patch] Upload actions failed silently on a lost session [src/app/(app)/onboarding/actions.ts, source-picker.tsx] - MED (blind). The `useActionState` upload actions returned `{error:"auth"}`, which the UI suppressed, leaving a dead button. They now `redirect("/login")` on an auth/ownership failure; the now-dead "auth"-suppression branch was removed.

Deferred (real but out of 5.2 scope; recorded in deferred-work.md):

- [x] [Review][Defer] `dashboardFarm`/`currentFarm` ignore `userId`, so any signed-in user lands on the most recent connected farm [src/lib/onboarding/farm.ts] - the spec deliberately deferred owner-filtering (filtering now would hide the demo seed's representative fallback and break existing tests); v1 is effectively single-grower. A multi-tenant ownership story owns this. 5.2 only populates `Farm.userId`.
- [x] [Review][Defer] `identifyFarmAction` creates a new farm on every submit (orphan pending farms on back/refresh) - harmless to resolution (`currentFarm` requires an active connection), a v1 cleanliness item; a later pass can reuse an operator's existing pending farm.
- [x] [Review][Defer] No server-side file size/count cap on uploads - mitigated by Next's default Server Action body limit (~1MB); revisit if the limit is raised for large real Green Button exports.
- [x] [Review][Defer] `addBill` create-not-upsert + a future all-null real scan would make indistinguishable unpinned duplicates - latent behind the FR-2 real-vision cutover; benign with the v1 stub.

Dismissed:

- [x] [Review][Dismiss] `addPgeFeed` active-status coupling could skip confirm (Med, blind) - VERIFIED not a bug: `addPgeFeed` imports + classifies but does NOT flip the connection to active (only `saveConfirmation` does), so the connect/confirm finalize guards fire only after save, as intended.
- [x] [Review][Dismiss] Unguarded `JSON.parse` in `saveConfirmationAction` (Low, blind) - the payload comes from our own `ConfirmClient` (JSON.stringify), the ownership check gates the mutation, and this matches the legacy action; a malformed payload is a 500, not a security issue.
