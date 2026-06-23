"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { en, num } from "@/copy/en";
import { cardClass } from "@/components/ui/card";
import { COLOR_BYS, legendFor, type LegendItem } from "@/lib/parcel/farm/color";
import { summarize, type PortfolioSummary } from "@/lib/parcel/farm/portfolio";
import type { ColorByKey, Farm, FarmParcel } from "@/lib/parcel/farm/types";
import { FarmMap } from "./farm-map";
import { ParcelDrawer } from "./parcel-drawer";
import { AddParcelTool } from "./add-parcel-tool";

// The map-first Parcels workspace (Acres.com shell, farm-ops data). A full-bleed map fills the
// content area (offset by the rail on desktop, the tab bar on mobile); the nav, a representative
// banner, a portfolio summary, a color-by control + legend, the "+ Add parcel" tool, and the
// detail drawer all overlay it. `fixed` so it escapes the dashboard <main> padding without
// touching the shared layout. Loads straight to the farm's blocks: zero manual entry.

const t = en.parcel.farm;

export function ParcelsWorkspace({ farm, year, demo }: { farm: Farm; year: number; demo: boolean }) {
  const [colorBy, setColorBy] = useState<ColorByKey>("crop");
  const [selectedApn, setSelectedApn] = useState<string | null>(null);
  const [extra, setExtra] = useState<FarmParcel[]>([]);

  // Seeded blocks + any added live; drop added blocks that duplicate a seeded APN.
  const parcels = useMemo(() => {
    const seeded = new Set(farm.parcels.map((p) => p.apn));
    return [...farm.parcels, ...extra.filter((p) => !seeded.has(p.apn))];
  }, [farm.parcels, extra]);

  const selected = useMemo(() => parcels.find((p) => p.apn === selectedApn) ?? null, [parcels, selectedApn]);
  const summary = useMemo(() => summarize(parcels, year), [parcels, year]);
  const legend = useMemo(() => legendFor(parcels, colorBy, year), [parcels, colorBy, year]);

  const addBlock = (block: FarmParcel) => {
    setExtra((prev) => (prev.some((p) => p.apn === block.apn) ? prev : [...prev, block]));
    setSelectedApn(block.apn);
  };

  return (
    <div className="fixed inset-x-0 top-0 bottom-16 z-10 overflow-hidden bg-paper lg:bottom-0 lg:left-48">
      <FarmMap
        parcels={parcels}
        colorBy={colorBy}
        year={year}
        selectedApn={selectedApn}
        onSelect={setSelectedApn}
      />

      {/* Keyboard / screen-reader path to the blocks: the MapLibre canvas is pointer-only, so this
          focusable list opens each block's drawer (WCAG 2.1.1). */}
      <ul aria-label={en.parcel.farm.blocksLabel} className="sr-only">
        {parcels.map((p) => (
          <li key={p.apn}>
            <button type="button" onClick={() => setSelectedApn(p.apn)}>
              {en.parcel.farm.openBlock(p.name, p.planting.crop, en.parcel.farm.acres(p.identity.gross_acres))}
            </button>
          </li>
        ))}
      </ul>

      {/* Overlay layer: transparent to the map except on the actual controls. */}
      <div className="pointer-events-none absolute inset-0">
        {/* Representative banner, top-center. */}
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 px-3">
          <div
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-full border border-outline-variant bg-paper/95 px-4 py-2 shadow-e1 backdrop-blur",
            )}
          >
            <span className="type-body-sm text-on-surface-variant">{t.banner}</span>
            <Link
              href={demo ? "/login" : "/onboarding"}
              className="shrink-0 type-label-caps font-semibold text-primary hover:underline"
            >
              {t.connect}
            </Link>
          </div>
        </div>

        {/* Left column: portfolio summary + color-by control. */}
        <div className="absolute left-3 top-3 flex max-h-[calc(100%-1.5rem)] w-[min(92vw,300px)] flex-col gap-3 overflow-y-auto">
          <div className="pointer-events-auto">
            <PortfolioStrip farmName={farm.name} county={farm.county} summary={summary} />
          </div>
          <div className="pointer-events-auto">
            <ColorByControl colorBy={colorBy} onChange={setColorBy} legend={legend} />
          </div>
        </div>

        {/* + Add parcel, bottom-left. */}
        <div className="absolute bottom-4 left-3 z-20">
          <AddParcelTool onAdded={addBlock} />
        </div>
      </div>

      <ParcelDrawer key={selected?.apn ?? "none"} parcel={selected} onClose={() => setSelectedApn(null)} />
    </div>
  );
}

function PortfolioStrip({
  farmName,
  county,
  summary,
}: {
  farmName: string;
  county: string;
  summary: PortfolioSummary;
}) {
  const total = summary.total_acres || 1;
  return (
    <div className={cardClass({ className: "p-3.5" })}>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="type-title text-on-surface">{farmName}</h1>
        <span className="type-label-caps text-on-surface-variant">{county} County</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        <Stat label={t.summary.acres} value={num(summary.total_acres)} />
        <Stat label={t.summary.blocks} value={String(summary.block_count)} />
        <Stat label={t.summary.leased} value={`${summary.pct_leased}%`} />
        <Stat
          label={t.summary.expiring}
          value={String(summary.leases_expiring.count)}
          tone={summary.leases_expiring.count > 0 ? "warn" : undefined}
        />
        <Stat
          label={t.summary.attention}
          value={summary.needs_attention > 0 ? String(summary.needs_attention) : t.summary.none}
          tone={summary.needs_attention > 0 ? "alert" : undefined}
        />
      </div>
      {/* Acres-by-crop bar. */}
      {summary.acres_by_crop.length > 0 && (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full">
            {summary.acres_by_crop.map((c) => (
              <div
                key={c.crop}
                title={`${c.crop} - ${num(c.acres)} ac`}
                style={{ width: `${(c.acres / total) * 100}%`, backgroundColor: c.color }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {summary.acres_by_crop.slice(0, 4).map((c) => (
              <span key={c.crop} className="inline-flex items-center gap-1 type-label-caps text-on-surface-variant">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.crop}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "alert" }) {
  return (
    <div>
      <p className="type-label-caps text-on-surface-variant">{label}</p>
      <p
        className={cn(
          "type-body-lg tnum font-semibold",
          tone === "alert" ? "text-alert" : tone === "warn" ? "text-on-surface" : "text-on-surface",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ColorByControl({
  colorBy,
  onChange,
  legend,
}: {
  colorBy: ColorByKey;
  onChange: (c: ColorByKey) => void;
  legend: LegendItem[];
}) {
  return (
    <div className={cardClass({ className: "p-3.5" })}>
      <p className="type-label-caps text-on-surface-variant">{t.colorBy}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {COLOR_BYS.map((cb) => (
          <button
            key={cb.key}
            type="button"
            aria-pressed={colorBy === cb.key}
            onClick={() => onChange(cb.key)}
            className={cn(
              "rounded-full px-2.5 py-1 type-label-caps transition-colors",
              colorBy === cb.key
                ? "bg-primary text-on-primary"
                : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low",
            )}
          >
            {cb.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {legend.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
            <span className="min-w-0 flex-1 truncate type-body-sm text-on-surface">{item.label}</span>
            <span className="type-num tnum text-on-surface-variant">{item.count}</span>
          </div>
        ))}
        {/* Attention key, mirrored from the map's clay ring. */}
        <div className="mt-1 flex items-center gap-2 border-t border-outline-variant/60 pt-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 text-alert" />
          <span className="type-body-sm text-on-surface-variant">{t.attention}</span>
        </div>
      </div>
    </div>
  );
}
