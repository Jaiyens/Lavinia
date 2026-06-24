"use client";

import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { GeoJSONSource, LngLatBoundsLike, MapGeoJSONFeature, Map as MapLibreMap, Popup as MlPopup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/cn";
import { colorForParcel } from "@/lib/parcel/farm/color";
import { parcelNeedsAttention } from "@/lib/parcel/farm/portfolio";
import type { ColorByKey, FarmParcel } from "@/lib/parcel/farm/types";
import { BasemapToggle, buildStyle, DEFAULT_CENTER, DEFAULT_ZOOM, type Basemap } from "./basemap";

// The full-bleed farm map: every block drawn as a polygon shaded by the active attribute
// (color.ts), with a hover tooltip (APN / acres / crop), click-to-open, a selected highlight, and
// a clay ring on blocks needing a look. Reuses the shared basemap (basemap.tsx) and MeterMap's
// lazy-import + scroll-gating wiring. Colors are precomputed in JS and fed to MapLibre as a
// feature property, so switching the color-by is just a setData.

const SRC = "farm-parcels";
const SRC_ATTN = "farm-attention";

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  // MapLibre rejects lab()/oklch() — normalize to hex via canvas.
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  ctx.fillStyle = raw;
  return ctx.fillStyle;
}

function parcelsToFeatures(parcels: FarmParcel[], colorBy: ColorByKey, year: number): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parcels.map((p, i): Feature => ({
      type: "Feature",
      id: i,
      properties: {
        apn: p.apn,
        name: p.name,
        crop: p.planting.crop,
        acres: p.identity.gross_acres,
        fill: colorForParcel(p, colorBy, year),
        attention: parcelNeedsAttention(p),
      },
      geometry: p.geometry,
    })),
  };
}

function attentionFeatures(parcels: FarmParcel[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parcels
      .filter(parcelNeedsAttention)
      .map((p): Feature<Point> => ({
        type: "Feature",
        properties: { apn: p.apn },
        geometry: { type: "Point", coordinates: [p.centroid_lon, p.centroid_lat] },
      })),
  };
}

function farmBounds(parcels: FarmParcel[]): LngLatBoundsLike | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const p of parcels) {
    const polys = p.geometry.type === "Polygon" ? [p.geometry.coordinates] : p.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lat < minLat) minLat = lat;
          if (lng > maxLng) maxLng = lng;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function tooltipHtml(f: MapGeoJSONFeature): string {
  const p = f.properties ?? {};
  const apn = String(p.apn ?? "");
  const acres = typeof p.acres === "number" ? p.acres : Number(p.acres);
  const crop = String(p.crop ?? "");
  // Inline styles: the popup lives outside the React tree, so it cannot use Tailwind classes.
  return `<div style="font:600 12px/1.3 Inter,system-ui,sans-serif;color:#16190f">
      <div style="font-size:13px">${crop}</div>
      <div style="font-weight:500;color:#5b5f52">APN ${apn} &middot; ${acres.toFixed(1)} ac</div>
    </div>`;
}

