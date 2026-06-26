"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { en } from "@/copy/en";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { FarmParcel } from "@/lib/parcel/farm/types";
import type { GisMapHandle } from "./gis-map";

// The Zillow-style search: type an address, an APN, or a "lat,lng" coordinate and jump to it on the
// map with the parcel selected. Addresses resolve through /api/geocode (a dropdown of matches);
// coordinates and APNs resolve straight to a land record via the existing block endpoint.

const c = en.parcelsGis;

const COORD_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
// An APN: starts with a digit, alphanumeric/hyphen, no spaces (distinguishes it from an address).
const APN_RE = /^[0-9][0-9A-Za-z-]{5,31}$/;

type GeocodeHit = { name: string; lat: number; lng: number };

async function fetchBlock(body: Record<string, unknown>, signal: AbortSignal): Promise<FarmParcel | null> {
  const res = await fetch("/api/parcel/block", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return null;
  return (await res.json()) as FarmParcel;
}

export function ParcelSearch({
  mapHandle,
  onOpenParcel,
}: {
  mapHandle: RefObject<GisMapHandle | null>;
  onOpenParcel: (parcel: FarmParcel) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolveAt = async (lat: number, lng: number, signal: AbortSignal) => {
    mapHandle.current?.flyTo(lng, lat, 16);
    const parcel = await fetchBlock({ lat, lng }, signal);
    if (signal.aborted) return;
    if (parcel) onOpenParcel(parcel);
    else setNote(c.search.noParcel);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (q.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setNote(null);
    setHits([]);

    try {
      const coord = COORD_RE.exec(q);
      if (coord) {
        const lat = Number(coord[1]);
        const lng = Number(coord[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          await resolveAt(lat, lng, controller.signal);
        } else {
          setNote(c.search.badCoord);
        }
        return;
      }

      if (APN_RE.test(q)) {
        const parcel = await fetchBlock({ apn: q }, controller.signal);
        if (controller.signal.aborted) return;
        if (parcel) {
          mapHandle.current?.flyTo(parcel.centroid_lon, parcel.centroid_lat, 16);
          onOpenParcel(parcel);
        } else {
          setNote(c.search.noApn);
        }
        return;
      }

      // Address: geocode, then show matches to pick from.
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const json = (res.ok ? await res.json() : { results: [] }) as { results?: GeocodeHit[] };
      const results = json.results ?? [];
      if (results.length === 0) {
        setNote(c.search.noAddress);
      } else if (results.length === 1) {
        await resolveAt(results[0]!.lat, results[0]!.lng, controller.signal);
      } else {
        setHits(results);
      }
    } catch {
      if (!controller.signal.aborted) setNote(c.search.error);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const pickHit = async (hit: GeocodeHit) => {
    setHits([]);
    setValue(hit.name);
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      await resolveAt(hit.lat, hit.lng, controller.signal);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <div className="pointer-events-auto relative">
      <form onSubmit={onSubmit}>
        <InputGroup className="h-11 rounded-full border-transparent bg-white text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
          <InputGroupAddon align="inline-start">
            {busy ? (
              <Loader2 className="size-4 animate-spin text-on-surface-variant" />
            ) : (
              <Search className="size-4 text-on-surface-variant" strokeWidth={2} />
            )}
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setNote(null);
            }}
            placeholder={c.searchPlaceholder}
          />
        </InputGroup>
      </form>

      {(hits.length > 0 || note !== null) && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-xl bg-white text-on-surface shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
          {note !== null && <p className="px-4 py-3 text-[0.82rem] text-on-surface-variant">{note}</p>}
          {hits.map((hit, i) => (
            <Button
              key={`${hit.lat},${hit.lng},${i}`}
              type="button"
              variant="ghost"
              onClick={() => void pickHit(hit)}
              className="h-auto w-full justify-start gap-2 rounded-none px-4 py-2.5 text-left text-[0.85rem] hover:bg-surface-container-high"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#2fa84f]" />
              <span className="line-clamp-2 whitespace-normal">{hit.name}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
