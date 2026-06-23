import { lookupParcelByPoint } from "@/lib/parcel";
import { ParcelLookupError } from "@/lib/parcel";

/**
 * Public-records parcel lookup endpoint. GET /api/parcel?lat=..&lng=.. returns the county parcel
 * that contains the point (APN + boundary + acreage/centroid computed in EPSG:3310). The county
 * dispatch + the Esri query + the geo math all live in @/lib/parcel; this is a thin HTTP edge
 * (the repo's route-handler-for-external-integrations pattern, like api/almond/chat).
 *
 * Node runtime: the lookup uses proj4 + fetch server-side, and keeps the per-county adapter logic
 * (and the upstream URL) off the client.
 *
 * NOTE (abuse): this proxies a free public county GIS service and is currently unauthenticated.
 * It only reads public records (no grower data), but a scripted caller could run up requests
 * against the county. Add a per-IP rate limit / bot check before exposing it widely.
 */
export const runtime = "nodejs";

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  if (latParam === null || lngParam === null) {
    return Response.json({ error: "invalid_point" }, { status: 400 });
  }

  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "invalid_point" }, { status: 400 });
  }

  try {
    const result = await lookupParcelByPoint(lat, lng);
    if (result === null) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json(result);
  } catch (cause) {
    if (cause instanceof ParcelLookupError) {
      // invalid_point -> 400, out_of_coverage -> 404 (with a distinct code the UI reads),
      // upstream -> 502 (the county service failed, not the caller).
      const status =
        cause.code === "invalid_point" ? 400 : cause.code === "out_of_coverage" ? 404 : 502;
      return Response.json({ error: cause.code }, { status });
    }
    return Response.json({ error: "lookup_failed" }, { status: 502 });
  }
}
