// Color-by-attribute: shade every parcel by a chosen attribute (crop, tree age, NDVI vigor,
// owned-vs-leased, water source) so a wall of APNs becomes a readable map, with a matching legend.
// Pure: the map precomputes each parcel's fill color in JS and feeds it to MapLibre as a feature
// property, and the legend renders the buckets actually present. Palette is tuned to the warm
// agricultural brand (greens/golds/clay/teal), not default-viz neon.

import type { ColorByKey, FarmParcel } from "./types";

export type Bucket = { key: string; label: string; color: string };
export type LegendItem = Bucket & { count: number };

export const COLOR_BYS: { key: ColorByKey; label: string }[] = [
  { key: "crop", label: "Crop" },
  { key: "tree_age", label: "Tree age" },
  { key: "ndvi", label: "NDVI vigor" },
  { key: "tenure", label: "Owned / leased" },
  { key: "water_source", label: "Water source" },
];

const UNKNOWN = "#9aa0a6"; // warm slate for missing/other

// Specific-crop palette (warm + earthy). Unknown crops fall back to a stable hashed pick.
const CROP_COLORS: Record<string, string> = {
  Almonds: "#6fae5e",
  Pistachios: "#3e8e7e",
  "Grapes (Raisin)": "#7d5ba6",
  "Grapes (Wine)": "#8c3b5a",
  Oranges: "#e0892e",
  Cotton: "#cbb994",
  Alfalfa: "#8a9a3b",
  "Processing Tomatoes": "#c0432f",
};
const CROP_FALLBACK = ["#4a90a4", "#c77d3e", "#5b8c5a", "#b0883e", "#6b7280"];
function cropColor(crop: string): string {
  if (CROP_COLORS[crop]) return CROP_COLORS[crop];
  let h = 0;
  for (let i = 0; i < crop.length; i++) h = (h * 31 + crop.charCodeAt(i)) >>> 0;
  return CROP_FALLBACK[h % CROP_FALLBACK.length]!;
}

const TENURE_COLOR = { owned: "#2fa84f", leased: "#f2c14e" } as const;

const WATER_META: Record<string, { label: string; color: string }> = {
  well: { label: "Well", color: "#4a90a4" },
  district: { label: "District", color: "#4e79a7" },
  well_and_district: { label: "Well + district", color: "#6b8fb5" },
  riparian: { label: "Riparian", color: "#8a9a3b" },
};

// Ordered ramps (low -> high). legendFor keeps this canonical order and drops empty buckets.
const NDVI_BUCKETS: Bucket[] = [
  { key: "lt50", label: "Low, under 0.50", color: "#bd4b34" },
  { key: "b5060", label: "Fair, 0.50 to 0.60", color: "#e0913e" },
  { key: "b6070", label: "Good, 0.60 to 0.70", color: "#f2c14e" },
  { key: "b7078", label: "Strong, 0.70 to 0.78", color: "#8cc63f" },
  { key: "gte78", label: "Vigorous, 0.78 plus", color: "#1f7a39" },
];
function ndviKey(v: number | null): string {
  if (v === null) return "lt50";
  if (v < 0.5) return "lt50";
  if (v < 0.6) return "b5060";
  if (v < 0.7) return "b6070";
  if (v < 0.78) return "b7078";
  return "gte78";
}

const AGE_BUCKETS: Bucket[] = [
  { key: "annual", label: "Annual / row", color: "#9aa0a6" },
  { key: "establishing", label: "Establishing, 0 to 3 yr", color: "#cfe8d4" },
  { key: "developing", label: "Developing, 4 to 7 yr", color: "#8cc63f" },
  { key: "prime", label: "Prime, 8 to 14 yr", color: "#2fa84f" },
  { key: "mature", label: "Mature, 15 to 22 yr", color: "#1b6b34" },
  { key: "old", label: "Old, 23 yr plus", color: "#0f3d1e" },
];
function ageKey(plantingYear: number | null, year: number): string {
  if (plantingYear === null) return "annual";
  const age = year - plantingYear;
  if (age <= 3) return "establishing";
  if (age <= 7) return "developing";
  if (age <= 14) return "prime";
  if (age <= 22) return "mature";
  return "old";
}

const byKey = (buckets: Bucket[], key: string): Bucket =>
  buckets.find((b) => b.key === key) ?? { key, label: key, color: UNKNOWN };

/** The bucket (key + label + color) a parcel falls into for the given attribute. */
export function bucketFor(parcel: FarmParcel, colorBy: ColorByKey, year: number): Bucket {
  switch (colorBy) {
    case "crop": {
      const crop = parcel.planting.crop;
      return { key: crop, label: crop, color: cropColor(crop) };
    }
    case "tenure": {
      const t = parcel.identity.tenure;
      return { key: t, label: t === "owned" ? "Owned" : "Leased", color: TENURE_COLOR[t] };
    }
    case "water_source": {
      const w = parcel.water.water_source;
      const meta = WATER_META[w] ?? { label: w, color: UNKNOWN };
      return { key: w, label: meta.label, color: meta.color };
    }
    case "ndvi":
      return byKey(NDVI_BUCKETS, ndviKey(parcel.health.ndvi_latest));
    case "tree_age":
      return byKey(AGE_BUCKETS, ageKey(parcel.planting.planting_year, year));
  }
}

export function colorForParcel(parcel: FarmParcel, colorBy: ColorByKey, year: number): string {
  return bucketFor(parcel, colorBy, year).color;
}

const ORDERED: Partial<Record<ColorByKey, Bucket[]>> = {
  ndvi: NDVI_BUCKETS,
  tree_age: AGE_BUCKETS,
};

/** The legend for the active attribute: only buckets present, ordered (ramp order, else by count). */
export function legendFor(parcels: FarmParcel[], colorBy: ColorByKey, year: number): LegendItem[] {
  const counts = new Map<string, { bucket: Bucket; count: number }>();
  for (const p of parcels) {
    const b = bucketFor(p, colorBy, year);
    const hit = counts.get(b.key);
    if (hit) hit.count += 1;
    else counts.set(b.key, { bucket: b, count: 1 });
  }
  const ordered = ORDERED[colorBy];
  if (ordered) {
    return ordered
      .filter((b) => counts.has(b.key))
      .map((b) => ({ ...b, count: counts.get(b.key)!.count }));
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.bucket.label.localeCompare(b.bucket.label))
    .map(({ bucket, count }) => ({ ...bucket, count }));
}
