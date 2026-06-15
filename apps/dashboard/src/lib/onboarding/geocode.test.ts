import { describe, expect, it } from "vitest";
import { MAP_BOUNDS, geocodeAddress } from "./geocode";

describe("geocodeAddress", () => {
  it("is deterministic: the same address always resolves to the same pin", () => {
    const a = geocodeAddress("21500 Avenue 18, Madera, CA 93637");
    const b = geocodeAddress("21500 Avenue 18, Madera, CA 93637");
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });

  it("ignores surrounding whitespace and case", () => {
    expect(geocodeAddress("  Road 24, Madera CA  ")).toEqual(
      geocodeAddress("road 24, madera ca"),
    );
  });

  it("gives different addresses different pins", () => {
    const a = geocodeAddress("21500 Avenue 18, Madera, CA");
    const b = geocodeAddress("8900 Road 24, Madera, CA");
    expect(a).not.toEqual(b);
  });

  it("returns null for a missing or blank address", () => {
    expect(geocodeAddress(null)).toBeNull();
    expect(geocodeAddress(undefined)).toBeNull();
    expect(geocodeAddress("   ")).toBeNull();
  });

  it("places the pin inside the Madera County box", () => {
    const { center, latSpread, lngSpread } = MAP_BOUNDS;
    for (const addr of ["one well", "another well", "shop", "north 40"]) {
      const pin = geocodeAddress(addr);
      expect(pin).not.toBeNull();
      if (!pin) continue;
      expect(Math.abs(pin.lat - center.lat)).toBeLessThanOrEqual(latSpread);
      expect(Math.abs(pin.lng - center.lng)).toBeLessThanOrEqual(lngSpread);
    }
  });
});
