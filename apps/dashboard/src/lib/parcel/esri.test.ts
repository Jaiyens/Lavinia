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

function fcWith(features: unknown[], extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ type: "FeatureCollection", features, ...extra }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const BOX = { minLat: 36.5, maxLat: 36.6, minLng: -119.9, maxLng: -119.8 };

describe("createEsriParcelAdapter.lookupByBbox", () => {
  it("queries the envelope (xmin,ymin,xmax,ymax = lng,lat) and returns APN + geometry", async () => {
    const fetchImpl = vi.fn(async (_i: RequestInfo | URL) =>
      fcWith([squareFeature({ APN: "a-1" }), squareFeature({ APN: "a-2" })]),
    );
    const res = await withFetch(fetchImpl).lookupByBbox!(BOX);

    expect(res.parcels.map((p) => p.apn)).toEqual(["a-1", "a-2"]);
    expect(res.parcels[0]!.geometry.type).toBe("Polygon");
    expect(res.capped).toBe(false);
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("geometryType=esriGeometryEnvelope");
    expect(url).toContain("geometry=-119.9%2C36.5%2C-119.8%2C36.6"); // minLng,minLat,maxLng,maxLat
    expect(url).toContain("outFields=APN"); // the county's first apnField
  });

  it("flags capped when Esri reports exceededTransferLimit", async () => {
    const fetchImpl = vi.fn(async (_i: RequestInfo | URL) =>
      fcWith([squareFeature({ APN: "a-1" })], { exceededTransferLimit: true }),
    );
    const res = await withFetch(fetchImpl).lookupByBbox!(BOX);
    expect(res.capped).toBe(true);
  });

  it("flags capped when the feature count reaches the record cap", async () => {
    const many = Array.from({ length: 3 }, (_v, i) => squareFeature({ APN: `a-${i}` }));
    const fetchImpl = vi.fn(async (_i: RequestInfo | URL) => fcWith(many));
    const adapter = createEsriParcelAdapter({ ...baseConfig, maxRecordCount: 3, fetchImpl: fetchImpl as typeof fetch });
    const res = await adapter.lookupByBbox!(BOX);
    expect(res.capped).toBe(true);
  });

  it("skips null-geometry and APN-less rows without throwing", async () => {
    const noGeom = { type: "Feature", properties: { APN: "x" }, geometry: null };
    const noApn = squareFeature({ APN: 0 }); // all-zero sentinel -> skipped
    const fetchImpl = vi.fn(async (_i: RequestInfo | URL) =>
      fcWith([noGeom, noApn, squareFeature({ APN: "keep" })]),
    );
    const res = await withFetch(fetchImpl).lookupByBbox!(BOX);
    expect(res.parcels.map((p) => p.apn)).toEqual(["keep"]);
  });
});
