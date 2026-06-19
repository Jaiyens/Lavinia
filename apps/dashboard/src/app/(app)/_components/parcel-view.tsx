"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ParcelResult } from "@/lib/parcel";
import { ParcelMap } from "./parcel-map";

// The Parcel lookup surface (Energy > Parcel). A coordinate input pre-filled with the Fresno test
// point, a Look up action that calls /api/parcel, then the parcel boundary on the map + a card
// with the APN (one-click copyable), acreage, centroid, and a link to the county source. Mirrors
// the acres.com plat-map layout: a left detail column, a large map on the right.

const t = en.parcel;

// Pre-filled test point: Fresno County, CA (the acceptance point).
const DEFAULT_LAT = "36.6004616";
const DEFAULT_LNG = "-119.7817871";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; code: string }
  | { status: "ok"; result: ParcelResult };

function errorCopy(code: string): string {
  const messages = en.parcel.errors;
  return (messages as Record<string, string | undefined>)[code] ?? messages.lookup_failed;
}

export function ParcelView() {
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [state, setState] = useState<ViewState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  // Monotonic request token: only the most recent lookup is allowed to write state, so a slow
  // older response (the county service has variable latency) can never overwrite a newer one.
  const requestIdRef = useRef(0);

  const lookup = useCallback(async () => {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (
      !Number.isFinite(latNum) ||
      !Number.isFinite(lngNum) ||
      Math.abs(latNum) > 90 ||
      Math.abs(lngNum) > 180
    ) {
      setState({ status: "error", code: "invalid_point" });
      return;
    }
    const requestId = ++requestIdRef.current;
    const stale = () => requestId !== requestIdRef.current;
    setState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/parcel?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      );
      if (stale()) return;
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        if (stale()) return;
        const code =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "lookup_failed";
        setState({ status: "error", code });
        return;
      }
      const result = (await res.json()) as ParcelResult;
      if (stale()) return;
      setState({ status: "ok", result });
    } catch {
      if (stale()) return;
      setState({ status: "error", code: "lookup_failed" });
    }
  }, [lat, lng]);

  const copyApn = useCallback(async (apn: string) => {
    try {
      await navigator.clipboard.writeText(apn);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context): leave the value visible to copy by hand.
    }
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const result = state.status === "ok" ? state.result : null;

  return (
    <div className="px-5 py-6 lg:px-12 lg:py-10">
      <header className="mb-6">
        <p className="type-label-caps text-primary">{t.eyebrow}</p>
        <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
        <p className="type-body-md mt-2 max-w-2xl text-on-surface-variant">{t.intro}</p>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Left: input + result detail column. */}
        <div className="flex w-full flex-col gap-4 lg:w-[380px] lg:shrink-0">
          <div className={cardClass({ className: "p-4" })}>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t.latLabel}
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void lookup()}
              />
              <Input
                label={t.lngLabel}
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void lookup()}
              />
            </div>
            <Button
              className="mt-3 w-full"
              onClick={() => void lookup()}
              disabled={state.status === "loading"}
            >
              {state.status === "loading" ? t.lookingUp : t.lookup}
            </Button>
          </div>

          {state.status === "error" && (
            <div className={cardClass({ className: "p-4" })}>
              <p className="type-body-md text-on-surface-variant">{errorCopy(state.code)}</p>
            </div>
          )}

          {state.status === "idle" && (
            <div className={cardClass({ className: "p-4" })}>
              <p className="type-title text-on-surface">{t.emptyTitle}</p>
              <p className="type-body-md mt-1 text-on-surface-variant">{t.emptyBody}</p>
            </div>
          )}

          {result && (
            <ResultCard result={result} copied={copied} onCopy={() => void copyApn(result.apn)} />
          )}
        </div>

        {/* Right: the parcel boundary on the map. */}
        <div className="min-w-0 flex-1">
          <ParcelMap
            geometry={result?.geometry ?? null}
            centroid={result ? { lat: result.centroid_lat, lng: result.centroid_lon } : null}
            heightClass="h-[420px] lg:h-[560px]"
          />
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  result,
  copied,
  onCopy,
}: {
  result: ParcelResult;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className={cardClass({ className: "p-4" })}>
      {result.match === "nearest" && (
        <p className="type-body-sm mb-3 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low px-3 py-2 text-on-surface-variant">
          {t.nearestNote(t.metersAway(result.distance_m ?? 0))}
        </p>
      )}

      <p className="type-label-caps text-on-surface-variant">{t.apnLabel}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="type-headline tnum text-on-surface">{result.apn}</span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={t.copyApn}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-outline-variant px-2.5 type-label-caps transition-colors",
            "hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            copied ? "text-primary" : "text-on-surface-variant",
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span>{copied ? t.copied : t.copyApn}</span>
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label={t.countyLabel} value={t.countyValue(result.county)} />
        <Field label={t.acresLabel} value={t.acresValue(result.parcel_acres)} />
        <Field
          label={t.centroidLabel}
          value={t.centroidValue(result.centroid_lat, result.centroid_lon)}
          wide
        />
      </dl>

      <a
        href={result.source_url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 type-body-sm text-primary hover:underline"
      >
        <ExternalLink className="h-4 w-4" />
        {t.sourceLink}
      </a>
    </div>
  );
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5", wide && "col-span-2")}>
      <dt className="type-label-caps text-on-surface-variant">{label}</dt>
      <dd className="type-body-md tnum text-on-surface">{value}</dd>
    </div>
  );
}
