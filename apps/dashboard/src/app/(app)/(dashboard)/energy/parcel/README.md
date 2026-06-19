# Energy → Parcel (dashboard feature)

A coordinate-driven **public-records parcel lookup**, living as a sub-tab under **Energy**. Enter
a latitude/longitude and the dashboard draws the containing county parcel on the map and shows a
card with its **APN** (one-click copyable), acreage, centroid, and a link to the county source.

Routes:

- `/energy/parcel` — signed-in app (auth + farm gated, like the rest of Energy)
- `/tour/energy/parcel` — the public Tour (reads only public records, so it is safe unauthenticated)

## How it's wired into the existing dashboard

It reuses the app's patterns; nothing was re-architected.

```
energy/layout.tsx            ← adds the sub-tab strip over BOTH /energy and /energy/parcel
  └─ <EnergySubnav>          ← "Energy | Parcel" underline tabs (mirrors the lens-toggle style)

energy/parcel/page.tsx       ← renders <ParcelView/>
  └─ <ParcelView>            ← client: prefilled lat/lng input → fetch /api/parcel → card + map
       ├─ GET /api/parcel    ← thin route handler → lookupParcelByPoint() (server-side)
       └─ <ParcelMap>        ← MapLibre GeoJSON polygon + centroid, over the shared basemap
```

| Piece | File |
|---|---|
| Sub-tab strip | `src/app/(app)/_components/energy-subnav.tsx` |
| Energy sub-tab layout | `src/app/(app)/(dashboard)/energy/layout.tsx` |
| Page (signed-in) | `src/app/(app)/(dashboard)/energy/parcel/page.tsx` |
| Page (Tour) | `src/app/tour/energy/parcel/page.tsx` + `tour/energy/layout.tsx` |
| Lookup surface | `src/app/(app)/_components/parcel-view.tsx` |
| Map | `src/app/(app)/_components/parcel-map.tsx` |
| Shared basemap (also used by `meter-map.tsx`) | `src/app/(app)/_components/basemap.tsx` |
| API route | `src/app/api/parcel/route.ts` |
| Copy | `src/copy/en.ts` → `en.parcel` |
| Lookup engine | `src/lib/parcel/*` (see its README) |

### Design-system reuse

- `cardClass()`, `Button`, `Input` primitives; the warm green palette; Inter + `type-*` roles.
- The map reuses MeterMap's exact MapLibre setup via the extracted `basemap.tsx` (same keyless
  satellite/streets tiles, same scroll-zoom gating, same graceful tile-failure fallback). The
  parcel boundary is a translucent green fill + outline with a dot at the centroid.
- All strings live in `en.parcel`; no em dashes; plain operator English.
- Layout follows the acres.com plat-map shape: a left detail column, a large map on the right;
  stacks on mobile.

## Behavior notes

- The input is **pre-filled** with the Fresno test point `36.6004616, -119.7817871`.
- That point sits on a **road/right-of-way**, so the lookup falls back to the nearest parcel
  within 25 m and the card shows an honest "showing the nearest parcel, about 5.6 m away" note.
- APN copy uses the clipboard API; the button flips to "Copied" for ~1.5 s.
- Error states map the API's codes to plain copy (`invalid_point`, `out_of_coverage`,
  `not_found`, `upstream`).

## API

`GET /api/parcel?lat={lat}&lng={lng}` →

- `200` `ParcelResult` JSON (see `@/lib/parcel`)
- `400` `{ error: "invalid_point" }`
- `404` `{ error: "not_found" }` (county has no parcel here) or `{ error: "out_of_coverage" }`
  (no county source covers the point)
- `502` `{ error: "upstream" | "lookup_failed" }` (the county service failed)

> The route currently proxies a free public county service unauthenticated. It exposes only
> public records, but add a per-IP rate limit / bot check before exposing it widely (same note as
> `api/almond/chat`).

## Verifying

```bash
# unit + integration
npm test -w @lavinia/dashboard
PARCEL_LIVE=1 npx vitest run src/lib/parcel/fresno.live.test.ts

# the live HTTP route (with the dev server on :3001)
curl "http://localhost:3001/api/parcel?lat=36.6004616&lng=-119.7817871"
```

Acceptance: looking up `36.6004616, -119.7817871` returns Fresno APN **33803239S** (~36.1 acres)
with its boundary drawn on the map. Adding another county is one adapter in `@/lib/parcel`, with
no change here.
