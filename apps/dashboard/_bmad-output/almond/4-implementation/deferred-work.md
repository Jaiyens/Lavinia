# Deferred work — Almond effort (Epics 7-10)

Items surfaced during review/dev that are real but intentionally not done now. Kept in the per-effort
folder (mirroring the effort's sprint-status.yaml) rather than the global Tool-1 deferred-work.md.

## Deferred from: code review of 7-4-the-server-client-navigation-bridge (2026-06-18)

All items are in the offline **stub** parser (dev/test/demo path); production uses the live model,
which produces structured navigate input and is unaffected.

- **Lens word hijacks a compound meter-open request** — "show me the table for pump 3" resolves to a
  lens switch only (the pump target is dropped). By-design stub simplification; compound requests are
  the live model's job. [src/lib/almond/responder.ts `deriveNavigateInput`] (Edge Case Hunter, Med)
- **Greedy `(.+)$` capture swallows trailing qualifiers** into the meter query (e.g. "open pump 4 on
  rate ag-5" -> query "pump 4 on rate ag-5"). By-design stub simplification. [responder.ts] (Low)
- **Constant `data-navigate` part id ("almond-nav") collides as a chip key** across multiple
  navigations in one conversation. Harmless for 7.4 (transient parts are delivered once per stream
  regardless of id), but **Story 7.5's action chip needs a stable/unique key** — give each emitted
  navigation a unique id when the chip lands. [responder.ts `NAVIGATE_PART_ID`] (Low)
- **Navigate can open a meter filtered out of the current view** — `useAlmondNavigation` sets the
  `meter` key, but the drawer's open-gate (`meters.some(...)`, meter-drawer.tsx:123) no-ops if an
  active entity/ranch/rate filter excludes that meter. Whether opening a pump should clear conflicting
  filters is a **7.5 UX decision**. [src/app/(app)/_components/almond/use-almond-navigation.ts] (Low)
- **AC3 (exactly-once) and AC5 (live-path emission) lack an executable test** — both are proven
  structurally (transient `onData`) / by typecheck (shared `writeNavigatePart`), per the project's
  node-env-vitest / no-Playwright-session convention. A single mock-`LanguageModel` test asserting the
  live path emits one `data-navigate` with the resolved action would close the AC5 runtime gap and
  exercise the `createUIMessageStream` + `writer.merge` ordering. [responder.ts, almond-launcher.tsx]
  (Acceptance Auditor nit)
