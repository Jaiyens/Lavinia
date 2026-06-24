"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { FeatureCollection } from "geojson";
import type { LngLatBoundsLike, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Card } from "@/components/ui";
import { buildStyle, DEFAULT_CENTER, DEFAULT_ZOOM } from "./basemap";

// The Home "Your parcels" tile: a LIGHTWEIGHT, non-interactive satellite preview of the operation's
// land, drawn from the real parcel polygons, that links straight to the full Parcels surface. It
// reuses the shared satellite basemap (basemap.tsx) so the heavy tile wiring lives once. Every
// interaction is disabled (no drag, no zoom, no scroll, no keyboard) so the whole card stays a
// single clean click-through: the surrounding <Link> takes the grower to /parcels.

const SRC = "parcels-preview";

/** A preview of the farm's parcels: the polygons to draw + a bounds to frame them. */
export type ParcelsPreviewData = {
  /** Parcel polygons, each with a precomputed `fill` color property (computed server-side). */
  features: FeatureCollection;
  /** [[minLng, minLat], [maxLng, maxLat]] framing the whole operation, or null to use the default view. */
  bounds: [[number, number], [number, number]] | null;
};

export function ParcelsPreview({ data, href }: { data: ParcelsPreviewData; href: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Create the map once; everything interactive is disabled so the tile is a pure preview. The
  // lazy maplibre import keeps the heavy JS off the critical path (mirrors meter-map / farm-map).
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;

    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || containerRef.current === null) return;
      const paper =
        getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#faf9f4";
      const map = new lib.Map({
        container,
        style: buildStyle("satellite", paper),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
        interactive: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        const outline =
          getComputedStyle(document.documentElement).getPropertyValue("--on-surface").trim() ||
          "#16190f";
        map.addSource(SRC, { type: "geojson", data: data.features });
        map.addLayer({
          id: "parcels-preview-fill",
          type: "fill",
          source: SRC,
          paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.6 },
        });
        map.addLayer({
          id: "parcels-preview-outline",
          type: "line",
          source: SRC,
          paint: { "line-color": outline, "line-width": 1, "line-opacity": 0.6 },
        });
        if (data.bounds) {
          map.fitBounds(data.bounds as LngLatBoundsLike, { padding: 28, maxZoom: 14, duration: 0 });
        }
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The preview data is stable for the life of the tile (built once server-side).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card asChild className="group flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-2xl p-3">
      <Link href={href} aria-label={en.home.parcelsPreview.cta}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="type-label-caps text-on-surface-variant">{en.home.parcelsPreview.caption}</h2>
        <ArrowUpRight
          className="h-4 w-4 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-control)] border border-outline-variant">
        {/* The preview canvas: pointer-events off so the whole card is one click-through to /parcels. */}
        <div ref={containerRef} className={cn("h-full min-h-[120px] w-full", "pointer-events-none")} />
      </div>
      </Link>
    </Card>
  );
}
