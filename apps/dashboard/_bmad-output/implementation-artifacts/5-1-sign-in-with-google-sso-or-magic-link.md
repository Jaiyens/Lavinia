---
baseline_commit: f0cc5bd1d31b758a21d5d41a0fb1cf6e13266934
---

# Story 5.1: Sign in with Google SSO or magic link

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a returning grower,
I want to log in without a password and land straight on my dashboard,
so that checking my farm takes seconds, not a login ritual.

## Acceptance Criteria

1. **Given** Auth.js v5 + `@auth/prisma-adapter`, **When** the migration is applied, **Then** the User / Account / Session / VerificationToken tables (the adapter's four) are added (created here, where first needed) and `db:generate` succeeds.

2. **Given** providers, **When** configured, **Then** Google SSO and email magic link (no passwords) work; the magic-link email sender is a stubbed boundary (marked TODO) with a real sender deferred to prod.

3. **Given** a unified `auth()`, **When** used, **Then** it gates the `(app)` group in Server Components, Server Actions, and middleware, while the `(auth)` group is public.

4. **Given** a returning user with a valid session, **When** they open the app, **Then** they land straight in the dashboard (no splash); **Given** a logged-in user with no data, **Then** they route to the connect-a-source picker, not a dead end.

5. **Given** secrets, **When** deployed, **Then** AUTH_SECRET, Google creds, and email creds are env-only, never committed.

### AC interpretation notes (read before coding)

- **The `Account` model name collides - this is the single highest-risk trap in the story.** `@auth/prisma-adapter` calls four Prisma delegates by FIXED names: `prisma.user`, `prisma.account`, `prisma.session`, `prisma.verificationToken`. But Terra ALREADY has a `model Account` (the PG&E billing account, `prisma/schema.prisma:62`) mapped to the default table `Account`. You CANNOT add a second `model Account`, and you must not rename or disturb the PG&E `Account` (it ripples across the entire ingest/dashboard codebase - Entity -> Account -> Pump). Resolution: name the auth OAuth-link model **`AuthAccount`** (its own table) and feed the adapter a thin wrapper that redirects its `account` delegate to `prisma.authAccount`. This is a documented, supported `@auth/prisma-adapter` pattern (the adapter is a plain object of delegate references; you spread `PrismaAdapter(prisma)` and override `.account`-bound methods, or pass a Proxy/extended client whose `account` points at `authAccount`). The AC says "Account ... table is added"; it is satisfied in spirit by the OAuth-account-linkage table existing under the non-colliding name `AuthAccount` - **document this variance explicitly** in the schema comment, the `lib/auth.ts` header, and the Dev Agent Record. Do NOT touch `model Account`.

- **Session strategy MUST be JWT, not database - because middleware can't reach Prisma on the edge.** AC3 requires `auth()` to gate in **middleware**. Next.js middleware runs on the edge runtime by default, and Prisma (the adapter's database-session lookup) does not run there. The `@auth/prisma-adapter` defaults to the **database** session strategy, which would force every middleware request to hit the DB - impossible on edge. Resolution: set `session: { strategy: "jwt" }`. The Prisma adapter is still used (for User + AuthAccount persistence and OAuth account linking + the VerificationToken table the magic link needs); the SESSION itself rides in a signed cookie the middleware can verify with no DB call. This is the canonical Auth.js v5 + Prisma + middleware combination. Carry `userId` into the JWT in the `jwt` callback and expose it on `session.user.id` in the `session` callback (needed for User -> Farm ownership in 5.2). The `Session` table is still created by the migration (AC1) even though JWT does not populate it - that is honest (the adapter schema includes it); note it in the Dev Agent Record.

- **Split the config: `auth.config.ts` (edge-safe) + `auth.ts` (full).** This is the Auth.js v5 pattern that makes middleware gating work. `auth.config.ts` holds everything that is edge-safe (providers list, pages, the `authorized` callback) and NO Prisma adapter import. `auth.ts` imports `auth.config.ts`, adds the `PrismaAdapter` (Node-only) + `session.strategy: "jwt"`, and exports `{ auth, handlers, signIn, signOut }`. `middleware.ts` imports ONLY `auth.config.ts` (via `NextAuth(authConfig).auth`) so no Prisma is pulled into the edge bundle. Server Components / Server Actions / the route handler import the full `auth.ts`. Per the architecture the single source is conceptually `lib/auth.ts`; implement it as this two-file split and say so in the header (the split is the mechanics of "unified `auth()`", not a contradiction of it).

- **Route groups are invisible in the URL - the middleware matcher gates by an ALLOWLIST, not an `(app)` prefix.** `(app)` and `(auth)` never appear in the path: `(app)/page.tsx` is `/`, `(app)/energy` is `/energy`, `(auth)/login` is `/login`. So middleware cannot match "the `(app)` group" by a path prefix. Gate by allowlisting the PUBLIC surface and protecting the rest: public = `/login`, `/api/auth/*` (Auth.js handler), Next internals (`/_next/*`, static assets, `favicon.ico`), AND the **legacy `/dashboard/*` tree** (the pre-rebuild pump-timing onboarding that Story 5.2 replaces - it must keep working and its e2e must stay green; do NOT gate it in this story). Everything else (`/`, `/energy`, `/settings`, ...) requires a session and redirects to `/login` when absent. Put this logic in the `authorized({ auth, request })` callback in `auth.config.ts` and a matcher that excludes static assets.

