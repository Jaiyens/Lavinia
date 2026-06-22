// Deterministic representative farm-ops data for a parcel. Given the REAL public-records parcel
// (APN + geometry + acreage from the engine) and whatever we genuinely auto-enriched (crop, GSA,
// water district, soil...), synthesize believable, internally-consistent operational data for the
// rest of the schema (variety, yields, tenure, wells, rate schedule, NDVI, spray history, tasks,
// financials).
//
// Pure + deterministic: seeded by the APN, so a parcel always renders the same data. Relative
// dates (lease expiry, task due, REI/PHI windows) are computed from `todayIso` so the demo stays
// current without re-baking the fixture. This keeps the seed fixture tiny (only the real geometry +
// live enrichment, which need network) while the ops layer regenerates at render time.
//
// The dashboard already shows the "representative data" banner; every field here is representative
// EXCEPT those supplied via `enrichment` (which carry a real source in FarmParcel.sources).

import type { ParcelGeometry } from "../types";
import type {
  FarmParcel,
  IrrigationMethod,
  ParcelTask,
  SprayRecord,
  Tenure,
  WaterSource,
} from "./types";

/** The real, engine-provided parcel facts the generator builds on. */
export type EngineParcel = {
  apn: string;
  county: string;
  geometry: ParcelGeometry;
  centroid_lat: number;
  centroid_lon: number;
  source_url: string;
  gross_acres: number;
};

export type Sourced<T> = { value: T; source: string };

/** Genuinely auto-pulled fields (from free public layers). Anything absent is generated. */
export type Enrichment = {
  crop?: Sourced<string>;
  gsa_name?: Sourced<string>;
  water_district?: Sourced<string>;
  soil_class?: Sourced<string>;
  slope_pct?: Sourced<number>;
  et_estimate_af?: Sourced<number>;
};

// --- deterministic RNG (xfnv1a hash -> mulberry32) -------------------------------------------

function seedFrom(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const range = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);
const intRange = (rng: Rng, min: number, max: number): number => Math.round(range(rng, min, max));
const chance = (rng: Rng, p: number): boolean => rng() < p;
const round = (n: number, d = 0): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

// --- date helpers (relative to the grower's "today") -----------------------------------------

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

// --- crop agronomy presets -------------------------------------------------------------------

type CropType = "tree" | "vine" | "row";
type CropPreset = {
  name: string;
  type: CropType;
  weight: number;
  varieties: readonly string[];
  rootstocks: readonly string[] | null;
  spacings: readonly string[]; // "row x tree" feet
  yield: readonly [number, number]; // per acre
  yieldUnit: "lb" | "ton" | "bale";
  pricePerUnit: number; // USD/unit
  irrigation: readonly IrrigationMethod[];
  costPerAcre: readonly [number, number];
};

