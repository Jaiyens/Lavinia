import { describe, expect, it } from "vitest";
import { lookupParcelByPoint } from "./lookup";
import { adapterForPoint, COUNTY_ADAPTERS } from "./registry";
import { ParcelLookupError, type CountyParcelAdapter, type RawParcelHit } from "./types";

const FRESNO_POINT = { lat: 36.6004616, lng: -119.7817871 };

function fakeAdapter(hit: RawParcelHit | null): CountyParcelAdapter {
  return {
    county: "Fresno",
    bbox: { minLat: 35.9, maxLat: 37.6, minLng: -120.95, maxLng: -118.35 },
    lookupByPoint: async () => hit,
  };
}

const squareHit: RawParcelHit = {
  apn: "33803239S",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-119.7825, 36.5999],
        [-119.781, 36.5999],
        [-119.781, 36.601],
        [-119.7825, 36.601],
        [-119.7825, 36.5999],
      ],
    ],
  },
  sourceUrl: "https://example.test/FeatureServer/0",
  match: "contains",
  distanceMeters: null,
  fields: { APN: "33803239S", ROLL_YEAR: 2001 },
};

describe("adapterForPoint (dispatch)", () => {
  it("routes a Fresno point to the Fresno adapter", () => {
    expect(adapterForPoint(FRESNO_POINT)?.county).toBe("Fresno");
  });

  it("returns null for a point outside every county bbox (e.g. Los Angeles)", () => {
    expect(adapterForPoint({ lat: 34.05, lng: -118.24 })).toBeNull();
  });

  it("ships the Central Valley counties, Fresno first", () => {
    const counties = COUNTY_ADAPTERS.map((a) => a.county);
    expect(counties[0]).toBe("Fresno");
    expect(counties).toEqual(
      expect.arrayContaining([
        "Fresno",
        "Madera",
        "Kings",
        "Tulare",
        "Kern",
        "Merced",
        "Stanislaus",
        "San Joaquin",
        "Sacramento",
      ]),
    );
  });
});

describe("lookupParcelByPoint", () => {
  it("normalizes a hit into the ParcelResult contract with computed acreage + centroid", async () => {
    const result = await lookupParcelByPoint(FRESNO_POINT.lat, FRESNO_POINT.lng, {
      adapters: [fakeAdapter(squareHit)],
    });

    expect(result).not.toBeNull();
    expect(result!.apn).toBe("33803239S");
    expect(result!.county).toBe("Fresno");
    expect(result!.parcel_acres).toBeGreaterThan(0);
    expect(result!.centroid_lat).toBeCloseTo(36.6, 2);
    expect(result!.centroid_lon).toBeCloseTo(-119.7817, 2);
    expect(result!.geometry.type).toBe("Polygon");
    expect(result!.source_url).toContain("FeatureServer");
    expect(result!.match).toBe("contains");
    expect(result!.distance_m).toBeNull();
    expect(result!.fields.ROLL_YEAR).toBe(2001);
  });

  it("passes the nearest-match distance through, rounded to 0.1m", async () => {
    const result = await lookupParcelByPoint(FRESNO_POINT.lat, FRESNO_POINT.lng, {
      adapters: [fakeAdapter({ ...squareHit, match: "nearest", distanceMeters: 12.3456 })],
    });
    expect(result!.match).toBe("nearest");
    expect(result!.distance_m).toBe(12.3);
  });

  it("returns null when the covering county has no parcel at the point", async () => {
    const result = await lookupParcelByPoint(FRESNO_POINT.lat, FRESNO_POINT.lng, {
      adapters: [fakeAdapter(null)],
    });
    expect(result).toBeNull();
  });

  it("falls through to the next covering county when the first has no parcel (overlapping bboxes)", async () => {
    const bbox = { minLat: 35, maxLat: 38, minLng: -121, maxLng: -118 };
    const first: CountyParcelAdapter = { county: "First", bbox, lookupByPoint: async () => null };
    const second: CountyParcelAdapter = { county: "Second", bbox, lookupByPoint: async () => squareHit };
    const result = await lookupParcelByPoint(FRESNO_POINT.lat, FRESNO_POINT.lng, {
      adapters: [first, second],
    });
    expect(result!.county).toBe("Second");
    expect(result!.apn).toBe("33803239S");
  });

  it("returns a neighbor's hit even when an earlier covering county errors", async () => {
    const bbox = { minLat: 35, maxLat: 38, minLng: -121, maxLng: -118 };
    const erroring: CountyParcelAdapter = {
      county: "Erroring",
      bbox,
      lookupByPoint: async () => {
        throw new ParcelLookupError("upstream", "down");
      },
    };
    const working: CountyParcelAdapter = { county: "Working", bbox, lookupByPoint: async () => squareHit };
    const result = await lookupParcelByPoint(FRESNO_POINT.lat, FRESNO_POINT.lng, {
      adapters: [erroring, working],
    });
    expect(result!.county).toBe("Working");
  });

  it("throws out_of_coverage when no adapter covers the point", async () => {
    await expect(
      lookupParcelByPoint(34.05, -118.24, { adapters: [fakeAdapter(squareHit)] }),
    ).rejects.toMatchObject({ code: "out_of_coverage" });
  });

  it("throws invalid_point on out-of-range coordinates", async () => {
    await expect(lookupParcelByPoint(200, 0)).rejects.toBeInstanceOf(ParcelLookupError);
    await expect(lookupParcelByPoint(0, 999)).rejects.toMatchObject({ code: "invalid_point" });
  });
});
