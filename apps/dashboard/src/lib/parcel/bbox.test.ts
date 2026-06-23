import { describe, expect, it } from "vitest";
import { adaptersForBbox } from "./registry";
import { lookupParcelsByBbox } from "./lookup";
import { ParcelLookupError, type BBox, type BBoxResult, type CountyParcelAdapter } from "./types";

function squarePolygon(cx: number, cy: number, d = 0.001) {
  return {
    type: "Polygon" as const,
    coordinates: [
      [
        [cx - d, cy - d],
        [cx + d, cy - d],
        [cx + d, cy + d],
        [cx - d, cy + d],
        [cx - d, cy - d],
      ] as [number, number][],
    ],
  };
}

/** A stub county: knows its bbox, returns the parcels it is handed (clipped queries ignored). */
function stubCounty(
  county: string,
  bbox: BBox,
  result: BBoxResult,
  onQuery?: (box: BBox) => void,
): CountyParcelAdapter {
  return {
    county,
    bbox,
    async lookupByPoint() {
      return null;
    },
    async lookupByBbox(box: BBox) {
      onQuery?.(box);
      return result;
    },
  };
}

const A: BBox = { minLat: 36, maxLat: 37, minLng: -120, maxLng: -119 };
const B: BBox = { minLat: 36, maxLat: 37, minLng: -119, maxLng: -118 };

describe("adaptersForBbox", () => {
  it("returns adapters whose county extent intersects the box", () => {
    const a = stubCounty("A", A, { parcels: [], capped: false });
    const b = stubCounty("B", B, { parcels: [], capped: false });
    const hit = adaptersForBbox({ minLat: 36.4, maxLat: 36.6, minLng: -119.5, maxLng: -119.2 }, [a, b]);
    expect(hit.map((x) => x.county)).toEqual(["A"]);
  });

  it("returns both adapters when the box straddles two counties", () => {
    const a = stubCounty("A", A, { parcels: [], capped: false });
    const b = stubCounty("B", B, { parcels: [], capped: false });
    const hit = adaptersForBbox({ minLat: 36.4, maxLat: 36.6, minLng: -119.2, maxLng: -118.8 }, [a, b]);
    expect(hit.map((x) => x.county).sort()).toEqual(["A", "B"]);
  });

  it("returns nothing outside all county extents", () => {
    const a = stubCounty("A", A, { parcels: [], capped: false });
    expect(adaptersForBbox({ minLat: 40, maxLat: 41, minLng: -100, maxLng: -99 }, [a])).toEqual([]);
  });
});

describe("lookupParcelsByBbox", () => {
  it("merges parcels across counties and de-dupes by APN", async () => {
    const a = stubCounty("A", A, { parcels: [{ apn: "1", geometry: squarePolygon(-119.5, 36.5) }], capped: false });
    const b = stubCounty("B", B, {
      parcels: [
        { apn: "1", geometry: squarePolygon(-118.5, 36.5) }, // duplicate APN on the seam -> kept once
        { apn: "2", geometry: squarePolygon(-118.6, 36.5) },
      ],
      capped: false,
    });
    const box: BBox = { minLat: 36.4, maxLat: 36.6, minLng: -119.2, maxLng: -118.8 };
    const res = await lookupParcelsByBbox(box, { adapters: [a, b] });
    expect(res.parcels.map((p) => p.apn).sort()).toEqual(["1", "2"]);
  });

  it("propagates capped when any adapter truncated", async () => {
    const a = stubCounty("A", A, { parcels: [], capped: true });
    const res = await lookupParcelsByBbox({ minLat: 36.4, maxLat: 36.6, minLng: -119.5, maxLng: -119.2 }, {
      adapters: [a],
    });
    expect(res.capped).toBe(true);
  });

  it("clips each adapter's query to box ∩ county extent", async () => {
    let seen: BBox | null = null;
    const a = stubCounty("A", A, { parcels: [], capped: false }, (box) => {
      seen = box;
    });
    // The query box spills west of county A (minLng -121 < A.minLng -120).
    await lookupParcelsByBbox({ minLat: 36.4, maxLat: 36.6, minLng: -121, maxLng: -119.5 }, { adapters: [a] });
    expect(seen!.minLng).toBe(-120); // clamped to the county's western edge
  });

  it("throws out_of_coverage when no county intersects", async () => {
    const a = stubCounty("A", A, { parcels: [], capped: false });
    await expect(
      lookupParcelsByBbox({ minLat: 40, maxLat: 41, minLng: -100, maxLng: -99 }, { adapters: [a] }),
    ).rejects.toBeInstanceOf(ParcelLookupError);
  });

  it("rejects an inverted / invalid box", async () => {
    await expect(
      lookupParcelsByBbox({ minLat: 37, maxLat: 36, minLng: -119, maxLng: -120 }),
    ).rejects.toMatchObject({ code: "invalid_point" });
  });
});
