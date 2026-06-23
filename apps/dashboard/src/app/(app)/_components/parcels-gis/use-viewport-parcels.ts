"use client";

import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

// The Zillow-style viewport loader: as the farmer pans/zooms, fetch the parcels intersecting the
// current viewport from /api/parcels/bbox and feed them to a MapLibre GeoJSON source. Gated by zoom
// (no fetch when too far out), debounced, request-cancelled on rapid pan, and tile-cached (snapped
// bbox keys) so small pans reuse results. Subdivides on a capped (too-dense) response.

export const BBOX_MIN_ZOOM = 14;
const DEBOUNCE_MS = 350;
const GRID = 0.01; // ~1km snap: quantizes bbox edges so nearby viewports share a cache key
const PAD = 0.12; // fetch a little beyond the viewport so a small pan doesn't bare the edges

export type ViewportState = "idle" | "loading" | "ready" | "too_low" | "capped" | "error";

type Box = { minLng: number; minLat: number; maxLng: number; maxLat: number };

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

// Module-scoped so the cache survives component remounts within a session.
const tileCache = new Map<string, FeatureCollection>();

function snap(v: number, dir: "down" | "up"): number {
  return dir === "down" ? Math.floor(v / GRID) * GRID : Math.ceil(v / GRID) * GRID;
}

function keyOf(b: Box, zoom: number): string {
  return `${b.minLng.toFixed(3)},${b.minLat.toFixed(3)},${b.maxLng.toFixed(3)},${b.maxLat.toFixed(3)}@${zoom}`;
}

async function fetchBox(
  b: Box,
  zoom: number,
  signal: AbortSignal,
): Promise<{ features: FeatureCollection["features"]; capped: boolean }> {
  const url = `/api/parcels/bbox?bbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}&zoom=${zoom}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    // Too low / too large / not covered: a legitimate "nothing to draw here", not an error.
    if (res.status === 422 || res.status === 404) return { features: [], capped: false };
    throw new Error(`bbox ${res.status}`);
  }
  const json: unknown = await res.json();
  const obj = (json ?? {}) as { features?: FeatureCollection["features"]; capped?: boolean };
  return { features: obj.features ?? [], capped: obj.capped === true };
}

/** Split a box into 2x2 quadrants. */
function quadrants(b: Box): Box[] {
  const midLng = (b.minLng + b.maxLng) / 2;
  const midLat = (b.minLat + b.maxLat) / 2;
  return [
    { minLng: b.minLng, minLat: b.minLat, maxLng: midLng, maxLat: midLat },
    { minLng: midLng, minLat: b.minLat, maxLng: b.maxLng, maxLat: midLat },
    { minLng: b.minLng, minLat: midLat, maxLng: midLng, maxLat: b.maxLat },
    { minLng: midLng, minLat: midLat, maxLng: b.maxLng, maxLat: b.maxLat },
  ];
}

export function useViewportParcels(map: MapLibreMap | null, sourceId: string): ViewportState {
  const [state, setState] = useState<ViewportState>("idle");

  useEffect(() => {
    if (map === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abort: AbortController | null = null;
    let disposed = false;

    const setData = (fc: FeatureCollection) => {
      const src = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (src) src.setData(fc);
    };

    const run = async () => {
      const zoom = Math.floor(map.getZoom());
      if (zoom < BBOX_MIN_ZOOM) {
        setData(EMPTY);
        if (!disposed) setState("too_low");
        return;
      }
      const bounds = map.getBounds();
      const padLng = (bounds.getEast() - bounds.getWest()) * PAD;
      const padLat = (bounds.getNorth() - bounds.getSouth()) * PAD;
      const box: Box = {
        minLng: snap(bounds.getWest() - padLng, "down"),
        minLat: snap(bounds.getSouth() - padLat, "down"),
        maxLng: snap(bounds.getEast() + padLng, "up"),
        maxLat: snap(bounds.getNorth() + padLat, "up"),
      };
      const key = keyOf(box, zoom);
      const cached = tileCache.get(key);
      if (cached) {
        setData(cached);
        if (!disposed) setState("ready");
        return;
      }

      abort?.abort();
      const controller = new AbortController();
      abort = controller;
      if (!disposed) setState("loading");

      try {
        let { features, capped } = await fetchBox(box, zoom, controller.signal);
        // One level of subdivision when the source truncated: fetch the 4 quadrants and merge.
        if (capped) {
          const quads = await Promise.all(
            quadrants(box).map((q) => fetchBox(q, zoom, controller.signal)),
          );
          const byApn = new Map<string, FeatureCollection["features"][number]>();
          for (const f of features) {
            const apn = (f.properties as { apn?: string } | null)?.apn;
            if (apn) byApn.set(apn, f);
          }
          let stillCapped = false;
          for (const q of quads) {
            if (q.capped) stillCapped = true;
            for (const f of q.features) {
              const apn = (f.properties as { apn?: string } | null)?.apn;
              if (apn && !byApn.has(apn)) byApn.set(apn, f);
            }
          }
          features = [...byApn.values()];
          capped = stillCapped;
        }
        if (controller.signal.aborted) return;
        const fc: FeatureCollection = { type: "FeatureCollection", features };
        tileCache.set(key, fc);
        setData(fc);
        if (!disposed) setState(capped ? "capped" : "ready");
      } catch {
        if (controller.signal.aborted || disposed) return;
        setState("error");
      }
    };

    const onMove = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), DEBOUNCE_MS);
    };
    const onStyle = () => void run();

    map.on("moveend", onMove);
    map.on("style.load", onStyle);
    if (map.isStyleLoaded()) void run();

    return () => {
      disposed = true;
      map.off("moveend", onMove);
      map.off("style.load", onStyle);
      if (timer) clearTimeout(timer);
      abort?.abort();
    };
  }, [map, sourceId]);

  return state;
}
