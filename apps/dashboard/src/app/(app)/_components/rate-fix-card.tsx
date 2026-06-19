"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import { BorderBeam } from "@/components/ui/border-beam";
import { centsFromDollars, formatUsdWhole } from "@/lib/format/money";
import type { FindingView } from "@/lib/dashboard/findings";
import { resolveFinding, type FindingResponse } from "../actions";

// The Home "Rate Fix" hero (the conversion moment, from the Carson/Maya/Sally relay): one named
// pump, one dollar, "nothing changes." Inverted from a normal FindingCard - the pump name and the
// saving lead, no severity badge (this is always an opportunity, never an alarm). The same card
// shows the resolved "What happened" state once a result is attached (the trust loop over time).
// Honest empty state when no meter is mis-rated. Built on the same resolveFinding action the rail
// uses; the trace navigates to the meter's detail on the Energy surface.

const t = en.home.rateFix;
const GREEN = "#2fa84f";
const GOLD = "#f2c14e";

export function RateFixCard({
  finding,
  energyHref,
  readOnly = false,
}: {
  finding: FindingView | null;
  energyHref: string;
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  // Honest empty state: every pump already on its best rate (or none loaded yet).
  if (finding === null) {
    return (
      <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
            <Zap size={16} aria-hidden />
          </span>
          <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
        </div>
        <p className="type-title mt-3 text-on-surface">{t.emptyTitle}</p>
        <p className="type-body-md mt-1 text-on-surface-variant">{t.emptyBody}</p>
      </section>
    );
  }

  const cents = finding.impactUsd !== null ? centsFromDollars(finding.impactUsd) : null;
  const resolved = finding.resultNote !== null;

  const respond = (response: FindingResponse) => {
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await resolveFinding(finding.id, response);
        if (!result.ok) setFailed(true);
        // On ok the revalidated shell re-renders with the next rate finding (or the empty state).
      } catch {
        setFailed(true);
      }
    });
  };

  return (
    <section
      aria-busy={isPending}
      className={cardClass({
        radius: "2xl",
        className: cn("relative flex flex-col overflow-hidden p-6", isPending && "opacity-70"),
      })}
    >
      {/* The one flourish: a green border beam on entrance (idle after), dropped under reduced motion. */}
      {!resolved && <BorderBeam size={140} duration={9} colorFrom={GREEN} colorTo={GOLD} />}

      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
          <Zap size={16} aria-hidden />
        </span>
        <span className="type-label-caps text-on-surface-variant">
          {resolved ? t.whatHappenedLabel : t.biggestEyebrow}
        </span>
      </div>

      <h2 className="type-headline mt-3 text-on-surface">{finding.meterName ?? "This pump"}</h2>

      {resolved ? (
        <p className="type-body-lg mt-2 text-on-surface">{finding.resultNote}</p>
      ) : (
        <>
          {/* Lead with plain meaning, not the rate code. */}
          <p className="type-body-md mt-1 text-on-surface">{t.plainLead}</p>

          {cents !== null && cents > 0 && (
            <>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="type-money-hero tnum text-money-positive">
                  {formatUsdWhole(cents)}
                </span>
                <span className="type-title text-on-surface-variant">{t.perYear}</span>
              </div>
              {/* Honesty hedge: the number is an estimate from the grower's own bills, not a promise. */}
              <p className="type-caption mt-1 text-on-surface-variant">{t.estimateNote}</p>
            </>
          )}

          {/* The rate codes demoted to small, secondary verification detail (AG-B -> AG-C). */}
          <p className="type-caption mt-2 text-on-surface-variant">
            {finding.situation}
            {finding.actionLabel ? ` ${finding.actionLabel}` : ""}
          </p>

          {finding.meterId !== null && (
            <Link
              href={`${energyHref}?meter=${finding.meterId}`}
              className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 type-body-md text-primary transition-colors hover:text-on-surface"
            >
              {t.trace}
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}

          {!readOnly && (
            <div className="mt-4 flex items-center gap-3 border-t border-outline-variant pt-4">
              <button
                type="button"
                disabled={isPending}
                onClick={() => respond("done")}
                className="press min-h-[44px] flex-1 rounded-[var(--radius-control)] bg-primary px-4 type-body-md font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isPending ? t.saving : t.done}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => respond("dismissed")}
                className="min-h-[44px] px-2 type-body-sm text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-60"
              >
                {t.notNow}
              </button>
            </div>
          )}
          {!readOnly && failed && (
            <p role="alert" className="type-caption mt-2 text-alert">
              {en.shell.findings.respondError}
            </p>
          )}
        </>
      )}
    </section>
  );
}
