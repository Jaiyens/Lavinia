"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  DollarSign,
  Flag,
  Footprints,
  Globe,
  Info,
  Layers,
  Map as MapIcon,
  MapPin,
  Minus,
  MousePointer2,
  Plus,
  Ruler,
  Search,
  Share2,
  Sparkles,
  Spline,
  Square,
  Tag,
  Type as TypeIcon,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/logo";
import { en } from "@/copy/en";
import { GisMap, type GisMapHandle } from "./gis-map";
import { LISTING_CARDS, PHOTO_GRADIENTS, type ListingCard } from "./data";

// The full-screen Parcels GIS surface: a full-bleed dark satellite map with light floating
// panels, modeled on a professional land-mapping app. Terra-branded, original copy, placeholder
// data. The whole thing pins to fixed inset-0 z-50 so it owns the viewport over the app shell.
//
// Layering (z within this fixed container): map (z-0) -> a pointer-events-none overlay layer
// holding every panel; each panel re-enables pointer-events-auto so the map keeps the wheel
// everywhere else. That is what makes scroll-zoom work over the whole canvas while the panels
// stay interactive.

const c = en.parcelsGis;

export function ParcelsGis() {
  const mapHandle = useRef<GisMapHandle>(null);
  const [listingsOpen, setListingsOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(true);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "saved">("all");
  const [activeTool, setActiveTool] = useState<string>("select");
  const [landMode, setLandMode] = useState<"fsa" | "parcel">("parcel");
  // Selected parcel id from a map dot click. Stubbed: we only surface the right panel today.
  const [, setSelectedParcel] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#070a10] text-white">
      {/* The map fills the frame, offset left by the nav rail so it never sits under it. */}
      <div className="absolute inset-0 left-[68px]">
        <GisMap handleRef={mapHandle} onSelect={setSelectedParcel} />
      </div>

      {/* The nav rail is opaque and sits above the map on the far left. */}
      <NavRail />

      {/* Overlay layer: transparent to the wheel/pointer except on the panels themselves, so the
          map keeps scroll-zoom across the whole canvas. */}
      <div className="pointer-events-none absolute inset-0 left-[68px]">
        {/* Top-left stack: search pill + listings panel. */}
        <div className="absolute left-4 top-4 flex w-[332px] max-w-[calc(100%-2rem)] flex-col gap-3">
          <SearchPill />
          {listingsOpen && (
            <ListingsPanel
              activeTab={activeTab}
              onTab={setActiveTab}
              onClose={() => setListingsOpen(false)}
            />
          )}
        </div>

        {/* Centered top toolbar. */}
        <TopToolbar activeTool={activeTool} onTool={setActiveTool} />

        {/* Right-side actions + info card. */}
        <div className="absolute right-4 top-4 flex w-[340px] max-w-[calc(100%-2rem)] flex-col gap-3">
          <RightActions />
          {bannerOpen && <InfoBanner onDismiss={() => setBannerOpen(false)} />}
          {infoOpen && <InfoCard onClose={() => setInfoOpen(false)} />}
        </div>

        {/* Bottom-center map controls. */}
        <BottomControls
          landMode={landMode}
          onLandMode={setLandMode}
          onZoomIn={() => mapHandle.current?.zoomIn()}
          onZoomOut={() => mapHandle.current?.zoomOut()}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- Left nav rail */

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: "baseMaps", label: c.nav.baseMaps, icon: Globe },
  { key: "listings", label: c.nav.listings, icon: Flag, active: true },
  { key: "soldLand", label: c.nav.soldLand, icon: Tag },
  { key: "mortgage", label: c.nav.mortgage, icon: DollarSign },
  { key: "insights", label: c.nav.insights, icon: Sparkles },
  { key: "layers", label: c.nav.layers, icon: Layers },
  { key: "portfolio", label: c.nav.portfolio, icon: BookOpen },
];

function NavRail() {
  return (
    <nav className="absolute inset-y-0 left-0 z-20 flex w-[68px] flex-col items-center border-r border-white/10 bg-[#0c0f16] py-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-[#2fa84f]/15">
        <LogoMark className="size-6 text-[#2fa84f]" />
      </div>
      <div className="mt-4 flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.key} item={item} />
        ))}
      </div>
      <button
        type="button"
        aria-label={c.nav.account}
        className="mt-2 flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#3f7a4f] to-[#2fa84f] text-[0.7rem] font-semibold text-white ring-2 ring-white/10 transition hover:ring-white/25"
      >
        TF
      </button>
    </nav>
  );
}

