import { describe, expect, it, vi } from "vitest";
import { createEsriParcelAdapter, type EsriParcelAdapterConfig } from "./esri";
import { ParcelLookupError } from "./types";

const LAYER = "https://example.test/FeatureServer/0";

function fc(features: unknown[]): Response {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function squareFeature(props: Record<string, unknown>, cx = -119.78, cy = 36.6, d = 0.001) {
  return {
    type: "Feature",
    properties: props,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [cx - d, cy - d],
          [cx + d, cy - d],
          [cx + d, cy + d],
          [cx - d, cy + d],
          [cx - d, cy - d],
        ],
      ],
    },
  };
}

const baseConfig: EsriParcelAdapterConfig = {
  county: "Testville",
  bbox: { minLat: 36, maxLat: 37, minLng: -120, maxLng: -119 },
  layerUrl: LAYER,
  apnFields: ["APN", "PARCELID"],
  sourcePage: "https://example.test/page",
  bufferMeters: 25,
};

const withFetch = (fetchImpl: unknown) =>
  createEsriParcelAdapter({ ...baseConfig, fetchImpl: fetchImpl as typeof fetch });

describe("createEsriParcelAdapter", () => {
  it("returns the containing parcel on an exact intersect, x=lng/y=lat in the query", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>fc([squareFeature({ APN: "111-222-33" })]));
    const hit = await withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 });

    expect(hit?.apn).toBe("111-222-33");
    expect(hit?.match).toBe("contains");
    expect(hit?.distanceMeters).toBeNull();
    expect(hit?.sourceUrl).toBe(LAYER);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("geometry=-119.78%2C36.6"); // lng first, then lat
    expect(url).toContain("inSR=4326");
    expect(url).toContain("f=geojson");
  });

  it("falls back to a buffered nearest query when the exact intersect is empty", async () => {
    const near = squareFeature({ APN: "near" }, -119.7805, 36.6, 0.0006);
    const far = squareFeature({ APN: "far" }, -119.7700, 36.6, 0.0006);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => fc([]));
    fetchImpl
      .mockResolvedValueOnce(fc([])) // exact intersect: empty (point on a road)
      .mockResolvedValueOnce(fc([far, near])); // buffer: two parcels, "near" is closer

    const hit = await withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(hit?.match).toBe("nearest");
    expect(hit?.apn).toBe("near");
    expect(hit?.distanceMeters).not.toBeNull();
    const bufferUrl = String(fetchImpl.mock.calls[1]![0]);
    expect(bufferUrl).toContain("distance=25");
    expect(bufferUrl).toContain("units=esriSRUnit_Meter");
  });

  it("picks the APN from the first present configured field (PARCELID fallback)", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      fc([squareFeature({ PARCELID: "from-parcelid" })]),
    );
    const hit = await withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 });
    expect(hit?.apn).toBe("from-parcelid");
  });

  it("skips a 0 / boolean sentinel APN and falls through to the next field", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      fc([squareFeature({ APN: 0, PARCELID: "0123-456" })]),
    );
    const hit = await withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 });
    expect(hit?.apn).toBe("0123-456"); // not the bogus "0"
  });

  it("throws upstream when every APN field is an all-zero / unusable sentinel", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      fc([squareFeature({ APN: 0, PARCELID: false })]),
    );
    await expect(withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 })).rejects.toMatchObject({
      code: "upstream",
    });
  });

  it("throws upstream on an Esri error body (HTTP 200 with { error })", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: 400, message: "bad field" } }), { status: 200 }),
    );
    await expect(withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 })).rejects.toMatchObject({
      code: "upstream",
    });
  });

  it("throws a ParcelLookupError on a non-200 response", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>new Response("nope", { status: 503 }));
    await expect(withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 })).rejects.toBeInstanceOf(
      ParcelLookupError,
    );
  });

  it("returns null when even the buffer finds nothing", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => fc([]));
    expect(await withFetch(fetchImpl).lookupByPoint({ lat: 36.6, lng: -119.78 })).toBeNull();
  });
});
