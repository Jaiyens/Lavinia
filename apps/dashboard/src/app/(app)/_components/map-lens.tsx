"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQueryState } from "nuqs";
import { ChevronDown } from "lucide-react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import { filterMeters } from "@/lib/dashboard/table";
import { toMapPins, type MapPin } from "@/lib/dashboard/map";
// (MapPin also types the latest-pins ref the async init effect reads.)
import { SURFACE } from "@/lib/dashboard/surface";
import { isActiveFilterValue } from "./filter-bar";

// The Map lens (Story 2.9, FR-12): read-only MapLibre over the canonical inventory. Pins are
// DOM-element markers (real focusable buttons: aria name + state, click/Enter opens the 2.5
// drawer via the nuqs `meter` key); meters without a valid location live in the honest tray
// below, never dropped or fake-pinned. The committed style is the minimal agrarian canvas
// (warm paper background read from the CSS token at runtime); a basemap tile source is a
// deliberate TODO boundary - no paid key, no runtime tile fetch, zero external calls.
// maplibre-gl's JS is heavy, so it is imported lazily inside the effect (its namespaced
// CSS and this small component module do ship statically with the page bundle).

const t = en.shell.map;

// Fresno-area default view for a pinless farm (the Central Valley home turf).
const DEFAULT_CENTER: [number, number] = [-119.8, 36.7];
const DEFAULT_ZOOM = 9;

/** A built pin: the marker plus the handles the open-state toggle mutates in place. */
type PinEntry = {
  marker: Marker;
  el: HTMLButtonElement;
  dot: HTMLSpanElement;
  meterId: string;
  baseLabel: string;
};

// The open meter (a focused finding traces here, AC4): a charcoal --on-surface ring
// stacked OVER the elevation shadow, aria-current, and a label note - the emphasis is
// never color-fill alone and no new hue is introduced. Mutated in place so toggling
// the drawer never rebuilds the marker set (or drops keyboard focus mid-interaction).
function applyOpenState(entry: PinEntry, isOpen: boolean): void {
  if (isOpen) {
    entry.el.setAttribute("aria-current", "true");
    entry.el.setAttribute("aria-label", `${entry.baseLabel}. ${t.pinOpenNote}`);
    entry.dot.style.boxShadow = "0 0 0 3px var(--on-surface), var(--shadow-elevated)";
  } else {
    entry.el.removeAttribute("aria-current");
    entry.el.setAttribute("aria-label", entry.baseLabel);
    entry.dot.style.boxShadow = "var(--shadow-elevated)";
  }
}

function pinElement(
  pin: MapPin,
  onOpen: () => void,
): { el: HTMLButtonElement; dot: HTMLSpanElement; baseLabel: string } {
  const stateLabel = pin.attention ? t.attention : t.calm;
  const baseLabel = t.pinAria(pin.name, stateLabel);
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", baseLabel);
  // A small dot with a generous transparent hit area (the 44px floor).
  el.style.width = "44px";
  el.style.height = "44px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.background = "transparent";
  el.style.border = "none";
  el.style.cursor = "pointer";
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.style.width = "14px";
  dot.style.height = "14px";
  dot.style.borderRadius = "9999px";
  dot.style.background = pin.attention ? "var(--alert)" : "var(--primary)";
  dot.style.border = "2px solid var(--surface-container-lowest)";
  dot.style.boxShadow = "var(--shadow-elevated)";
  el.appendChild(dot);
  el.addEventListener("click", onOpen);
  return { el, dot, baseLabel };
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
    { padding: 48, maxZoom: 13, duration: 0 },
  );
}