function NavButton({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "group relative flex w-[56px] flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors",
        item.active ? "bg-[#2fa84f]/15 text-[#5fd07e]" : "text-white/55 hover:bg-white/5 hover:text-white/85",
      )}
    >
      {item.active && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-[#2fa84f]" />}
      <Icon className="size-5" strokeWidth={1.8} />
      <span className="text-[0.6rem] font-medium leading-none">{item.label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------------------- Search pill */

function SearchPill() {
  return (
    <label className="pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-white px-4 text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      <Search className="size-4 text-on-surface-variant" strokeWidth={2} />
      <input
        type="search"
        placeholder={c.searchPlaceholder}
        className="w-full bg-transparent text-[0.9rem] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
      />
    </label>
  );
}

/* ---------------------------------------------------------------------------- Listings panel */

function ListingsPanel({
  activeTab,
  onTab,
  onClose,
}: {
  activeTab: "all" | "saved";
  onTab: (t: "all" | "saved") => void;
  onClose: () => void;
}) {
  return (
    <section className="pointer-events-auto flex max-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl bg-white text-on-surface shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[1.05rem] font-semibold">{c.listings.title}</h2>
          <Info className="size-3.5 text-on-surface-variant" aria-label={c.listings.info} />
        </div>
        <button
          type="button"
          aria-label={c.listings.close}
          onClick={onClose}
          className="grid size-7 place-items-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="px-4 pt-1 text-[0.75rem] text-on-surface-variant">{c.listings.breadcrumb}</p>

      <div className="mt-2 flex gap-5 border-b border-outline-variant px-4">
        <TabButton label={c.listings.tabAll} active={activeTab === "all"} onClick={() => onTab("all")} />
        <TabButton label={c.listings.tabSaved} active={activeTab === "saved"} onClick={() => onTab("saved")} />
      </div>

      <div className="px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2fa84f] py-2 text-[0.85rem] font-semibold text-[#1f7a39] transition hover:bg-[#2fa84f]/8"
        >
          <FunnelIcon className="size-4" />
          {c.listings.filters}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {LISTING_CARDS.map((card) => (
          <ListingCardView key={card.id} card={card} />
        ))}
      </div>
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

function ListingCardView({ card }: { card: ListingCard }) {
  const available = card.status === "available";
  return (
    <article className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-[0_2px_8px_rgba(20,24,40,0.06)] transition hover:shadow-[0_10px_24px_rgba(20,24,40,0.12)]">
      <div className="relative h-32 w-full" style={{ background: PHOTO_GRADIENTS[card.imagePlaceholder] }}>
        <span className="absolute left-2.5 top-2.5 rounded-md bg-black/55 px-2 py-1 text-[0.78rem] font-semibold tabular-nums text-white backdrop-blur-sm">
          {card.pricePerAc}
        </span>
        <button
          type="button"
          aria-label={c.listings.save}
          className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          <Bookmark className="size-3.5" />
        </button>
        <span className="absolute bottom-2.5 left-2.5 text-[1.35rem] font-bold leading-none tabular-nums text-white drop-shadow">
          {card.acres} {c.listings.acresLabel}
        </span>
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[0.7rem] font-semibold text-on-surface shadow">
          <span className={cn("size-1.5 rounded-full", available ? "bg-[#2fa84f]" : "bg-[#f59e0b]")} />
          {available ? c.listings.available : c.listings.pending}
        </span>
      </div>
      <div className="px-3 py-2.5 text-[0.82rem] font-medium text-on-surface-variant">{card.county}</div>
    </article>
  );
}

/* ------------------------------------------------------------------------------- Top toolbar */

interface ToolDef {
  key: string;
  label: string;
  icon: LucideIcon;
  caret?: boolean;
  dot?: boolean; // an info dot, as on the select tool
}

const TOOLS: ToolDef[] = [
  { key: "select", label: c.tools.select, icon: MousePointer2, dot: true },
  { key: "addPoint", label: c.tools.addPoint, icon: MapPin },
  { key: "measureWalk", label: c.tools.measureWalk, icon: Footprints },
  { key: "history", label: c.tools.history, icon: Clock },
  { key: "drawRectangle", label: c.tools.drawRectangle, icon: Square, caret: true },
  { key: "drawLine", label: c.tools.drawLine, icon: Spline, caret: true },
  { key: "dropPin", label: c.tools.dropPin, icon: MapPin, caret: true },
  { key: "text", label: c.tools.text, icon: TypeIcon },
  { key: "duplicate", label: c.tools.duplicate, icon: Copy, caret: true },
  { key: "ruler", label: c.tools.ruler, icon: Ruler },
  { key: "area", label: c.tools.area, icon: Compass },
  { key: "export", label: c.tools.export, icon: Upload },
];

function TopToolbar({ activeTool, onTool }: { activeTool: string; onTool: (k: string) => void }) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/10 bg-[#11151c]/95 px-1.5 py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur">
      {TOOLS.map((tool, i) => {
        const Icon = tool.icon;
        const active = activeTool === tool.key;
        return (
          <div key={tool.key} className="flex items-center">
            <button
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={active}
              onClick={() => onTool(tool.key)}
              className={cn(
                "group relative flex h-8 items-center gap-0.5 rounded-lg px-1.5 transition-colors",
                active ? "bg-[#2fa84f] text-white" : "text-white/65 hover:bg-white/10 hover:text-white",
              )}
            >
              <span className="relative">
                <Icon className="size-[18px]" strokeWidth={1.9} />
                {tool.dot && (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 size-1.5 rounded-full ring-2",
                      active ? "bg-white ring-[#2fa84f]" : "bg-[#2fa84f] ring-[#11151c]",
                    )}
                  />
                )}
              </span>
              {tool.caret && <ChevronDown className="size-3 opacity-70" />}
            </button>
            {(i === 3 || i === 9) && <span className="mx-1 h-5 w-px bg-white/12" />}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------ Right region */

function RightActions() {
  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <button
        type="button"
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2fa84f] text-[0.95rem] font-semibold text-white shadow-[0_8px_24px_rgba(47,168,79,0.35)] transition hover:bg-[#268a41]"
      >
        <MapIcon className="size-[18px]" />
        {c.right.newMap}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <OutlineButton icon={Sparkles} label={c.right.insights} />
        <OutlineButton icon={Share2} label={c.right.export} />
      </div>
    </div>
  );
}

function OutlineButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 text-[0.85rem] font-medium text-white/90 backdrop-blur transition hover:bg-white/12"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function InfoBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/12 bg-[#11151c]/90 px-3 py-2.5 text-[0.82rem] text-white/85 shadow-lg backdrop-blur">
      <Info className="size-4 shrink-0 text-[#5fd07e]" />
      <span className="flex-1">{c.right.banner}</span>
      <button
        type="button"
        aria-label={c.right.dismissBanner}
        onClick={onDismiss}
        className="grid size-6 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function InfoCard({ onClose }: { onClose: () => void }) {
  return (
    <section className="pointer-events-auto overflow-hidden rounded-2xl bg-white text-on-surface shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className="text-[0.75rem] text-on-surface-variant">{c.right.breadcrumb}</span>
        <button
          type="button"
          aria-label={c.right.close}
          onClick={onClose}
          className="grid size-7 place-items-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-4 pb-4 pt-1">
        <h2 className="text-[1.45rem] font-bold tracking-tight">{c.right.heading}</h2>
        <div className="mt-2 space-y-3 text-[0.86rem] leading-relaxed text-on-surface-variant">
          <p>{renderWithLinks(c.right.bodyOne)}</p>
          <p>{renderWithLinks(c.right.bodyTwo)}</p>
        </div>
        <button
          type="button"
          className="mt-3 flex items-center gap-1 text-[0.85rem] font-semibold text-[#1f7a39] transition hover:text-[#2fa84f]"
        >
          {c.right.allCounties}
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#2fa84f] text-[0.92rem] font-semibold text-white transition hover:bg-[#268a41]"
        >
          {c.right.comparePlans}
        </button>
      </div>
    </section>
  );
}

// Render [[...]] spans inside copy as green inline links (stubbed, non-navigating).
function renderWithLinks(text: string): ReactNode {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return parts.map((part, i) => {
    const m = /^\[\[(.*?)\]\]$/.exec(part);
    if (m) {
      return (
        <button key={i} type="button" className="font-semibold text-[#1f7a39] underline-offset-2 hover:underline">
          {m[1]}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/* ---------------------------------------------------------------------------- Bottom controls */

function BottomControls({
  landMode,
  onLandMode,
  onZoomIn,
  onZoomOut,
}: {
  landMode: "fsa" | "parcel";
  onLandMode: (m: "fsa" | "parcel") => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center gap-3">
      <LandToggle landMode={landMode} onLandMode={onLandMode} />
      <div className="pointer-events-auto flex items-end gap-2">
        <RoundControl label={c.controls.threeD}>
          <span className="text-[0.72rem] font-bold">3D</span>
        </RoundControl>
        <RoundControl label={c.controls.layers}>
          <Layers className="size-4" />
        </RoundControl>
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
    </div>
  );
}

function RoundControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-xl bg-white text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition hover:bg-surface-container-high"
    >
      {children}
    </button>
  );
}

function LandToggle({
  landMode,
  onLandMode,
}: {
  landMode: "fsa" | "parcel";
  onLandMode: (m: "fsa" | "parcel") => void;
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white px-1.5 py-1 text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      <RadioPill label={c.controls.fsa} active={landMode === "fsa"} onClick={() => onLandMode("fsa")} />
      <RadioPill label={c.controls.parcel} active={landMode === "parcel"} onClick={() => onLandMode("parcel")} />
      <button type="button" aria-label={c.controls.layers} className="grid size-7 place-items-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high">
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}

function RadioPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] font-semibold transition-colors",
        active ? "bg-[#2fa84f]/12 text-[#1f7a39]" : "text-on-surface-variant hover:bg-surface-container-high",
      )}
    >
      <span
        className={cn(
          "grid size-3.5 place-items-center rounded-full border-2",
          active ? "border-[#2fa84f]" : "border-on-surface-variant/50",
        )}
      >
        {active && <span className="size-1.5 rounded-full bg-[#2fa84f]" />}
      </span>
      {label}
    </button>
  );
}

// Lucide's funnel icon is named `Funnel` in newer versions and `Filter` in older ones; this
// project's lucide-react exposes `Funnel`. A tiny inline funnel keeps the import surface stable
// regardless of the installed icon set.
function FunnelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
    </svg>
  );
}
