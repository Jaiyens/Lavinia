"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { GeoJSONSource, LngLatBoundsLike, MapGeoJSONFeature, Map as MapLibreMap, Popup as MlPopup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { en } from "@/copy/en";
import { colorForParcel } from "@/lib/parcel/farm/color";
import { parcelNeedsAttention } from "@/lib/parcel/farm/portfolio";
import type { ColorByKey, FarmParcel } from "@/lib/parcel/farm/types";
import { buildStyle } from "../basemap";
import { GIS_CENTER, GIS_ZOOM } from "./data";
import { useViewportParcels, type ViewportState } from "./use-viewport-parcels";

// The full-bleed satellite map for the Parcels GIS surface. Two real GeoJSON sources over the Esri
// satellite basemap:
//   - "my-parcels": the farmer's preloaded blocks (Batth) — always drawn, color-coded, with the
//     clay attention rings. The map opens fit to these.
//   - "viewport-parcels": every public parcel intersecting the current viewport, streamed live by
//     useViewportParcels as you pan/zoom (Zillow-style), translucent so your own land reads on top.
// Click a parcel to select it (the page opens the land record). Scroll zoom is enabled outright.

const MY = "my-parcels";
const VP = "viewport-parcels";

const c = en.parcelsGis;

export interface GisMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  /** Return to the farmer's own land: fit to their blocks (or the default center if none). */
  home: () => void;
}

/** What a map click hands the page: the APN, whether it's one of the farmer's own blocks (so the
 *  page can open it from memory), and the click point (to enrich a generic viewport parcel). */
export interface ParcelSelection {
  apn: string;
  mine: boolean;
  lng: number;
  lat: number;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  // MapLibre only accepts hex/rgb(a), not the wide-gamut color() forms (lab()/oklch()) that the
  // shadcn theme uses. Modern browsers PRESERVE those through `canvas.fillStyle` instead of
  // converting, so reading fillStyle back leaks the raw lab()/oklch() string. Paint the color into
  // a 1px canvas and read it back as sRGB bytes to force a MapLibre-valid rgb()/rgba(). Seed with
  // the fallback first so a value the canvas can't parse degrades to the fallback, not to black.
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const r = d[0] ?? 0;
  const g = d[1] ?? 0;
  const b = d[2] ?? 0;
  const a = d[3] ?? 255;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

function myParcelsToFeatures(parcels: FarmParcel[], colorBy: ColorByKey, year: number): FeatureCollection {
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
  const crop = typeof p.crop === "string" && p.crop.length > 0 ? p.crop : null;
  const acres = typeof p.acres === "number" ? p.acres : Number(p.acres);
  const line2 = Number.isFinite(acres) ? `APN ${apn} &middot; ${acres.toFixed(1)} ac` : `APN ${apn}`;
  // Inline styles: the popup lives outside the React tree, so it cannot use Tailwind classes.
  return `<div style="font:600 12px/1.3 Inter,system-ui,sans-serif;color:#16190f">
      ${crop ? `<div style="font-size:13px">${crop}</div>` : ""}
      <div style="font-weight:500;color:#5b5f52">${line2}</div>
    </div>`;
}

function StatusPill({ state }: { state: ViewportState }) {
  const label =
    state === "too_low"
      ? c.status.zoomIn
      : state === "loading"
        ? c.status.loading
        : state === "capped"
          ? c.status.dense
          : state === "error"
            ? c.status.error
            : null;
  if (label === null) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <span className="rounded-full bg-[#11151c]/90 px-3 py-1.5 text-[0.78rem] font-medium text-white/90 shadow-lg backdrop-blur">
        {label}
      </span>
    </div>
  );
}