export function MapLens({ meters }: { meters: MeterView[] }) {
  const [entity, setEntity] = useQueryState(SURFACE.entity);
  const [ranch, setRanch] = useQueryState(SURFACE.ranch);
  const [rate, setRate] = useQueryState(SURFACE.rate);
  const [meterId, setMeter] = useQueryState(SURFACE.meter);

  const { pins, unlocated } = useMemo(
    () => toMapPins(filterMeters(meters, { entity, ranch, rate })),
    [meters, entity, ranch, rate],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<PinEntry[]>([]);
  // The latest pins + opener + open meter, readable by the async map-init effect without
  // re-creating the map (assigned in effects, never during render).
  const pinsRef = useRef<MapPin[]>([]);
  const openRef = useRef<(id: string) => void>(() => undefined);
  const openMeterRef = useRef<string | null>(null);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  useEffect(() => {
    openRef.current = (id: string) => void setMeter(id);
  }, [setMeter]);
  useEffect(() => {
    openMeterRef.current = meterId;
  }, [meterId]);

  const hasView = meters.length > 0 && pins.length + unlocated.length > 0;

  // Create the map once per container mount (lazy maplibre import); 2.8's lesson: the
  // container is conditionally rendered, so the effect depends on that mount state.
  useEffect(() => {
    if (!hasView) return;
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;

    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || containerRef.current === null) return;
      // Token-sourced canvas; if the token ever resolved empty, transparent lets the page
      // paper show through rather than introducing a color literal here.
      const paper =
        getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() ||
        "transparent";
      const map = new lib.Map({
        container,
        // The committed minimal style: the paper canvas. TODO boundary: a self-hosted /
        // keyless basemap source when one is chosen; never a paid key, never Bayou.
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "paper", type: "background", paint: { "background-color": paper } }],
        },
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = pinsRef.current.map((pin) => {
        const built = pinElement(pin, () => openRef.current(pin.meterId));
        const marker = new lib.Marker({ element: built.el })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map);
        const entry: PinEntry = { marker, meterId: pin.meterId, ...built };
        applyOpenState(entry, pin.meterId === openMeterRef.current);
        return entry;
      });
      refit(map, pinsRef.current);
    })();

    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [hasView]);

  // Re-sync markers when the filtered pin set changes on a live map. Deliberately NOT
  // keyed on the open meter: toggling the drawer mutates the two affected pins in place
  // (the effect below) instead of tearing down ~183 markers and dropping keyboard focus.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    let cancelled = false;
    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || mapRef.current === null) return;
      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = pins.map((pin) => {
        const built = pinElement(pin, () => openRef.current(pin.meterId));
        const marker = new lib.Marker({ element: built.el })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map);
        const entry: PinEntry = { marker, meterId: pin.meterId, ...built };
        applyOpenState(entry, pin.meterId === openMeterRef.current);
        return entry;
      });
      // Refit so a filter change cannot strand the new pin set outside the viewport
      // (the paper canvas has no landmarks to navigate back by).
      refit(map, pins);
    })();
    return () => {
      cancelled = true;
    };
  }, [pins]);

  // The open-meter highlight (AC4): toggle ring + aria state in place on the live
  // markers; never a rebuild, never a camera move.
  useEffect(() => {
    for (const entry of markersRef.current) {
      applyOpenState(entry, entry.meterId === meterId);
    }
  }, [meterId]);

  if (!hasView) {
    const hasActiveFilter =
      isActiveFilterValue(entity) || isActiveFilterValue(ranch) || isActiveFilterValue(rate);
    const clearAll = () => {
      void setEntity(null);
      void setRanch(null);
      void setRate(null);
    };
    return (
      <div
        id="energy-lens"
        className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8"
      >
        <p className="type-body-md text-on-surface-variant">
          {meters.length === 0 ? en.shell.table.emptyFarm : t.emptyView}
        </p>
        {meters.length > 0 && hasActiveFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-[44px] rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low"
          >
            {en.shell.filter.clear}
          </button>
        )}
      </div>
    );
  }

  return (
    <section id="energy-lens" aria-label={t.caption} className="scroll-mt-6">
      {/* Pin legend: color always paired with its label. */}
      <ul aria-label={t.legendLabel} className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-outline-variant"
            style={{ background: "var(--alert)" }}
          />
          <span className="type-caption text-on-surface-variant">{t.attention}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-outline-variant"
            style={{ background: "var(--primary)" }}
          />
          <span className="type-caption text-on-surface-variant">{t.calm}</span>
        </li>
      </ul>

      <div
        ref={containerRef}
        className="h-[360px] w-full overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant"
      />

      {/* The honest tray: every meter without a resolvable location, opener included. */}
      {unlocated.length > 0 && (
        <details className="group mt-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest">
          {/* display:flex removes the native disclosure triangle, so the chevron carries
              the "this expands" affordance (rotates when open). */}
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 type-body-md text-on-surface">
            <span>{t.traySummary(unlocated.length)}</span>
            <ChevronDown
              size={18}
              aria-hidden
              className="shrink-0 text-on-surface-variant transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="border-t border-outline-variant">
            {unlocated.map((u) => (
              <li key={u.meterId} className="border-t border-outline-variant first:border-t-0">
                <button
                  type="button"
                  onClick={() => openRef.current(u.meterId)}
                  aria-label={en.shell.table.openMeter(u.name)}
                  className="flex min-h-[44px] w-full items-center px-4 py-2 text-left type-body-md text-on-surface hover:bg-surface-container-low"
                >
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
