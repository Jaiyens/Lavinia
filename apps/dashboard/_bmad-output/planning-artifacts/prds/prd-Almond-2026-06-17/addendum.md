# Addendum — Almond generative-operator PRD

Technical-how, mechanism, and rejected alternatives that earned a place but do not belong in the capability-level PRD. For the downstream architecture / solution-design pass.

## Mechanism notes

### Navigation skills reuse existing URL state (do not build new)
The dashboard already drives every primary surface from canonical nuqs URL-state keys: `meter` (the shared meter drawer), `lens` (calendar / table / chart / map), and the filters `entity`, `ranch`, `rate`. Almond's `navigate` skill sets these keys; the existing surfaces react. No new routing, no parallel navigation layer. The action chip is the conversation-side record of the state change and links back to it. Because the keys are non-destructive view state, "undo" is browser/back navigation — there is nothing to roll back.

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

### Reports-area persistence and storage
Saved artifacts (FR15–FR16) need: (a) a persisted record (a `GeneratedReport`-style row: id, farmId, kind, request text, createdAt, file pointer) and (b) file storage. **Assume Vercel Blob** (now supports private storage) with scoped, non-guessable, expiring access — not a public URL. Farm-scope the record the same way findings/meters are scoped. Stored-file access must inherit the owner-scope check; never a guessable path.

## Rejected / deferred alternatives (rationale)

- **Write-actions in v1 (resolve findings, change rates).** Rejected for v1 (D3). Notion's agent does take confirmed write actions, but each requires a confirm-with-preview gate and careful permission inheritance. Staying read-only keeps Terra's "display, never execute" law, removes the entire confirmation-risk surface, and still feels fully agentic via navigate + generate. Revisit post-v1 as the natural next wedge expansion.
- **Chat-first / agent-as-front-door.** Rejected (D2). Glean/Sierra/Decagon put the agent as the front door; Terra keeps the dashboard as the hero and Almond as the operator that drives it — lower risk, preserves the legibility moat, and the grower never loses the canvas.
- **A single rigid PDF template.** Rejected (D8). The report is "whatever the farmer asks for" — request-driven and generative, grounded in real data, with sensible defaults rather than one fixed shape.
- **Email delivery in v1.** Deferred (D7). The Resend integration exists, but v1 ships download + saved Reports; email is a clean future skill.
- **Chromium-based PDF.** Rejected (see above) — pure-JS avoids the Vercel bundle/cold-start tax.

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