export function GisMap({
  handleRef,
  onSelect,
  myParcels,
  colorBy,
  year,
  selectedApn,
}: {
  handleRef?: Ref<GisMapHandle>;
  onSelect?: (sel: ParcelSelection | null) => void;
  myParcels: FarmParcel[];
  colorBy: ColorByKey;
  year: number;
  selectedApn: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<MlPopup | null>(null);
  const hoveredRef = useRef<{ source: string; id: string | number } | null>(null);
  const didFitRef = useRef(false);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  const myParcelsRef = useRef(myParcels);
  const colorByRef = useRef(colorBy);
  const yearRef = useRef(year);
  const selectedRef = useRef(selectedApn);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    myParcelsRef.current = myParcels;
  }, [myParcels]);
  useEffect(() => {
    colorByRef.current = colorBy;
  }, [colorBy]);
  useEffect(() => {
    yearRef.current = year;
  }, [year]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Stream the viewport overlay into the VP source.
  const vpState = useViewportParcels(mapInstance, VP);

  useImperativeHandle(
    handleRef,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn({ duration: 240 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 240 }),
      flyTo: (lng: number, lat: number, zoom = 16) =>
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 900 }),
      home: () => {
        const map = mapRef.current;
        if (!map) return;
        const b = farmBounds(myParcelsRef.current);
        if (b) map.fitBounds(b, { padding: 90, maxZoom: 15.5, duration: 900 });
        else map.flyTo({ center: GIS_CENTER, zoom: GIS_ZOOM, duration: 900 });
      },
    }),
    [],
  );

  // Add (or re-add after a restyle) both sources + their layers.
  const paint = (map: MapLibreMap) => {
    const outline = cssVar("--on-surface", "#16190f");
    const selected = cssVar("--primary", "#2fa84f");
    const alert = cssVar("--alert", "#bd4b34");

    // --- Viewport overlay (drawn first, below the farmer's own blocks) ---
    if (!map.getSource(VP)) {
      map.addSource(VP, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "apn" });
      map.addLayer({
        id: "vp-fill",
        type: "fill",
        source: VP,
        paint: {
          "fill-color": "#5fd07e",
          // Note: a zoom interpolate may only sit at the TOP of an expression, never nested in a
          // "case", so hover brightening uses plain constants here.
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.32, 0.14],
        },
      });
      map.addLayer({
        id: "vp-line",
        type: "line",
        source: VP,
        paint: {
          "line-color": "rgba(255,255,255,0.85)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.4, 17, 1.2],
        },
      });
      map.addLayer({
        id: "vp-selected",
        type: "line",
        source: VP,
        filter: ["==", ["get", "apn"], selectedRef.current ?? "__none__"],
        paint: { "line-color": "#f2c14e", "line-width": 3 },
      });
    }

    // --- The farmer's own blocks (drawn on top, fully colored) ---
    const myData = myParcelsToFeatures(myParcelsRef.current, colorByRef.current, yearRef.current);
    if (!map.getSource(MY)) {
      map.addSource(MY, { type: "geojson", data: myData, promoteId: "apn" });
      map.addLayer({
        id: "my-fill",
        type: "fill",
        source: MY,
        paint: {
          "fill-color": ["get", "fill"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.82, 0.6],
        },
      });
      map.addLayer({
        id: "my-line",
        type: "line",
        source: MY,
        paint: { "line-color": outline, "line-width": 1.4, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "my-selected",
        type: "line",
        source: MY,
        filter: ["==", ["get", "apn"], selectedRef.current ?? "__none__"],
        paint: { "line-color": selected, "line-width": 3.2 },
      });
      map.addSource("my-attention", { type: "geojson", data: attentionFeatures(myParcelsRef.current) });
      map.addLayer({
        id: "my-attention",
        type: "circle",
        source: "my-attention",
        paint: {
          "circle-radius": 5,
          "circle-color": alert,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
    } else {
      (map.getSource(MY) as GeoJSONSource).setData(myData);
      const attn = map.getSource("my-attention");
      if (attn) (attn as GeoJSONSource).setData(attentionFeatures(myParcelsRef.current));
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
      const paper = cssVar("--surface", "#0b0e14");
      const map = new lib.Map({
        container,
        style: buildStyle("satellite", paper),
        center: GIS_CENTER,
        zoom: GIS_ZOOM,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new lib.AttributionControl({ compact: true }), "bottom-right");
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      popupRef.current = new lib.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "farm-tip" });
      mapRef.current = map;

      map.on("style.load", () => {
        paint(map);
        if (!didFitRef.current) {
          const b = farmBounds(myParcelsRef.current);
          if (b) map.fitBounds(b, { padding: 90, maxZoom: 15.5, duration: 0 });
          didFitRef.current = true;
        }
      });

      // Hover on either fill layer: brighten + tooltip.
      const onMove = (source: string) => (e: { features?: MapGeoJSONFeature[]; lngLat: { lng: number; lat: number } }) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f || f.id == null) return;
        const prev = hoveredRef.current;
        if (prev && (prev.source !== source || prev.id !== f.id)) {
          map.setFeatureState({ source: prev.source, id: prev.id }, { hover: false });
        }
        hoveredRef.current = { source, id: f.id };
        map.setFeatureState({ source, id: f.id }, { hover: true });
        popupRef.current?.setLngLat(e.lngLat).setHTML(tooltipHtml(f)).addTo(map);
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = "";
        const prev = hoveredRef.current;
        if (prev) {
          map.setFeatureState({ source: prev.source, id: prev.id }, { hover: false });
          hoveredRef.current = null;
        }
        popupRef.current?.remove();
      };
      map.on("mousemove", "vp-fill", onMove(VP));
      map.on("mouseleave", "vp-fill", onLeave);
      map.on("mousemove", "my-fill", onMove(MY));
      map.on("mouseleave", "my-fill", onLeave);

      // Click: prefer the farmer's own block, else the viewport parcel, else clear. Guard the
      // layer list to those actually present (a layer can be mid-(re)build during a restyle).
      map.on("click", (e) => {
        const layers = ["my-fill", "vp-fill"].filter((id) => map.getLayer(id));
        const hits = layers.length > 0 ? map.queryRenderedFeatures(e.point, { layers }) : [];
        const hit = hits[0];
        const apn = hit?.properties?.apn;
        if (hit && typeof apn === "string") {
          onSelectRef.current?.({
            apn,
            mine: hit.layer.id === "my-fill",
            lng: e.lngLat.lng,
            lat: e.lngLat.lat,
          });
        } else {
          onSelectRef.current?.(null);
        }
      });

      setMapInstance(map);
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Recolor the farmer's blocks when color-by / year / parcels change.
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) paint(map);
  }, [colorBy, year, myParcels]);

  // Move the selected highlight on both sources.
  useEffect(() => {
    selectedRef.current = selectedApn;
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("my-selected")) map.setFilter("my-selected", ["==", ["get", "apn"], selectedApn ?? "__none__"]);
    if (map.getLayer("vp-selected")) map.setFilter("vp-selected", ["==", ["get", "apn"], selectedApn ?? "__none__"]);
  }, [selectedApn]);

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <StatusPill state={vpState} />
    </div>
  );
}
