# Batth Farms Analysis — Index & Read Order

**Authoritative docs (read in this order):**
1. **NUMBERS-RECONCILED.md** — the dollar figures (single source of truth; supersedes all others)
2. **SAVINGS-METHODOLOGY.md** — how savings are computed, who does it, is it AI (the core question, code-proven)
3. **DECISION.md** — data strategy + Tuesday demo script (its $ figures are superseded by #1)
4. **DATA-DICTIONARY.md** — the normalized dataset reference
5. **meters/** — one full dossier per meter (183 files)
6. **methodology/** — per-lever "how we know" explainers + `00-how-savings-are-computed.md` (the code trace with file:line)
7. **gap-interval-data.md**, **gap-other-accounts.md**, **BUY-LIST.md** — what to buy and why
8. **dashboard-wiring.md** (how to render) + **dashboard-surfacing.md** (how each finding shows in the UI)
9. **COMPLETENESS-CRITIC.md** — known gaps / caveats
10. **normalized/** — the UtilityAPI-shaped dataset (`meters.json`, `manifest.json`, `by-meter/*.json`)
11. **brief-*.md** — PG&E rate / NEM / demand research briefs

**To render on the dashboard** (needs local Postgres running):
`prisma/batth-real-farm.ts` is wired and typecheck-clean. Add the `SEED_BATTH_REAL` hook to `prisma/seed.ts`
(see dashboard-wiring.md), then: `SEED_BATTH_REAL=1 npm run db:seed -w @lavinia/dashboard` and
`npm run dev:dashboard`.

**`_superseded/`** — round-1 drafts kept for provenance only. DO NOT cite (they carry the discredited
12,180 kW array figure and the $63,792 total).
