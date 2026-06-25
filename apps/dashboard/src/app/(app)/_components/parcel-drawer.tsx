"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { en, usd } from "@/copy/en";
import type { FarmParcel } from "@/lib/parcel/farm/types";

// The per-block detail drawer: slides in over the map (right side, map stays full behind) and
// shows the grouped farm-ops data, scrollable. APN is one-click copyable; genuinely auto-enriched
// fields (crop class, GSA, water district, soil) are badged with their public source.

const t = en.parcel.farm;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string, withDay = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  const mon = MONTHS[(m ?? 1) - 1] ?? "";
  return withDay ? `${mon} ${d}, ${y}` : `${mon} ${y}`;
}

export function ParcelDrawer({ parcel, onClose }: { parcel: FarmParcel | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!parcel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [parcel, onClose]);

  // Move focus into the drawer on open (it remounts per parcel via its key), so keyboard / screen
  // reader users land on the panel rather than the canvas behind it. Mirrors meter-drawer.tsx.
  useEffect(() => {
    asideRef.current?.focus();
  }, []);

  // Keep Tab within the drawer while it is open.
  const trapTab = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab") return;
    const root = asideRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  if (!parcel) return null;
  const p = parcel;
  const leased = p.identity.tenure === "leased";

  // Provenance per field: a real public source shows its "from ..." badge; anything else is
  // representative demo data and is tagged "sample". Newly-wired enrichers populate p.sources and
  // auto-flip a row from sample -> sourced. Genuinely real engine facts (acres, MTRS, from the
  // parcel boundary) pass neither and read as plain values.
  const prov = (key: string): { source?: string; sample?: boolean } =>
    p.sources[key] ? { source: p.sources[key] } : { sample: true };

  const copyApn = async () => {
    try {
      await navigator.clipboard.writeText(p.apn);
      setCopied(true);
    } catch {
      // clipboard blocked; the value stays visible to copy by hand
    }
  };

  return (
    <aside
      ref={asideRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${p.name} detail`}
      tabIndex={-1}
      onKeyDown={trapTab}
      className="drawer-in absolute inset-y-0 right-0 z-30 flex w-full flex-col bg-surface-container-lowest shadow-e4 outline-none sm:w-[420px]"
    >
      {/* Header */}
      <div className="shrink-0 border-b border-outline-variant px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-label-caps text-primary">{p.planting.crop}</p>
            <h2 className="type-title mt-0.5 truncate text-on-surface">{p.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="-mr-1.5 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="type-num tnum text-on-surface-variant">APN {p.apn}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyApn()}
            aria-label={t.copyApn}
            className={cn("type-label-caps", copied ? "text-primary" : "text-on-surface-variant")}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? t.copied : t.copyApn}</span>
          </Button>
          <span className="type-body-sm text-on-surface-variant">
            {t.acres(p.identity.gross_acres)} &middot; {p.county}
          </span>
        </div>
      </div>

      {/* Scrollable grouped body. Extra bottom padding so the source link clears the floating
          Almond launcher (fixed bottom-right, above this panel). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-4">
        {/* Honesty: sourced rows show their public source; rows tagged "sample" are representative
            demo values until the farmer connects their own records. */}
        <p className="mb-3 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low px-3 py-2 type-caption text-on-surface-variant">
          {t.sampleDisclaimer}
        </p>

        <Group title={t.sections.identity}>
          <Row label={t.labels.grossAcres} value={t.acres(p.identity.gross_acres)} />
          <Row label={t.labels.netPlanted} value={t.acres(p.identity.net_planted_acres)} {...prov("net_planted_acres")} />
          <Row label={t.labels.mtrs} value={p.identity.mtrs} />
          <Row label={t.labels.tenure} value={t.tenure[p.identity.tenure]} {...prov("tenure")} />
          {leased && <Row label={t.labels.landlord} value={p.identity.landlord} {...prov("landlord")} />}
          {leased && p.identity.rent_per_acre !== null && (
            <Row label={t.labels.rentPerAcre} value={`${usd(p.identity.rent_per_acre)}/ac`} {...prov("rent_per_acre")} />
          )}
          {leased && p.identity.lease_start && p.identity.lease_expiry && (
            <Row
              label={t.labels.leaseTerm}
              value={`${fmtDate(p.identity.lease_start, false)} - ${fmtDate(p.identity.lease_expiry, false)}`}
              {...prov("lease_term")}
            />
          )}
        </Group>

        <Group title={t.sections.planting}>
          <Row label={t.labels.crop} value={p.planting.crop} {...prov("crop")} />
          <Row label={t.labels.variety} value={p.planting.variety} {...prov("variety")} />
          <Row label={t.labels.rootstock} value={p.planting.rootstock} {...prov("rootstock")} />
          <Row
            label={t.labels.plantingYear}
            value={p.planting.planting_year ? String(p.planting.planting_year) : "Annual"}
            {...prov("planting_year")}
          />
          <Row label={t.labels.treeCount} value={p.planting.tree_count} {...prov("tree_count")} />
          <Row label={t.labels.spacing} value={p.planting.spacing} {...prov("spacing")} />
          <Row
            label={t.labels.irrigation}
            value={p.planting.irrigation_method ? t.irrigation[p.planting.irrigation_method] ?? null : null}
            {...prov("irrigation_method")}
          />
          <Row
            label={t.labels.expectedYield}
            value={
              p.planting.expected_yield_per_acre !== null
                ? t.perAcre(p.planting.expected_yield_per_acre, p.planting.yield_unit)
                : null
            }
            {...prov("expected_yield_per_acre")}
          />
          <Row
            label={t.labels.historicalYield}
            value={
              p.planting.historical_yield_per_acre !== null
                ? t.perAcre(p.planting.historical_yield_per_acre, p.planting.yield_unit)
                : null
            }
            {...prov("historical_yield_per_acre")}
          />
        </Group>

        <Group title={t.sections.water}>
          <Row label={t.labels.waterSource} value={t.waterSource[p.water.water_source] ?? null} {...prov("water_source")} />
          <Row label={t.labels.wellDepth} value={p.water.well_depth_ft !== null ? t.feet(p.water.well_depth_ft) : null} {...prov("well_depth_ft")} />
          <Row label={t.labels.wellHp} value={p.water.well_hp !== null ? t.hp(p.water.well_hp) : null} {...prov("well_hp")} />
          <Row
            label={t.labels.wellCapacity}
            value={p.water.well_capacity_gpm !== null ? t.gpm(p.water.well_capacity_gpm) : null}
            {...prov("well_capacity_gpm")}
          />
          <Row label={t.labels.gsa} value={p.water.gsa_name} {...prov("gsa_name")} />
          <Row
            label={t.labels.allocation}
            value={p.water.groundwater_allocation_af !== null ? t.afPerAcre(p.water.groundwater_allocation_af) : null}
            {...prov("groundwater_allocation_af")}
          />
          <Row label={t.labels.waterDistrict} value={p.water.water_district} {...prov("water_district")} />
          <Row
            label={t.labels.et}
            value={p.water.et_estimate_af !== null ? t.af(p.water.et_estimate_af) : null}
            {...prov("et_estimate_af")}
          />
        </Group>

        <Group title={t.sections.energy}>
          <Row label={t.labels.pgeMeter} value={p.energy.pge_meter_id} {...prov("pge_meter_id")} />
          <Row
            label={t.labels.rateSchedule}
            value={p.energy.rate_schedule}
            badge={p.energy.rate_misclassified ? t.rateMisclassified : undefined}
            {...prov("rate_schedule")}
          />
          <Row label={t.labels.pumpHp} value={p.energy.pump_hp !== null ? t.hp(p.energy.pump_hp) : null} {...prov("pump_hp")} />
          <Row
            label={t.labels.annualEnergyCost}
            value={p.energy.annual_energy_cost !== null ? usd(p.energy.annual_energy_cost) : null}
            {...prov("annual_energy_cost")}
          />
        </Group>

        <Group title={t.sections.soil}>
          <Row label={t.labels.soilClass} value={p.soil.soil_class} {...prov("soil_class")} />
          <Row label={t.labels.slope} value={p.soil.slope_pct !== null ? t.pct(p.soil.slope_pct) : null} {...prov("slope_pct")} />
          <Row label={t.labels.salinity} value={p.soil.salinity_notes} {...prov("salinity_notes")} />
        </Group>

        <Group title={t.sections.health}>
          <Row
            label={t.labels.ndvi}
            value={
              p.health.ndvi_latest !== null
                ? `${p.health.ndvi_latest.toFixed(2)}${p.health.ndvi_trend ? ` (${t.ndviTrend[p.health.ndvi_trend] ?? p.health.ndvi_trend})` : ""}`
                : null
            }
            {...prov("ndvi_latest")}
          />
          {p.health.scouting_notes.length > 0 && (
            <ListBlock label={t.labels.scouting} sample>
              {p.health.scouting_notes.map((n, i) => (
                <li key={i} className="type-body-sm text-on-surface">
                  <span className="text-on-surface-variant">{fmtDate(n.date)}</span> {n.note}
                  {n.author ? <span className="text-on-surface-variant"> - {n.author}</span> : null}
                </li>
              ))}
            </ListBlock>
          )}
          {p.health.photos.length > 0 && (
            <ListBlock label={t.labels.photos} sample>
              {p.health.photos.map((ph, i) => (
                <li key={i} className="type-body-sm text-on-surface-variant">
                  {ph.caption} - {fmtDate(ph.date)}
                </li>
              ))}
            </ListBlock>
          )}
        </Group>

        <Group title={t.sections.compliance}>
          <Row label={t.labels.permit} value={p.compliance.permit_site_id} {...prov("permit_site_id")} />
          {p.compliance.spray_section ? (
            // REAL DPR PUR, aggregated to this parcel's 1-sq-mi PLSS section (not the exact field).
            <div className="py-1.5">
              <p className="flex items-center gap-1.5 type-body-sm text-on-surface-variant">
                {t.spraySection.title(p.compliance.spray_section.year)}
                <Tag tone="source">{t.sourceFrom(p.sources.spray_section ?? "CA DPR PUR")}</Tag>
              </p>
              <p className="mt-1 type-body-md text-on-surface">
                {t.spraySection.summary(
                  p.compliance.spray_section.records,
                  Math.round(p.compliance.spray_section.total_lbs),
                )}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {p.compliance.spray_section.top_chemicals.map((chem, i) => (
                  <li key={i} className="type-body-sm text-on-surface">
                    <span className="tnum text-on-surface-variant">{Math.round(chem.lbs)} lb</span> {chem.name}
                  </li>
                ))}
              </ul>
              <p className="mt-1 type-caption text-on-surface-variant">{t.spraySection.note}</p>
            </div>
          ) : (
            p.compliance.spray_history.length > 0 && (
              <ListBlock label={t.labels.sprayHistory} sample>
                {p.compliance.spray_history.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5 type-body-sm text-on-surface">
                    <span>{t.sprayLine(s.material, fmtDate(s.date))}</span>
                    {s.rei_until >= s.date && <Tag tone="alert">{t.reiActive}</Tag>}
                  </li>
                ))}
              </ListBlock>
            )
          )}
          {p.compliance.upcoming_tasks.length > 0 && (
            <ListBlock label={t.labels.tasks} sample>
              {p.compliance.upcoming_tasks.map((task, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5 type-body-sm text-on-surface">
                  <span className="text-on-surface-variant">{fmtDate(task.due)}</span>
                  <span>{task.label}</span>
                  {task.overdue && <Tag tone="alert">{t.overdue}</Tag>}
                </li>
              ))}
            </ListBlock>
          )}
        </Group>

        <Group title={t.sections.financial}>
          <Row label={t.labels.revenue} value={p.financial.revenue !== null ? usd(p.financial.revenue) : null} {...prov("revenue")} />
          <Row
            label={t.labels.costPerAcre}
            value={p.financial.cost_per_acre !== null ? `${usd(p.financial.cost_per_acre)}/ac` : null}
            {...prov("cost_per_acre")}
          />
          {leased && p.financial.lease_cost !== null && (
            <Row label={t.labels.leaseCost} value={usd(p.financial.lease_cost)} {...prov("lease_cost")} />
          )}
        </Group>

        <a
          href={p.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 type-body-sm text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          {en.parcel.sourceLink}
        </a>
      </div>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 type-label-caps text-on-surface-variant">{title}</h3>
      <dl className="divide-y divide-outline-variant/60">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  source,
  badge,
  sample,
}: {
  label: string;
  value: string | number | null;
  source?: string;
  badge?: string;
  /** True when this value is representative/sample data (no real public source) — shows a tag. */
  sample?: boolean;
}) {
  const display = value === null || value === undefined || value === "" ? t.notOnFile : String(value);
  const muted = display === t.notOnFile;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="type-body-sm shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-1.5 text-right">
        <span className={cn("type-body-md tnum", muted ? "text-on-surface-variant/60" : "text-on-surface")}>
          {display}
        </span>
        {badge && <Tag tone="alert">{badge}</Tag>}
        {source && <Tag tone="source">{t.sourceFrom(source)}</Tag>}
        {/* Representative value with no real source: mark it so the farmer never mistakes it for fact. */}
        {sample && !source && !muted && <Tag tone="sample">{t.sampleTag}</Tag>}
      </dd>
    </div>
  );
}

function ListBlock({ label, children, sample }: { label: string; children: ReactNode; sample?: boolean }) {
  return (
    <div className="py-1.5">
      <p className="flex items-center gap-1.5 type-body-sm text-on-surface-variant">
        {label}
        {sample && <Tag tone="sample">{t.sampleTag}</Tag>}
      </p>
      <ul className="mt-1 flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function Tag({ tone, children }: { tone: "alert" | "source" | "sample"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 type-label-caps",
        tone === "alert" && "bg-alert-container text-on-alert-container",
        tone === "source" && "border border-outline-variant text-on-surface-variant/80",
        tone === "sample" && "bg-surface-container-high text-on-surface-variant/80",
      )}
    >
      {tone === "alert" && <AlertTriangle className="h-3 w-3" />}
      {children}
    </span>
  );
}
