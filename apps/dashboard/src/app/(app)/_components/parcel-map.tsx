"use client";

import { useEffect, useRef, useState } from "react";
import type { Feature, Point } from "geojson";
import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/cn";
import type { ParcelGeometry } from "@/lib/parcel";
import { BasemapToggle, buildStyle, DEFAULT_CENTER, DEFAULT_ZOOM, type Basemap } from "./basemap";

// The parcel map: the shared MapLibre basemap (basemap.tsx) with one parcel boundary drawn over
// it as a translucent green fill + outline, plus a dot at its centroid. Mirrors MeterMap's
// lazy-import + scroll-zoom-gating wiring, but renders a GeoJSON polygon instead of pins. The
// polygon + centroid are style sources, so they are re-applied after a basemap swap (setStyle
// wipes the style's sources/layers; DOM markers would persist, layers do not).

const PARCEL_SOURCE = "parcel";
const CENTROID_SOURCE = "parcel-centroid";

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Bounding box [west, south, east, north] over every vertex of a parcel polygon. */
function geometryBounds(geometry: ParcelGeometry): LngLatBoundsLike {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
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
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Add or update the parcel fill/outline + centroid dot on a live, style-loaded map. `fit` only
 * recenters the camera on a NEW parcel; a basemap swap re-applies the layers with fit=false so it
 * never yanks the camera back from where the user panned.
 */
function paintParcel(
  map: MapLibreMap,
  geometry: ParcelGeometry | null,
  centroid: { lat: number; lng: number } | null,
  fit: boolean,
): void {
  if (!geometry) return;
  const primary = cssVar("--primary", "#2fa84f");
  const onSurface = cssVar("--surface-container-lowest", "#ffffff");
  const polygonFeature: Feature = { type: "Feature", geometry, properties: {} };

  const existing = map.getSource(PARCEL_SOURCE);
  if (existing && "setData" in existing) {
    (existing as GeoJSONSource).setData(polygonFeature);
  } else {
    map.addSource(PARCEL_SOURCE, { type: "geojson", data: polygonFeature });
    map.addLayer({
      id: "parcel-fill",
      type: "fill",
      source: PARCEL_SOURCE,
      paint: { "fill-color": primary, "fill-opacity": 0.18 },
    });
    map.addLayer({
      id: "parcel-line",
      type: "line",
      source: PARCEL_SOURCE,
      paint: { "line-color": primary, "line-width": 2.5 },
    });
  }

  if (centroid) {
    const centroidFeature: Feature<Point> = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [centroid.lng, centroid.lat] },
      properties: {},
    };
    const existingCentroid = map.getSource(CENTROID_SOURCE);
    if (existingCentroid && "setData" in existingCentroid) {
      (existingCentroid as GeoJSONSource).setData(centroidFeature);
    } else {
      map.addSource(CENTROID_SOURCE, { type: "geojson", data: centroidFeature });
      map.addLayer({
        id: "parcel-centroid",
        type: "circle",
        source: CENTROID_SOURCE,
        paint: {
          "circle-radius": 5,
          "circle-color": primary,
          "circle-stroke-color": onSurface,
          "circle-stroke-width": 2,
        },
      });
    }
  }

  if (fit) {
    map.fitBounds(geometryBounds(geometry), { padding: 64, maxZoom: 17, duration: 0 });
  }
}

export function ParcelMap({
  geometry,
  centroid,
  heightClass = "h-[420px]",
}: {
  geometry: ParcelGeometry | null;
  centroid: { lat: number; lng: number } | null;
  heightClass?: string;
}) {
  const [basemap, setBasemap] = useState<Basemap>("satellite");

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geometryRef = useRef<ParcelGeometry | null>(geometry);
  const centroidRef = useRef<{ lat: number; lng: number } | null>(centroid);
  const basemapRef = useRef<Basemap>(basemap);
  const enableZoomRef = useRef<(() => void) | null>(null);
  const disableZoomRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);
  useEffect(() => {
    centroidRef.current = centroid;
  }, [centroid]);
  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);

  // Create the map once per container mount (lazy maplibre import).
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
        center: centroidRef.current
          ? [centroidRef.current.lng, centroidRef.current.lat]
          : DEFAULT_CENTER,
        zoom: centroidRef.current ? 15 : DEFAULT_ZOOM,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new lib.NavigationControl({ showCompass: false }), "bottom-right");
      // Page-scroll must not zoom the map: scroll-zoom is off until the user clicks in, and off
      // again when the pointer leaves (same affordance as the meter map).
      map.scrollZoom.disable();
      enableZoomRef.current = () => map.scrollZoom.enable();
      disableZoomRef.current = () => map.scrollZoom.disable();
      container.addEventListener("click", enableZoomRef.current);
      container.addEventListener("mouseleave", disableZoomRef.current);
      mapRef.current = map;
      // Re-apply the parcel layers on every style load (initial + after each basemap swap). fit
      // is false here: a restyle must not move the camera the user positioned.
      map.on("style.load", () => paintParcel(map, geometryRef.current, centroidRef.current, false));
    })();

    return () => {
      cancelled = true;
      if (container && enableZoomRef.current) {
        container.removeEventListener("click", enableZoomRef.current);
      }
      if (container && disableZoomRef.current) {
        container.removeEventListener("mouseleave", disableZoomRef.current);
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Swap the basemap in place when the toggle changes (style.load re-applies the parcel layers).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const paper = cssVar("--surface", "#faf9f4");
    map.setStyle(buildStyle(basemap, paper));
  }, [basemap]);

  // Re-paint when a new lookup lands (the style is already loaded on a live map).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !geometry) return;
    // A new parcel landed: fit the camera to it.
    if (map.isStyleLoaded()) {
      paintParcel(map, geometry, centroid, true);
    } else {
      map.once("style.load", () => paintParcel(map, geometry, centroid, true));
    }
  }, [geometry, centroid]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant",
        heightClass,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      <BasemapToggle basemap={basemap} onChange={setBasemap} />
    </div>
  );
}
