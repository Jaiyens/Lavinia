# Parcels (dashboard feature)

The farmer's **land, map-first** — an Acres.com-style shell filled with farm-operations data (not
real-estate comps). A top-level agent in the rail (peer of Home / Energy). Loads straight to the
operation's blocks on a full-screen map: **zero manual entry**. Click a block for a rich grouped
detail drawer; hover for a tooltip; shade every block by an attribute (the priority feature that
makes a wall of APNs visual); read the portfolio at a glance.

Routes: `/parcels` (signed-in, auth + farm gated) and `/tour/parcels` (public Tour).

## Shell

```
parcels/page.tsx                 ← server: loadRepresentativeFarm(todayIso) -> <ParcelsWorkspace>
  └─ ParcelsWorkspace            ← full-bleed `fixed` container (escapes the <main> padding;
                                    offset by the rail on desktop, the tab bar on mobile)
       ├─ FarmMap                ← MapLibre: every block as a polygon shaded by the active
       │                           attribute; hover tooltip; click -> select; clay ring = attention
       ├─ banner                 ← "Representative farm. Connect yours" + Connect CTA
       ├─ PortfolioStrip         ← acres, blocks, % leased, leases expiring, need-a-look, by-crop bar
       ├─ ColorByControl         ← crop / tree age / NDVI / owned-leased / water source + legend
       ├─ AddParcelTool          ← the demoted lookup: APN or coordinate -> /api/parcel/block
       └─ ParcelDrawer           ← grouped sections (identity/planting/water/energy/soil/health/
                                    compliance/financial), copyable APN, source badges
```

| Piece | File |
|---|---|
| Workspace | `src/app/(app)/_components/parcels-workspace.tsx` |
| Map | `src/app/(app)/_components/farm-map.tsx` |
| Drawer | `src/app/(app)/_components/parcel-drawer.tsx` |
| Add-parcel tool | `src/app/(app)/_components/add-parcel-tool.tsx` |
| Shared basemap (with MeterMap) | `src/app/(app)/_components/basemap.tsx` |
| Ingest route | `src/app/api/parcel/block/route.ts` (POST `{ apn }` or `{ lat, lng }` -> `FarmParcel`) |
| Data + engine | `src/lib/parcel/farm/*` (see its README) and `src/lib/parcel/*` (the public-records engine) |
| Copy | `src/copy/en.ts` -> `en.parcel.farm` |

## How the pieces interact

- **Seeded farm.** With no connected farmer yet, the page loads a seeded representative operation:
  12 real ag blocks (real APNs / boundaries / acreage from the county engine) clustered around
  `36.6004616, -119.7817871`, auto-enriched from free public layers (DWR crop class, GSA, water
  district, USDA soil) and filled with believable ops data. The "representative data" banner stays.
- **Color-by.** Each block's fill color for the active attribute is precomputed in JS (`color.ts`)
  and fed to MapLibre as a feature property, so switching attributes is a `setData`. The legend
  shows only the buckets present; a clay ring marks blocks needing a look (low NDVI or overdue task).
- **Ingestion.** "+ Add parcel" (and, at scale, "Connect your farm") POST an APN or coordinate to
  `/api/parcel/block`; the engine pulls the boundary, `enrichParcel` auto-enriches it, and the block
  drops onto the map + portfolio. Adding another **county** is one adapter in `@/lib/parcel`, no
  workspace change.

## Layout note

The workspace is `fixed inset-x-0 top-0 bottom-16 lg:left-40 lg:bottom-0`, so it fills the content
area (right of the 160px rail, above the 64px mobile tab bar) without editing the shared dashboard
layout. The banner + controls overlay the map; the overlay layer is `pointer-events-none` with
`pointer-events-auto` on the actual controls, so the map stays draggable between them.

## Verifying

```bash
npm test -w @lavinia/dashboard           # farm data-layer + engine tests
npx tsx scripts/seed-representative-farm.ts   # refresh the fixture from live data

# the live ingest route (dev server on :3001)
curl -X POST localhost:3001/api/parcel/block -H 'content-type: application/json' -d '{"apn":"33803239S"}'
```

Acceptance: `/parcels` loads to the farm's blocks on a full map (no entry); click -> grouped drawer;
hover -> tooltip; color-by works with a legend; the portfolio strip is populated; adding a real farm
is entering APNs, no rearchitecting.
