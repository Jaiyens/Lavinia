# Addendum — Almond generative-operator PRD

Technical-how, mechanism, and rejected alternatives that earned a place but do not belong in the capability-level PRD. For the downstream architecture / solution-design pass.

## Mechanism notes

### Navigation skills reuse existing URL state (do not build new)
The dashboard already drives every primary surface from canonical nuqs URL-state keys: `meter` (the shared meter drawer), `lens` (calendar / table / chart / map), and the filters `entity`, `ranch`, `rate`. Almond's `navigate` skill sets these keys; the existing surfaces react. No new routing, no parallel navigation layer. The action chip is the conversation-side record of the state change and links back to it. Because the keys are non-destructive view state, "undo" is browser/back navigation — there is nothing to roll back.

**Single source of truth (NFR: stays native to a changing dashboard).** The dashboard changes constantly. Almond's navigation must read the *canonical key set + lens registry* (`src/lib/dashboard/lens.ts` and the closed `lens | entity | ranch | rate | meter` set) rather than hardcoding routes, so a dashboard change updates the operator's reach in one place. Almond must never offer to open a surface that no longer exists; if a key/lens is retired, the navigate skill loses it automatically.

### Data-first export scope (v1)
Per the data-first instinct (farmers want their data upfront, not findings/recs first), v1 exports lead with the data growers already trust — the **meter table** and the **bill-due schedule** (the calendar). Findings/recommendation exports are deferred (PRD Open Q4) until a farmer validates that they want them. This mirrors the dashboard's own hero-not-money-loudest, data-first direction.

### The skill framework rides the existing tool layer
Almond's six read tools (Story 6.1: `getFarmOverview`, `listMeters`, `getMeter`, `listFindings`, `getRatesSummary`, `getReconciliation`) are already farm-scoped, grounded, and built by a factory closed over the resolved `farmId`. The skill framework adds *action/generation* skills alongside these read tools, selected by the model via the same AI SDK v6 tool-calling loop. Each skill:
- is built by the same farm-scoped factory (closes over `farmId`; never takes scope from the model — FR7),
- sources content only through the read tools / dashboard loaders (FR8),
- is read-only on data (FR6).

Keep skill *execution logic* (artifact shaping) pure and unit-tested, mirroring how `shape.ts` keeps Almond's response shaping pure. The route only wires.

### Model boundary stays injected
Keep the Story 6.1 pattern: `AlmondResponder` with an offline deterministic stub (default, zero external calls, used by tests/CI) and a live Vercel AI Gateway responder built only when the key is present (`AI_GATEWAY_API_KEY ?? VERCEL_AI_SDK_API_KEY`, model `anthropic/claude-opus-4-8`, via `src/lib/ai/gateway.ts`). New skills must be exercisable by the stub so e2e/CI stay offline and deterministic.

### Server-side artifact generation — pure JS, no Chromium
Generate artifacts server-side with pure-JS libraries to stay serverless-safe on Vercel:
- **CSV** — already solved (`src/lib/dashboard/csv.ts` `metersCsv`); reuse and extend.
- **XLSX** — `exceljs` (pure JS, no native binaries).
- **PDF** — `pdfkit` or `@react-pdf/renderer` (pure JS; we draw the layout) for the branded report.
- **PPTX (future skill)** — `pptxgenjs` (pure JS) when that skill lands.

**Explicitly avoid headless Chromium / Puppeteer for PDF.** It is the serverless-gotcha path: read-only FS (only `/tmp`), the ~250MB unzipped / ~50MB zipped function bundle limit (full Chromium busts it; needs `puppeteer-core` + `@sparticuz/chromium`), ~15s browser cold starts forcing extended `maxDuration`, and custom fonts must be bundled. The warm-palette report is composable with `@react-pdf`/`pdfkit` without any of that tax. Reserve Chromium only if a future skill genuinely needs pixel-faithful HTML→PDF (it does not for v1).

### Reports-area persistence and storage — DECIDED
Saved artifacts (FR15–FR16) need: (a) a persisted record (a `GeneratedReport`-style row: id, farmId, kind, request text, createdAt, file pointer) and (b) file storage.

