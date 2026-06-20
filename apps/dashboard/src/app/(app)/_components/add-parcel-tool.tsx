"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FarmParcel } from "@/lib/parcel/farm/types";

// The demoted lookup, tucked in a corner: enter an APN (what a farmer knows) or a coordinate and
// the ingestion engine (/api/parcel/block) pulls the boundary + auto-enriches it into a block that
// drops onto the map. This is the same path "Connect your farm" uses at scale.

const t = en.parcel.farm;
const DEFAULT_LAT = "36.6004616";
const DEFAULT_LNG = "-119.7817871";

type Mode = "apn" | "coord";

export function AddParcelTool({ onAdded }: { onAdded: (block: FarmParcel) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("apn");
  const [apn, setApn] = useState("");
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = mode === "apn" ? { apn } : { lat: Number(lat), lng: Number(lng) };
      const res = await fetch("/api/parcel/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const code =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "lookup_failed";
        setError(errorCopy(code));
        return;
      }
      const block = (await res.json()) as FarmParcel;
      onAdded(block);
      setApn("");
      setOpen(false);
    } catch {
      setError(errorCopy("lookup_failed"));
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 type-body-md font-semibold text-on-primary shadow-e2 transition-colors hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <Plus className="h-4 w-4" />
        {t.addParcel}
      </button>
    );
  }

  return (
    <div className={cardClass({ className: "pointer-events-auto w-[min(92vw,320px)] p-4" })}>
      <div className="flex items-start justify-between">
        <div>
          <p className="type-label-caps text-primary">{t.addParcel}</p>
          <h3 className="type-title mt-0.5 text-on-surface">{t.addTitle}</h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t.close}
          className="-mr-1.5 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-on-surface-variant hover:bg-surface-container-low"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 type-body-sm text-on-surface-variant">{t.addHint}</p>

      <div role="tablist" className="mt-3 flex gap-1 rounded-[var(--radius-control)] bg-surface-container p-1">
        <ModeButton active={mode === "apn"} onClick={() => setMode("apn")} label={t.addByApn} />
        <ModeButton active={mode === "coord"} onClick={() => setMode("coord")} label={t.addByCoord} />
      </div>

      <div className="mt-3">
        {mode === "apn" ? (
          <Input
            label={t.addApnLabel}
            value={apn}
            placeholder={t.addApnPlaceholder}
            onChange={(e) => setApn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.addLatLabel} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
            <Input label={t.addLngLabel} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
        )}
      </div>

      {error && <p className="mt-2 type-body-sm text-on-surface-variant">{error}</p>}

      <Button className="mt-3 w-full" onClick={() => void submit()} disabled={loading || (mode === "apn" && !apn.trim())}>
        {loading ? t.adding : t.addParcel}
      </Button>
      <p className="mt-2 type-label-caps text-on-surface-variant/70">{t.addNote}</p>
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[calc(var(--radius-control)-2px)] px-2 py-1.5 type-label-caps transition-colors",
        active ? "bg-surface-container-lowest text-primary shadow-e1" : "text-on-surface-variant hover:text-on-surface",
      )}
    >
      {label}
    </button>
  );
}

function errorCopy(code: string): string {
  const messages = en.parcel.errors as Record<string, string | undefined>;
  return messages[code] ?? messages.lookup_failed ?? "That did not work.";
}