const CROPS: readonly CropPreset[] = [
  {
    name: "Almonds",
    type: "tree",
    weight: 34,
    varieties: ["Nonpareil", "Monterey", "Carmel", "Independence", "Aldrich"],
    rootstocks: ["Nemaguard", "Hansen 536", "Krymsk 86", "Viking"],
    spacings: ["22 x 18 ft", "20 x 16 ft", "24 x 18 ft"],
    yield: [1700, 2900],
    yieldUnit: "lb",
    pricePerUnit: 1.85,
    irrigation: ["micro_sprinkler", "drip", "fanjet"],
    costPerAcre: [2800, 3800],
  },
  {
    name: "Pistachios",
    type: "tree",
    weight: 18,
    varieties: ["Kerman", "Golden Hills", "Lost Hills"],
    rootstocks: ["UCB-1", "Pioneer Gold"],
    spacings: ["20 x 16 ft", "22 x 17 ft"],
    yield: [2800, 4600],
    yieldUnit: "lb",
    pricePerUnit: 2.25,
    irrigation: ["micro_sprinkler", "drip"],
    costPerAcre: [2400, 3300],
  },
  {
    name: "Grapes (Raisin)",
    type: "vine",
    weight: 12,
    varieties: ["Thompson Seedless", "Selma Pete", "Fiesta"],
    rootstocks: ["Freedom", "Own-rooted"],
    spacings: ["11 x 7 ft", "12 x 7 ft"],
    yield: [8, 13],
    yieldUnit: "ton",
    pricePerUnit: 305,
    irrigation: ["drip", "furrow"],
    costPerAcre: [3000, 4200],
  },
  {
    name: "Grapes (Wine)",
    type: "vine",
    weight: 6,
    varieties: ["Cabernet Sauvignon", "Chardonnay", "Rubired", "Zinfandel"],
    rootstocks: ["1103P", "110R", "Freedom"],
    spacings: ["8 x 6 ft", "9 x 6 ft"],
    yield: [6, 11],
    yieldUnit: "ton",
    pricePerUnit: 360,
    irrigation: ["drip"],
    costPerAcre: [2600, 3600],
  },
  {
    name: "Oranges",
    type: "tree",
    weight: 10,
    varieties: ["Navel", "Valencia", "Cara Cara"],
    rootstocks: ["Carrizo", "C-35"],
    spacings: ["22 x 14 ft", "20 x 12 ft"],
    yield: [12, 24],
    yieldUnit: "ton",
    pricePerUnit: 290,
    irrigation: ["micro_sprinkler", "drip"],
    costPerAcre: [3200, 4600],
  },
  {
    name: "Cotton",
    type: "row",
    weight: 8,
    varieties: ["Pima", "Acala"],
    rootstocks: null,
    spacings: ["30 in rows", "38 in rows"],
    yield: [2.4, 3.6],
    yieldUnit: "bale",
    pricePerUnit: 620,
    irrigation: ["furrow", "drip", "solid_set"],
    costPerAcre: [1300, 1900],
  },
  {
    name: "Alfalfa",
    type: "row",
    weight: 7,
    varieties: ["CUF 101", "SW 6330"],
    rootstocks: null,
    spacings: ["solid stand"],
    yield: [6.5, 9],
    yieldUnit: "ton",
    pricePerUnit: 280,
    irrigation: ["flood", "furrow", "solid_set"],
    costPerAcre: [900, 1400],
  },
  {
    name: "Processing Tomatoes",
    type: "row",
    weight: 5,
    varieties: ["Heinz 8504", "BQ 205"],
    rootstocks: null,
    spacings: ["60 in beds"],
    yield: [42, 58],
    yieldUnit: "ton",
    pricePerUnit: 105,
    irrigation: ["drip"],
    costPerAcre: [2600, 3400],
  },
];

function weightedCrop(rng: Rng): CropPreset {
  const total = CROPS.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of CROPS) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return CROPS[0]!;
}

/**
 * Candidate presets for a crop label. DWR gives a coarse land-use CLASS (e.g. "Deciduous orchard",
 * "Vineyard"); we map it to the specific crops it could be so the displayed crop is granular and
 * its agronomy is consistent. A specific label maps to one preset; an unmappable/non-ag label
 * returns [] (the caller falls back to a weighted representative pick).
 */
function presetsForCropLabel(label: string): CropPreset[] {
  const byName = (n: string): CropPreset => CROPS.find((c) => c.name === n)!;
  const l = label.toLowerCase();
  if (l.includes("almond")) return [byName("Almonds")];
  if (l.includes("pistachio")) return [byName("Pistachios")];
  if (l.includes("wine")) return [byName("Grapes (Wine)")];
  if (l.includes("vineyard") || l.includes("grape")) return [byName("Grapes (Raisin)"), byName("Grapes (Wine)")];
  if (l.includes("citrus") || l.includes("orange") || l.includes("mandarin")) return [byName("Oranges")];
  if (l.includes("deciduous") || l.includes("orchard") || l.includes("nut"))
    return [byName("Almonds"), byName("Pistachios")];
  if (l.includes("cotton")) return [byName("Cotton")];
  if (l.includes("tomato")) return [byName("Processing Tomatoes")];
  if (l.includes("alfalfa") || l.includes("grain") || l.includes("hay") || l.includes("pasture"))
    return [byName("Alfalfa")];
  if (l.includes("truck") || l.includes("row") || l.includes("field"))
    return [byName("Processing Tomatoes"), byName("Cotton")];
  return [];
}

// --- representative value pools ---------------------------------------------------------------

