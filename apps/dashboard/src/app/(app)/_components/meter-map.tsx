"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  Marker,
  Popup,
  GeoJSONSource,
  GeoJSONSourceSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import type { MapPin } from "@/lib/dashboard/map";
import { colorForRate, isLegacyRate, sizeForSpend } from "@/lib/dashboard/map-style";
import type { ParcelOverlay } from "@/lib/dashboard/parcel-overlay";
import { BasemapToggle, buildStyle, DEFAULT_CENTER, DEFAULT_ZOOM, type Basemap } from "./basemap";

// The shared meter map (the live "farm on the map" view). Renders a real basemap (satellite
// imagery or a plain street map) with one DOM-element marker per located meter. Two encodings:
//   - "status" (the Home hero + the Solar map, unchanged): a calm-green / clay attention dot, with
//     an optional true-up-soon ring and a floating bill chip when reconciled.
//   - "rate" (the Energy map lens): the pin is COLORED by the meter's PG&E rate family, SIZED by
//     its annual spend, RINGED when on a closed legacy AG-4/AG-5 schedule, bordered clay when it
//     needs attention, and hovering it opens a popup with the meter's key facts.
// The Energy map also accepts an optional parcel-boundary underlay (the farm's field outlines),
// drawn beneath the pins with a "Fields" on/off toggle. maplibre-gl's JS is heavy, so it is
// imported lazily inside the effect. The basemap tiles/style + the satellite/streets toggle are
// shared with the parcel map (basemap.tsx).

const t = en.shell.map;
const tp = t.popup;

export type MapEncoding = "status" | "rate";

/** A built pin: the marker plus the handles open-state and hover toggles mutate in place. */
type PinEntry = {
  marker: Marker;
  el: HTMLButtonElement;
  dot: HTMLSpanElement;
  chip: HTMLSpanElement | null;
  meterId: string;
  baseLabel: string;
};

// The open meter (a focused finding traces here): a charcoal ring stacked over the elevation
// shadow + aria-current. Mutated in place so toggling never rebuilds the marker set.
function applyOpenState(entry: PinEntry, isOpen: boolean): void {
  if (isOpen) {
    entry.el.setAttribute("aria-current", "true");
    entry.dot.style.boxShadow = "0 0 0 3px var(--on-surface), var(--shadow-elevated)";
    if (entry.chip) entry.chip.style.display = "block";
  } else {
    entry.el.removeAttribute("aria-current");
    entry.dot.style.boxShadow = "var(--shadow-elevated)";
  }
}

/** Escape user-derived text before it lands in the popup's innerHTML. */
function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

/** One label/value row of the hover popup; empty string when the value is honest-blank (null). */
function popupRow(label: string, value: string | null): string {
  if (value == null) return "";
  return (
    `<div style="display:flex;justify-content:space-between;gap:16px">` +
    `<span style="color:var(--on-surface-variant)">${esc(label)}</span>` +
    `<span style="color:var(--on-surface);font-variant-numeric:tabular-nums">${esc(value)}</span>` +
    `</div>`
  );
}

/** The hover popup body for a pin: name + the meter's key facts, each blank when not on file. */
function buildPopupHtml(pin: MapPin): string {
  const rateText = pin.rateSchedule
    ? isLegacyRate(pin.rateSchedule)
      ? `${pin.rateSchedule} (${tp.legacyTag})`
      : pin.rateSchedule
    : null;
  const rows = [
    popupRow(tp.pumpId, pin.growerPumpId),
    popupRow(tp.rate, rateText),
    popupRow(tp.status, pin.status),
    popupRow(tp.annualSpend, pin.annualSpendCents != null ? formatUsdWhole(pin.annualSpendCents) : null),
    popupRow(tp.latestBill, pin.latestBillCents != null ? formatUsdWhole(pin.latestBillCents) : null),
    popupRow(tp.peak, pin.peakKw != null ? `${Math.round(pin.peakKw)} kW` : null),
    popupRow(tp.flow, pin.gpm != null ? `${Math.round(pin.gpm)} gpm` : null),
    popupRow(tp.account, pin.accountNumber),
    popupRow(tp.ranch, pin.ranchName),
  ].join("");
  return (
    `<div style="min-width:184px">` +
    `<div style="font-weight:600;color:var(--on-surface);margin-bottom:6px">${esc(pin.name)}</div>` +
    `<div style="display:flex;flex-direction:column;gap:3px;font-size:12px">${rows}</div>` +
    `</div>`
  );
}

