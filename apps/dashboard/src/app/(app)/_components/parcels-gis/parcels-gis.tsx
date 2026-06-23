"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Home, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { ParcelDrawer } from "../parcel-drawer";
import { COLOR_BYS, legendFor } from "@/lib/parcel/farm/color";
import { summarize, type PortfolioSummary } from "@/lib/parcel/farm/portfolio";
import { parcelThumbnailUrl } from "@/lib/parcel/farm/thumbnail";
import type { ColorByKey, Farm, FarmParcel } from "@/lib/parcel/farm/types";
import { GisMap, type GisMapHandle, type ParcelSelection } from "./gis-map";
import { ParcelSearch } from "./parcel-search";
import { LISTING_CARDS, PHOTO_GRADIENTS, type ListingCard } from "./data";

// The Parcels GIS surface: a full-bleed dark satellite map (real county parcels: the farmer's own
// blocks preloaded + every other parcel streamed per viewport) under light floating panels, docked
// beside the global Terra sidebar. Click any parcel to open its full land record (crop, water,
// meters/rate, spray history, financials). The left panel is the farmer's blocks + nearby market
// comps; the right panel is the farm at a glance.

const c = en.parcelsGis;

export function ParcelsGis({ myFarm, year }: { myFarm: Farm; year: number }) {
  const mapHandle = useRef<GisMapHandle>(null);
  const [listingsOpen, setListingsOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"blocks" | "market">("blocks");
  const [colorBy, setColorBy] = useState<ColorByKey>("crop");

  // Selected parcel + its full land record. The farmer's own blocks resolve instantly from the
  // cache; a streamed parcel or a market comp is enriched on demand by the live block endpoint.
  const [selectedApn, setSelectedApn] = useState<string | null>(null);
  const [block, setBlock] = useState<FarmParcel | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const blockCache = useRef<Map<string, FarmParcel>>(new Map());
  const fetchAbort = useRef<AbortController | null>(null);

  const summary = useMemo(() => summarize(myFarm.parcels, year), [myFarm.parcels, year]);

  useEffect(() => {
    for (const p of myFarm.parcels) blockCache.current.set(p.apn, p);
  }, [myFarm]);

  // Open a parcel we already hold the full record for (a block click or a search result).
  const openParcel = useCallback((parcel: FarmParcel) => {
    fetchAbort.current?.abort();
    blockCache.current.set(parcel.apn, parcel);
    setSelectedApn(parcel.apn);
    setBlock(parcel);
    setBlockLoading(false);
    mapHandle.current?.flyTo(parcel.centroid_lon, parcel.centroid_lat, 16);
  }, []);

  // Enrich + open the parcel at a point: a map click on a streamed parcel, or a market comp.
  const openAtPoint = useCallback((lat: number, lng: number, apn: string | null, fly: boolean) => {
    fetchAbort.current?.abort();
    if (fly) mapHandle.current?.flyTo(lng, lat, 16);
    const cached = apn ? blockCache.current.get(apn) : undefined;
    if (cached) {
      setSelectedApn(cached.apn);
      setBlock(cached);
      setBlockLoading(false);
      return;
    }
    setSelectedApn(apn);
    setBlock(null);
    setBlockLoading(true);
    const controller = new AbortController();
    fetchAbort.current = controller;
    void (async () => {
      try {
        const res = await fetch("/api/parcel/block", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat, lng }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`block ${res.status}`);
        const parcel = (await res.json()) as FarmParcel;
        blockCache.current.set(parcel.apn, parcel);
        if (!controller.signal.aborted) {
          setSelectedApn(parcel.apn);
          setBlock(parcel);
          setBlockLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setBlockLoading(false);
          setSelectedApn(null);
        }
      }
    })();
  }, []);

  const handleSelect = useCallback(
    (sel: ParcelSelection | null) => {
      if (sel === null) {
        fetchAbort.current?.abort();
        setSelectedApn(null);
        setBlock(null);
        setBlockLoading(false);
        return;
      }
      if (sel.mine) {
        const own = blockCache.current.get(sel.apn);
        if (own) {
          openParcel(own);
          return;
        }
      }
      openAtPoint(sel.lat, sel.lng, sel.apn, false);
    },
    [openParcel, openAtPoint],
  );

  const closeDrawer = useCallback(() => handleSelect(null), [handleSelect]);

  return (
    <div className="fixed inset-x-0 top-0 bottom-16 z-10 overflow-hidden bg-[#070a10] text-white lg:bottom-0 lg:left-40">
      {/* The map fills the surface to the right of the global Terra sidebar (lg:left-40). */}
      <div className="absolute inset-0">
        <GisMap
          handleRef={mapHandle}
          onSelect={handleSelect}
          myParcels={myFarm.parcels}
          colorBy={colorBy}
          year={year}
          selectedApn={selectedApn}
        />
      </div>

      {/* Overlay layer: transparent to the wheel/pointer except on the panels themselves. */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top-left: search + the farmer's blocks. */}
        <div className="absolute left-4 top-4 flex w-[340px] max-w-[calc(100%-2rem)] flex-col gap-3">
          <ParcelSearch mapHandle={mapHandle} onOpenParcel={openParcel} />
          {listingsOpen && (
            <BlocksPanel
              parcels={myFarm.parcels}
              colorBy={colorBy}
              onColorBy={setColorBy}
              year={year}
              selectedApn={selectedApn}
              onOpenBlock={openParcel}
              onOpenComp={(card) => openAtPoint(card.lat, card.lng, null, true)}
              activeTab={activeTab}
              onTab={setActiveTab}
              onClose={() => setListingsOpen(false)}
            />
          )}
        </div>

        {/* Top-right: the farm at a glance. */}
        {summaryOpen && (
          <div className="absolute right-4 top-4 w-[300px] max-w-[calc(100%-2rem)]">
            <FarmSummaryCard farm={myFarm} summary={summary} onClose={() => setSummaryOpen(false)} />
          </div>
        )}

        {/* Bottom-right: return to my farm + zoom. */}
        <MapControls
          onHome={() => mapHandle.current?.home()}
          onZoomIn={() => mapHandle.current?.zoomIn()}
          onZoomOut={() => mapHandle.current?.zoomOut()}
        />
      </div>

      {/* The land record for the selected parcel. Own blocks open instantly; others enrich on click. */}
      {block !== null && <ParcelDrawer key={block.apn} parcel={block} onClose={closeDrawer} />}
      {block === null && blockLoading && <DrawerLoading onClose={closeDrawer} />}
    </div>
  );
}

/* ------------------------------------------------------------------------------ Drawer loading */

function DrawerLoading({ onClose }: { onClose: () => void }) {
  return (
    <aside
      className="absolute inset-y-0 right-0 z-30 flex w-full flex-col bg-surface-container-lowest text-on-surface shadow-e4 sm:w-[420px]"
      aria-busy="true"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant px-5 py-4">
        <span className="type-label-caps text-on-surface-variant">{c.status.loading}</span>
        <button
          type="button"
          aria-label={c.blocks.close}
          onClick={onClose}
          className="grid size-7 place-items-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-3 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 w-full animate-pulse rounded bg-surface-container-high" />
        ))}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------------------- Blocks panel */

