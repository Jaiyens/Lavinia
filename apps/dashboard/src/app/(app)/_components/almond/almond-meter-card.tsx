"use client";

import type { ReactNode } from "react";
import { Droplet, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import type { MeterDetail } from "@/lib/almond/shape";

/**
 * One meter Almond pulled into the chat this turn, captured client-side as its transient `data-meter`
 * part arrived (B2). It holds the resolved MeterDetail; the launcher captures these (like the nav
 * chips and download cards) and threads them down, since transient parts are not in `message.parts`.
 */
export type AlmondMeterCard = {
  meter: MeterDetail;
};

const t = en.shell.almond.meterCard;

/**
 * A LIGHT inline card for a single meter, rendered right in the chat (B2). The grower asked to see one
 * meter, so it shows the meter at a glance - name, rate (legacy flagged), where it sits (company /
 * ranch), its flow, its latest bill split into energy + demand + total, an estimated-cost note when
 * the cost is modeled (never a posted bill), the fields it serves, and a one-line solar summary for a
 * solar meter - without leaving the conversation or opening the heavy drawer.
 *
 * Formatting CONVENTIONS mirror the meter drawer (FieldRow / MoneyRow): caps labels in the variant
 * tone, tabular figures on the right, "Not on file" for an absent fact. Kept compact and inline (no
 * dialog, no scroll lock). Cool-grey palette; static (no entrance/loop motion), so there is nothing to
 * degrade under prefers-reduced-motion.
 */
export function AlmondMeterCard({ card }: { card: AlmondMeterCard }) {
  const m = card.meter;
  // The rate the header shows: the latest bill's printed tariff first (what PG&E actually billed),
  // else the inventory rate schedule. Mirrors the drawer's rate precedence.
  const rateShown = m.recentBills.at(-1)?.tariff ?? m.rateSchedule;
  const latest = m.recentBills.at(-1) ?? null;
  // MODELED cost is an estimate, never a posted bill; NONE / no bill reads not-on-file.
  const estimated = m.costSource === "MODELED" ? m.modeledCost : null;

  return (
    <div
      role="group"
      aria-label={t.cardAria(m.name)}
      className="mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low"
    >
      {/* Header: name + rate, with a legacy flag and a solar mark. */}
      <div className="border-b border-outline-variant px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="type-body-md min-w-0 truncate font-medium text-on-surface">{m.name}</p>
          {m.isSolar && (
            <span className="inline-flex shrink-0 items-center gap-1 type-label-caps text-on-surface-variant">
              <Sun size={13} aria-hidden style={{ color: "var(--color-gold)" }} />
              {t.solarLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 type-caption text-on-surface-variant">
          <span>
            {t.rateLabel}: {rateShown !== null && rateShown !== "" ? rateShown : t.notOnFile}
          </span>
          {m.isLegacyRate && (
            <span className="type-label-caps inline-flex items-center rounded-[var(--radius-control)] bg-alert-container px-2 py-0.5 text-on-alert-container">
              {t.legacyTag}
            </span>
          )}
        </p>
      </div>

      <div className="px-3.5 py-1">
        {/* Where it sits + how it flows. */}
        <CardRow label={t.entityLabel} value={m.entity} />
        <CardRow label={t.ranchLabel} value={m.ranch} />
        <CardRow label={t.cropLabel} value={m.crop} />
        <CardRow
          label={t.gpmLabel}
          value={m.gpm !== null ? t.gpmValue(formatNumber(m.gpm)) : null}
          icon={<Droplet size={13} aria-hidden className="text-on-surface-variant" />}
        />
        <CardRow label={t.statusLabel} value={m.status} flagged={m.status === "BAD"} />
        <CardRow label={t.accountLabel} value={m.account} />
      </div>

      {/* Latest bill: the energy / demand split + total, or the estimated note, or not-on-file. A MODELED
          meter is an estimate and must NEVER render as a posted bill, so the bill block is gated on the
          cost source (structural), not merely on the period happening to carry null money. */}
      {m.costSource !== "MODELED" &&
      latest !== null &&
      (latest.total !== null || latest.demandCharge !== null) ? (
        <div className="border-t border-outline-variant px-3.5 py-2.5">
          <p className="type-label-caps mb-1 text-on-surface-variant">{t.latestBillLabel}</p>
          <p className="type-caption tnum mb-1.5 text-on-surface-variant">
            {t.billRange(formatDate(latest.start), formatDate(latest.close))}
          </p>
          {latest.breakdown !== null && (
            <MoneyLine label={t.energyLabel} usd={latest.breakdown.energy.usd} />
          )}
          <MoneyLine
            label={t.demandLabel}
            usd={latest.demandCharge !== null ? latest.demandCharge.usd : null}
          />
          <MoneyLine label={t.totalLabel} usd={latest.total !== null ? latest.total.usd : null} strong />
        </div>
      ) : estimated !== null ? (
        <div className="border-t border-outline-variant px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="type-label-caps text-on-surface-variant">{t.estimatedLabel}</p>
            <span className="type-label-caps inline-flex items-center rounded-[var(--radius-control)] border border-dashed border-outline-variant px-2 py-0.5 text-on-surface-variant">
              {t.estimatedTag}
            </span>
          </div>
          <p className="type-num tnum mt-0.5 text-on-surface">{estimated.usd}</p>
        </div>
      ) : (
        <div className="border-t border-outline-variant px-3.5 py-2.5">
          <p className="type-label-caps text-on-surface-variant">{t.latestBillLabel}</p>
          <p className="type-body-sm mt-0.5 text-on-surface-variant/70">{t.noBillOnFile}</p>
        </div>
      )}

      {/* Fields this pump serves. */}
      {m.blocks.length > 0 && (
        <div className="border-t border-outline-variant px-3.5 py-2.5">
          <p className="type-label-caps mb-1 text-on-surface-variant">{t.blocksLabel}</p>
          <p className="type-body-sm text-on-surface">
            {m.blocks
              .map((b) => (b.acreage !== null ? t.blockAcres(b.name, formatNumber(b.acreage)) : b.name))
              .join(", ")}
          </p>
        </div>
      )}

      {/* Solar summary (solar meter only): the pre-composed plain-word phrases. No invented credit. */}
      {m.solar !== null && (
        <div className="border-t border-outline-variant px-3.5 py-2.5">
          <p className="type-label-caps mb-1 text-on-surface-variant">{t.solarLabel}</p>
          <p className="type-body-sm text-on-surface">{m.solar.program}</p>
          <p className="type-body-sm mt-0.5 text-on-surface-variant">{m.solar.arrayMembership}</p>
        </div>
      )}
    </div>
  );
}

/** A label/value row. Null/empty values read "Not on file", never fabricated (drawer FieldRow idiom). */
function CardRow({
  label,
  value,
  flagged,
  icon,
}: {
  label: string;
  value: string | null;
  flagged?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-outline-variant py-1.5 first:border-t-0">
      <dt className="type-label-caps flex shrink-0 items-center gap-1 text-on-surface-variant">
        {icon}
        {label}
      </dt>
      {value === null || value === "" ? (
        <dd className="type-body-sm text-on-surface-variant/70">{t.notOnFile}</dd>
      ) : (
        <dd
          className={cn(
            "type-body-sm tnum text-right text-on-surface",
            flagged &&
              "type-label-caps rounded-[var(--radius-control)] bg-alert-container px-2 py-0.5 text-on-alert-container",
          )}
        >
          {value}
        </dd>
      )}
    </div>
  );
}

/** A money line: plain label left, tabular whole-dollar figure right (drawer MoneyRow idiom). The
 *  dollar string is already formatted on the meter detail (integer cents end to end), so this never
 *  re-rounds. A null figure reads not-on-file, never a fabricated $0. */
function MoneyLine({ label, usd, strong }: { label: string; usd: string | null; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <p className={cn("type-body-sm text-on-surface", strong && "font-medium")}>{label}</p>
      <p className={cn("type-num tnum shrink-0 text-on-surface", strong && "font-medium")}>
        {usd ?? t.notOnFile}
      </p>
    </div>
  );
}

// Billing period bounds are stored midnight-UTC; format in UTC so a Pacific-time grower never sees a
// cycle date shifted a day early, and SSR/CSR text stays identical (mirrors the drawer's DATE_FMT).
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const NUM_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

function formatNumber(n: number): string {
  return NUM_FMT.format(n);
}
