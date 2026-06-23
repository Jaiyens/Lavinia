import { describe, expect, it } from "vitest";
import proj4 from "proj4";
import { distanceMetersPointToGeometry, polygonAcresAndCentroid } from "./geo";
import type { MultiPolygonGeometry, PolygonGeometry } from "./types";

// geo.ts defines EPSG:3310 on import, so we can build test polygons from known metric squares and
// inverse-project them to WGS84 — giving exact, equal-area expectations independent of the code
// under test (the area is built in 3310; the code re-derives it from WGS84).
const albersToWgs = (x: number, y: number): [number, number] =>
  proj4("EPSG:3310", "EPSG:4326", [x, y]) as [number, number];
const wgsToAlbers = (lng: number, lat: number): [number, number] =>
  proj4("EPSG:4326", "EPSG:3310", [lng, lat]) as [number, number];

/** A square of `side` meters centered on (cx, cy) in EPSG:3310, as a WGS84 GeoJSON polygon. */
function squarePolygon(cx: number, cy: number, side: number): PolygonGeometry {
  const h = side / 2;
  const corners: Array<[number, number]> = [
    [cx - h, cy - h],
    [cx + h, cy - h],
    [cx + h, cy + h],
    [cx - h, cy + h],
    [cx - h, cy - h],
  ];
  return { type: "Polygon", coordinates: [corners.map(([x, y]) => albersToWgs(x, y))] };
}

const ACRE_M2 = 4046.8564224;
const CENTER = wgsToAlbers(-119.7817871, 36.6004616);

describe("polygonAcresAndCentroid", () => {
  it("measures a 1km square as ~247.105 acres (equal-area, not Web-Mercator inflated)", () => {
    const { acres } = polygonAcresAndCentroid(squarePolygon(CENTER[0], CENTER[1], 1000));
    expect(acres).toBeCloseTo(1_000_000 / ACRE_M2, 1);
  });

  it("returns a centroid at the square's center, round-tripped to WGS84", () => {
    const { centroidLat, centroidLng } = polygonAcresAndCentroid(squarePolygon(CENTER[0], CENTER[1], 800));
    expect(centroidLng).toBeCloseTo(-119.7817871, 4);
    expect(centroidLat).toBeCloseTo(36.6004616, 4);
  });

  it("is winding-independent (a reversed ring gives the same area + centroid)", () => {
    const poly = squarePolygon(CENTER[0], CENTER[1], 600);
    const reversed: PolygonGeometry = {
      type: "Polygon",
      coordinates: [[...poly.coordinates[0]!].reverse()],
    };
    const a = polygonAcresAndCentroid(poly);
    const b = polygonAcresAndCentroid(reversed);
    expect(b.acres).toBeCloseTo(a.acres, 6);
    expect(b.centroidLng).toBeCloseTo(a.centroidLng, 9);
  });

  it("subtracts a hole from the outer ring (donut area = outer - hole)", () => {
    const outer = squarePolygon(CENTER[0], CENTER[1], 1000).coordinates[0]!;
    const hole = squarePolygon(CENTER[0], CENTER[1], 500).coordinates[0]!;
    const { acres } = polygonAcresAndCentroid({ type: "Polygon", coordinates: [outer, hole] });
    expect(acres).toBeCloseTo(750_000 / ACRE_M2, 1);
  });

  it("sums the parts of a MultiPolygon", () => {
    const a = squarePolygon(CENTER[0], CENTER[1], 1000).coordinates;
    const b = squarePolygon(CENTER[0] + 5000, CENTER[1], 1000).coordinates;
    const mp: MultiPolygonGeometry = { type: "MultiPolygon", coordinates: [a, b] };
    expect(polygonAcresAndCentroid(mp).acres).toBeCloseTo(2_000_000 / ACRE_M2, 1);
  });
});

describe("distanceMetersPointToGeometry", () => {
  const square = squarePolygon(CENTER[0], CENTER[1], 1000);

  it("is 0 for a point inside the polygon", () => {
    const inside = albersToWgs(CENTER[0], CENTER[1]);
    expect(distanceMetersPointToGeometry({ lat: inside[1], lng: inside[0] }, square)).toBe(0);
  });

  it("measures true meters to the edge for a point outside", () => {
    // 1000m east of center: the east edge is 500m away, so the gap is ~500m.
    const outside = albersToWgs(CENTER[0] + 1000, CENTER[1]);
    const d = distanceMetersPointToGeometry({ lat: outside[1], lng: outside[0] }, square);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(550);
  });
});
