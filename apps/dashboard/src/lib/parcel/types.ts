// Public-records parcel lookup: the shared vocabulary every county adapter and the core
// dispatcher speak. "Public APN records" is NOT one API; each California county hosts its own
// source. The CountyParcelAdapter interface is the seam: implement one per county, the core
// (lookup.ts) never changes. See README.md.

/** A WGS84 decimal-degree point. lng is x, lat is y (the order Esri wants for a point query). */
export type LatLng = { lat: number; lng: number };

/** A rough county extent in decimal degrees, used only to dispatch a point to its adapter. */
export type BBox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

// Minimal GeoJSON (we don't pull in @types/geojson for two shapes). Positions are [lng, lat]
// in WGS84, the GeoJSON spec order. Rings are arrays of positions; a Polygon is [outer, ...holes].
export type Position = [number, number];
export type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
export type ParcelGeometry = PolygonGeometry | MultiPolygonGeometry;

/** Every raw attribute the source returned, kept verbatim so the UI can show provenance and so
 *  no county-specific field name is hardcoded outside its adapter. */
export type ParcelFields = Record<string, string | number | boolean | null>;

/**
 * How the parcel was matched to the query point:
 *  - "contains": the point falls inside the parcel polygon (exact point-in-polygon).
 *  - "nearest": the point fell in a gap (a road / right-of-way between parcels); this is the
 *    nearest parcel within the adapter's buffer. The dashboard discloses this honestly.
 */
export type ParcelMatch = "contains" | "nearest";

/**
 * What a county adapter hands back: the raw boundary + APN + provenance. The core computes
 * acreage and centroid from `geometry`, so adapters never do geo math (it lives once in geo.ts).
 */
export type RawParcelHit = {
  apn: string;
  /** WGS84 lng/lat rings. */
  geometry: ParcelGeometry;
  /** Where this parcel came from (the live layer URL or distribution page). */
  sourceUrl: string;
  match: ParcelMatch;
  /** Ground distance (m) from the point to the parcel when `match === "nearest"`, else null. */
  distanceMeters: number | null;
  fields: ParcelFields;
};

/**
 * The public result shape `lookupParcelByPoint` returns. The first seven fields are the spec;
 * `match` / `distance_m` / `fields` are honest disclosure the dashboard surfaces (the road-gap
 * note and the raw attribute table). Acreage + centroid are computed in EPSG:3310 (see geo.ts).
 */
export type ParcelResult = {
  apn: string;
  county: string;
  parcel_acres: number;
  centroid_lat: number;
  centroid_lon: number;
  geometry: ParcelGeometry;
  source_url: string;
  match: ParcelMatch;
  distance_m: number | null;
  fields: ParcelFields;
};

/** One parcel in a bulk viewport query: just the APN + boundary (no enrichment, no geo math). */
export type BBoxParcel = {
  apn: string;
  /** WGS84 lng/lat rings. */
  geometry: ParcelGeometry;
};

/**
 * The result of a viewport (bbox) query: the parcels intersecting the box, plus whether the source
 * hit its record cap (so the caller can subdivide / show a "zoom in" notice).
 */
export type BBoxResult = {
  parcels: BBoxParcel[];
  /** True when the source returned more than its per-request limit (results are truncated). */
  capped: boolean;
};

/**
 * A county-specific parcel source. Given a point KNOWN to be inside this county's bbox, return
 * the containing (or nearest) parcel, or null if the county truly has none there. Adding a
 * county = adding one of these; the core dispatcher and the dashboard never change.
 */
export interface CountyParcelAdapter {
  /** Human county name, e.g. "Fresno". */
  readonly county: string;
  /** Rough county extent, for point dispatch. */
  readonly bbox: BBox;
  lookupByPoint(point: LatLng): Promise<RawParcelHit | null>;
  /**
   * Return every parcel whose boundary intersects `box` (a viewport), APN + geometry only. Optional
   * so a county without bulk-query support (or a test stub) still satisfies the interface; the core
   * `lookupParcelsByBbox` skips adapters that don't implement it.
   */
  lookupByBbox?(box: BBox): Promise<BBoxResult>;
}

export type ParcelErrorCode =
  /** No adapter covers this point (outside every county's bbox). */
  | "out_of_coverage"
  /** The county source failed, timed out, or returned an unexpected shape. */
  | "upstream"
  /** The caller passed a lat/lng outside valid ranges. */
  | "invalid_point";

/** A typed error so the route handler can map a cause to the right HTTP status + UI copy. */
export class ParcelLookupError extends Error {
  readonly code: ParcelErrorCode;
  constructor(code: ParcelErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ParcelLookupError";
  }
}
