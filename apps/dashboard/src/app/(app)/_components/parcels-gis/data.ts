// Static config + placeholder figures for the Parcels GIS surface. The real parcels now come from
// the live county engine (viewport streaming + the preloaded Batth blocks); what remains here is
// the map's initial camera and the marketplace-comp placeholders that are still invented for the demo.

export type ParcelStatus = "available" | "pending";

export interface ListingCard {
  id: string;
  pricePerAc: string; // pre-formatted, e.g. "$11,750/ac"
  acres: string; // pre-formatted, e.g. "10.01"
  county: string;
  status: ParcelStatus;
  // Index into the placeholder-gradient palette below (gradient is the on-error fallback for the
  // real satellite thumbnail).
  imagePlaceholder: number;
  // A real ag coordinate in that county: drives the satellite thumbnail and, on click, flies the
  // map there and opens the real parcel's land record.
  lat: number;
  lng: number;
}

// ~5 comparable-land cards for the Market tab. Prices/acres are representative; the coordinates are
// real ag points so each card shows real satellite imagery and opens a real parcel when clicked.
export const LISTING_CARDS: ListingCard[] = [
  { id: "l1", pricePerAc: "$11,750/ac", acres: "10.01", county: "Fresno County, CA", status: "available", imagePlaceholder: 0, lat: 36.5536, lng: -119.7822 },
  { id: "l2", pricePerAc: "$8,400/ac", acres: "38.6", county: "Tulare County, CA", status: "available", imagePlaceholder: 1, lat: 36.2042, lng: -119.3565 },
  { id: "l3", pricePerAc: "$14,200/ac", acres: "5.25", county: "Kern County, CA", status: "pending", imagePlaceholder: 2, lat: 35.752, lng: -119.246 },
  { id: "l4", pricePerAc: "$6,950/ac", acres: "122.4", county: "Merced County, CA", status: "available", imagePlaceholder: 3, lat: 37.3258, lng: -120.6 },
  { id: "l5", pricePerAc: "$9,600/ac", acres: "20.0", county: "Stanislaus County, CA", status: "available", imagePlaceholder: 4, lat: 37.5205, lng: -120.852 },
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

// Initial camera: Batth Farms, Caruthers (Fresno County). Above the streaming zoom gate so real
// parcels draw on first paint; fitBounds to the preloaded blocks overrides this once they load.
export const GIS_CENTER: [number, number] = [-119.8872, 36.5326];
export const GIS_ZOOM = 14.5;
