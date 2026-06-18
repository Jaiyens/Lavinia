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

## Deferred from: code review of 10-1-action-and-export-flavored-starters (2026-06-18)

- **Manual in-app verification of the new starters** — confirm on the signed-in app that an export/PDF
  starter shows on Almond's empty chat and drives the real skill when tapped, and that NO export/PDF
  starter shows on `/tour`. Not runnable in the headless review/dev environment; the gating laws are
  proven by the pure unit tests + production build. Disclosed in the story's Dev Agent Record.
  [Story 10.1 Task 5] (Acceptance Auditor)
- **(Possible follow-up, pending the Story 10.1 decision) `navigate` cannot resolve a finding /
  "opportunity"** — `resolveNavigate` (src/lib/almond/skills/navigate.ts) handles meter/lens/entity/
  ranch/rate only. The "Open my biggest opportunity" starter (FR21's example) therefore has no direct
  navigate target; the model must `listFindings` then navigate to that meter, or answer as a read. If
  the Story 10.1 review decision keeps the starter copy, consider an Epic 7 enhancement that lets
  `navigate` open the top/named finding directly. [src/lib/almond/skills/navigate.ts] (Edge Case Hunter, Med)

## Deferred from: code review of 10-2-rail-entry-and-the-calm-first-run-nudge (2026-06-18)

- **Tour rail "Ask Almond" is a dead control when no demo farm exists** — on `/tour`, when
  `demoFarm` returns null (un-seeded DB, or the badged demo farm was deleted), `AgentRail demo` still
  renders the new "Ask Almond" button, but `AlmondLauncher` is gated behind `{resolved && ...}` in the
  Tour layout, so the click flips the shared `open` with no launcher mounted to consume it (a silent
  no-op). Degenerate state: the whole Tour is non-functional without a demo farm (no findings, no
  launcher), and the pre-existing FAB launcher is likewise absent there — so the new entry is no worse
  than the existing behavior. If the Tour is ever hardened against a missing demo farm, gate the rail
  entry (or render a disabled state) when the launcher is not mounted.
  [src/app/tour/layout.tsx, src/app/(app)/_components/shell/agent-rail.tsx] (Edge Case Hunter, Med)
- **Manual in-app verification of the rail entry + nudge** — confirm on the signed-in app that the
  desktop rail "Ask Almond" opens the panel, the first-run nudge shows on a real owner's Home with
  working "Show me" / dismiss and does not reappear after dismissal, and that `/tour` shows the rail
  entry but no nudge. Not runnable in the headless review/dev environment; the gating laws are proven by
  the pure unit tests + production build. Disclosed in the story's Dev Agent Record. [Story 10.2 Task 7]
  (Acceptance Auditor)