export function FarmMap({
  parcels,
  colorBy,
  year,
  selectedApn,
  onSelect,
}: {
  parcels: FarmParcel[];
  colorBy: ColorByKey;
  year: number;
  selectedApn: string | null;
  onSelect: (apn: string | null) => void;
}) {
  const [basemap, setBasemap] = useState<Basemap>("satellite");

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<MlPopup | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const didFitRef = useRef(false);

  const parcelsRef = useRef(parcels);
  const colorByRef = useRef(colorBy);
  const yearRef = useRef(year);
  const selectedRef = useRef(selectedApn);
  const onSelectRef = useRef(onSelect);
  const basemapRef = useRef(basemap);

  useEffect(() => {
    parcelsRef.current = parcels;
  }, [parcels]);
  useEffect(() => {
    colorByRef.current = colorBy;
  }, [colorBy]);
  useEffect(() => {
    yearRef.current = year;
  }, [year]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);

  // Add (or re-add, after a basemap restyle) the parcel + attention layers to a live map.
  const paint = (map: MapLibreMap) => {
    const data = parcelsToFeatures(parcelsRef.current, colorByRef.current, yearRef.current);
    const outline = cssVar("--on-surface", "#16190f");
    const selected = cssVar("--primary", "#2fa84f");
    const alert = cssVar("--alert", "#bd4b34");

    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data });
      map.addLayer({
        id: "parcels-fill",
        type: "fill",
        source: SRC,
        paint: {
          "fill-color": ["get", "fill"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.78, 0.55],
        },
      });
      map.addLayer({
        id: "parcels-outline",
        type: "line",
        source: SRC,
        paint: { "line-color": outline, "line-width": 1, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "parcels-selected",
        type: "line",
        source: SRC,
        filter: ["==", ["get", "apn"], selectedRef.current ?? "__none__"],
        paint: { "line-color": selected, "line-width": 3 },
      });
      map.addSource(SRC_ATTN, { type: "geojson", data: attentionFeatures(parcelsRef.current) });
      map.addLayer({
        id: "parcels-attention",
        type: "circle",
        source: SRC_ATTN,
        paint: {
          "circle-radius": 5,
          "circle-color": alert,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
    } else {
      (map.getSource(SRC) as GeoJSONSource).setData(data);
      const attn = map.getSource(SRC_ATTN);
      if (attn) (attn as GeoJSONSource).setData(attentionFeatures(parcelsRef.current));
    }
  };

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;

    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || containerRef.current === null) return;
      const paper = cssVar("--surface", "#faf9f4");
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
      // Scroll zoom is enabled outright (no click-to-arm gating): the wheel zooms the map
      // immediately, so "I can't zoom in" is fixed. The +/- NavigationControl stays for taps.
      map.scrollZoom.enable();
      popupRef.current = new lib.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "farm-tip" });
      mapRef.current = map;

      map.on("style.load", () => {
        paint(map);
        if (!didFitRef.current) {
          const b = farmBounds(parcelsRef.current);
          if (b) map.fitBounds(b, { padding: 80, maxZoom: 15, duration: 0 });
          didFitRef.current = true;
        }
      });

      // Hover: brighten the fill + show a tooltip.
      map.on("mousemove", "parcels-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        if (hoveredRef.current !== null && hoveredRef.current !== f.id) {
          map.setFeatureState({ source: SRC, id: hoveredRef.current }, { hover: false });
        }
        hoveredRef.current = f.id as number;
        map.setFeatureState({ source: SRC, id: f.id as number }, { hover: true });
        popupRef.current?.setLngLat(e.lngLat).setHTML(tooltipHtml(f)).addTo(map);
      });
      map.on("mouseleave", "parcels-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredRef.current !== null) {
          map.setFeatureState({ source: SRC, id: hoveredRef.current }, { hover: false });
          hoveredRef.current = null;
        }
        popupRef.current?.remove();
      });

      // Click: select the parcel under the pointer, or clear if the click missed.
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["parcels-fill"] });
        const apn = hits[0]?.properties?.apn;
        onSelectRef.current(typeof apn === "string" ? apn : null);
      });
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Recolor when the color-by (or parcels/year) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) paint(map);
     
  }, [colorBy, year, parcels]);

  // Basemap swap (style.load re-applies the layers).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    map.setStyle(buildStyle(basemap, cssVar("--surface", "#faf9f4")));
  }, [basemap]);

  // Move the selected highlight.
  useEffect(() => {
    selectedRef.current = selectedApn;
    const map = mapRef.current;
    if (map && map.getLayer("parcels-selected")) {
      map.setFilter("parcels-selected", ["==", ["get", "apn"], selectedApn ?? "__none__"]);
    }
  }, [selectedApn]);

  return (
    <div className={cn("absolute inset-0")}>
      <div ref={containerRef} className="h-full w-full" />
      <BasemapToggle basemap={basemap} onChange={setBasemap} />
    </div>
  );
}
