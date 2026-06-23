"use client";

import type { StyleSpecification } from "maplibre-gl";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";

// Shared MapLibre basemap config + the satellite/streets toggle, used by BOTH the meter map and
// the parcel map so the heavy tile wiring lives once. Tiles are keyless by default (Esri World
// Imagery for satellite, CARTO for streets) so the app runs with no signup; set
// NEXT_PUBLIC_MAP_TILES_KEY (a MapTiler key) to upgrade. If tiles fail to load, maplibre paints
// the paper background underneath, so the map never hard-breaks.

const t = en.shell.map;

// Fresno-area default view for a locationless map (the Central Valley home turf).
export const DEFAULT_CENTER: [number, number] = [-119.8, 36.7];
export const DEFAULT_ZOOM = 9;

export type Basemap = "satellite" | "map";

/** Per-basemap raster tile config. Keyless by default; MapTiler when a key is provided. */
export function tileConfig(basemap: Basemap): { tiles: string[]; attribution: string; maxzoom: number } {
  const key = process.env.NEXT_PUBLIC_MAP_TILES_KEY;
  if (key) {
    const style = basemap === "satellite" ? "satellite" : "streets-v2";
    const ext = basemap === "satellite" ? "jpg" : "png";
    return {
      tiles: [`https://api.maptiler.com/maps/${style}/{z}/{x}/{y}.${ext}?key=${key}`],
      attribution: "(c) MapTiler (c) OpenStreetMap contributors",
      maxzoom: 20,
    };
  }
  if (basemap === "satellite") {
    return {
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      attribution: "Imagery (c) Esri, Maxar, Earthstar Geographics",
      maxzoom: 19,
    };
  }
  return {
    tiles: [
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    ],
    attribution: "(c) OpenStreetMap contributors (c) CARTO",
    maxzoom: 20,
  };
}

/** A maplibre style with the chosen raster basemap over the warm paper background. */
export function buildStyle(basemap: Basemap, paper: string): StyleSpecification {
  const cfg = tileConfig(basemap);
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: cfg.tiles,
        tileSize: 256,
        attribution: cfg.attribution,
        maxzoom: cfg.maxzoom,
      },
    },
    layers: [
      // The paper background shows through if a tile 404s (the keyless fallback).
      { id: "paper", type: "background", paint: { "background-color": paper } },
      { id: "base", type: "raster", source: "base" },
    ],
  };
}

/** The satellite / streets switch overlaid on a map, top-right like the mockup. */
export function BasemapToggle({
  basemap,
  onChange,
}: {
  basemap: Basemap;
  onChange: (next: Basemap) => void;
}) {
  return (
    <div
      role="group"
      aria-label={t.basemapLabel}
      className="absolute right-3 top-3 flex overflow-hidden rounded-[var(--radius-control)] border border-outline-variant bg-paper shadow-[var(--shadow-elevated)]"
    >
      <BasemapButton
        active={basemap === "satellite"}
        onClick={() => onChange("satellite")}
        label={t.basemapSatellite}
      />
      <BasemapButton active={basemap === "map"} onClick={() => onChange("map")} label={t.basemapStreets} />
    </div>
  );
}

function BasemapButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-[36px] px-3 type-body-sm font-semibold transition-colors",
        active
          ? "bg-primary-container text-on-primary-container"
          : "text-on-surface-variant hover:bg-surface-container-low",
      )}
    >
      {label}
    </button>
  );
}
