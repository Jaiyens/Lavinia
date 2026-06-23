import { lookupParcelsByBbox, ParcelLookupError, type BBox } from "@/lib/parcel";

/**
 * Viewport parcel overlay. GET /api/parcels/bbox?bbox=minLng,minLat,maxLng,maxLat&zoom=15 returns a
 * GeoJSON FeatureCollection (APN + boundary only) of every parcel intersecting the box, across the
 * counties it touches. This backs the Zillow-style streaming overlay on the Parcels map: the client
 * refetches per viewport as the farmer pans/zooms. Keeps the county Esri URLs server-side (the
 * repo's route-handler-for-external-integrations pattern, like /api/parcel).
 *
 * Guards: a zoom gate (no upstream call when too far out) and an area clamp keep a single request
 * from asking for a county-sized box. The response carries `capped` when the source truncated, so
 * the client can subdivide. Boundaries are effectively static, so we cache hard at the edge.
 *
 * NOTE (abuse): proxies free public county GIS services, currently unauthenticated. Add a per-IP
 * rate limit before exposing widely (same TODO as /api/parcel).
 */
export const runtime = "nodejs";

/** Below this zoom we don't stream parcels (too many to draw / too large a query). Matches the client. */
const MIN_ZOOM = 14;
/** Refuse a viewport wider/taller than this in degrees (a zoomed-out client that slipped the gate). */
const MAX_SPAN_DEG = 0.25;

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const bboxParam = searchParams.get("bbox");
  const zoomParam = searchParams.get("zoom");

  if (bboxParam === null) {
    return Response.json({ error: "invalid_bbox" }, { status: 400 });
  }
  const parts = bboxParam.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return Response.json({ error: "invalid_bbox" }, { status: 400 });
  }
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  const box: BBox = { minLng, minLat, maxLng, maxLat };

  // Zoom gate: when the client tells us it's below the threshold, skip the upstream entirely.
  const zoom = zoomParam === null ? Number.NaN : Number(zoomParam);
  if (Number.isFinite(zoom) && zoom < MIN_ZOOM) {
    return Response.json({ error: "zoom_too_low", minZoom: MIN_ZOOM }, { status: 422 });
  }

  // Area clamp: never let one request fetch a region-sized box.
  if (maxLng - minLng > MAX_SPAN_DEG || maxLat - minLat > MAX_SPAN_DEG) {
    return Response.json({ error: "bbox_too_large", maxSpanDeg: MAX_SPAN_DEG }, { status: 422 });
  }

  try {
    const { parcels, capped } = await lookupParcelsByBbox(box);
    const body = {
      type: "FeatureCollection" as const,
      capped,
      features: parcels.map((p) => ({
        type: "Feature" as const,
        properties: { apn: p.apn },
        geometry: p.geometry,
      })),
    };
    return Response.json(body, {
      headers: {
        // Parcel boundaries change rarely; cache shared viewports at the edge, never re-hit the county.
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (cause) {
    if (cause instanceof ParcelLookupError) {
      const status =
        cause.code === "invalid_point" ? 400 : cause.code === "out_of_coverage" ? 404 : 502;
      return Response.json({ error: cause.code }, { status });
    }
    return Response.json({ error: "lookup_failed" }, { status: 502 });
  }
}
