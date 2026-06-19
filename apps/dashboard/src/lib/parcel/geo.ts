// Pure geometry for the parcel lookup: acreage + centroid, and point-to-parcel distance.
// No network, no DB. Unit-tested in geo.test.ts.
//
// WHY EPSG:3310. Acreage MUST be measured in an EQUAL-AREA projection. The source layers are
// Web Mercator (EPSG:3857), whose area is inflated by ~1/cos(lat)^2 — at Fresno's latitude
// (~36.6 deg) that over-states a parcel by ~55% (a real ~36-acre parcel reads as ~56 acres in
// the layer's Web-Mercator Shape__Area). EPSG:3310 (California Albers, NAD83) is an Albers
// equal-area conic tuned for California, so a planar shoelace on its meters is true ground area.
// Centroids are computed in the same meters then projected back to WGS84, so callers get plain
// lat/lng decimal degrees.

import proj4 from "proj4";
import type { LatLng, ParcelGeometry, Position } from "./types";

const EPSG_3310 =
  "+proj=aea +lat_1=34 +lat_2=40.5 +lat_0=0 +lon_0=-120 +x_0=0 +y_0=-4000000 +datum=NAD83 +units=m +no_defs";
proj4.defs("EPSG:3310", EPSG_3310);

/** Survey/international acre. 1 acre = 4046.8564224 m^2 exactly. */
const SQ_METERS_PER_ACRE = 4046.8564224;

/** A ring projected into EPSG:3310 meters. */
type MeterRing = Array<[number, number]>;

function toAlbers(lng: number, lat: number): [number, number] {
  const [x, y] = proj4("EPSG:4326", "EPSG:3310", [lng, lat]) as [number, number];
  return [x, y];
}

function toWgs84(x: number, y: number): [number, number] {
  const [lng, lat] = proj4("EPSG:3310", "EPSG:4326", [x, y]) as [number, number];
  return [lng, lat];
}

function projectRing(ring: Position[]): MeterRing {
  return ring.map(([lng, lat]) => toAlbers(lng, lat));
}

/** Mean of a ring's vertices: the honest fallback centroid for a degenerate (zero-area) ring. */
function vertexMean(ring: MeterRing): { cx: number; cy: number } {
  const n = ring.length || 1;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return { cx: sx / n, cy: sy / n };
}

/**
 * Absolute area + centroid of a single ring (winding-independent). The shoelace cross product
 * is signed by winding, but |area| and the centroid (cross cancels in the ratio) do not depend
 * on whether the ring is CW or CCW — important because Esri rings often wind opposite to the
 * GeoJSON right-hand rule.
 */
function ringMetrics(ring: MeterRing): { area: number; cx: number; cy: number } {
  const n = ring.length;
  if (n < 3) {
    return { area: 0, ...vertexMean(ring) };
  }
  let area2 = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[(i + 1) % n]!;
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cxAcc += (x0 + x1) * cross;
    cyAcc += (y0 + y1) * cross;
  }
  if (Math.abs(area2) < 1e-9) {
    return { area: 0, ...vertexMean(ring) };
  }
  return { area: Math.abs(area2) / 2, cx: cxAcc / (3 * area2), cy: cyAcc / (3 * area2) };
}

/** Net area + composite centroid of one polygon: outer ring minus its holes. */
function polygonMetrics(rings: MeterRing[]): { area: number; cx: number; cy: number } {
  const outer = rings[0];
  if (!outer) return { area: 0, cx: 0, cy: 0 };
  const outerM = ringMetrics(outer);
  let area = outerM.area;
  let cxA = outerM.cx * outerM.area;
  let cyA = outerM.cy * outerM.area;
  for (let i = 1; i < rings.length; i++) {
    const hole = ringMetrics(rings[i]!);
    area -= hole.area;
    cxA -= hole.cx * hole.area;
    cyA -= hole.cy * hole.area;
  }
  if (area <= 1e-9) {
    // Degenerate net area (sliver or all-holes): fall back to the outer ring's own centroid.
    return { area: Math.max(area, 0), cx: outerM.cx, cy: outerM.cy };
  }
  return { area, cx: cxA / area, cy: cyA / area };
}

export type AreaCentroid = { acres: number; centroidLat: number; centroidLng: number };

/**
 * Acreage (equal-area, EPSG:3310) and centroid (computed in 3310, returned as WGS84 lat/lng) of
 * a parcel polygon. Handles Polygon and MultiPolygon, holes, and either winding order.
 */
export function polygonAcresAndCentroid(geometry: ParcelGeometry): AreaCentroid {
  const polys: MeterRing[][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates.map(projectRing)]
      : geometry.coordinates.map((poly) => poly.map(projectRing));

  let area = 0;
  let cxA = 0;
  let cyA = 0;
  for (const rings of polys) {
    const m = polygonMetrics(rings);
    area += m.area;
    cxA += m.cx * m.area;
    cyA += m.cy * m.area;
  }

  let cx: number;
  let cy: number;
  if (area <= 1e-9) {
    // No usable area anywhere: average all outer-ring vertices so we still return an honest
    // point rather than NaN.
    const outerPts = polys.flatMap((rings) => rings[0] ?? []);
    const mean = vertexMean(outerPts);
    cx = mean.cx;
    cy = mean.cy;
  } else {
    cx = cxA / area;
    cy = cyA / area;
  }

  const [centroidLng, centroidLat] = toWgs84(cx, cy);
  return { acres: area / SQ_METERS_PER_ACRE, centroidLat, centroidLng };
}

function distPointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Even-odd point-in-polygon over all rings (a point inside a hole reads as outside). */
function pointInRings(px: number, py: number, rings: MeterRing[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}

/**
 * Ground distance (meters) from a point to a parcel: 0 if the point is inside, else the minimum
 * distance to any edge. Computed in EPSG:3310 so the comparison is in true meters. Used to pick
 * the nearest parcel when an exact point-in-polygon found nothing (the road-gap fallback).
 */
export function distanceMetersPointToGeometry(point: LatLng, geometry: ParcelGeometry): number {
  const [px, py] = toAlbers(point.lng, point.lat);
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best = Infinity;
  for (const poly of polys) {
    const rings = poly.map(projectRing);
    if (pointInRings(px, py, rings)) return 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        best = Math.min(best, distPointSegment(px, py, a[0], a[1], b[0], b[1]));
      }
    }
  }
  return best;
}
