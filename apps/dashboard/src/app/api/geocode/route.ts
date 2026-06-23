/**
 * Address geocoder for the Parcels search. GET /api/geocode?q=... returns up to 5 matches biased to
 * the Central Valley. Prefers MapTiler when NEXT_PUBLIC_MAP_TILES_KEY is set (better rate limits),
 * else falls back to Nominatim (OpenStreetMap). Proxied server-side so we can set a descriptive
 * User-Agent (Nominatim requires one), cache results, and not pin OSM from many client IPs.
 *
 * Call only on explicit submit, never per keystroke (OSM usage policy). Keep within ~1 req/sec.
 */
export const runtime = "nodejs";

// Central Valley bias box (minLng,minLat,maxLng,maxLat).
const CV = { minLng: -121.95, minLat: 34.7, maxLng: -118.0, maxLat: 38.85 };

export type GeocodeHit = { name: string; lat: number; lng: number };

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

async function geocodeMapTiler(q: string, key: string): Promise<GeocodeHit[]> {
  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json` +
    `?key=${key}&bbox=${CV.minLng},${CV.minLat},${CV.maxLng},${CV.maxLat}&limit=5&country=us`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`maptiler ${res.status}`);
  const json: unknown = await res.json();
  const features = (json as { features?: unknown[] }).features ?? [];
  const hits: GeocodeHit[] = [];
  for (const f of features) {
    const feat = f as { place_name?: unknown; text?: unknown; center?: unknown };
    const center = Array.isArray(feat.center) ? feat.center : [];
    const lng = num(center[0]);
    const lat = num(center[1]);
    const name = typeof feat.place_name === "string" ? feat.place_name : typeof feat.text === "string" ? feat.text : null;
    if (lat !== null && lng !== null && name) hits.push({ name, lat, lng });
  }
  return hits;
}

async function geocodeNominatim(q: string): Promise<GeocodeHit[]> {
  // viewbox order is left,top,right,bottom = minLng,maxLat,maxLng,minLat.
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&bounded=1` +
    `&viewbox=${CV.minLng},${CV.maxLat},${CV.maxLng},${CV.minLat}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "User-Agent": "TerraDashboard/1.0 (https://app.tryterra.ai; farmer parcel search)",
    },
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const json: unknown = await res.json();
  const rows = Array.isArray(json) ? json : [];
  const hits: GeocodeHit[] = [];
  for (const r of rows) {
    const row = r as { display_name?: unknown; lat?: unknown; lon?: unknown };
    const lat = num(row.lat);
    const lng = num(row.lon);
    const name = typeof row.display_name === "string" ? row.display_name : null;
    if (lat !== null && lng !== null && name) hits.push({ name, lat, lng });
  }
  return hits;
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  const key = process.env.NEXT_PUBLIC_MAP_TILES_KEY;
  try {
    const results = key ? await geocodeMapTiler(q, key) : await geocodeNominatim(q);
    return Response.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ error: "geocode_failed" }, { status: 502 });
  }
}
