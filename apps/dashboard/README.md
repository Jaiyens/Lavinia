# Terra: PG&E energy tool

An operating system for California farmers. This repo is Tool 1: it makes a grower's
PG&E account legible (every meter, rate, billing cycle, and solar array in one place)
and surfaces the money hiding in it. See [CLAUDE.md](CLAUDE.md) for the full product
context and architecture.

## Getting started

```bash
npm install
npm run db:reset   # migrate + seed the local SQLite db (prisma/dev.db)
npm run dev        # http://localhost:3000
```

The app runs with **zero external calls** out of the box: every data source has a
committed fixture, so dev and tests never need a live utility account. See
`fixtures/` and the data-source notes below.

Common commands (full list in [CLAUDE.md](CLAUDE.md)): `npm test`, `npm run lint`,
`npm run build`, `npm run db:studio`.

## Connecting utility data (Bayou)

Terra pulls a grower's account through [Bayou](https://bayou.energy), a utility-data
provider. There is one normalized internal model (`NormalizedMeter`) that every source
maps into, so the source is swappable: we build on Bayou's **Speculoos** fake utility
today and flip to real PG&E later with **no code changes**, only an env switch.

### How it flows

```
Bayou v2 JSON ──normalizeBayou()──▶ NormalizedMeter ──importMeters()──▶ DB ──▶ screens + findings
  (or PG&E Green Button ──normalizeEspi()──▶ NormalizedMeter ──▶ same path)
```

Only [src/lib/bayou/client.ts](src/lib/bayou/client.ts) (HTTP) and
[src/lib/normalize/](src/lib/normalize/) (the mappers) ever touch raw Bayou fields.
Every screen and finding reads the normalized model out of the DB, never raw Bayou
JSON, so swapping Speculoos for real PG&E (or a Green Button export) changes nothing in
the UI. A guard test enforces this:
[src/lib/normalize/no-raw-source-in-ui.test.ts](src/lib/normalize/no-raw-source-in-ui.test.ts).

### Configuration

Copy [.env.example](.env.example) to `.env.local` (gitignored, never commit keys) and
set:

| var                           | dev (sandbox)             | prod (real PG&E)           |
| ----------------------------- | ------------------------- | -------------------------- |
| `BAYOU_DOMAIN`                | `staging.bayou.energy`    | `bayou.energy`             |
| `BAYOU_API_KEY`               | a `test_...` key          | a `live_...` key           |
| `UTILITY`                     | unset (defaults below)    | unset (defaults below)     |
| `NEXT_PUBLIC_BAYOU_COMPANY_ID`| staging company id        | live company id            |

`UTILITY` selects which Bayou utility customers are created under. Leave it **unset**
and it follows `BAYOU_DOMAIN`: a staging domain defaults to `speculoos_power` (Bayou's
fake utility), a live domain defaults to `pacific_gas_and_electric` (real PG&E). Set it
only to force a specific slug. This is why the flip to production is just the domain and
key, no code change.

> The key and the domain must be the **same** environment. A `test_...` key only works
> against `staging.bayou.energy`; a `live_...` key only against `bayou.energy`. Mixing
> them returns `401 "This key was not generated on the live environment."` If
> `BAYOU_DOMAIN`/`BAYOU_API_KEY` are unset or mismatched, the connect flow falls back to
> the committed Speculoos fixtures so dev keeps working.

### Speculoos test logins

On `staging.bayou.energy` + `speculoos_power`, Bayou's onboarding form accepts these
canned logins (no real PG&E account involved). **Any password works.**

| login                       | returns                                              |
| --------------------------- | ---------------------------------------------------- |
| `multi-account@bayou.energy`| **multiple** accounts. Use this one.                 |
| `iamvalid@bayou.energy`     | a single account.                                    |

The committed sample in `fixtures/bayou/` is a real verbatim Speculoos pull; see
[fixtures/bayou/README.md](fixtures/bayou/README.md) for the shape the normalizer
depends on and how to refresh it.

## Deploy

Deploys on [Vercel](https://vercel.com). Fixtures read at runtime ship via
`outputFileTracingIncludes` in [next.config.ts](next.config.ts). Set the Bayou env vars
(live domain + `live_...` key + live company id) in the Vercel project; `UTILITY` can
stay unset to default to real PG&E.