**Decision (2026-06-17): the relational DB stays Neon Postgres; report *files* go in Vercel Blob (private).** The `GeneratedReport` row lives in the existing Neon/Prisma schema, farm-scoped like findings/meters; the file bytes go to Vercel Blob with private, non-guessable, scoped/expiring access (never a public URL), and stored-file access inherits the owner-scope check.

**Why not Supabase (the "why aren't we on Supabase?" question):**
- Neon vs Supabase is a *Postgres-provider* question — both are Postgres. Terra is already on Neon, the Postgres that Vercel's own integration defaults to (Vercel Postgres ran on Neon; it is now a Marketplace install). Neon's serverless + branching fit Vercel preview deploys, it works today, and tests run against local Postgres. Migrating providers is real risk for ~zero gain.
- Supabase's pull is its *bundle* (Postgres + Auth + Storage + Realtime) for greenfield BaaS apps. Terra already made deliberate, working choices for the two pieces Supabase would bundle: **Auth.js** (passwordless Google + magic link) for auth, **Neon** for the DB. Adopting Supabase now means a second platform and re-doing auth for marginal benefit.
- The real need here is *file storage*, not a DB swap. **Vercel Blob** gives private object storage native to the existing Vercel deploy, a pure-JS SDK, scoped/expiring URLs, and zero new platform — strictly the lowest-friction fit. Supabase Storage solves the same need but drags in the second platform.
- Net: keep Neon, add Vercel Blob for files. Revisit Supabase only as a deliberate platform bet on its realtime/edge bundle, never as a storage afterthought.

**Considered alternative — regenerate-on-download (no blob):** store only the report *spec* (request + params) and rebuild the file each download. Storage-free and always fresh, but a "saved" report would silently change as farm data changes — bad for an artifact a grower already shared with a lender. Saved reports should be immutable, so we store the bytes (a separate "refresh this report" action can regenerate later if wanted).

## Rejected / deferred alternatives (rationale)

- **Write-actions in v1 (resolve findings, change rates).** Rejected for v1 (D3). Notion's agent does take confirmed write actions, but each requires a confirm-with-preview gate and careful permission inheritance. Staying read-only keeps Terra's "display, never execute" law, removes the entire confirmation-risk surface, and still feels fully agentic via navigate + generate. Revisit post-v1 as the natural next wedge expansion.
- **Chat-first / agent-as-front-door.** Rejected (D2). Glean/Sierra/Decagon put the agent as the front door; Terra keeps the dashboard as the hero and Almond as the operator that drives it — lower risk, preserves the legibility moat, and the grower never loses the canvas.
- **A single rigid PDF template.** Rejected (D8). The report is "whatever the farmer asks for" — request-driven and generative, grounded in real data, with sensible defaults rather than one fixed shape.
- **Email delivery in v1.** Deferred (D7). The Resend integration exists, but v1 ships download + saved Reports; email is a clean future skill.
- **Chromium-based PDF.** Rejected (see above) — pure-JS avoids the Vercel bundle/cold-start tax.
- **Migrating to Supabase.** Rejected (D13). Keep Neon Postgres; add Vercel Blob for report files. Full rationale in the storage section above.

## Reuse map (don't reinvent)

| Need | Reuse |
|------|-------|
| Open a meter | `?meter=` drawer (Story 2-5) |
| Switch view | `lens` toggle: calendar/table/chart/map |
| Filter | `entity` / `ranch` / `rate` keys, `filter-bar.tsx` |
| CSV | `src/lib/dashboard/csv.ts` `metersCsv` + `meter-table.tsx` export |
| Grounded data | Story 6.1 tool layer + dashboard loaders |
| Coverage honesty | reconciliation/coverage (Story 1-7) for FR19 footers |
| Model boundary | `AlmondResponder` + `src/lib/ai/gateway.ts` |
| Owner-scoping | `dashboardFarm` + the `(app)/actions.ts` scoping law |
