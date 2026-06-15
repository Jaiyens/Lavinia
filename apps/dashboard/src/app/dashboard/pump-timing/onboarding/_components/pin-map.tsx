"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { MAP_BOUNDS } from "@/lib/onboarding/geocode";

export type MapPin = {
  key: string;
  name: string;
  lat: number | null;
  lng: number | null;
  kind: "pump" | "non_pump";
};

const { center, latSpread, lngSpread } = MAP_BOUNDS;
const LAT_MIN = center.lat - latSpread;
const LNG_MIN = center.lng - lngSpread;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Geo <-> normalized box coords. North is up, so y inverts latitude.
function toXY(lat: number | null, lng: number | null): { x: number; y: number } {
  if (lat === null || lng === null) return { x: 0.5, y: 0.5 };
  return {
    x: clamp01((lng - LNG_MIN) / (2 * lngSpread)),
    y: clamp01(1 - (lat - LAT_MIN) / (2 * latSpread)),
  };
}
function toLatLng(x: number, y: number): { lat: number; lng: number } {
  return {
    lat: Math.round((LAT_MIN + (1 - clamp01(y)) * 2 * latSpread) * 1e5) / 1e5,
    lng: Math.round((LNG_MIN + clamp01(x) * 2 * lngSpread) * 1e5) / 1e5,
  };
}

/**
 * A schematic, draggable pin map. No tiles, no network: pins sit in a normalized
 * county-sized box and report their dragged position back as lat/lng. Pointer drag
 * to move; focus a pin and arrow-key to nudge. The real spot is what the farmer sets.
 */
export function PinMap({
  pins,
  onMove,
}: {
  pins: MapPin[];
  onMove: (key: string, lat: number, lng: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  function moveTo(key: string, clientX: number, clientY: number) {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    const { lat, lng } = toLatLng(x, y);
    onMove(key, lat, lng);
  }

  function nudge(key: string, lat: number | null, lng: number | null, dx: number, dy: number) {
    const { x, y } = toXY(lat, lng);
    const next = toLatLng(x + dx, y + dy);
    onMove(key, next.lat, next.lng);
  }

  return (
    <div
      ref={boxRef}
      className="border-border bg-card relative aspect-[5/3] w-full overflow-hidden rounded-2xl border"
      style={{
        backgroundImage:
          "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "12% 16%",
      }}
    >
      {pins.map((pin) => {
        const { x, y } = toXY(pin.lat, pin.lng);
        const isPump = pin.kind === "pump";
        return (
          <button
            key={pin.key}
            type="button"
            aria-label={`Move ${pin.name}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setActive(pin.key);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (active === pin.key) moveTo(pin.key, e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              setActive(null);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onKeyDown={(e) => {
              const step = 0.03;
              if (e.key === "ArrowUp") nudge(pin.key, pin.lat, pin.lng, 0, -step);
              else if (e.key === "ArrowDown") nudge(pin.key, pin.lat, pin.lng, 0, step);
              else if (e.key === "ArrowLeft") nudge(pin.key, pin.lat, pin.lng, -step, 0);
              else if (e.key === "ArrowRight") nudge(pin.key, pin.lat, pin.lng, step, 0);
              else return;
              e.preventDefault();
            }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none flex-col items-center gap-1 active:cursor-grabbing"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            <span
              className={cn(
                "size-3.5 rounded-full ring-2 ring-offset-2 ring-offset-[var(--card)] transition-transform",
                active === pin.key ? "scale-125" : "",
                isPump ? "bg-accent ring-accent/40" : "bg-faint ring-faint/40",
              )}
            />
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.7rem] whitespace-nowrap",
                isPump ? "bg-accent/15 text-foreground" : "bg-card-hover text-muted",
              )}
            >
              {pin.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
