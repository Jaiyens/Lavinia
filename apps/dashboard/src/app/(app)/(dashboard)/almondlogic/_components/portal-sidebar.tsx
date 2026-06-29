"use client";

import { parseAsInteger, useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import type { HandlerInfo, HullerInfo } from "@/lib/almond-portal/data";

// The Almond Logic left sidebar, re-skinned in the Terra palette: My Hullers / My Handlers (with
// their logos) and a crop-year selector. Selecting a huller writes ?hullerId (and defaults the crop
// year to that huller's latest); the crop-year chips write ?cropYear. The screens read those params.
export function PortalSidebar({
  hullers,
  handlers,
  defaultHullerId = null,
  defaultCropYear = null,
}: {
  hullers: HullerInfo[];
  handlers: HandlerInfo[];
  /** The data-bearing huller/year to highlight when the URL has no explicit selection. */
  defaultHullerId?: number | null;
  defaultCropYear?: number | null;
}) {
  const [hullerId, setHullerId] = useQueryState("hullerId", parseAsInteger);
  const [cropYear, setCropYear] = useQueryState("cropYear", parseAsInteger);

  const active =
    hullers.find((h) => h.id === hullerId) ??
    hullers.find((h) => h.id === defaultHullerId) ??
    hullers[0] ??
    null;
  const years = active?.cropYears ?? [];
  const defaultYear =
    active?.id === defaultHullerId && defaultCropYear != null && years.includes(defaultCropYear)
      ? defaultCropYear
      : years[0] ?? null;
  const activeYear = cropYear ?? defaultYear;

  const selectHuller = (h: HullerInfo) => {
    void setHullerId(h.id);
    // Snap the crop year to one this huller actually has.
    if (!h.cropYears.includes(activeYear ?? -1)) void setCropYear(h.cropYears[0] ?? null);
  };

  return (
    <aside className="space-y-6">
      <EntityGroup
        title="My Hullers"
        entities={hullers}
        activeId={active?.id ?? null}
        onSelect={(e) => selectHuller(e as HullerInfo)}
      />
      <EntityGroup title="My Handlers" entities={handlers} activeId={null} onSelect={() => {}} />

      {years.length > 0 && (
        <div>
          <p className="type-label-caps mb-2 text-on-surface-variant">Crop Year</p>
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => void setCropYear(y)}
                aria-pressed={y === activeYear}
                className={cn(
                  "tnum rounded-[var(--radius-md)] border px-2.5 py-1 type-num transition-colors",
                  y === activeYear
                    ? "border-primary bg-primary/10 text-on-surface"
                    : "border-outline-variant text-on-surface-variant hover:text-on-surface",
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function EntityGroup({
  title,
  entities,
  activeId,
  onSelect,
}: {
  title: string;
  entities: (HullerInfo | HandlerInfo)[];
  activeId: number | null;
  onSelect: (e: HullerInfo | HandlerInfo) => void;
}) {
  if (entities.length === 0) return null;
  return (
    <div>
      <p className="type-label-caps mb-2 text-on-surface-variant">{title}</p>
      <ul className="space-y-1">
        {entities.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelect(e)}
              aria-pressed={e.id === activeId}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
                e.id === activeId
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:bg-surface-container-low/50",
              )}
            >
              {e.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element -- external huller logos; no optimization needed
                <img src={e.logoPath} alt="" className="h-7 w-7 shrink-0 rounded-[4px] object-contain" />
              ) : (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] bg-primary/10 type-label-caps text-primary">
                  {e.name.slice(0, 1)}
                </span>
              )}
              <span className="type-body-md min-w-0 flex-1 truncate text-on-surface">{e.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
