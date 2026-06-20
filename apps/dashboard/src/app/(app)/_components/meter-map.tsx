"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import type { MapPin } from "@/lib/dashboard/map";

// The shared meter map (the live "farm on the map" view). Renders a real basemap (satellite
// imagery or a plain street map) with one DOM-element marker per located meter; when a meter is
// reconciled, its latest bill floats above the pin as a small chip (AR-15: only proven dollars
// render). Used by BOTH the Energy map lens and the Home hero, so the heavy maplibre wiring
// lives here once. maplibre-gl's JS is heavy, so it is imported lazily inside the effect.
//
// Tiles are keyless by default (Esri World Imagery for satellite, CARTO for streets) so the app
// runs with no signup; set NEXT_PUBLIC_MAP_TILES_KEY (a MapTiler key) to upgrade. If tiles fail
// to load, maplibre simply paints the paper background underneath - the map never hard-breaks.

const t = en.shell.map;

// Fresno-area default view for a pinless farm (the Central Valley home turf).
const DEFAULT_CENTER: [number, number] = [-119.8, 36.7];
const DEFAULT_ZOOM = 9;

export type Basemap = "satellite" | "map";

/** Per-basemap raster tile config. Keyless by default; MapTiler when a key is provided. */
function tileConfig(basemap: Basemap): { tiles: string[]; attribution: string; maxzoom: number } {
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
function buildStyle(basemap: Basemap, paper: string): StyleSpecification {
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

/** A built pin: the marker plus the handles open-state and hover toggles mutate in place. */
type PinEntry = {
  marker: Marker;
  el: HTMLButtonElement;
  dot: HTMLSpanElement;
  chip: HTMLSpanElement | null;
  meterId: string;
  baseLabel: string;
};

// The open meter (a focused finding traces here): a charcoal ring stacked over the elevation
// shadow + aria-current. Mutated in place so toggling never rebuilds the marker set.
function applyOpenState(entry: PinEntry, isOpen: boolean): void {
  if (isOpen) {
    entry.el.setAttribute("aria-current", "true");
    entry.dot.style.boxShadow = "0 0 0 3px var(--on-surface), var(--shadow-elevated)";
    if (entry.chip) entry.chip.style.display = "block";
  } else {
    entry.el.removeAttribute("aria-current");
    entry.dot.style.boxShadow = "var(--shadow-elevated)";
  }
}

/** Build one marker DOM element: a focusable button with a status dot and an optional bill chip. */
function pinElement(
  pin: MapPin,
  showBill: boolean,
  onOpen: () => void,
): { el: HTMLButtonElement; dot: HTMLSpanElement; chip: HTMLSpanElement | null; baseLabel: string } {
  const billText = pin.latestBillCents != null ? formatUsdWhole(pin.latestBillCents) : null;
  const stateLabel = pin.attention ? t.attention : t.calm;
  // The optional true-up-soon dimension (the solar Map lens, FR35) is announced as words on the pin,
  // so the ring is never the only signal it carries (a screen reader hears it too).
  const fullStateLabel = pin.trueUpSoon ? t.pinTrueUpSoon(stateLabel) : stateLabel;
  const baseLabel =
    showBill && billText
      ? t.pinBillAria(pin.name, billText)
      : t.pinAria(pin.name, fullStateLabel);

  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", baseLabel);
  el.style.position = "relative";
  el.style.width = "44px";
  el.style.height = "44px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.background = "transparent";
  el.style.border = "none";
  el.style.cursor = "pointer";

  let chip: HTMLSpanElement | null = null;
  if (showBill && billText) {
    chip = document.createElement("span");
    chip.setAttribute("aria-hidden", "true");
    chip.textContent = billText;
    chip.style.position = "absolute";
    chip.style.bottom = "calc(50% + 10px)";
    chip.style.left = "50%";
    chip.style.transform = "translateX(-50%)";
    chip.style.whiteSpace = "nowrap";
    chip.style.padding = "2px 7px";
    chip.style.borderRadius = "9999px";
    chip.style.background = "var(--surface-container-lowest)";
    chip.style.color = "var(--on-surface)";
    chip.style.border = "1px solid var(--outline-variant)";
    chip.style.boxShadow = "var(--shadow-elevated)";
    chip.style.fontSize = "12px";
    chip.style.fontWeight = "600";
    chip.style.fontVariantNumeric = "tabular-nums";
    el.appendChild(chip);
  }

  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.style.width = "14px";
  dot.style.height = "14px";
  dot.style.borderRadius = "9999px";
  dot.style.background = pin.attention ? "var(--alert)" : "var(--primary)";
  dot.style.border = "2px solid var(--surface-container-lowest)";
  dot.style.boxShadow = "var(--shadow-elevated)";
  // The optional true-up-soon ring (the solar Map lens, FR35): a quiet outline around the status dot,
  // a SECOND encoded dimension on top of the attention/calm hue, not a hue of its own. Additive - it
  // only draws when the surface set pin.trueUpSoon, so the Energy map and the Home hero are unchanged.
  if (pin.trueUpSoon) {
    dot.style.outline = "2px solid var(--on-surface)";
    dot.style.outlineOffset = "2px";
  }
  el.appendChild(dot);

  el.addEventListener("click", onOpen);
  return { el, dot, chip, baseLabel };
}

/** Fit the camera to the pin set (no-op when empty). */
function refit(map: MapLibreMap, pins: readonly MapPin[]): void {
  if (pins.length === 0) return;
  const lats = pins.map((p) => p.latitude);
  const lngs = pins.map((p) => p.longitude);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 56, maxZoom: 14, duration: 0 },
  );
}

