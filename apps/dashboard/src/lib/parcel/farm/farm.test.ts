import { describe, expect, it } from "vitest";
import type { ParcelGeometry } from "../types";
import { buildFarmParcel, type EngineParcel } from "./representative";
import { bucketFor, colorForParcel, legendFor, COLOR_BYS } from "./color";
import { parcelNeedsAttention, summarize } from "./portfolio";
import { loadRepresentativeFarm } from "./seed";

const SQUARE: ParcelGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [-119.785, 36.6],
      [-119.78, 36.6],
      [-119.78, 36.604],
      [-119.785, 36.604],
      [-119.785, 36.6],
    ],
  ],
};

function base(apn: string, acres = 40): EngineParcel {
  return {
    apn,
    county: "Fresno",
    geometry: SQUARE,
    centroid_lat: 36.602,
    centroid_lon: -119.7825,
    source_url: "https://example.test/FeatureServer/0",
    gross_acres: acres,
  };
}

const TODAY = "2026-06-20";

describe("buildFarmParcel", () => {
  it("is deterministic per APN", () => {
    const a = buildFarmParcel(base("111-22-33"), {}, 0, TODAY);
    const b = buildFarmParcel(base("111-22-33"), {}, 9, TODAY);
    expect(b).toEqual(a);
  });

  it("keeps agronomy consistent with a live DWR crop class (Vineyard -> grapes, with trees/vines)", () => {
    const p = buildFarmParcel(
      base("vine-1"),
      { crop: { value: "Vineyard", source: "DWR Crop Mapping 2022 (land-use class)" } },
      0,
      TODAY,
    );
    expect(p.planting.crop).toMatch(/Grapes/);
    expect(p.planting.tree_count).toBeGreaterThan(0); // a perennial got a vine count
    expect(p.sources.crop).toContain("DWR");
  });

  it("badges genuinely-enriched fields with their source, leaves the rest representative", () => {
    const p = buildFarmParcel(
      base("soil-1"),
      { soil_class: { value: "Delhi loamy sand", source: "USDA SSURGO (Soil Data Access)" } },
      0,
      TODAY,
    );
    expect(p.soil.soil_class).toBe("Delhi loamy sand");
    expect(p.sources.soil_class).toContain("USDA");
    expect(p.sources.gsa_name).toBeUndefined(); // not enriched here -> representative, no source
  });

  it("computes net planted acres below gross", () => {
    const p = buildFarmParcel(base("acre-1", 50), {}, 0, TODAY);
    expect(p.identity.net_planted_acres).toBeLessThanOrEqual(50);
    expect(p.identity.net_planted_acres).toBeGreaterThan(40);
  });
});

describe("color + legend", () => {
  const parcels = ["a", "b", "c", "d", "e"].map((k) => buildFarmParcel(base(k), {}, 0, TODAY));

  it("returns a hex color for every color-by attribute", () => {
    for (const cb of COLOR_BYS) {
      for (const p of parcels) {
        expect(colorForParcel(p, cb.key, 2026)).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("builds a non-empty legend whose counts sum to the parcel count", () => {
    for (const cb of COLOR_BYS) {
      const legend = legendFor(parcels, cb.key, 2026);
      expect(legend.length).toBeGreaterThan(0);
      expect(legend.reduce((s, l) => s + l.count, 0)).toBe(parcels.length);
    }
  });

  it("buckets tenure into Owned / Leased", () => {
    const owned = buildFarmParcel(base("own"), {}, 0, TODAY);
    const b = bucketFor(owned, "tenure", 2026);
    expect(["Owned", "Leased"]).toContain(b.label);
  });
});

describe("summarize", () => {
  const parcels = Array.from({ length: 8 }, (_, i) => buildFarmParcel(base(`blk-${i}`, 30 + i * 5), {}, i, TODAY));

  it("totals acres and blocks and computes leased share", () => {
    const s = summarize(parcels, 2026);
    expect(s.block_count).toBe(8);
    expect(s.total_acres).toBeGreaterThan(0);
    expect(s.pct_leased).toBeGreaterThanOrEqual(0);
    expect(s.pct_leased).toBeLessThanOrEqual(100);
    expect(s.acres_by_crop.length).toBeGreaterThan(0);
    expect(s.acres_by_crop[0]!.acres).toBeGreaterThanOrEqual(s.acres_by_crop.at(-1)!.acres);
  });

  it("flags attention on low NDVI or an overdue task", () => {
    const flagged = parcels.filter(parcelNeedsAttention).length;
    expect(flagged).toBe(summarize(parcels, 2026).needs_attention);
  });

  it("counts a Jan-1 lease expiry in the right calendar year, timezone-independent", () => {
    // new Date("2027-01-01").getFullYear() is 2026 in US Pacific; the summary must not depend on it.
    const built = buildFarmParcel(base("lease-jan1"), {}, 0, TODAY);
    const leased = {
      ...built,
      identity: { ...built.identity, tenure: "leased" as const, lease_expiry: "2027-01-01" },
    };
    expect(summarize([leased], 2027).leases_expiring.count).toBe(1);
    expect(summarize([leased], 2026).leases_expiring.count).toBe(0);
  });
});

describe("loadRepresentativeFarm (committed fixture)", () => {
  it("builds the seeded operation from the real-parcel fixture", () => {
    const farm = loadRepresentativeFarm(TODAY);
    expect(farm.representative).toBe(true);
    expect(farm.parcels.length).toBeGreaterThanOrEqual(8);
    for (const p of farm.parcels) {
      expect(p.apn).toBeTruthy();
      expect(p.geometry.type).toMatch(/Polygon/);
      expect(p.identity.gross_acres).toBeGreaterThan(0);
      expect(p.planting.crop).toBeTruthy();
    }
    // Several blocks carry genuinely-enriched GSA / soil from the seed.
    const enriched = farm.parcels.filter((p) => p.sources.gsa_name || p.sources.soil_class);
    expect(enriched.length).toBeGreaterThan(0);
  });
});
