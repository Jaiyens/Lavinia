import { describe, expect, it } from "vitest";
import { lookupParcelByPoint } from "./lookup";

// A LIVE network test against the real Fresno County parcel service. Skipped by default so
// `npm test` stays offline + deterministic (the same spirit as the *.db.test.ts gate). Run it
// explicitly to prove the acceptance criterion end-to-end:
//   PARCEL_LIVE=1 npx vitest run src/lib/parcel/fresno.live.test.ts
const live = process.env.PARCEL_LIVE ? describe : describe.skip;

live("Fresno live lookup (network)", () => {
  it("returns a real Fresno parcel for the canonical test point", async () => {
    const result = await lookupParcelByPoint(36.6004616, -119.7817871);

    expect(result).not.toBeNull();
    expect(result!.county).toBe("Fresno");
    expect(result!.apn).toMatch(/\d/);
    expect(result!.parcel_acres).toBeGreaterThan(0);
    expect(result!.geometry.type).toMatch(/Polygon/);
    // The point falls on a road / right-of-way, so the nearest-parcel fallback should engage.
    expect(result!.match).toBe("nearest");

    console.log(
      "Fresno live result:",
      JSON.stringify({
        apn: result!.apn,
        acres: result!.parcel_acres,
        match: result!.match,
        distance_m: result!.distance_m,
        centroid: [result!.centroid_lat, result!.centroid_lon],
      }),
    );
  }, 30_000);
});
