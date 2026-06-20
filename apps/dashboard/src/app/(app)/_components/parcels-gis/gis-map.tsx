"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle } from "../basemap";
import {
  DOT_AVAILABLE,
  DOT_PENDING,
  GIS_CENTER,
  GIS_ZOOM,
  PARCEL_DOTS,
  type ParcelDot,
} from "./data";

// The full-bleed satellite map for the Parcels GIS surface. Reuses basemap.tsx's buildStyle
// (Esri World Imagery satellite tiles over the paper fallback) and scatters the placeholder
// parcel dots as circle markers. Unlike farm-map.tsx, scroll zoom is ENABLED normally (no
// click-gating that trapped the wheel), so the farmer can zoom straight in. The overlay panels
// sit above this in the page; this canvas fills its parent.

const SRC = "gis-parcels";

// A handle the page uses to drive the bottom zoom +/- buttons without re-rendering the map.
export interface GisMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function dotsToFeatures(dots: ParcelDot[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: dots.map((d, i): Feature<Point> => ({
      type: "Feature",
      id: i,
      properties: { id: d.id, status: d.status },
      geometry: { type: "Point", coordinates: [d.lng, d.lat] },
    })),
  };
}

export function GisMap({
  handleRef,
  onSelect,
}: {
  handleRef?: Ref<GisMapHandle>;
  onSelect?: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedRef = useRef<number | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useImperativeHandle(
    handleRef,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn({ duration: 240 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 240 }),
    }),
    [],
  );

  // Paint the parcel dots onto a live, styled map. Re-runnable after a basemap restyle.
  const paint = (map: MapLibreMap) => {
    const data = dotsToFeatures(PARCEL_DOTS);
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data });
      map.addLayer({
        id: "gis-dots",
        type: "circle",
        source: SRC,
        paint: {
          // Grow the dots slightly as you zoom in so they stay legible at every scale.
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            ["case", ["boolean", ["feature-state", "selected"], false], 5, 3],
            8,
            ["case", ["boolean", ["feature-state", "selected"], false], 9, 6],
          ],
          "circle-color": [
            "match",
            ["get", "status"],
            "pending",
            DOT_PENDING,
            DOT_AVAILABLE,
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, 0.6],
          "circle-stroke-opacity": 0.85,
        },
      });
    } else {
      (map.getSource(SRC) as GeoJSONSource).setData(data);
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
      // The attribution stays bottom-right per the brief; the +/- control is custom in the page,
      // but a hidden NavigationControl is kept for keyboard zoom parity with the rest of the app.
      map.addControl(new lib.AttributionControl({ compact: true }), "bottom-right");
      // The bug fix: scroll zoom is ENABLED with no click-gating, so the wheel zooms immediately.
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      mapRef.current = map;

      map.on("style.load", () => paint(map));

      map.on("mouseenter", "gis-dots", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "gis-dots", () => {
        map.getCanvas().style.cursor = "";
      });

      // Click a dot to select it (stub detail): toggle a selected feature-state ring.
      map.on("click", "gis-dots", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const fid = f.id as number;
        if (selectedRef.current !== null) {
          map.setFeatureState({ source: SRC, id: selectedRef.current }, { selected: false });
        }
        selectedRef.current = fid;
        map.setFeatureState({ source: SRC, id: fid }, { selected: true });
        const id = typeof f.properties?.id === "string" ? f.properties.id : null;
        onSelectRef.current?.(id);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