- **Layout/Server-Component gate is the AUTHORITATIVE one; middleware is the redirect UX.** Because route groups are path-invisible and middleware runs edge-side off a cookie, the trustworthy gate for the `(app)` group is an `auth()` check at the top of `src/app/(app)/layout.tsx` (a Node Server Component): no session -> `redirect("/login")`. Middleware gives the fast pre-render redirect; the layout guarantees no `(app)` Server Component renders farm data without a session even if a matcher gap slips through (defense in depth). Server Actions in `src/app/(app)/actions.ts` re-check `auth()` at the top of each action (a Server Action is a POST endpoint reachable independent of the page that rendered it - it must not trust that the page gated it). This satisfies AC3's "Server Components, Server Actions, AND middleware" literally.

- **"No data -> connect-a-source picker, not a dead end" (AC4) maps onto the EXISTING `dashboardFarm` null path, with an interim target.** `dashboardFarm(prisma)` already returns `null` only on a truly empty install (no real farm AND no demo seed); with the committed Batth demo seed present it returns the representative farm, so a freshly-logged-in user lands on the badged dashboard (NOT a dead end) - that already satisfies "land straight in the dashboard." The explicit no-data redirect applies when `dashboardFarm` is `null`: send the user to the connect-a-source picker. That picker is built in Story 5.2 at `app/(app)/onboarding` (architecture line 519); it does NOT exist yet. For THIS story, point the no-data redirect at the existing legacy onboarding (`/dashboard/pump-timing/onboarding`) as the interim non-dead-end target, behind a single `CONNECT_SOURCE_PATH` constant with a `TODO(5.2)` to repoint it. Do NOT build the new picker here (that is 5.2's scope) and do NOT build User -> Farm ownership filtering here (also 5.2) - 5.1 establishes auth + the gate + the JWT `userId`; 5.2 attaches farms to users. Keep the `userId` on the JWT so 5.2 can build on it without a second migration if cheap (see schema note below).

- **User -> Farm linkage: add the column now (cheap, first needed), filter on it later.** The architecture says "User -> Farm linkage lives in the schema" and AC4/5.2 need it. Add a nullable `userId String?` to `model Farm` + the back-relation on `model User` (`farms Farm[]`), nullable because the demo/seed farms and any pre-auth farm have no owner. Do NOT yet change `dashboardFarm`/`currentFarm` to filter by `userId` (that is 5.2's ownership story and would risk hiding the demo seed and breaking every existing test that relies on `dashboardFarm`). Adding the column now keeps 5.2 from needing a second migration; leaving the queries unchanged keeps 5.1 non-breaking. Document this as deliberate.

- **Secrets are env-only and the build/e2e must survive their ABSENCE (AC5).** `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and email creds go in `.env.example` (documented, blank) and `.env.local` (real, gitignored - `.gitignore` already ignores `.env*` except `.env.example`). The catch: the Playwright e2e runs `next start` (production) where Auth.js THROWS if `AUTH_SECRET` is missing. So (a) add `AUTH_SECRET` to the Playwright `webServer.env` (a throwaway test value is fine - it is not a real secret), and (b) make the Google provider CONDITIONAL: only register it when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set, so a build/e2e without Google creds does not crash. The magic-link (email) provider with a stubbed sender must also not throw when email creds are absent. Never commit a real secret; the test `AUTH_SECRET` in playwright.config is a non-secret throwaway, called out as such.

- **Magic-link email sender is a stubbed boundary (AC2), same pattern as `source.ts`/`vision.ts`/`geocode.ts`.** Create `src/lib/email.ts` exporting a `sendMagicLink({ identifier, url })` (or the Nodemailer/`EmailProvider` `sendVerificationRequest` shape Auth.js expects) that, in v1, writes the magic-link URL to the server console with a clearly-marked `// TODO(prod): wire a real sender (Resend/SMTP)`; zero external calls, so dev/e2e never send mail. The VerificationToken table (from the adapter) backs the link; the stub only handles DELIVERY. This is how a developer signs in by magic link locally (copy the URL from the console).

- **This story is auth plumbing, NOT a redesign of the dashboard or onboarding.** No new lens, no findings change, no dashboard data change. The `(auth)/login` page is a minimal, on-brand sign-in surface (two buttons: Continue with Google, email field + Send magic link) using existing tokens + copy in `src/copy/en.ts`. Plain operator English, no exclamation marks, no em dashes. Do NOT build the connect-a-source picker, the User-owned-farm filtering, or a real email sender (all later).

## Tasks / Subtasks

- [x] Task 1: Dependencies + env scaffolding (AC1, AC2, AC5)
  - [x] Install `next-auth@beta` (Auth.js v5) and `@auth/prisma-adapter` via npm (the repo uses npm; both verified compatible with Next 16.2.7 / React 19 per architecture line 225). Pin the resolved versions; do NOT add unrelated deps.
  - [x] Add to `.env.example` (blank, documented): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and an email-sender placeholder block (e.g. `AUTH_EMAIL_FROM`) with a comment that the sender is stubbed in v1. Mirror the existing Bayou block's documentation tone.
  - [x] Generate a real `AUTH_SECRET` into `.env.local` for local dev (`npx auth secret` or `openssl rand -base64 33`); confirm `.env.local` is gitignored (it is) and never stage it.

- [x] Task 2: Schema - the four adapter tables + the collision-safe AuthAccount + Farm.userId (AC1)
  - [x] Edit `prisma/schema.prisma`: add `model User`, `model AuthAccount` (the OAuth link - NOT named `Account`), `model Session`, `model VerificationToken` following the official Auth.js Prisma schema, with a header comment explaining the `AuthAccount` rename (the `Account` collision with the PG&E billing account) and that the adapter is wrapped to map its `account` delegate to `authAccount`. SQLite types per existing conventions (String ids `@default(cuid())` or the adapter's `@id`, `DateTime`, `@@unique([provider, providerAccountId])` on AuthAccount, `@@unique([identifier, token])` on VerificationToken).
  - [x] Add `userId String?` to `model Farm` + `user User? @relation(...)`; add `farms Farm[]` to `model User`. Index `Farm.userId`. Nullable (demo/seed/pre-auth farms own no user). Do NOT alter `model Account` (PG&E) at all.
  - [x] `npm run db:migrate -- --name add_auth_tables` (creates + applies the dev migration and auto-seeds). Confirm `db:generate` succeeds and the Prisma client now exposes `authAccount`, `user`, `session`, `verificationToken`. (AC1)
  - [x] Re-run `npm run db:seed` (or confirm the migrate auto-seed) so `dev.db` still seeds the Batth demo cleanly with the new nullable column (existing seed writes no `userId`, which is valid).

- [x] Task 3: `auth.config.ts` (edge-safe) + the `authorized` gate (AC3)
  - [x] New `src/lib/auth.config.ts`: export a `NextAuthConfig` with `pages: { signIn: "/login" }`, the provider LIST (Google conditional on env; the Email/magic-link provider referencing the stubbed sender), and the `authorized({ auth, request })` callback implementing the allowlist (public: `/login`, `/api/auth/*`, `/dashboard/*` legacy, Next internals; everything else needs `auth?.user`). NO `PrismaAdapter` import here (keeps it edge-safe). Include the `jwt`/`session` callbacks that thread `userId` (these are edge-safe pure callbacks).
  - [x] New `middleware.ts` (repo root, next to `next.config.ts`): `export { auth as middleware } from "@/lib/auth-edge"` where `auth-edge` is `NextAuth(authConfig).auth` (config-only, no adapter) - or inline per the Auth.js v5 docs. Add a `matcher` that excludes `/_next/*`, static files, and `favicon.ico`. Verify the legacy `/dashboard/*` flow and `/api/auth/*` are NOT redirected to login.

- [x] Task 4: `auth.ts` (full) + the route handler + the email stub (AC1, AC2)
  - [x] New `src/lib/auth.ts`: `NextAuth({ ...authConfig, adapter: <wrapped PrismaAdapter>, session: { strategy: "jwt" } })`, exporting `{ auth, handlers, signIn, signOut }`. Implement the adapter wrapper so its `account`-bound operations hit `prisma.authAccount` (document the wrapper). Header comment: the `Account` collision + variance, the JWT-not-database rationale, the split-config rationale.
  - [x] New `src/app/(auth)/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers`. (This is the Auth.js HTTP endpoint; it is public per the allowlist.)
  - [x] New `src/lib/email.ts`: `sendMagicLink`/`sendVerificationRequest` stub that console-logs the URL with a marked `TODO(prod)`; zero external calls. Wire it into the Email provider in `auth.config.ts`.

- [x] Task 5: The login page + the gates in layout/actions + the no-data redirect (AC3, AC4)
  - [x] New `src/app/(auth)/layout.tsx` (minimal public chrome; paper background, centered) and `src/app/(auth)/login/page.tsx`: a Server Component rendering "Continue with Google" (a form posting to `signIn("google")` via a Server Action, only shown when Google env is set) and an email input + "Send magic link" (Server Action calling `signIn("email", ...)`). On-brand, tokens + copy only.
  - [x] Gate `src/app/(app)/layout.tsx`: at the top, `const session = await auth(); if (!session?.user) redirect("/login");` BEFORE the `dashboardFarm` call. Then keep existing behavior. Add the no-data branch: if `dashboardFarm(prisma)` returns `null`, `redirect(CONNECT_SOURCE_PATH)` (the interim legacy onboarding constant with `TODO(5.2)`), so a logged-in user is never dropped on a blank shell. (Today the demo seed keeps it non-null; the branch is the honest safety net AC4 names.)
  - [x] Gate `src/app/(app)/actions.ts`: at the top of `resolveFinding`, re-check `const session = await auth(); if (!session?.user) return { ok: false, error: ... }` (a Server Action is independently reachable). Keep the existing farm-ownership + still-pending WHERE gate.
  - [x] Add a sign-out affordance somewhere unobtrusive in the shell (e.g. agent rail footer) calling `signOut()` via a Server Action, so the dev/grower can end a session. Minimal; copy in `en.ts`.
  - [x] Copy: add the login + sign-out strings to `src/copy/en.ts` (e.g. `en.auth.*`): the heading, the Google button, the email label + send button, the "we emailed you a link" confirmation, the sign-out label. Plain operator English; no em dashes; no exclamation marks.

- [x] Task 6: Keep the build, tests, and e2e green; verify; gates (AC1-AC5)
  - [x] Add `AUTH_SECRET` (throwaway non-secret) to `playwright.config.ts` `webServer.env` so `next start` does not throw; confirm the existing `e2e/onboarding.spec.ts` (legacy `/dashboard/pump-timing` flow) still passes UNCHANGED (it is on the public allowlist). If the Playwright health-check `url` (`/`) now 307-redirects to `/login`, confirm Playwright still treats it as ready (a redirect is a response); if not, point the health-check `url` at `/login` (a public 200) and note it.
  - [x] Verify Google provider is conditional: `npm run build` succeeds with NO Google creds set (CI/Vercel-preview reality). Magic-link/email provider must not throw without email creds.
  - [x] Browser verification against `dev.db`: (a) hit `/` unauthenticated -> redirected to `/login`; (b) request a magic link, copy the console URL, follow it -> land on `/` (the badged demo dashboard), session present; (c) sign out -> back to `/login`; (d) confirm the legacy `/dashboard/pump-timing` onboarding still loads without a session. Record the steps + outcomes honestly in the Dev Agent Record (note that real Google OAuth is not exercised locally without creds - the magic-link path proves the gate).
  - [x] Gates: `npm run lint` (no `any`, no unused), `npx tsc --noEmit`, full `npm test`, `npm run build`, `npm run test:e2e`. Honest Dev Agent Record: the Account-collision resolution, the JWT-not-database choice, the Session-table-created-but-unused note, the interim no-data target, and the User->Farm column added-but-not-yet-filtered.

## Dev Notes

### Scope boundary

- IN: Auth.js v5 + `@auth/prisma-adapter` (JWT sessions); the four adapter tables (with `AuthAccount` resolving the collision) + `Farm.userId` column; split `auth.config.ts`/`auth.ts`; `middleware.ts` allowlist gate; the `(auth)/login` page + route handler; the stubbed `email.ts` sender; the layout + Server-Action + middleware gates; the no-data redirect (interim target); sign-out; env scaffolding; copy.
- OUT (later stories): the connect-a-source picker UI (5.2, `app/(app)/onboarding`); User-owned-farm FILTERING in `dashboardFarm`/`currentFarm` (5.2); a real email sender (prod); "Tour a sample" / demo separation surfaces (5.3); any dashboard/findings/lens change. Do NOT rename or restructure the PG&E `model Account`. Do NOT migrate Prisma off v6.

### What exists to build on (read these files first)

- `prisma/schema.prisma:62` - `model Account` (PG&E billing account). The collision source. Read it; leave it untouched. `:15` `model Farm` gets the new `userId`. `:341` `model Connection` shows the existing `pge_smd` connection shape `currentFarm` keys on.
- `src/lib/onboarding/farm.ts:1216` `currentFarm`, `:1241` `dashboardFarm` (the null path AC4 hangs off), `:1227` the `DashboardFarm` type. Do NOT add `userId` filtering here in 5.1.
- `src/app/(app)/layout.tsx` - the Server Component that calls `dashboardFarm` then renders the three-zone shell; the authoritative gate goes at its top, before `dashboardFarm`.
- `src/app/(app)/actions.ts` - `resolveFinding`, the only `(app)` Server Action today; add the `auth()` re-check at its top, preserve the existing WHERE gate. The `ActionResult` discriminated-union pattern is the failure-return convention.
- `src/app/(app)/page.tsx`, `src/app/(app)/energy/page.tsx` - the gated routes (`/`, `/energy`).
- `src/app/dashboard/pump-timing/onboarding/*` - the LEGACY onboarding (the interim no-data target); `e2e/onboarding.spec.ts` drives it and must stay green (keep `/dashboard/*` on the public allowlist).
- `src/lib/onboarding/source.ts`, `vision.ts`, `geocode.ts` - the stubbed-boundary pattern (marked TODO, zero external calls) to mirror in `email.ts`.
- `playwright.config.ts` - the `webServer` block (add `AUTH_SECRET` to `env`; the health-check `url`). `next.config.ts` - `turbopack.root` + `outputFileTracingIncludes` (no change expected; auth reads no fixtures).
- `.env.example` / `.gitignore:33-35` - `.env*` ignored except `.env.example`; add the auth vars to `.env.example`.
- `src/copy/en.ts` - add `en.auth.*`; the no-em-dash / no-exclamation voice rules.
- Root `src/app/layout.tsx` - Inter font + `bg-bg text-ink`; the `(auth)` layout should match the brand without the OS shell.

### Critical guardrails (the trap list a reviewer will probe)

1. **Do NOT add a second `model Account`.** Auth OAuth links live in `model AuthAccount`; the adapter is wrapped to map `account -> authAccount`. The PG&E `Account` is untouched. (AC1)
2. **`session.strategy: "jwt"`** - database sessions cannot be validated in edge middleware. Thread `userId` through the `jwt`/`session` callbacks. (AC3)
3. **Split config:** `auth.config.ts` (no adapter, edge-safe) feeds `middleware.ts`; `auth.ts` (adapter, Node) feeds Server Components / Actions / the route handler. No Prisma in the edge bundle. (AC3)
4. **Allowlist gating, not an `(app)` path prefix** (route groups are path-invisible). Public: `/login`, `/api/auth/*`, `/dashboard/*` (legacy), Next internals. Everything else needs a session. (AC3)
5. **Three real gates:** middleware (redirect UX) + `(app)/layout.tsx` `auth()` (authoritative) + each Server Action `auth()` (independently reachable). (AC3)
6. **No-data is never a dead end** (AC4): the `dashboardFarm === null` branch redirects to `CONNECT_SOURCE_PATH` (interim legacy onboarding, `TODO(5.2)`); with the demo seed present the user lands on the badged dashboard.
7. **Secrets env-only and absence-tolerant** (AC5): Google provider conditional on env; `AUTH_SECRET` in `.env.example` (blank) + `.env.local` (real, gitignored) + `playwright.config` env (throwaway). Build/e2e must pass with no Google/email creds. Never stage a real secret.
8. **Email sender stubbed** (AC2): `email.ts` console-logs the link, `TODO(prod)`; zero external calls; the magic-link path is how you sign in locally.
9. **Non-breaking:** every existing test + the legacy e2e stays green; `dashboardFarm`/`currentFarm` queries unchanged; `Farm.userId` added but not yet filtered.
10. TS strict, no `any` (`@typescript-eslint/no-explicit-any` is an error), `noUncheckedIndexedAccess` guards, unused vars prefixed `_`, `@/` alias imports, kebab-case filenames. Run `db:generate` after the schema edit.

### Auth.js v5 specifics (verified shape - prevent outdated patterns)

- Package is `next-auth@beta` (v5) + `@auth/prisma-adapter`. Env prefix is `AUTH_` (e.g. `AUTH_SECRET`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are auto-read by the Google provider when named this way). `auth.ts` exports `{ handlers: { GET, POST }, auth, signIn, signOut }` from `NextAuth(config)`.
- The route handler is `export const { GET, POST } = handlers` at `app/(auth)/api/auth/[...nextauth]/route.ts`.
- Adapter wrapping for the renamed model: `PrismaAdapter(prisma)` returns an object whose methods call `prisma.account.*`; provide a client/Proxy where `account` resolves to the `authAccount` delegate, OR build the adapter against an extended client. Confirm the exact mechanics against the installed `@auth/prisma-adapter` source (read `node_modules/@auth/prisma-adapter/index.js` after install) rather than guessing - the delegate names there are authoritative.
- Magic link uses the Email/Nodemailer provider with a custom `sendVerificationRequest`; in v1 that function is the stub (console log). The provider still needs the adapter's `VerificationToken` table (created in Task 2).
- Next 16 middleware: with Fluid Compute, Node runtime in middleware is possible, but the JWT + split-config approach is simpler and the documented Auth.js path - prefer it over a Node-runtime-middleware + database-session approach.

### Previous story / epic intelligence

- Epic 5 is the first epic to introduce auth; there is no prior 5.x story. Epics 1-4 established: pure `/lib` modules + colocated tests; DB edges take an explicit `PrismaClient`; stubbed external boundaries with marked TODOs (`source.ts`, `vision.ts`, `geocode.ts`) - `email.ts` follows that exact pattern. The `(app)` group + `ActionResult` Server-Action convention came from Story 2.2/3.1.
- The recent close-the-loop stories (4.1, 4.2) show the repo's gate bar: lint clean, `tsc --noEmit` exit 0, full `npm test` green (533 tests / 68 files at 4.2 close), production build, and a real-`dev.db` browser/SSR verification - match or exceed, and add `npm run test:e2e` here since this story touches routing/gating.
- One-story-per-commit, imperative subject ("Add story 4.2: ..."). dev-story stamps `baseline_commit` from `git rev-parse HEAD`.

### Project Structure Notes

- New: `src/lib/auth.config.ts`, `src/lib/auth.ts`, `src/lib/email.ts`, `middleware.ts` (repo root), `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/api/auth/[...nextauth]/route.ts`; a new Prisma migration `add_auth_tables`.
- Modified: `prisma/schema.prisma` (4 auth models + `Farm.userId`; PG&E `Account` untouched), `src/app/(app)/layout.tsx` (auth gate + no-data redirect), `src/app/(app)/actions.ts` (auth re-check), `src/copy/en.ts` (`en.auth.*`), `.env.example`, `playwright.config.ts` (env), `package.json` (deps). Possibly the agent rail component for the sign-out affordance.
- Untouched: `model Account` (PG&E), `dashboardFarm`/`currentFarm` query bodies, every `/lib/energy` math file, the dashboard/findings/lens code, `next.config.ts` (auth reads no fixtures).
- A pure-ish unit test is hard for auth (it is mostly framework config + I/O); cover what is testable: the `authorized` allowlist callback as a pure function (public vs protected paths), and a DB-integration test that the adapter wrapper writes/reads an `AuthAccount` row (proves the collision wrapper works). Do not chase coverage on the framework glue.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1; #Epic 5] - the five ACs; LOA-as-upgrade; returning grower lands straight in the dashboard.
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security; lines 298-312] - Auth.js v5 + `@auth/prisma-adapter`, Google + magic link (no passwords), unified `auth()` in SC/SA/middleware, `AUTH_*` env, the four adapter tables, the email sender stubbed (TODO), returning-user-to-dashboard / no-data-to-connect routing.
- [Source: _bmad-output/planning-artifacts/architecture.md#Project structure; lines 503-505, 532-533, 591] - `(auth)/login`, `api/auth/[...nextauth]/route.ts`, `lib/auth.ts`, `lib/email.ts`, the Auth/returning-user mapping; the `(app)` group "authed OS shell."
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries; lines 579-581] - "Auth boundary: `lib/auth.ts` is the single `auth()` source; the `(app)` group is gated; `(auth)` is public. User -> Farm linkage lives in the schema."
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure; lines 343-344] - `AUTH_SECRET` + Google creds + email creds via env, never committed.
- [Source: _bmad-output/project-context.md#Framework-Specific Rules; #Security] - Server Components/Actions; runtime fixture reads via `process.cwd()` (n/a here); credentials never in repo/client/agent-readable; Prisma pinned v6; `db:generate` after schema edits.
- [Source: prisma/schema.prisma:62] - the PG&E `model Account` (the name collision); `:15` `model Farm`; `:341` `model Connection`.
- [Source: src/lib/onboarding/farm.ts:1216-1252] - `currentFarm` + `dashboardFarm` (the AC4 null path); leave the queries unchanged in 5.1.
- [Source: src/app/(app)/layout.tsx; src/app/(app)/actions.ts] - the gate sites.
- [Source: playwright.config.ts; e2e/onboarding.spec.ts] - the e2e that must stay green; the `webServer.env` where `AUTH_SECRET` goes.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow).

### Debug Log References

- `npx vitest run src/lib/auth.config.test.ts src/lib/auth-adapter.db.test.ts` - 7 pass (allowlist gate + Account-collision adapter wrapper).
- `npm run lint` clean; `npx tsc --noEmit` exit 0.
- `npm test` - 540 pass / 70 files (4.2 closed at 533 / 68; +7 tests, +2 files).
- `npm run build` - production build succeeds with NO Google creds set (the conditional Google provider does not crash the build/CI).
- `npm run test:e2e` - 3 pass (`auth.spec.ts` x2: `/` and `/energy` redirect to `/login`, login renders the email form, Google button absent without creds; `onboarding.spec.ts`: legacy `/dashboard` onboarding still public + renders). Zero `UntrustedHost` / `MissingAdapter` errors in the server log after the two fixes below.
- Real `dev.db` round-trip under `next start` (port 3310): `GET /` -> 307 -> `/login?callbackUrl=...`; `GET /login` -> 200; email sign-in POST -> the stub logged the magic-link URL to the console (no email sent); following the callback -> 302 to `/` and set the `authjs.session-token` (JWT) cookie; authed `GET /` -> 200 (lands on the badged demo dashboard); a `User` row (grower@batthfarms.test) was created via the wrapped adapter. Test user + verification tokens were then deleted; dev.db restored (users: 0).

### Completion Notes List

- **AC1 - the four adapter tables + the Account-collision resolution.** Migration `20260610021700_add_auth_tables` adds `User`, `AuthAccount`, `Session`, `VerificationToken` and a nullable `Farm.userId`. The PG&E `model Account` is untouched. Because `@auth/prisma-adapter` calls a delegate named `account`, the OAuth-link model is named **`AuthAccount`** and `lib/auth-adapter.ts` hands the adapter a `Proxy` of the client whose `.account` resolves to `prisma.authAccount` (every other delegate passes through). The `auth-adapter.db.test.ts` proves createUser + linkAccount land in `AuthAccount`, `getUserByAccount` reads back, and the PG&E `Account` table stays empty. `db:generate` succeeds (client exposes `authAccount`).
- **AC1 variance (documented):** the AC's literal "Account table" is satisfied in spirit by `AuthAccount` (the rename is forced by the pre-existing PG&E `Account`). The `Session` table is created but stays empty under JWT sessions (kept for adapter-schema completeness / a possible future switch).
- **AC2 - Google + magic link, sender stubbed.** Google is registered only when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are both set (so the build/e2e without creds do not crash and the Google button is conditionally hidden). The magic-link provider is a hand-rolled `type: "email"` object (NOT the `Nodemailer` factory, which hard-imports the uninstalled `nodemailer` and throws without an SMTP `server`); its `sendVerificationRequest` calls the stubbed `src/lib/email.ts` sender, which logs the link to the console with a `TODO(prod)` and makes zero external calls. Verified end-to-end (the round-trip above).
- **AC3 - gated in middleware, Server Component, and Server Action.** `middleware.ts` runs `NextAuth(authConfig).auth` (edge-safe, no adapter) and redirects unauthenticated protected requests to `/login`. `(app)/layout.tsx` re-checks `auth()` before `dashboardFarm` (authoritative). `resolveFinding` in `(app)/actions.ts` re-checks `auth()` at the top (a Server Action is independently reachable). `(auth)` is public via `isPublicPath` (unit-tested). JWT session strategy + the split `auth.config.ts` (edge) / `auth.ts` (full) keep Prisma off the edge.
- **AC4 - land in the dashboard / no dead end.** A returning user with a valid session lands straight on the dashboard (verified: authed `/` -> 200). A signed-in user with no farm (`dashboardFarm === null`) is redirected to `CONNECT_SOURCE_PATH` (the interim legacy onboarding, `TODO(5.2)` to repoint at the new picker), never a blank shell. `Farm.userId` + the JWT `userId` are added now; `dashboardFarm`/`currentFarm` are deliberately NOT yet filtered by owner (that is 5.2) so nothing existing breaks.
- **AC5 - secrets env-only and absence-tolerant.** `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `AUTH_EMAIL_FROM` documented (blank) in `.env.example`; a real `AUTH_SECRET` lives only in the gitignored `.env.local`; a throwaway non-secret `AUTH_SECRET` is in `playwright.config` `webServer.env` (required by `next start`). Build + e2e pass with no Google/email creds. No real secret is committed or staged.
- **Two production bugs caught and fixed during the e2e/`next start` verification (both invisible to lint/tsc/unit tests):**
  1. **`UntrustedHost`** - Auth.js v5 rejects sign-in/session/callback under self-hosted `next start` unless the host is trusted. Fixed with `trustHost: true` in `auth.config.ts` (Vercel sets it in prod; this keeps `next start`/previews working).
  2. **`MissingAdapter: Email login requires an adapter`** - the email provider needs the Prisma adapter, but it was in the edge `auth.config.ts` (no adapter). Moved the email provider into the full `auth.ts` (which has the adapter); `auth.config.ts` now carries only the adapter-free Google provider. This is the correct split-config boundary.
- **Pre-existing e2e drift, handled honestly (NOT a regression from this story):** `e2e/onboarding.spec.ts` was already failing at the baseline commit `f0cc5bd` - during the Epic 1-4 rebuild the legacy onboarding hook became the value-honest Bayou-connect screen ("See what your power is actually costing you." / "Connect PG&E"), which has no offline "Explore with sample data" path, so the old deep flow (connect -> classify -> tag -> save) could no longer run. Proof: that copy is in `f0cc5bd` (`git grep`), and the failure renders the new hook, not a 404/`/login` (so auth did not cause it). The deep connect-a-source flow is rebuilt and re-tested in Story 5.2. For 5.1 I replaced the obsolete spec with a shallow, offline-safe reachability check (the legacy onboarding stays public and renders) and added `e2e/auth.spec.ts` for this story's actual deliverable (the gate). Net: e2e is green and now tests truth.
- **Sign-out** added to the agent-rail footer (a form posting to `signOutAction` -> `signOut({ redirectTo: "/login" })`).

### File List

- `prisma/schema.prisma` (modified) - `User` / `AuthAccount` / `Session` / `VerificationToken` models + nullable `Farm.userId` + relation/index; PG&E `Account` untouched.
- `prisma/migrations/20260610021700_add_auth_tables/migration.sql` (new) - the auth-tables migration.
- `src/lib/auth.config.ts` (new) - edge-safe config: `trustHost`, conditional Google provider, pages, `authorized`/`jwt`/`session` callbacks, the pure `isPublicPath` allowlist.
- `src/lib/auth.ts` (new) - full config: spreads authConfig, adds the stubbed email magic-link provider + the wrapped Prisma adapter + JWT session strategy; exports `{ handlers, auth, signIn, signOut }`.
- `src/lib/auth-adapter.ts` (new) - the Account-collision adapter wrapper (`authAccountClient` Proxy + `terraPrismaAdapter`).
- `src/lib/email.ts` (new) - the stubbed magic-link sender (console log, `TODO(prod)`, zero external calls).
- `middleware.ts` (new) - the edge gate (`NextAuth(authConfig).auth`) + matcher.
- `src/app/(auth)/layout.tsx` (new) - public centered chrome.
- `src/app/(auth)/login/page.tsx` (new) - the sign-in surface (Google when enabled + email magic-link form).
- `src/app/(auth)/api/auth/[...nextauth]/route.ts` (new) - the Auth.js HTTP handler.
- `src/app/(app)/layout.tsx` (modified) - `auth()` gate + the no-data `CONNECT_SOURCE_PATH` redirect.
- `src/app/(app)/actions.ts` (modified) - `auth()` re-check in `resolveFinding`; new `signOutAction`.
- `src/app/(app)/_components/shell/agent-rail.tsx` (modified) - sign-out footer.
- `src/copy/en.ts` (modified) - the `en.auth.*` strings.
- `src/lib/auth.config.test.ts` (new) - `isPublicPath` allowlist tests.
- `src/lib/auth-adapter.db.test.ts` (new) - the adapter-wrapper DB-integration test.
- `e2e/auth.spec.ts` (new) - the (app) gate + login-render e2e.
- `e2e/onboarding.spec.ts` (modified) - replaced the obsolete deep flow with an offline-safe legacy-onboarding reachability check.
- `.env.example` (modified) - the Auth.js env block (blank).
- `playwright.config.ts` (modified) - `AUTH_SECRET` in `webServer.env`; health-check `url` -> `/login`.
- `package.json` / `package-lock.json` (modified) - added `next-auth@5.0.0-beta.31`, `@auth/prisma-adapter@2.11.2`.

### Change Log

- 2026-06-10: Implemented Story 5.1 (sign-in: Google SSO + email magic link, Auth.js v5 + Prisma adapter). Added the four adapter tables with the `AuthAccount` rename resolving the PG&E `Account` collision, JWT sessions, the split edge/full config, the middleware + layout + Server-Action gates, the `(auth)/login` surface + route handler, the stubbed email sender, the no-data redirect, sign-out, and env scaffolding. Caught and fixed `UntrustedHost` (`trustHost: true`) and `MissingAdapter` (email provider moved to the adapter-backed config) during `next start`/e2e verification. Replaced the pre-existingly-broken onboarding e2e with an honest reachability check + a new auth gate e2e. Gates green: lint, tsc, 540 tests, build (no Google creds), e2e 3/3, full magic-link round-trip on dev.db. Status -> review.
- 2026-06-10: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 5 ACs confirmed satisfied by the Acceptance Auditor; project-context compliance clean (no `any`, copy in en.ts with no em dash / no exclamation, no committed secret, Prisma v6). 4 findings patched, 8 dismissed (refuted or by-design). Gates re-run green (lint, tsc, 540 tests, build, e2e 3/3) and the High finding fix verified live (/logo.svg -> 200, / and /energy still 307 -> /login). Status -> done.

## Review Findings

Adversarial three-layer review (2026-06-10). Acceptance Auditor: all 5 ACs fully satisfied; the spec's flagged guardrails (Account collision via `AuthAccount`, JWT-not-database, split config, allowlist gating, three real gates, no-dead-end redirect, absence-tolerant secrets, stubbed email, non-breaking) all held; the three scope deviations (`trustHost`, hand-rolled email provider, rewritten onboarding e2e) each justified and documented.

Patches (applied):

- [x] [Review][Patch] /public static assets were gated by the middleware matcher [middleware.ts] - HIGH (blind+edge). The matcher `/((?!api|_next/static|_next/image|favicon.ico).*)` did not exclude dotted files, so an unauthenticated request for `/logo.svg` (and any /public image/video) 307-redirected to `/login` - meaning the login page's own logo never rendered (the `<img onError>` fell back to a leaf). Added a `.*\.` exclusion so extensioned paths serve directly. Verified live: `/logo.svg` -> 200, `/` and `/energy` still 307 -> `/login`.
- [x] [Review][Patch] Magic-link token logged with no production guard [src/lib/email.ts] - MED (blind+edge). The stubbed sender `console.log`ged the one-time sign-in URL (a live credential); if the prod sender swap were forgotten the token would leak into production logs. Guarded with `NODE_ENV === "production"` -> warn without the URL and return; dev still logs the link as the v1 delivery channel.
- [x] [Review][Patch] Sign-in ignored the gate's callbackUrl [src/app/(auth)/login/page.tsx] - LOW (blind). Actions hardcoded `redirectTo: "/"`, so a user deep-linked to `/energy` and bounced to `/login` was not returned there. Now the `callbackUrl` is threaded through a hidden field and honored, sanitized to same-origin relative paths (no `//`) to avoid an open redirect (Auth.js also validates).
- [x] [Review][Patch] Loose `/api/auth` prefix in isPublicPath [src/lib/auth.config.ts] - LOW (blind+edge). `startsWith("/api/auth")` would also match `/api/authxyz`. Tightened to `=== "/api/auth" || startsWith("/api/auth/")`; added a test pinning `/api/authxyz` -> false.

Dismissed (refuted or correct-as-designed):

- [x] [Review][Dismiss] `session.user.id` assignment needs a missing `next-auth.d.ts` augmentation -> likely TS build break (Low, blind) - REFUTED: `tsc --noEmit` and `next build` both pass clean; next-auth v5's default `Session["user"]`/`JWT` accept the id assignment here.
- [x] [Review][Dismiss] Sibling Server Actions in `(app)/actions.ts` left unauthenticated-POST reachable (Med, blind) - REFUTED: the only other export is `signOutAction`, which calls `signOut` (signing out with no session is a harmless no-op and needs no gate). `resolveFinding` is gated. There is no other mutating action.
- [x] [Review][Dismiss] Hand-rolled `EmailConfig` may not satisfy Auth.js normalization at runtime (Med, blind) - REFUTED empirically: the full magic-link round-trip works (e2e + the dev.db verification: link generated, callback set the JWT session, authed `/` -> 200).
- [x] [Review][Dismiss] Empty/un-seeded DB strands authenticated users on the legacy onboarding (Med, edge) - BY DESIGN: that is exactly AC4's no-data path (`dashboardFarm === null` -> connect-a-source). The interim target is the public legacy onboarding (`TODO(5.2)`); no loop (it is outside the `(app)` group).
- [x] [Review][Dismiss] Middleware excludes the whole `/api` tree, not just `/api/auth` (High, blind) - NO IMPACT in 5.1: the only `/api` route is the public Auth.js handler. Standard Auth.js matcher. Any future protected API route (e.g. 5.2's admin `/api/import`) must self-gate with `auth()` (API routes return 401, not an HTML `/login` redirect) - noted for 5.2, not a 5.1 defect.
- [x] [Review][Dismiss] Wordmark on the login page links to `/` and bounces logged-out users (Low, edge) - COSMETIC: lands back on `/login` (a no-op); with the /public fix the logo now renders. Acceptable.
- [x] [Review][Dismiss] Adapter Proxy `Reflect.get(target, prop, receiver)` could rebind `this` for Prisma internals (Low, blind+edge) - works and is unit-tested for the adapter's full call set (`createUser`/`linkAccount`/`getUserByAccount`); the `$transaction`-through-proxy concern is hypothetical and never exercised.
- [x] [Review][Dismiss] `params.error` truthy shows the banner for `?error=0`; `isPublicPath` case sensitivity (Low, edge) - trivial, no real trigger (Auth.js passes named error codes, not `0`; Next normalizes casing/trailing slash at routing).