export function MeterMap({
  pins,
  openMeterId = null,
  onOpen,
  showBill = false,
  heightClass = "h-[360px]",
}: {
  pins: MapPin[];
  openMeterId?: string | null;
  onOpen: (meterId: string) => void;
  showBill?: boolean;
  heightClass?: string;
}) {
  const [basemap, setBasemap] = useState<Basemap>("satellite");

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<PinEntry[]>([]);
  // Latest values read by the async map-init effect without re-creating the map.
  const pinsRef = useRef<MapPin[]>(pins);
  const openRef = useRef<(id: string) => void>(onOpen);
  const openMeterRef = useRef<string | null>(openMeterId);
  const basemapRef = useRef<Basemap>(basemap);
  // Scroll-zoom toggles, assigned once the map exists (see the create effect).
  const enableZoomRef = useRef<(() => void) | null>(null);
  const disableZoomRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    openMeterRef.current = openMeterId;
  }, [openMeterId]);
  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);

  // Rebuild the marker set onto a live map (shared by create + pins-changed effects).
  const renderMarkers = (lib: typeof import("maplibre-gl"), map: MapLibreMap) => {
    for (const m of markersRef.current) m.marker.remove();
    markersRef.current = pinsRef.current.map((pin) => {
      const built = pinElement(pin, showBill, () => openRef.current(pin.meterId));
      const marker = new lib.Marker({ element: built.el })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map);
      const entry: PinEntry = { marker, meterId: pin.meterId, ...built };
      applyOpenState(entry, pin.meterId === openMeterRef.current);
      return entry;
    });
  };

  // Create the map once per container mount (lazy maplibre import).
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;

    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || containerRef.current === null) return;
      const paper =
        getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() ||
        "#faf9f4";
      const map = new lib.Map({
        container,
        style: buildStyle(basemapRef.current, paper),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new lib.NavigationControl({ showCompass: false }), "bottom-right");
      // Page-scroll must NOT zoom the map: scroll-zoom is off until the user clicks the map,
      // and turns back off when the pointer leaves it. So scrolling the page just scrolls the
      // page (the pins never drift), and you opt into zooming by clicking in first.
      map.scrollZoom.disable();
      enableZoomRef.current = () => map.scrollZoom.enable();
      disableZoomRef.current = () => map.scrollZoom.disable();
      container.addEventListener("click", enableZoomRef.current);
      container.addEventListener("mouseleave", disableZoomRef.current);
      mapRef.current = map;
      renderMarkers(lib, map);
      refit(map, pinsRef.current);
    })();

    return () => {
      cancelled = true;
      if (container && enableZoomRef.current) {
        container.removeEventListener("click", enableZoomRef.current);
      }
      if (container && disableZoomRef.current) {
        container.removeEventListener("mouseleave", disableZoomRef.current);
      }
      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap in place when the toggle changes (markers persist across setStyle).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const paper =
      getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#faf9f4";
    map.setStyle(buildStyle(basemap, paper));
  }, [basemap]);

  // Re-sync markers when the filtered pin set changes on a live map.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    let cancelled = false;
    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || mapRef.current === null) return;
      renderMarkers(lib, map);
      refit(map, pins);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, showBill]);

  // Toggle the open-meter highlight in place on the live markers.
  useEffect(() => {
    for (const entry of markersRef.current) {
      applyOpenState(entry, entry.meterId === openMeterId);
    }
  }, [openMeterId]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant",
        heightClass,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {/* Satellite / Map toggle, overlaid like the mockup. */}
      <div
        role="group"
        aria-label={t.basemapLabel}
        className="absolute right-3 top-3 flex overflow-hidden rounded-[var(--radius-control)] border border-outline-variant bg-paper shadow-[var(--shadow-elevated)]"
      >
        <BasemapButton
          active={basemap === "satellite"}
          onClick={() => setBasemap("satellite")}
          label={t.basemapSatellite}
        />
        <BasemapButton
          active={basemap === "map"}
          onClick={() => setBasemap("map")}
          label={t.basemapStreets}
        />
      </div>
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