type PinOpts = { showBill: boolean; encoding: MapEncoding; maxSpendCents: number };

/** Build one marker DOM element: a focusable button with a status dot and an optional bill chip. */
function pinElement(
  pin: MapPin,
  opts: PinOpts,
  onOpen: () => void,
): { el: HTMLButtonElement; dot: HTMLSpanElement; chip: HTMLSpanElement | null; baseLabel: string } {
  const { showBill, encoding, maxSpendCents } = opts;
  const isRate = encoding === "rate";
  const billText = pin.latestBillCents != null ? formatUsdWhole(pin.latestBillCents) : null;
  // "rate" encoding: amber/green/gold/... by rate family, sized by spend, ringed when legacy.
  // "status" encoding (unchanged): calm-green or clay attention dot, ringed when true-up is soon.
  const diameter = isRate ? sizeForSpend(pin.annualSpendCents, maxSpendCents) : 14;
  const legacy = isRate && (pin.isLegacy || isLegacyRate(pin.rateSchedule));
  const ringed = isRate ? legacy : Boolean(pin.trueUpSoon);
  const fill = isRate
    ? colorForRate(pin.rateSchedule)
    : pin.attention
      ? "var(--alert)"
      : "var(--primary)";

  const stateLabel = pin.attention ? t.attention : t.calm;
  const fullStateLabel = pin.trueUpSoon ? t.pinTrueUpSoon(stateLabel) : stateLabel;
  const baseLabel = isRate
    ? t.pinRateAria(pin.name, pin.rateSchedule ?? t.rateUnknownAria)
    : showBill && billText
      ? t.pinBillAria(pin.name, billText)
      : t.pinAria(pin.name, fullStateLabel);

  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", baseLabel);
  // MUST be absolute: maplibre positions each marker purely by a transform on an
  // `position:absolute` element (its .maplibregl-marker class). An inline `position:relative`
  // overrides that, drops the markers into normal document flow, and stacks them in a vertical
  // line ~44px apart instead of at their lng/lat. The button still acts as the chip's positioned
  // containing block (an absolute element is one too), so the bill chip stays anchored to it.
  el.style.position = "absolute";
  el.style.width = "44px";
  el.style.height = "44px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.background = "transparent";
  el.style.border = "none";
  el.style.cursor = "pointer";

  let chip: HTMLSpanElement | null = null;
  if (showBill && billText) {
    chip = document.createElement("span");
    chip.setAttribute("aria-hidden", "true");
    chip.textContent = billText;
    chip.style.position = "absolute";
    // Sit the chip above the dot, scaled so a larger (higher-spend) pin never overlaps it.
    chip.style.bottom = `calc(50% + ${Math.round(diameter / 2) + 6}px)`;
    chip.style.left = "50%";
    chip.style.transform = "translateX(-50%)";
    chip.style.whiteSpace = "nowrap";
    chip.style.padding = "2px 7px";
    chip.style.borderRadius = "9999px";
    chip.style.background = "var(--surface-container-lowest)";
    chip.style.color = "var(--on-surface)";
    chip.style.border = "1px solid var(--outline-variant)";
    chip.style.boxShadow = "var(--shadow-elevated)";
    chip.style.fontSize = "12px";
    chip.style.fontWeight = "600";
    chip.style.fontVariantNumeric = "tabular-nums";
    el.appendChild(chip);
  }

  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.style.width = `${diameter}px`;
  dot.style.height = `${diameter}px`;
  dot.style.borderRadius = "9999px";
  dot.style.background = fill;
  // A clay border flags an attention meter in the "rate" encoding (color is the rate there, so
  // attention needs its own channel); otherwise the dot keeps its plain white edge.
  dot.style.border =
    isRate && pin.attention ? "2px solid var(--alert)" : "2px solid var(--surface-container-lowest)";
  dot.style.boxShadow = "var(--shadow-elevated)";
  // The outline ring is a SECOND encoded dimension on top of the fill hue, never a hue of its own:
  // legacy AG-4/AG-5 in the "rate" encoding, true-up-soon in the "status" encoding.
  if (ringed) {
    dot.style.outline = "2px solid var(--on-surface)";
    dot.style.outlineOffset = "2px";
  }
  el.appendChild(dot);

  el.addEventListener("click", onOpen);
  return { el, dot, chip, baseLabel };
}

