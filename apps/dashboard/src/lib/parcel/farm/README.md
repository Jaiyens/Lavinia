# `@/lib/parcel/farm` — the farm-operations layer

Turns the public-records parcel engine (`@/lib/parcel`) into the **farmer's land**: a map-first
operation of blocks, each enriched with farm-ops data (crop, water, energy, soil, health,
compliance, financial). Powers the Parcels workspace (see
`src/app/(app)/(dashboard)/parcels/README.md`).

## Data flow

```
seed script (one-time)                          render time (per request)
  envelope query Fresno parcels        fixture     loadRepresentativeFarm(todayIso)
  -> real geometry + acreage  ──────►  ┌────────┐  -> buildFarmParcel(base, enrichment, i, today)
  enrichParcel(centroid) live          │ base + │     -> deterministic ops data, relative dates
  -> crop/gsa/wd/soil          ──────► │ enrich │        regenerated fresh
                                       └────────┘
```

The committed fixture (`fixtures/representative-farm.json`) holds **only** what needs the network
(real boundary + baked live enrichment). The full operational model is regenerated deterministically
at render time, so relative dates (lease expiry, overdue tasks) and tree-age coloring stay current
without re-baking, and the app runs with **zero external calls** on a normal page load.

## Files

| File | Role |
|---|---|
| `types.ts` | `FarmParcel` schema, grouped (identity / planting / water / energy / soil / health / compliance / financial) + `ColorByKey` |
| `representative.ts` | `buildFarmParcel` — deterministic (seeded by APN) ops generator; crop-consistent agronomy; uses live enrichment where present |
| `enrich.ts` | `enrichParcel` — spatial-join enrichers against free public layers |
| `seed.ts` | `loadRepresentativeFarm` — reads the fixture, builds the farm |
| `ingest.ts` | `ingestBlockByApn` / `ingestBlockByPoint` — the live "Connect your farm" / "+ Add parcel" path |
| `color.ts` | color-by-attribute + legend (pure, tested) |
| `portfolio.ts` | portfolio summary + `parcelNeedsAttention` (pure, tested) |

## Auto-enrichment sources

Real public data, joined at the parcel centroid. What we genuinely pull (and badge with its source
in the drawer):

| Field | Source | Status |
|---|---|---|
| crop (land-use class) | DWR Statewide Crop Mapping 2022 (`CLASS1`) | **wired** (keyless Esri intersect). Class is real; the specific crop shown is a representative pick within it |
| GSA | DWR SGMA GSA boundaries (`GSA_Name`) | **wired** (keyless) |
| water district | DWR Water Districts (`AGENCYNAME`) | **wired** (keyless; prefers the delivery district) |
| soil series | USDA SSURGO via Soil Data Access (`mapunit.muname`) | **wired** (keyless POST T-SQL) |
| ET (acre-feet) | OpenET | **stubbed** — needs an API key. `// TODO` in `enrich.ts`; wire `raster/timeseries/point` behind `OPENET_API_KEY` |

Everything else (variety, rootstock, tree count, yields, tenure, wells, rate schedule, NDVI, spray
history, tasks, financials) is **representative** demo data — believable and internally consistent,
but the dashboard's "representative data" banner makes the framing honest. Every field genuinely
pulled from a public source records that source in `FarmParcel.sources` and is badged in the UI.

> `// TODO` markers for the not-yet-wired sources name the real source to wire next: OpenET for ET,
> and (when a non-Esri path is added) the SDA endpoint is already proven for richer SSURGO
> attributes. NDVI is representative now; a Sentinel-2 / HLS NDVI sampler is the eventual source.

## Re-seeding

```bash
npx tsx scripts/seed-representative-farm.ts   # refetch real parcels + enrich -> fixture
```

Picks the ag-sized blocks (>= 12 ac) nearest the canonical point `36.6004616, -119.7817871` for a
tight, believable operation. Adding a real farm = entering APNs (the `ingest*` path); no change here.

## Tests

`farm.test.ts` covers generator determinism, crop-consistent agronomy, source badging, the
color-by + legend, the portfolio summary, and loading the committed fixture.
