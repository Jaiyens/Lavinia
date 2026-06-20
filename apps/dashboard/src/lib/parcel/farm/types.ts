// The farm-operations data model for a parcel: the canonical schema the map, the detail drawer,
// the color-by control, and the portfolio summary all read. A FarmParcel is the engine's
// public-records parcel (real APN + boundary + acreage, from @/lib/parcel) ENRICHED with farm
// operations data, grouped exactly as the drawer renders it (identity, planting, water, energy,
// soil, health, compliance, financial).
//
// Provenance: fields we genuinely auto-pull from a free public source (crop, GSA, water district,
// ...) record that source in `sources`. Everything else is representative demo data (the dashboard
// already shows the "representative data" banner) and carries a TODO in enrich.ts naming the real
// source to wire next. snake_case matches the existing ParcelResult contract.

import type { ParcelGeometry } from "../types";

export type Tenure = "owned" | "leased";

/** The attributes a farmer can shade the map by (the color-by control). */
export type ColorByKey = "crop" | "tree_age" | "ndvi" | "tenure" | "water_source";

export type IrrigationMethod =
  | "drip"
  | "micro_sprinkler"
  | "fanjet"
  | "flood"
  | "furrow"
  | "solid_set";

export type WaterSource = "well" | "district" | "well_and_district" | "riparian";

export type NdviTrend = "improving" | "stable" | "declining";

/** Identity + lease/tenure. */
export type ParcelIdentity = {
  gross_acres: number;
  net_planted_acres: number;
  /** Meridian-Township-Range-Section (e.g. "MDM T14S R20E S07"). */
  mtrs: string | null;
  tenure: Tenure;
  /** Landlord name when leased, else null. */
  landlord: string | null;
  /** $/acre/year when leased, else null. */
  rent_per_acre: number | null;
  /** ISO date (YYYY-MM-DD) when leased, else null. */
  lease_start: string | null;
  lease_expiry: string | null;
};

/** Planting / agronomy. */
export type ParcelPlanting = {
  crop: string;
  variety: string | null;
  rootstock: string | null;
  planting_year: number | null;
  tree_count: number | null;
  /** Tree spacing, e.g. "22 x 16 ft". */
  spacing: string | null;
  irrigation_method: IrrigationMethod | null;
  /** Units per acre (lbs for nuts, tons for grapes/forage, bales for cotton). */
  expected_yield_per_acre: number | null;
  historical_yield_per_acre: number | null;
  yield_unit: "lb" | "ton" | "bale";
};

/** Water source, groundwater management, and evapotranspiration. */
export type ParcelWater = {
  water_source: WaterSource;
  well_depth_ft: number | null;
  well_hp: number | null;
  /** Well capacity in gallons per minute. */
  well_capacity_gpm: number | null;
  gsa_name: string | null;
  /** SGMA groundwater allocation, acre-feet/acre/year. */
  groundwater_allocation_af: number | null;
  water_district: string | null;
  /** Seasonal evapotranspiration estimate, acre-feet (OpenET). */
  et_estimate_af: number | null;
};

/** PG&E energy + pumping. Ties into the Energy agent's rate work. */
export type ParcelEnergy = {
  pge_meter_id: string | null;
  rate_schedule: string | null;
  rate_misclassified: boolean;
  pump_hp: number | null;
  annual_energy_cost: number | null;
};

/** Soil (SSURGO) + terrain. */
export type ParcelSoil = {
  soil_class: string | null;
  /** Average slope, percent. */
  slope_pct: number | null;
  salinity_notes: string | null;
};

export type ScoutingNote = {
  date: string; // ISO
  note: string;
  author: string | null;
};

export type ParcelPhoto = {
  /** Representative placeholder for the demo; real photos arrive with field capture. */
  caption: string;
  date: string; // ISO
};

/** Remote-sensing health + field observations. */
export type ParcelHealth = {
  /** Latest mean NDVI for the block, 0..1. */
  ndvi_latest: number | null;
  ndvi_trend: NdviTrend | null;
  photos: ParcelPhoto[];
  scouting_notes: ScoutingNote[];
};

export type SprayRecord = {
  material: string;
  date: string; // ISO
  /** Restricted-entry interval lifts on this date. */
  rei_until: string; // ISO
  /** Pre-harvest interval clears on this date. */
  phi_until: string; // ISO
};

export type ParcelTaskKind = "irrigation" | "spray" | "fertility" | "scouting" | "harvest" | "lease";

export type ParcelTask = {
  label: string;
  due: string; // ISO
  kind: ParcelTaskKind;
  overdue: boolean;
};

/** Spray history + regulatory compliance (CalAgPermits site, REI/PHI windows, tasks). */
export type ParcelCompliance = {
  permit_site_id: string | null;
  spray_history: SprayRecord[];
  upcoming_tasks: ParcelTask[];
};

/** Financials, per block. */
export type ParcelFinancial = {
  /** Total block revenue for the trailing season, USD. */
  revenue: number | null;
  cost_per_acre: number | null;
  /** Annual lease cost when leased, else null. */
  lease_cost: number | null;
};

/**
 * One block of the operation: the real public-records parcel + all farm-ops data, grouped.
 * `sources` names the free public source for any field we genuinely auto-pulled (so the drawer can
 * badge it "from DWR ..."); absent keys are representative demo values.
 */
export type FarmParcel = {
  // --- real, from the public-records engine (@/lib/parcel) ---
  apn: string;
  county: string;
  geometry: ParcelGeometry;
  centroid_lat: number;
  centroid_lon: number;
  source_url: string;
  /** Operator-facing block name (e.g. "Home Ranch 12"). Representative for the demo. */
  name: string;

  identity: ParcelIdentity;
  planting: ParcelPlanting;
  water: ParcelWater;
  energy: ParcelEnergy;
  soil: ParcelSoil;
  health: ParcelHealth;
  compliance: ParcelCompliance;
  financial: ParcelFinancial;

  /** field key -> the live public source it was pulled from (provenance for auto-enriched fields). */
  sources: Record<string, string>;
};

/** The seeded operation: the set of blocks plus light metadata. */
export type Farm = {
  name: string;
  county: string;
  parcels: FarmParcel[];
  /** True when this is the seeded representative operation (drives the banner copy). */
  representative: boolean;
};
