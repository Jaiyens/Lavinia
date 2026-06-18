"use client";

import { useEffect, useRef } from "react";
import { useQueryState } from "nuqs";
import { BadgeCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { centsFromDollars, formatUsd, formatUsdWhole } from "@/lib/format/money";
import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import type { BillVerification } from "@/lib/energy/bill-verify";
import type { ResultView } from "@/lib/recommendations/result";
import { toDrawerDetail } from "@/lib/dashboard/drawer";
import { SURFACE } from "@/lib/dashboard/surface";
import { CoveragePill } from "./coverage-pill";
import { FindingCard } from "./finding-card";

// The meter drawer (Story 2.5): the ONE shared drill-in surface, opened from any table row
// (and later any chart bar / map pin) by the nuqs `meter` key. Open/close is pure URL state,
// so it survives refresh and lens switches and touches no other key (closing returns to the
// lens it came from with filter intact). Right-side panel on desktop, full-height sheet on
// mobile. Every dollar figure arrives pre-gated by the pure toDrawerDetail (AR-15): an
// unreconciled meter shows inventory + its coverage state, never a number.

const t = en.shell.drawer;

// Billing period bounds are stored midnight-UTC; format in UTC so a Pacific-time grower
// never sees a cycle date shifted a day early (and SSR/CSR text stays identical).
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

/** A printed NEM amount: negative cents are a credit to the grower, said in words. */
function signedUsd(cents: number): string {
  return cents < 0 ? en.solar.insight.creditValue(formatUsd(-cents)) : formatUsd(cents);
}

/** A label/value row inside a section. Null/empty values read "Not on file", never fabricated. */
function FieldRow({ label, value, flagged }: { label: string; value: string | null; flagged?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-outline-variant py-2 first:border-t-0">
      <dt className="type-label-caps shrink-0 text-on-surface-variant">{label}</dt>
      {value === null || value === "" ? (
        <dd className="type-body-md text-on-surface-variant/70">{t.notOnFile}</dd>
      ) : (
        <dd
          className={cn(
            "type-body-md tnum text-right text-on-surface",
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

/** A money row: plain label left, tabular figure right. Each row says what its own null
 *  means ("None" is honest for an absent demand charge; a missing total reads the no-value
 *  dash, never an affirmative claim). */
function MoneyRow({
  label,
  cents,
  nullLabel,
  sub,
  strong,
}: {
  label: string;
  cents: number | null;
  nullLabel: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-outline-variant py-2 first:border-t-0">
      <div className="min-w-0">
        <p className={cn("type-body-md text-on-surface", strong && "font-medium")}>{label}</p>
        {sub !== undefined && <p className="type-caption tnum text-on-surface-variant">{sub}</p>}
      </div>
      <p className={cn("type-num tnum shrink-0 text-on-surface", strong && "font-medium")}>
        {cents === null ? nullLabel : formatUsd(cents)}
      </p>
    </div>
  );
}

function SectionHeader({ children }: { children: string }) {
  return <h3 className="type-label-caps mb-2 mt-7 text-on-surface-variant">{children}</h3>;
}

// `findings` is required: an optional [] default would let a forgetful call site render
// the calm "Nothing needs you" line over real findings, the exact fabricated honesty
// the coverage rules forbid.
export function MeterDrawer({
  meters,
  findings,
  verifications,
  trackedResults,
  readOnly = false,
}: {
  meters: MeterView[];
  findings: FindingView[];
  /** Bill-accuracy verdict per meter id (Story 4.1); null = could not check. */
  verifications: Record<string, BillVerification | null>;
  /** Accepted recommendations' predicted-vs-realized results per meter id (Story 4.2). */
  trackedResults: Record<string, ResultView[]>;
  /** The public Tour (Story 5.3) renders findings display-only (no authed response buttons). */
  readOnly?: boolean;
}) {
  const [meterId, setMeter] = useQueryState(SURFACE.meter);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = meterId !== null && meters.some((m) => m.id === meterId);

  // Focus lands on the close button when the drawer opens or switches meter (the dialog
  // announces its meter); Tab cycles within the dialog (aria-modal promises an inert
  // background, so keep keyboard focus inside); Escape closes; body scroll is locked.
  // Focus return on close is left to the browser default (minimal dialog semantics).
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void setMeter(null);
        return;
      }
      if (e.key === "Tab" && dialogRef.current !== null) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (first === undefined || last === undefined) return;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, meterId, setMeter]);

  if (!open) return null;
  const meter = meters.find((m) => m.id === meterId);
  if (meter === undefined) return null; // unreachable after the `open` gate; narrows the type

  const d = toDrawerDetail(meter);
  // Bill-accuracy verification (Story 4.1): render the badge only on a positive
  // match. A miss (verified:false) and an uncheckable bill (null) both render
  // nothing - fail closed, no negative claim about PG&E.
  const verified = verifications[meter.id]?.verified === true;
  // Accepted recommendations tracked against the next bill (Story 4.2, FR-20).
  const meterResults = trackedResults[meter.id] ?? [];
  const meterFindings = findings.filter((f) => f.meterId === meter.id);
  // The rate the header shows: the latest bill's printed tariff first (what PG&E actually
  // billed), falling back to the inventory rate schedule when no reconciled period exists.
  const rateShown = d.latest?.tariff ?? meter.rateSchedule;
  const close = () => void setMeter(null);

  return (
    <div className="fixed inset-0 z-50">
      {/* Scrim: click closes. The close button is the accessible path. */}
      <div aria-hidden onClick={close} className="absolute inset-0 bg-on-surface/25" />

      <div
        key={meter.id}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.dialogLabel(meter.name)}
        className="drawer-in absolute inset-0 flex flex-col overflow-y-auto bg-surface-container-lowest shadow-[var(--shadow-elevated)] md:inset-y-0 md:left-auto md:right-0 md:w-[26rem] md:max-w-full md:rounded-l-[var(--radius-lg)] md:border-l md:border-outline-variant"
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant px-5 pb-4 pt-5">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="type-title min-w-0 max-w-full truncate text-on-surface">
                {meter.name}
              </h2>
              <CoveragePill state={meter.coverageState} />
            </div>
            <p className="type-caption mt-1 text-on-surface-variant">
              {rateShown !== null && rateShown !== "" ? (
                <>
                  {t.rate}: {rateShown}
                  {meter.isLegacy && (
                    <span className="type-label-caps ml-2 rounded-[var(--radius-control)] bg-surface-container-high px-2 py-0.5 text-on-surface-variant">
                      {t.legacyFlag}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {t.rate}: {t.notOnFile}
                </>
              )}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={t.closeAria}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="flex-1 px-5 pb-8">
          {/* Identity rows. */}
          <dl className="mt-4">
            <FieldRow label={t.pumpId} value={meter.growerPumpId} />
            <FieldRow label={t.saId} value={meter.serviceId} />
            <FieldRow label={t.account} value={meter.accountNumber} />
          </dl>

          {/* Billing detail: figures only when reconciled (the gate lives in toDrawerDetail). */}
          <SectionHeader>{t.billingHeader}</SectionHeader>
          {!d.isCovered ? (
            <div className="flex flex-col gap-2">
              <p className="type-body-md text-on-surface-variant">
                {meter.coverageState === "needs_review" ? t.withheldNote : t.noBillNote}
              </p>
              {/* Story 5.3, AC4: a field we could not read is flagged for a second look,
                  never blank-faked. Text + treatment, not color-only. */}
              {meter.coverageState === "needs_review" ? (
                <span className="inline-flex w-fit items-center rounded-[var(--radius-control)] bg-alert-container px-2.5 py-1 type-label-caps text-on-alert-container">
                  {t.confirmIt}
                </span>
              ) : null}
            </div>
          ) : d.latest === null ? (
            <p className="type-body-md text-on-surface-variant">{t.noPeriodNote}</p>
          ) : (
            <>
              <p className="type-caption tnum mb-2 text-on-surface-variant">
                {t.periodRange(formatDate(d.latest.start), formatDate(d.latest.close))}
              </p>

              {d.latest.touRows.length > 0 && (
                <>
                  <p className="type-caption mb-1 text-on-surface-variant">{t.energyHeader}</p>
                  <div className="mb-3">
                    {d.latest.touRows.map((row, i) => (
                      <MoneyRow
                        key={i}
                        label={row.label ?? t.energyRow}
                        cents={row.amountCents}
                        nullLabel={en.shell.table.emptyShort}
                        sub={row.kwh !== null ? t.kwhQty(NUM_FMT.format(row.kwh)) : undefined}
                      />
                    ))}
                  </div>
                </>
              )}

              <MoneyRow
                label={t.demand}
                cents={d.latest.demandCents}
                nullLabel={t.demandNone}
                sub={
                  d.latest.peakKw !== null ? t.peakNote(NUM_FMT.format(d.latest.peakKw)) : undefined
                }
              />

              {d.latest.otherRows.length > 0 && (
                <>
                  <p className="type-caption mb-1 mt-3 text-on-surface-variant">{t.otherHeader}</p>
                  {d.latest.otherRows.map((row, i) => (
                    <MoneyRow
                      key={i}
                      label={row.label ?? t.otherRow}
                      cents={row.amountCents}
                      nullLabel={en.shell.table.emptyShort}
                    />
                  ))}
                </>
              )}

              <div className="mt-3">
                {/* A reconciled period always carries a printed total (a 1.7 invariant); if it
                    ever arrives null, read the no-value dash, never an affirmative "None". */}
                <MoneyRow
                  label={t.total}
                  cents={d.latest.totalCents}
                  nullLabel={en.shell.table.emptyShort}
                  strong
                />
              </div>

              {/* Bill-accuracy verification badge (Story 4.1, FR-19): a calm, info-treatment
                  mark, only when Terra's independent recompute matched the printed total.
                  Icon + text carry the meaning (never color-only); never a severity chip. */}
              {verified && (
                <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container px-3 py-2.5">
                  <BadgeCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="type-label-caps text-on-surface">
                      <span className="sr-only">{t.verifiedAria}</span>
                      {t.verifiedLabel}
                    </p>
                    <p className="type-caption mt-0.5 text-on-surface-variant">{t.verifiedCaption}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Past cycles: only when prior reconciled periods exist (never faked). */}
          {d.history.length > 0 && (
            <>
              <SectionHeader>{t.historyHeader}</SectionHeader>
              <dl>
                {d.history.map((row, i) => (
                  <div
                    // A rebilled cycle can share a close date, so the key carries the index too.
                    key={`${row.close}-${i}`}
                    className="flex items-baseline justify-between gap-4 border-t border-outline-variant py-2 first:border-t-0"
                  >
                    <dt className="type-body-md text-on-surface-variant">{formatDate(row.close)}</dt>
                    <dd className="type-num tnum text-on-surface">{formatUsd(row.totalCents)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {/* Inventory: the farm's own facts. Null fields read "Not on file". */}
          <SectionHeader>{t.inventoryHeader}</SectionHeader>
          <dl>
            <FieldRow label={t.ranch} value={meter.ranchName} />
            <FieldRow label={t.entity} value={meter.entityName} />
            <FieldRow label={t.crop} value={meter.cropName} />
            <FieldRow
              label={t.gpm}
              value={meter.gpm !== null ? t.gpmValue(NUM_FMT.format(meter.gpm)) : null}
            />
            {/* A flagged-BAD pump is the one inventory concern signal: clay + the verbatim word. */}
            <FieldRow label={t.status} value={meter.status} flagged={meter.status === "BAD"} />
            {/* DR enrollment as printed on the bill (Story 3.7): a fact row, info only,
                no savings claim. Absent reads "Not on file" like every inventory fact. */}
            <FieldRow
              label={t.drProgram}
              value={d.drProgram !== null ? t.drProgramName[d.drProgram] : null}
            />
          </dl>
          {d.drProgram !== null && (
            <p className="type-caption mt-1 text-on-surface-variant">{t.drEnrolledNote}</p>
          )}

          {/* Solar / NEM: only for a solar meter (AC2). Absent facts read "Not on file". */}
          {d.showSolar && (
            <>
              <SectionHeader>{t.solarHeader}</SectionHeader>
              <dl>
                <FieldRow label={t.nemProgram} value={d.solar.nemType} />
                <FieldRow
                  label={t.trueUp}
                  value={
                    d.solar.trueUpMonth !== null
                      ? (t.months[d.solar.trueUpMonth - 1] ?? null)
                      : null
                  }
                />
                <FieldRow
                  label={t.nameplate}
                  value={
                    d.solar.solarKw !== null ? t.nameplateValue(NUM_FMT.format(d.solar.solarKw)) : null
                  }
                />
                <FieldRow
                  label={t.arrays}
                  value={
                    d.solar.arrays.length > 0
                      ? d.solar.arrays
                          .map(
                            (a) =>
                              `${a.name ?? t.arrayUnnamed} (${t.nameplateValue(NUM_FMT.format(a.nameplateKw))})`,
                          )
                          .join(", ")
                      : null
                  }
                />
                {/* NEM allocation: a labeled honest absence until Epic 1 persists allocation
                    rows; never a fabricated split (AC2). */}
                <FieldRow label={t.allocation} value={null} />
                {/* Story 3.4: the printed NEM facts. Position/charges come from the persisted
                    statement months; the demand line renders only when reconciled billing
                    shows a demand charge (solar never reduces it). */}
                <FieldRow
                  label={en.solar.insight.drawerPosition}
                  value={
                    d.solar.position !== null
                      ? en.solar.insight.drawerPositionValue[d.solar.position]
                      : null
                  }
                />
                <FieldRow
                  label={en.solar.insight.drawerNemCharges}
                  value={
                    d.solar.nemChargesCents !== null ? signedUsd(d.solar.nemChargesCents) : null
                  }
                />
                <FieldRow
                  label={en.solar.insight.drawerTrueUpAmount}
                  value={
                    d.solar.trueUpAmountCents !== null
                      ? signedUsd(d.solar.trueUpAmountCents)
                      : null
                  }
                />
                {d.solar.demandOwedCents !== null && (
                  <FieldRow
                    label={en.solar.insight.drawerDemandOwed}
                    value={formatUsd(d.solar.demandOwedCents)}
                  />
                )}
              </dl>
            </>
          )}

          {/* What happened (Story 4.2, FR-20): accepted recommendations tracked against
              the next bill. Predicted (frozen at acceptance) and the next bill as two
              facts, or "pending" until a bill posts after acceptance. Never attributed
              savings, never an explanation of the difference. Empty renders nothing. */}
          {meterResults.length > 0 && (
            <>
              <SectionHeader>{t.resultsHeader}</SectionHeader>
              <ul className="flex flex-col gap-3">
                {meterResults.map((r) => {
                  const predicted =
                    r.predictedUsd !== null
                      ? formatUsdWhole(centsFromDollars(r.predictedUsd))
                      : t.resultNoEstimate;
                  const realized = r.actualUsd !== null ? formatUsdWhole(centsFromDollars(r.actualUsd)) : null;
                  return (
                    <li
                      key={r.id}
                      className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-4"
                    >
                      <p className="type-body-md text-on-surface">{r.situation}</p>
                      <dl className="mt-2">
                        <div className="flex items-baseline justify-between gap-4 py-1">
                          <dt className="type-label-caps text-on-surface-variant">{t.resultPredictedLabel}</dt>
                          <dd className="type-num tnum text-on-surface">{predicted}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 py-1">
                          <dt className="type-label-caps text-on-surface-variant">{t.resultRealizedLabel}</dt>
                          <dd
                            className={cn(
                              "type-num tnum",
                              r.isPending ? "text-on-surface-variant/70" : "text-on-surface",
                            )}
                          >
                            {realized ?? t.resultPending}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* This meter's findings (Story 3.1): the same cards as the rail, minus the trace
              affordance (you are already on the meter). Empty reads the calm line. */}
          <SectionHeader>{t.findingsHeader}</SectionHeader>
          {meterFindings.length === 0 ? (
            <p className="type-body-md text-on-surface-variant">{t.findingsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {meterFindings.map((finding) => (
                <li key={finding.id}>
                  <FindingCard finding={finding} showTrace={false} readOnly={readOnly} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
