# @lavinia/extension — Terra portability probe (MV3)

A **thin Manifest V3 browser extension**. Its entire purpose is a **one-time
portability probe + manual backfill** for a grower's Almond Logic account.

It answers exactly one question: **does a logged-in Almond Logic session
travel** when we forward its cookies through Firecrawl's stealth proxy? Green
here means cookie-forward stealth is _viable_ — nothing more.

## What it is NOT

- **NOT the production scraper.** The recurring scrape runs on the backend in
  Phase 4. This extension is structurally incapable of being the production
  scraper: it is a separate workspace, it imports nothing from
  `apps/dashboard`, and it writes to no application database. Its only output is
  a human-readable status: _"your data traveled"_ or _"hit a login wall"_.
- **NOT CI-gated.** This workspace's toolchain is not part of the dashboard
  build or CI gate. Its `build` is a standalone esbuild bundle to `dist/`.
- **NEVER runs in production.** It is a developer / human-in-the-loop tool used
  once to validate viability and to manually backfill historical data.

## The three hard rules it structurally honors

1. **Never logs the Firecrawl key or cookies.** They are read into a local
   `const` at call time, attached as headers (`Authorization` / `Cookie`), and
   dropped. Nothing is `console.*`'d, written to a file, or placed in a URL
   query string.
2. **Never does arithmetic on a pound value.** Its job is to `POST {url,
   headers}` to Firecrawl `/scrape` and classify the response as
   data-vs-login_wall via a **string heuristic**. It does nothing numeric with
   the returned markup. The pound-gate lives server-side only (Phase 4).
3. **Never becomes the production scraper.** Separate workspace, zero imports
   from `apps/dashboard`, no DB writes. Only output is a status string.

## How it works

1. You log in to Almond Logic in this browser as normal.
2. Open the extension **Settings** (options page) and enter:
   - the **Almond Logic host** (bare host, e.g. `app.almondlogic.example`)
   - your **Firecrawl API key**

   Both persist to `chrome.storage.local` only.
3. Navigate to the Almond Logic page whose data you want to probe.
4. Click the toolbar icon and press **Scrape this page**. The service worker:
   - reads the host + key from `chrome.storage.local`,
   - collects the session cookies for that host (`chrome.cookies.getAll`),
   - assembles a `Cookie` header **in memory**,
   - builds a Firecrawl `/scrape` body (`{ url, headers: { Cookie, User-Agent },
     proxy: "stealth", zeroDataRetention: true, … }`),
   - `POST`s it with the key as a `Bearer` header,
   - classifies the response, and posts back the verdict.
   - The cookie / key locals are dropped immediately and never logged.

## Architecture

```
apps/extension/
  manifest.json            MV3 manifest (cookies/activeTab/storage; host scoped
                           to a placeholder Almond Logic origin, NOT <all_urls>)
  src/
    service-worker.ts      background orchestration (the only chrome.* I/O)
    popup/                 Scrape button + status line
    options/               Firecrawl key + Almond Logic host fields
    messages.ts            popup <-> worker message contract (verdict only)
    settings.ts            storage keys + host normalization
    chrome-shim.d.ts       minimal ambient chrome.* (install-less type source;
                           @types/chrome supersedes it once deps are installed)
    lib/                   PURE, browser-free, unit-tested core:
      cookie.ts            buildCookieHeader(cookies) -> "a=1; b=2"
      scrape-request.ts    buildScrapeRequest(url, cookieHeader, ua) -> body
      classify.ts          classifyResponse(body) -> "data" | "login_wall"
      *.test.ts            vitest unit tests for the three pure functions
  scripts/build.mjs        standalone esbuild bundle -> dist/
```

The three `lib/` functions take plain arguments (no `chrome.*`, no network), so
they are unit-testable in plain Node.

## Build

```bash
# from apps/extension (requires this workspace's devDeps installed)
npm run build      # -> dist/ unpacked MV3 extension
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load
unpacked** → select `dist/`.

> Note: this workspace's devDeps (`@types/chrome`, `esbuild`, `typescript`,
> `vitest`) are declared but may not be installed in every checkout. `build`
> degrades gracefully (exit 0 with a notice) if `esbuild` is missing so it never
> breaks a monorepo-wide `turbo run build`.

## Tests

The pure `lib/` functions are covered by vitest:

```bash
npm run test       # vitest run, from apps/extension
```

These tests need no browser and no network. They include an assertion that
`buildScrapeRequest` never places the Firecrawl key or the cookie header in the
request **url** (only in headers) — enforcing hard rule 1.

## What canNOT be tested without a human in the loop

The **live `/scrape` round-trip** requires:

- a **real Firecrawl API key**, and
- a **logged-in Almond Logic session** in the browser running the extension.

Neither can be checked in or automated, so verifying that real data actually
travels is a **manual, human-in-the-loop step**. The automated tests cover only
the pure, deterministic logic.
