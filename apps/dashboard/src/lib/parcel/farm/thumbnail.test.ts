import { describe, expect, it } from "vitest";
import { parcelThumbnailUrl } from "./thumbnail";

describe("parcelThumbnailUrl", () => {
  it("builds an Esri World Imagery export URL centered on the parcel", () => {
    const url = parcelThumbnailUrl(36.5326, -119.8872);
    expect(url).toContain("server.arcgisonline.com");
    expect(url).toContain("/World_Imagery/MapServer/export");
    expect(url).toContain("bboxSR=3857");
    expect(url).toContain("imageSR=3857");
    expect(url).toContain("f=image");
    expect(url).toContain("size=320%2C200");
  });

  it("produces a meters bbox whose aspect matches the image size (no stretch)", () => {
    const url = parcelThumbnailUrl(36.5326, -119.8872, { w: 320, h: 200, halfWidthMeters: 320 });
    const bbox = new URL(url).searchParams.get("bbox")!.split(",").map(Number);
    const [xmin, ymin, xmax, ymax] = bbox as [number, number, number, number];
    const wMeters = xmax - xmin;
    const hMeters = ymax - ymin;
    // width/height of the box should equal image width/height aspect (1.6).
    expect(wMeters / hMeters).toBeCloseTo(320 / 200, 5);
    expect(wMeters).toBeCloseTo(640, 3); // 2 * halfWidthMeters
  });

  it("centers the box on the projected centroid (west is negative x)", () => {
    const west = parcelThumbnailUrl(36.5, -120.0);
    const east = parcelThumbnailUrl(36.5, -119.0);
    const xWest = Number(new URL(west).searchParams.get("bbox")!.split(",")[0]);
    const xEast = Number(new URL(east).searchParams.get("bbox")!.split(",")[0]);
    expect(xEast).toBeGreaterThan(xWest);
  });
});
