# Parcels (dashboard feature)

A coordinate-driven **public-records parcel lookup**, surfaced as a **top-level agent** in the
left rail (a peer of Home / Energy, sitting above the not-yet-built Water). Enter a
latitude/longitude and the dashboard returns the county parcel that contains the point (its
**APN**, acreage, boundary, and centroid) from **free public county GIS sources**, drawn on the
map with a copyable-APN card.

Routes:

- `/parcels` — signed-in app (auth + farm gated, like the rest of the dashboard)
- `/tour/parcels` — the public Tour (reads only public records, so it is safe unauthenticated)

## How it's wired into the existing dashboard

It reuses the app's patterns; nothing was re-architected.

```
AGENTS registry (shell/agents.ts)  ← "parcels" is a live top-level agent (href /parcels, MapPin)
  └─ AgentRail / AgentTabBar         ← render it automatically in the rail + mobile tab bar

parcels/page.tsx                   ← renders <ParcelView/>
  └─ <ParcelView>                  ← client: prefilled lat/lng input → fetch /api/parcel → card + map
       ├─ GET /api/parcel          ← thin route handler → lookupParcelByPoint() (server-side)
       └─ <ParcelMap>              ← MapLibre GeoJSON polygon + centroid, over the shared basemap
```

| Piece | File |
|---|---|
| Agent registry entry | `src/app/(app)/_components/shell/agents.ts` (`parcels`) |
| Page (signed-in) | `src/app/(app)/(dashboard)/parcels/page.tsx` |
| Page (Tour) | `src/app/tour/parcels/page.tsx` |
| Lookup surface | `src/app/(app)/_components/parcel-view.tsx` |
| Map | `src/app/(app)/_components/parcel-map.tsx` |
| Shared basemap (also used by `meter-map.tsx`) | `src/app/(app)/_components/basemap.tsx` |
| API route | `src/app/api/parcel/route.ts` |
| Copy | `src/copy/en.ts` → `en.parcel`, plus the tab label `en.shell.agents.parcels` |
| Lookup engine | `src/lib/parcel/*` (see its README) |

### Design-system reuse

- `cardClass()`, `Button`, `Input` primitives; the warm green palette; Inter + `type-*` roles.
- The map reuses MeterMap's exact MapLibre setup via the shared `basemap.tsx` (same keyless
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
- A monotonic request token guards against a slow older lookup overwriting a newer one.

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
npm test -w @lavinia/dashboard
PARCEL_LIVE=1 npx vitest run src/lib/parcel/fresno.live.test.ts

# the live HTTP route (with the dev server on :3001)
curl "http://localhost:3001/api/parcel?lat=36.6004616&lng=-119.7817871"
```

Acceptance: looking up `36.6004616, -119.7817871` returns Fresno APN **33803239S** (~36.1 acres)
with its boundary drawn on the map. Adding another county is one adapter in `@/lib/parcel`, with
no change here.