/** Fit the camera to the pin set (no-op when empty). */
function refit(map: MapLibreMap, pins: readonly MapPin[]): void {
  if (pins.length === 0) return;
  const lats = pins.map((p) => p.latitude);
  const lngs = pins.map((p) => p.longitude);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 56, maxZoom: 14, duration: 0 },
  );
}

export function MeterMap({
  pins,
  openMeterId = null,
  onOpen,
  showBill = false,
  encoding = "status",
  parcels = null,
  heightClass = "h-[360px]",
}: {
  pins: MapPin[];
  openMeterId?: string | null;
  onOpen: (meterId: string) => void;
  showBill?: boolean;
  encoding?: MapEncoding;
  /** The farm's field-boundary underlay (Energy map only). Null hides the overlay + its toggle. */
  parcels?: ParcelOverlay | null;
  heightClass?: string;
}) {
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  // Field-boundary underlay starts ON when a farm has parcels (the founder's choice), with a toggle.
  const [showParcels, setShowParcels] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<PinEntry[]>([]);
  const popupRef = useRef<Popup | null>(null);
  // Latest values read by the async map-init effect without re-creating the map.
  const pinsRef = useRef<MapPin[]>(pins);
  const openRef = useRef<(id: string) => void>(onOpen);
  const openMeterRef = useRef<string | null>(openMeterId);
  const basemapRef = useRef<Basemap>(basemap);
  const parcelsRef = useRef<ParcelOverlay | null>(parcels);
  const showParcelsRef = useRef<boolean>(showParcels);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    openMeterRef.current = openMeterId;
  }, [openMeterId]);
  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);
  useEffect(() => {
    parcelsRef.current = parcels;
  }, [parcels]);
  useEffect(() => {
    showParcelsRef.current = showParcels;
  }, [showParcels]);

  // Add (or re-add after a basemap restyle) the parcel-boundary underlay. Guarded by getSource so a
  // restyle's style.load re-paint never double-adds; visibility tracks the Fields toggle. Drawn on
  // the map canvas, so it always sits BELOW the DOM-element pin markers (HTML overlays).
  const paintParcels = (map: MapLibreMap) => {
    const data = parcelsRef.current;
    if (!data) return;
    if (!map.getSource("parcels")) {
      map.addSource("parcels", {
        type: "geojson",
        data: data as unknown as GeoJSONSourceSpecification["data"],
      });
      map.addLayer({
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        paint: { "fill-color": "#2fa84f", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "parcels-line",
        type: "line",
        source: "parcels",
        paint: { "line-color": "#2fa84f", "line-opacity": 0.45, "line-width": 1.2 },
      });
    } else {
      (map.getSource("parcels") as GeoJSONSource).setData(
        data as unknown as Parameters<GeoJSONSource["setData"]>[0],
      );
    }
    const vis = showParcelsRef.current ? "visible" : "none";
    map.setLayoutProperty("parcels-fill", "visibility", vis);
    map.setLayoutProperty("parcels-line", "visibility", vis);
  };

  // Rebuild the marker set onto a live map (shared by create + pins-changed effects).
  const renderMarkers = (lib: typeof import("maplibre-gl"), map: MapLibreMap) => {
    for (const m of markersRef.current) m.marker.remove();
    const current = pinsRef.current;
    const maxSpendCents =
      encoding === "rate"
        ? current.reduce((mx, p) => Math.max(mx, p.annualSpendCents ?? 0), 0)
        : 0;
    markersRef.current = current.map((pin) => {
      const built = pinElement(
        pin,
        { showBill, encoding, maxSpendCents },
        () => openRef.current(pin.meterId),
      );
      const marker = new lib.Marker({ element: built.el })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map);
      // Hover popup with the meter's facts (rate encoding only). Click still opens the drawer, so
      // touch/mobile (no hover) loses nothing.
      if (encoding === "rate") {
        built.el.addEventListener("mouseenter", () => {
          popupRef.current?.setLngLat([pin.longitude, pin.latitude]).setHTML(buildPopupHtml(pin)).addTo(map);
        });
        built.el.addEventListener("mouseleave", () => popupRef.current?.remove());
      }
      const entry: PinEntry = { marker, meterId: pin.meterId, ...built };
      applyOpenState(entry, pin.meterId === openMeterRef.current);
      return entry;
    });
  };

  // Create the map once per container mount (lazy maplibre import).
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;

    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || containerRef.current === null) return;
      const paper =
        getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() ||
        "#faf9f4";
      const map = new lib.Map({
        container,
        style: buildStyle(basemapRef.current, paper),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new lib.NavigationControl({ showCompass: false }), "bottom-right");
      // Wheel scrolls ZOOM the map directly (the natural gesture). The earlier "click to
      // activate, scroll otherwise pages" opt-in read as broken - scrolling just moved the page
      // up and down instead of zooming - so the map now zooms on wheel like any map. The +/-
      // NavigationControl and pinch-zoom keep working too.
      map.scrollZoom.enable();
      popupRef.current = new lib.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        className: "meter-tip",
      });
      mapRef.current = map;
      // The parcel underlay lives in the style, so it must be (re-)added on every style.load -
      // both the initial load and after each basemap setStyle (which wipes added sources/layers).
      map.on("style.load", () => paintParcels(map));
      renderMarkers(lib, map);
      // Fit + resize only AFTER the map has loaded and the container has a real width. Fitting
      // synchronously at create time (when the lens tab-switch / Reveal entrance can leave the
      // container zero-width) computes a degenerate camera that zooms the whole state out.
      const settle = () => {
        map.resize();
        refit(map, pinsRef.current);
      };
      if (map.loaded()) settle();
      else map.once("load", settle);
    })();

    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap in place when the toggle changes (markers persist across setStyle; the parcel
  // underlay re-adds via the style.load handler registered in the create effect).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const paper =
      getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#faf9f4";
    map.setStyle(buildStyle(basemap, paper));
  }, [basemap]);

  // Toggle the parcel underlay's visibility in place (no source churn) when Fields is switched.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const vis = showParcels ? "visible" : "none";
    if (map.getLayer("parcels-fill")) map.setLayoutProperty("parcels-fill", "visibility", vis);
    if (map.getLayer("parcels-line")) map.setLayoutProperty("parcels-line", "visibility", vis);
  }, [showParcels]);

  // Re-sync markers when the filtered pin set (or encoding) changes on a live map.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    let cancelled = false;
    void (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || mapRef.current === null) return;
      renderMarkers(lib, map);
      refit(map, pins);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, showBill, encoding]);

  // Toggle the open-meter highlight in place on the live markers.
  useEffect(() => {
    for (const entry of markersRef.current) {
      applyOpenState(entry, entry.meterId === openMeterId);
    }
  }, [openMeterId]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant",
        heightClass,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {/* Field-boundary underlay toggle (only when the farm has parcels), top-left. */}
      {parcels && (
        <button
          type="button"
          onClick={() => setShowParcels((v) => !v)}
          aria-pressed={showParcels}
          aria-label={t.fieldsToggleAria(showParcels)}
          className={cn(
            "absolute left-3 top-3 min-h-[36px] rounded-[var(--radius-control)] border border-outline-variant px-3 type-body-sm font-semibold shadow-[var(--shadow-elevated)] transition-colors",
            showParcels
              ? "bg-primary-container text-on-primary-container"
              : "bg-paper text-on-surface-variant hover:bg-surface-container-low",
          )}
        >
          {t.fieldsLabel}
        </button>
      )}
      {/* Satellite / Map toggle, overlaid like the mockup (shared with the parcel map). */}
      <BasemapToggle basemap={basemap} onChange={setBasemap} />
    </div>
  );
}
