// A real satellite thumbnail of a parcel: an Esri World Imagery static export centered on the
// block's centroid (the same imagery as the map basemap, keyless). Used for the "Your blocks" cards
// so each card shows the actual ground, not a placeholder. Pure: builds a URL, no fetch.

const R = 6378137; // WGS84 web-mercator radius (meters)

/** Project WGS84 lng/lat to EPSG:3857 meters. */
function toMercator(lng: number, lat: number): [number, number] {
  const x = (R * lng * Math.PI) / 180;
  const clampedLat = Math.max(-85.05, Math.min(85.05, lat));
  const y = R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 180 / 2));
  return [x, y];
}

/**
 * Esri World Imagery export URL for a thumbnail centered on (lat, lon). The bbox is a meters box in
 * EPSG:3857 sized to the image aspect so the imagery isn't stretched. Default ~640m x 400m, which
 * frames a typical block. Bounded use only (the farmer's blocks, lazy-loaded), not the viewport.
 */
export function parcelThumbnailUrl(
  lat: number,
  lon: number,
  opts?: { halfWidthMeters?: number; w?: number; h?: number },
): string {
  const w = opts?.w ?? 320;
  const h = opts?.h ?? 200;
  const halfW = opts?.halfWidthMeters ?? 320;
  const halfH = halfW * (h / w);
  const [cx, cy] = toMercator(lon, lat);
  const params = new URLSearchParams({
    bbox: `${cx - halfW},${cy - halfH},${cx + halfW},${cy + halfH}`,
    bboxSR: "3857",
    imageSR: "3857",
    size: `${w},${h}`,
    format: "jpg",
    transparent: "false",
    f: "image",
  });
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${params.toString()}`;
}