function BlocksPanel({
  parcels,
  colorBy,
  onColorBy,
  year,
  selectedApn,
  onOpenBlock,
  onOpenComp,
  activeTab,
  onTab,
  onClose,
}: {
  parcels: FarmParcel[];
  colorBy: ColorByKey;
  onColorBy: (k: ColorByKey) => void;
  year: number;
  selectedApn: string | null;
  onOpenBlock: (p: FarmParcel) => void;
  onOpenComp: (card: ListingCard) => void;
  activeTab: "blocks" | "market";
  onTab: (t: "blocks" | "market") => void;
  onClose: () => void;
}) {
  const legend = legendFor(parcels, colorBy, year);
  return (
    <section className="pointer-events-auto flex max-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl bg-white text-on-surface shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[1.05rem] font-semibold">{c.blocks.title}</h2>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[0.7rem] font-medium text-on-surface-variant">
            {c.blocks.count(parcels.length)}
          </span>
        </div>
        <button
          type="button"
          aria-label={c.blocks.close}
          onClick={onClose}
          className="grid size-7 place-items-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="px-4 pt-1 text-[0.75rem] text-on-surface-variant">{c.listings.breadcrumb}</p>

      <div className="mt-2 flex gap-5 border-b border-outline-variant px-4">
        <TabButton label={c.blocks.tabBlocks} active={activeTab === "blocks"} onClick={() => onTab("blocks")} />
        <TabButton label={c.blocks.tabMarket} active={activeTab === "market"} onClick={() => onTab("market")} />
      </div>

      {activeTab === "blocks" ? (
        <>
          <div className="flex items-center gap-2 px-4 pt-3">
            <label htmlFor="colorBy" className="text-[0.75rem] font-medium text-on-surface-variant">
              {c.blocks.colorByLabel}
            </label>
            <select
              id="colorBy"
              value={colorBy}
              onChange={(e) => onColorBy(e.target.value as ColorByKey)}
              className="flex-1 rounded-lg border border-outline-variant bg-white px-2 py-1.5 text-[0.82rem] text-on-surface focus:outline-none focus:ring-2 focus:ring-[#2fa84f]/40"
            >
              {COLOR_BYS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {legend.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-4 pt-2">
              {legend.map((item) => (
                <span key={item.key} className="flex items-center gap-1.5 text-[0.72rem] text-on-surface-variant">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-1 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {parcels.length === 0 && <p className="text-[0.82rem] text-on-surface-variant">{c.blocks.empty}</p>}
            {parcels.map((p, i) => (
              <BlockCardView
                key={p.apn}
                parcel={p}
                gradientIndex={i % PHOTO_GRADIENTS.length}
                selected={p.apn === selectedApn}
                onClick={() => onOpenBlock(p)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <p className="text-[0.78rem] text-on-surface-variant">{c.blocks.marketNote}</p>
          {LISTING_CARDS.map((card) => (
            <MarketCardView key={card.id} card={card} onClick={() => onOpenComp(card)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px pb-2 pt-1 text-[0.85rem] font-medium transition-colors",
        active ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
      )}
    >
      {label}
      {active && <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-full bg-[#2fa84f]" />}
    </button>
  );
}

// One of the farmer's own blocks: a real satellite thumbnail + acreage + tenure, click to open the
// land record. On thumbnail error the field-tone gradient behind it shows through.
function BlockCardView({
  parcel,
  gradientIndex,
  selected,
  onClick,
}: {
  parcel: FarmParcel;
  gradientIndex: number;
  selected: boolean;
  onClick: () => void;
}) {
  const leased = parcel.identity.tenure === "leased";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "block w-full overflow-hidden rounded-xl border bg-white text-left shadow-[0_2px_8px_rgba(20,24,40,0.06)] transition hover:shadow-[0_10px_24px_rgba(20,24,40,0.12)]",
        selected ? "border-[#2fa84f] ring-2 ring-[#2fa84f]/40" : "border-outline-variant",
      )}
    >
      <div className="relative h-32 w-full" style={{ background: PHOTO_GRADIENTS[gradientIndex] }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={parcelThumbnailUrl(parcel.centroid_lat, parcel.centroid_lon)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="absolute left-2.5 top-2.5 rounded-md bg-black/55 px-2 py-1 text-[0.74rem] font-semibold text-white backdrop-blur-sm">
          {parcel.planting.crop}
        </span>
        <span className="absolute bottom-2.5 left-2.5 text-[1.35rem] font-bold leading-none tabular-nums text-white drop-shadow">
          {parcel.identity.gross_acres} {c.blocks.acresLabel}
        </span>
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[0.7rem] font-semibold text-on-surface shadow">
          <span className={cn("size-1.5 rounded-full", leased ? "bg-[#f59e0b]" : "bg-[#2fa84f]")} />
          {leased ? c.blocks.leased : c.blocks.owned}
        </span>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="truncate text-[0.86rem] font-semibold text-on-surface">{parcel.name}</span>
        <span className="ml-2 shrink-0 text-[0.74rem] tabular-nums text-on-surface-variant">APN {parcel.apn}</span>
      </div>
    </button>
  );
}

// A nearby comparable parcel: real satellite preview + representative price; click to fly there and
// open the real parcel's land record.
function MarketCardView({ card, onClick }: { card: ListingCard; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full overflow-hidden rounded-xl border border-outline-variant bg-white text-left shadow-[0_2px_8px_rgba(20,24,40,0.06)] transition hover:shadow-[0_10px_24px_rgba(20,24,40,0.12)]"
    >
      <div className="relative h-28 w-full" style={{ background: PHOTO_GRADIENTS[card.imagePlaceholder] }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={parcelThumbnailUrl(card.lat, card.lng)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="absolute left-2.5 top-2.5 rounded-md bg-black/55 px-2 py-1 text-[0.78rem] font-semibold tabular-nums text-white backdrop-blur-sm">
          {card.pricePerAc}
        </span>
        <span className="absolute bottom-2.5 left-2.5 text-[1.2rem] font-bold leading-none tabular-nums text-white drop-shadow">
          {card.acres} {c.listings.acresLabel}
        </span>
      </div>
      <div className="px-3 py-2.5 text-[0.82rem] font-medium text-on-surface-variant">{card.county}</div>
    </button>
  );
}

/* -------------------------------------------------------------------------- Farm summary card */

function FarmSummaryCard({
  farm,
  summary,
  onClose,
}: {
  farm: Farm;
  summary: PortfolioSummary;
  onClose: () => void;
}) {
  const sc = c.summaryCard;
  return (
    <section className="pointer-events-auto overflow-hidden rounded-2xl bg-white text-on-surface shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between px-4 pt-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-[1.05rem] font-semibold">{farm.name}</h2>
          <p className="text-[0.75rem] text-on-surface-variant">{sc.county(farm.county)}</p>
        </div>
        <button
          type="button"
          aria-label={sc.close}
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-px bg-outline-variant/40">
        <Stat label={sc.acres} value={summary.total_acres.toLocaleString()} />
        <Stat label={sc.blocks} value={String(summary.block_count)} />
        <Stat label={sc.leased} value={`${summary.pct_leased}%`} />
        <Stat label={sc.attention} value={String(summary.needs_attention)} alert={summary.needs_attention > 0} />
      </div>

      {summary.acres_by_crop.length > 0 && (
        <div className="px-4 py-3">
          <p className="mb-2 text-[0.72rem] font-medium uppercase tracking-wide text-on-surface-variant">{sc.cropMix}</p>
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            {summary.acres_by_crop.map((cr) => (
              <span
                key={cr.crop}
                title={`${cr.crop} ${cr.acres} ${c.blocks.acresLabel}`}
                style={{ width: `${(cr.acres / summary.total_acres) * 100}%`, background: cr.color }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {summary.acres_by_crop.map((cr) => (
              <span key={cr.crop} className="flex items-center gap-1.5 text-[0.72rem] text-on-surface-variant">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: cr.color }} />
                {cr.crop} &middot; {cr.acres} {c.blocks.acresLabel}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <p className="text-[0.7rem] uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className={cn("text-[1.15rem] font-bold tabular-nums", alert ? "text-[#bd4b34]" : "text-on-surface")}>
        {value}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------- Bottom controls */

function MapControls({
  onHome,
  onZoomIn,
  onZoomOut,
}: {
  onHome: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-28 right-4 flex flex-col items-end gap-2 lg:bottom-24">
      {/* Return to the farmer's own land. */}
      <button
        type="button"
        aria-label={c.controls.home}
        title={c.controls.home}
        onClick={onHome}
        className="flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-[0.82rem] font-semibold text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition hover:bg-surface-container-high"
      >
        <Home className="size-4 text-[#2fa84f]" />
        {c.controls.home}
      </button>
      <div className="flex flex-col overflow-hidden rounded-xl bg-white text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
        <button
          type="button"
          aria-label={c.controls.zoomIn}
          onClick={onZoomIn}
          className="grid size-9 place-items-center transition hover:bg-surface-container-high"
        >
          <Plus className="size-4" />
        </button>
        <span className="h-px w-full bg-outline-variant" />
        <button
          type="button"
          aria-label={c.controls.zoomOut}
          onClick={onZoomOut}
          className="grid size-9 place-items-center transition hover:bg-surface-container-high"
        >
          <Minus className="size-4" />
        </button>
      </div>
    </div>
  );
}