const LANDLORDS = [
  "Cordova Family Trust",
  "Sierra Vista Land Co.",
  "J. Mehta Properties",
  "Kings River Holdings",
  "Valle Verde LLC",
  "B. Singh Estate",
];
const GSAS = [
  "North Kings GSA",
  "Kings River East GSA",
  "Central Kings GSA",
  "McMullin Area GSA",
];
const WATER_DISTRICTS = [
  "Fresno Irrigation District",
  "Consolidated Irrigation District",
  "Alta Irrigation District",
  "Raisin City Water District",
];
const SOILS = [
  "Hanford sandy loam",
  "Hesperia sandy loam",
  "Tujunga loamy sand",
  "Ramona loam",
  "Exeter sandy loam",
  "Greenfield sandy loam",
];
const RATE_SCHEDULES = ["AG-A1", "AG-A2", "AG-B", "AG-C", "AG-4B", "AG-5B"];
const SPRAY_MATERIALS = [
  "Roundup PowerMax",
  "Altacor",
  "Sevin XLR",
  "Movento",
  "Luna Sensation",
  "Belt SC",
  "Sulfur 90W",
];
const BLOCK_PREFIXES = ["Home Ranch", "Westside", "Lateral", "River", "Mill", "North", "Avenue 7", "Old Vineyard"];

const REI_PHI_DAYS: Record<string, [number, number]> = {
  "Roundup PowerMax": [0, 0],
  Altacor: [0.17, 1],
  "Sevin XLR": [0.5, 3],
  Movento: [1, 7],
  "Luna Sensation": [0.5, 14],
  "Belt SC": [0.5, 3],
  "Sulfur 90W": [1, 0],
};

// --- the generator ----------------------------------------------------------------------------

/**
 * Build the full FarmParcel for one block from its real engine facts + any live enrichment.
 * `index` only flavors the block name; all data is seeded by the APN so it is stable.
 */
