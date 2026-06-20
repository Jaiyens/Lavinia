// Hardcoded placeholder data for the Parcels GIS surface. No backend: the dots and listing
// cards are fixed sample data so the view renders identically for everyone (the signed-in app
// and the public Tour). All coordinates and figures are invented for the demo.

export type ParcelStatus = "available" | "pending";

export interface ParcelDot {
  id: string;
  lng: number;
  lat: number;
  status: ParcelStatus;
}

export interface ListingCard {
  id: string;
  pricePerAc: string; // pre-formatted, e.g. "$11,750/ac"
  acres: string; // pre-formatted, e.g. "10.01"
  county: string;
  status: ParcelStatus;
  // Index into the placeholder-gradient palette below, so each card paints a distinct field tone.
  imagePlaceholder: number;
}

// Deterministic pseudo-random so the scatter is fixed across renders (no Math.random at runtime,
// which would also break server/client hydration parity). Mulberry32.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scatter clusters: denser toward the upper-right (Colorado / Mountain West), sparser across
// California and the Southwest, mirroring the reference distribution. Each cluster is a center,
// a spread in degrees, a count, and the share of dots that read "pending" (orange/amber).
interface Cluster {
  center: [number, number];
  spread: number;
  count: number;
  pendingShare: number;
}

const CLUSTERS: Cluster[] = [
  // Colorado / Mountain West - dense upper-right.
  { center: [-105.4, 39.4], spread: 2.4, count: 34, pendingShare: 0.22 },
  { center: [-108.5, 40.2], spread: 1.8, count: 14, pendingShare: 0.18 },
  // Utah / Wyoming bridge.
  { center: [-111.2, 41.0], spread: 1.6, count: 10, pendingShare: 0.2 },
  // California Central Valley - sparser.
  { center: [-120.4, 37.0], spread: 1.9, count: 16, pendingShare: 0.25 },
  // Southern California / Imperial - sparse.
  { center: [-116.4, 33.5], spread: 1.6, count: 8, pendingShare: 0.2 },
  // Southwest (Arizona / New Mexico) - sparse.
  { center: [-110.5, 33.8], spread: 2.2, count: 9, pendingShare: 0.22 },
  // A few scattered across Nevada / Oregon edge to fill the western frame.
  { center: [-117.5, 39.8], spread: 2.6, count: 7, pendingShare: 0.15 },
];

function buildParcelDots(): ParcelDot[] {
  const next = rng(20260620);
  const dots: ParcelDot[] = [];
  let i = 0;
  for (const c of CLUSTERS) {
    for (let n = 0; n < c.count; n++) {
      // Two random draws averaged -> a soft bell, so dots bunch near the cluster center.
      const jitterLng = (next() + next() - 1) * c.spread;
      const jitterLat = (next() + next() - 1) * c.spread;
      const status: ParcelStatus = next() < c.pendingShare ? "pending" : "available";
      dots.push({
        id: `p${i}`,
        lng: c.center[0] + jitterLng,
        lat: c.center[1] + jitterLat,
        status,
      });
      i += 1;
    }
  }
  return dots;
}

export const PARCEL_DOTS: ParcelDot[] = buildParcelDots();

// ~5 placeholder listing cards for the left panel. Figures are invented; counties are real
// California ag counties so the demo reads true to the product.
export const LISTING_CARDS: ListingCard[] = [
  { id: "l1", pricePerAc: "$11,750/ac", acres: "10.01", county: "Fresno County, CA", status: "available", imagePlaceholder: 0 },
  { id: "l2", pricePerAc: "$8,400/ac", acres: "38.6", county: "Tulare County, CA", status: "available", imagePlaceholder: 1 },
  { id: "l3", pricePerAc: "$14,200/ac", acres: "5.25", county: "Kern County, CA", status: "pending", imagePlaceholder: 2 },
  { id: "l4", pricePerAc: "$6,950/ac", acres: "122.4", county: "Merced County, CA", status: "available", imagePlaceholder: 3 },
  { id: "l5", pricePerAc: "$9,600/ac", acres: "20.0", county: "Stanislaus County, CA", status: "available", imagePlaceholder: 4 },
];

// Neutral field-tone gradients for the listing photo placeholders. NOT real listing photos:
// soft top-down washes that read as cropland / orchard / fallow ground without any third-party
// imagery. Indexed by ListingCard.imagePlaceholder.
export const PHOTO_GRADIENTS: string[] = [
  "linear-gradient(160deg, #6f8a4f 0%, #4d6b35 55%, #34501f 100%)",
  "linear-gradient(160deg, #93a86a 0%, #6f8a4f 60%, #4d6b35 100%)",
  "linear-gradient(160deg, #c2b070 0%, #9d8a4f 55%, #6f5f33 100%)",
  "linear-gradient(160deg, #7f9a5c 0%, #5c7a3e 60%, #3c5524 100%)",
  "linear-gradient(160deg, #a9b97f 0%, #7f9a5c 55%, #5c7a3e 100%)",
];

// Map view centered on the western US so California and the Mountain-West clusters both read.
export const GIS_CENTER: [number, number] = [-112, 38.2];
export const GIS_ZOOM = 4.4;

// Dot colors: teal/cyan for available (the majority), warm amber for pending (the minority).
export const DOT_AVAILABLE = "#2dd4bf"; // teal
export const DOT_PENDING = "#f59e0b"; // amber
