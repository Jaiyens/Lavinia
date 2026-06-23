# `@/lib/parcel` — public-records parcel lookup

Given a latitude/longitude, return the **APN** and parcel info for the county parcel that
**contains** the point, from **free public county GIS sources**. Pure, server-side, no DB.

```ts
import { lookupParcelByPoint } from "@/lib/parcel";

const parcel = await lookupParcelByPoint(36.6004616, -119.7817871);
// {
//   apn: "33803239S",
//   county: "Fresno",
//   parcel_acres: 36.1,
//   centroid_lat: 36.5999001,
//   centroid_lon: -119.7794191,
//   geometry: { type: "Polygon", coordinates: [...] },   // GeoJSON, WGS84 lng/lat
//   source_url: "https://services6.arcgis.com/.../Fresno_County_Parcels/FeatureServer/0",
//   match: "nearest",        // "contains" | "nearest" (see "the road-gap problem")
//   distance_m: 5.6,         // metres to the parcel when match === "nearest", else null
//   fields: { APN: "33803239S", ROLL_YEAR: 2001, ... }   // every raw source attribute
// }
```

Returns `null` when the covering county genuinely has no parcel at the point. Throws a
`ParcelLookupError` (`.code`) for `invalid_point`, `out_of_coverage`, or `upstream`.

## Why a county-adapter pattern

"Public APN records" is **not one API**. Every California county hosts its own source, names
its APN field differently (`APN`, `PARCELID`, `ASMT`, `PARCEL_NUM`…), and uses its own CRS. So
the module is built around one seam:

```
lookupParcelByPoint(lat, lng)
   │  validate the point
   │  adapterForPoint() ── pick the county whose bbox contains the point (registry.ts)
   ▼
CountyParcelAdapter.lookupByPoint(point)  →  RawParcelHit { apn, geometry, fields, match, ... }
   │  (county-specific: which service, which APN field, which CRS)
   ▼
core normalizes → ParcelResult   (acreage + centroid computed once, in EPSG:3310)
```

Everything county-specific lives **inside an adapter**. The core (`lookup.ts`), the dispatch
(`registry.ts`), and the geo math (`geo.ts`) are generic.

### Adding a county

Most CA counties expose parcels through a standard **Esri ArcGIS REST** layer, so a new county
is usually **one config object** — no new code:

```ts
// counties/tulare.ts
import { createEsriParcelAdapter } from "../esri";

export const tulareAdapter = createEsriParcelAdapter({
  county: "Tulare",
  bbox: { minLat: 35.78, maxLat: 36.75, minLng: -119.57, maxLng: -117.98 },
  layerUrl:
    "https://maps.tulare.ca.gov/server/rest/services/Hosted/Public_Parcels__Tulare_County/FeatureServer/0",
  apnFields: ["apn12", "apn11", "apn15", "APN"], // first present, non-empty wins
  sourcePage: "https://www.tularecounty.ca.gov/...",
});
```

Then add it to `COUNTY_ADAPTERS` in `registry.ts`. That's the whole change — the dispatcher,
the API route, and the dashboard are untouched.

A county **without** an Esri service (shapefile-only, a bespoke API, a PostGIS table) writes its
own object implementing `CountyParcelAdapter` instead of using `createEsriParcelAdapter`. The
`RawParcelHit` it returns flows through the same normalizer.

## The lookup mechanic (Esri adapter)

The point-in-polygon query shape is identical for **any** Esri parcel layer:

```
{layerUrl}/query?geometry={lng},{lat}&geometryType=esriGeometryPoint&inSR=4326
  &spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=geojson
```

> **The #1 silent bug:** Esri point geometry is `x=LONGITUDE, y=LATITUDE` — **not** lat,lng.
> Swapping them makes the query "work" but return nothing or the wrong parcel. `inSR=4326`
> declares the point is WGS84; `f=geojson` returns standard GeoJSON (always WGS84 lng/lat).

## The road-gap problem (why `match: "nearest"` exists)

A coordinate can land on a **road or right-of-way** that no parcel polygon covers — an exact
point-in-polygon then returns nothing, even though the area is fully mapped. The canonical test
point `36.6004616, -119.7817871` is exactly such a point.

So the adapter does **exact intersect first**, and on an empty result retries with a small
**buffer** (`bufferMeters`, default 25 m) and returns the **nearest** parcel, flagged
`match: "nearest"` with `distance_m`. The dashboard surfaces this honestly ("this point sits on a
road… showing the nearest parcel").

## Acreage + centroid: always EPSG:3310

`parcel_acres` and the centroid are computed in **EPSG:3310 (California Albers, an equal-area
conic)** — never from the source attributes, never in Web Mercator.

The source layers are Web Mercator (EPSG:3857), whose **area is inflated by ~1/cos(lat)²**. At
Fresno's latitude (~36.6°) that overstates a parcel by **~55%**: the test parcel's true ground
area is **~36 acres**, but the layer's `Shape__Area` reads ~56 acres. Computing a planar shoelace
on EPSG:3310 metres gives the true 36.1 acres. The centroid is computed in the same metres, then
projected back to WGS84 so callers get plain lat/lng. (`proj4` does the projection.)

`geo.ts` handles Polygon + MultiPolygon, subtracts holes, and is winding-order independent
(Esri rings often wind opposite to the GeoJSON right-hand rule).

## Files

| File | Role |
|---|---|
| `types.ts` | `CountyParcelAdapter`, `ParcelResult`, `RawParcelHit`, GeoJSON types, `ParcelLookupError` |
| `geo.ts` | EPSG:3310 acreage + centroid + point-to-parcel distance (pure) |
| `esri.ts` | `createEsriParcelAdapter` — the generic Esri-backed adapter (query, buffer fallback, zod-validated parsing) |
| `counties/fresno.ts` | Fresno config (the one live county) |
| `registry.ts` | `COUNTY_ADAPTERS` + `adapterForPoint` dispatch |
| `lookup.ts` | `lookupParcelByPoint` — validate → dispatch → normalize |
| `index.ts` | public barrel |

## Tests

```bash
npm test -w @lavinia/dashboard            # all unit tests (mocked fetch, offline, deterministic)
PARCEL_LIVE=1 npx vitest run src/lib/parcel/fresno.live.test.ts   # hits the real Fresno service
```

`geo.test.ts` validates equal-area acreage + centroid against known metric squares;
`esri.test.ts` covers the query shape, the buffer→nearest fallback, APN field selection, and
upstream errors (all with a mocked `fetchImpl`); `lookup.test.ts` covers dispatch + the result
contract. `fresno.live.test.ts` is the gated network test that proves the acceptance point.

## Source

Fresno parcels are served by Fresno State's `Fresno_County_Parcels` ArcGIS FeatureServer
(public, token-free, CORS-open). The county's official distribution page (the shapefile
fallback) is linked in `counties/fresno.ts` as `sourcePage`. Note the live layer is a dated
snapshot (roll year ~2001): trust the **boundary + APN**, not the roll attributes.