export function buildFarmParcel(
  base: EngineParcel,
  enrichment: Enrichment,
  index: number,
  todayIso: string,
): FarmParcel {
  const rng = mulberry32(seedFrom(base.apn));
  const today = new Date(`${todayIso}T12:00:00`);
  const sources: Record<string, string> = {};

  // Crop: prefer the live DWR value; otherwise weighted-pick. Either way, drive agronomy from a
  // matching preset so variety/yield/spacing stay consistent with the crop shown.
  let preset: CropPreset;
  let cropLabel: string;
  if (enrichment.crop) {
    const candidates = presetsForCropLabel(enrichment.crop.value);
    if (candidates.length > 0) {
      // Real DWR land-use class -> a specific crop within it (consistent agronomy), source-badged.
      preset = pick(rng, candidates);
      cropLabel = preset.name;
      sources.crop = enrichment.crop.source;
    } else {
      // DWR class is non-ag / unmappable here -> representative crop, no source claim.
      preset = weightedCrop(rng);
      cropLabel = preset.name;
    }
  } else {
    preset = weightedCrop(rng);
    cropLabel = preset.name;
  }
  const isPerennial = preset.type !== "row";

  const grossAcres = round(base.gross_acres, 1);
  const netPlanted = round(grossAcres * range(rng, 0.86, 0.96), 1);

  // Tenure + lease. A couple of blocks get a lease expiring within the next ~8 months so the
  // portfolio "leases expiring this year" tile populates.
  const tenure: Tenure = chance(rng, 0.42) ? "leased" : "owned";
  const leasedExpirySoon = tenure === "leased" && chance(rng, 0.4);
  const rentPerAcre = isPerennial ? intRange(rng, 450, 750) : intRange(rng, 240, 420);
  const leaseStart = tenure === "leased" ? iso(addMonths(today, -intRange(rng, 18, 96))) : null;
  const leaseExpiry =
    tenure === "leased"
      ? iso(addMonths(today, leasedExpirySoon ? intRange(rng, 1, 8) : intRange(rng, 14, 60)))
      : null;

  // Planting / agronomy.
  const plantingYear = isPerennial
    ? today.getFullYear() - intRange(rng, 2, 22)
    : today.getFullYear();
  const variety = pick(rng, preset.varieties);
  const rootstock = preset.rootstocks ? pick(rng, preset.rootstocks) : null;
  const spacing = pick(rng, preset.spacings);
  const irrigation = pick(rng, preset.irrigation);
  // tree/vine count from spacing, when the spacing looks like "A x B ft".
  let treeCount: number | null = null;
  const m = spacing.match(/([\d.]+)\s*x\s*([\d.]+)/);
  if (isPerennial && m) {
    const per = (43560 / (Number(m[1]) * Number(m[2]))) * netPlanted;
    treeCount = Math.round(per / 5) * 5;
  }
  const expectedYield = round(range(rng, preset.yield[0], preset.yield[1]), isPerennial ? 0 : 1);
  // Young perennials under-produce; mature blocks near expected.
  const age = today.getFullYear() - plantingYear;
  const maturity = isPerennial ? Math.min(1, Math.max(0.15, (age - 1) / 6)) : 1;
  const historicalYield = round(expectedYield * range(rng, 0.82, 1.04) * maturity, isPerennial ? 0 : 1);

  // Water.
  const waterSource: WaterSource = pick(rng, [
    "well",
    "well",
    "well_and_district",
    "well_and_district",
    "district",
  ] as const);
  const hasWell = waterSource !== "district";
  const wellDepth = hasWell ? intRange(rng, 280, 920) : null;
  const wellHp = hasWell ? pick(rng, [40, 50, 60, 75, 100, 125, 150]) : null;
  const wellCapacity = hasWell ? intRange(rng, 350, 1400) : null;
  const gsaName = enrichment.gsa_name?.value ?? pick(rng, GSAS);
  if (enrichment.gsa_name) sources.gsa_name = enrichment.gsa_name.source;
  const groundwaterAlloc = round(range(rng, 1.4, 2.6), 2);
  const waterDistrict =
    waterSource === "well" ? (enrichment.water_district?.value ?? null) : (enrichment.water_district?.value ?? pick(rng, WATER_DISTRICTS));
  if (enrichment.water_district && waterDistrict) sources.water_district = enrichment.water_district.source;
  const etPerAcre = isPerennial ? range(rng, 2.8, 3.9) : range(rng, 2.2, 3.2);
  const etEstimate = enrichment.et_estimate_af?.value ?? round(etPerAcre * netPlanted, 1);
  if (enrichment.et_estimate_af) sources.et_estimate_af = enrichment.et_estimate_af.source;

  // Energy.
  const pumpHp = hasWell ? (wellHp ?? pick(rng, [50, 75, 100])) : pick(rng, [25, 40, 50]);
  const rateSchedule = pick(rng, RATE_SCHEDULES);
  const rateMisclassified = chance(rng, 0.18);
  // Rough annual pumping cost: hp -> kW -> hours -> $/kWh.
  const annualEnergyCost = Math.round(
    (pumpHp * 0.746 * intRange(rng, 1400, 2600) * range(rng, 0.17, 0.24)) / 50,
  ) * 50;
  const meterId = `${intRange(rng, 1000, 9999)}-${intRange(rng, 100, 999)}`;

  // Soil.
  const soilClass = enrichment.soil_class?.value ?? pick(rng, SOILS);
  if (enrichment.soil_class) sources.soil_class = enrichment.soil_class.source;
  const slope = enrichment.slope_pct?.value ?? round(range(rng, 0, 4), 1);
  if (enrichment.slope_pct) sources.slope_pct = enrichment.slope_pct.source;
  const salinity = chance(rng, 0.25)
    ? pick(rng, ["Mild salinity on the east edge, monitor ECe", "Slight boron, no action needed"])
    : null;

  // Health.
  const ndvi = round(range(rng, 0.42, 0.86), 2);
  const ndviTrend = pick(rng, ["improving", "stable", "stable", "declining"] as const);
  const photos = Array.from({ length: intRange(rng, 1, 3) }, (_, i) => ({
    caption: `${["Drone pass", "Ground photo", "Canopy"][i % 3]} ${pick(rng, ["NE corner", "head row", "mid-block"])}`,
    date: iso(addDays(today, -intRange(rng, 5, 80))),
  }));
  const scoutingNotes =
    chance(rng, 0.6)
      ? [
          {
            date: iso(addDays(today, -intRange(rng, 3, 40))),
            note: pick(rng, [
              "Mite pressure building on the south edge, keep watching.",
              "Irrigation set uneven, check the filter station.",
              "Good nut set, canopy looks strong.",
              "Some water stress showing midday, bump the set.",
              "Weeds in the row middles, schedule a mow.",
            ]),
            author: pick(rng, ["R. Cordova", "PCA - Vargas Ag", "M. Singh"]),
          },
        ]
      : [];

  // Compliance: spray history (some with active windows) + upcoming tasks (some overdue).
  const sprayHistory: SprayRecord[] = Array.from({ length: intRange(rng, 1, 3) }, () => {
    const material = pick(rng, SPRAY_MATERIALS);
    const date = addDays(today, -intRange(rng, 1, 45));
    const [reiD, phiD] = REI_PHI_DAYS[material] ?? [0.5, 3];
    return {
      material,
      date: iso(date),
      rei_until: iso(addDays(date, Math.ceil(reiD))),
      phi_until: iso(addDays(date, Math.ceil(phiD))),
    };
  });
  const taskPool: Array<Omit<ParcelTask, "due" | "overdue">> = [
    { label: "Pull leaf/petiole samples", kind: "fertility" },
    { label: "Hull split spray window", kind: "spray" },
    { label: "Irrigation system check", kind: "irrigation" },
    { label: "Mow row middles", kind: "scouting" },
    { label: "Harvest readiness walk", kind: "harvest" },
    { label: "Renew lease paperwork", kind: "lease" },
  ];
  const upcomingTasks: ParcelTask[] = Array.from({ length: intRange(rng, 1, 3) }, () => {
    const t = pick(rng, taskPool);
    const offset = intRange(rng, -10, 25); // some overdue (negative)
    return { label: t.label, kind: t.kind, due: iso(addDays(today, offset)), overdue: offset < 0 };
  });

  // Financial.
  const revenue = Math.round((historicalYield * netPlanted * preset.pricePerUnit) / 100) * 100;
  const costPerAcre = intRange(rng, preset.costPerAcre[0], preset.costPerAcre[1]);
  const leaseCost = tenure === "leased" ? Math.round(rentPerAcre * grossAcres) : null;

  const blockName = `${pick(rng, BLOCK_PREFIXES)} ${intRange(rng, 1, 48)}`;

  return {
    apn: base.apn,
    county: base.county,
    geometry: base.geometry,
    centroid_lat: base.centroid_lat,
    centroid_lon: base.centroid_lon,
    source_url: base.source_url,
    name: blockName,
    identity: {
      gross_acres: grossAcres,
      net_planted_acres: netPlanted,
      mtrs: representativeMtrs(rng),
      tenure,
      landlord: tenure === "leased" ? pick(rng, LANDLORDS) : null,
      rent_per_acre: tenure === "leased" ? rentPerAcre : null,
      lease_start: leaseStart,
      lease_expiry: leaseExpiry,
    },
    planting: {
      crop: cropLabel,
      variety,
      rootstock,
      planting_year: isPerennial ? plantingYear : null,
      tree_count: treeCount,
      spacing: isPerennial ? spacing : spacing,
      irrigation_method: irrigation,
      expected_yield_per_acre: expectedYield,
      historical_yield_per_acre: historicalYield,
      yield_unit: preset.yieldUnit,
    },
    water: {
      water_source: waterSource,
      well_depth_ft: wellDepth,
      well_hp: wellHp,
      well_capacity_gpm: wellCapacity,
      gsa_name: gsaName,
      groundwater_allocation_af: groundwaterAlloc,
      water_district: waterDistrict,
      et_estimate_af: etEstimate,
    },
    energy: {
      pge_meter_id: meterId,
      rate_schedule: rateSchedule,
      rate_misclassified: rateMisclassified,
      pump_hp: pumpHp,
      annual_energy_cost: annualEnergyCost,
    },
    soil: { soil_class: soilClass, slope_pct: slope, salinity_notes: salinity },
    health: { ndvi_latest: ndvi, ndvi_trend: ndviTrend, photos, scouting_notes: scoutingNotes },
    compliance: {
      permit_site_id: `10-${intRange(rng, 10, 99)}-${intRange(rng, 1000, 9999)}`,
      spray_history: sprayHistory,
      upcoming_tasks: upcomingTasks,
    },
    financial: {
      revenue,
      cost_per_acre: costPerAcre,
      lease_cost: leaseCost,
    },
    sources,
  };
  // index is intentionally unused beyond seeding flavor; kept for a stable call signature.
  void index;
}

function representativeMtrs(rng: Rng): string {
  const township = intRange(rng, 12, 16);
  const rangeE = intRange(rng, 18, 23);
  const section = intRange(rng, 1, 36);
  return `MDM T${township}S R${rangeE}E S${String(section).padStart(2, "0")}`;
}
