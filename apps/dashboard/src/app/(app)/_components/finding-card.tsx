"use client";

import { useState, useTransition } from "react";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { SeverityBadge, cardClass } from "@/components/ui";
import { centsFromDollars, formatUsdWhole } from "@/lib/format/money";
import { isSolarBillingFinding, type FindingView } from "@/lib/dashboard/findings";
import { SURFACE } from "@/lib/dashboard/surface";
import { resolveFinding, type FindingResponse } from "../actions";

// The finding card (Story 3.1, FR-13 / UX-DR14): the recommendation grammar rendered
// calmly - situation, one concrete action, the dollar impact in tabular figures, the
// severity badge, and a one-tap response that RECORDS (never executes). Severity carries
// no new color: act gets the clay edge accent, watch reads through the badge's weight,
// info stays muted. The trace affordance writes the canonical nuqs `meter` key, so the
// shared drawer opens and the lenses highlight that meter's row/pin (AC4); inside the
// drawer itself the trace is omitted (you are already on the meter).

const t = en.shell.findings;

export function FindingCard({
  finding,
  showTrace = true,
  readOnly = false,
  mode = "rail",
}: {
  finding: FindingView;
  showTrace?: boolean;
  // The public Tour (Story 5.3) renders findings for the demo farm but has no session, so
  // the one-tap response buttons would fail auth. readOnly hides them: a prospect reads the
  // money story, they do not act.
  readOnly?: boolean;
  // "rail" (default): the Energy findings feed - primary "Add to to-do" parks it, secondary
  // "Dismiss" clears it. "todo": the To-do page - primary "Mark done" resolves it, secondary
  // "Remove" sends it back to dismissed.
  mode?: "rail" | "todo";
}) {
  const [, setMeter] = useQueryState(SURFACE.meter);
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  // Which response is in flight, so only the tapped button reads "Saving".
  const [pendingResponse, setPendingResponse] = useState<FindingResponse | null>(null);

  const respond = (response: FindingResponse) => {
    setFailed(false);
    setPendingResponse(response);
    startTransition(async () => {
      try {
        const result = await resolveFinding(finding.id, response);
        if (!result.ok) setFailed(true);
        // On ok the revalidated shell re-renders without this card; nothing to do here.
      } catch {
        // The invocation itself failed (offline, timeout - a farmer in a truck). Keep
        // the card and show the inline error; never bubble to the error boundary.
        setFailed(true);
      }
    });
  };

  // Dollar impact renders whole-dollar (savings estimates are never cent-exact). The
  // impactNote renders whether or not a dollar is present: for the rate lever it carries
  // the labeled estimate with the rates used and their effective date (FR-14), and for a
  // note-only finding it is the impact line itself. The pure mapping already guarantees
  // at least one of the two exists (AC5).
  const impact =
    finding.impactUsd !== null ? formatUsdWhole(centsFromDollars(finding.impactUsd)) : null;

  // G-2 (FR23, UX-DR11) the honest-dollar separation guard: a solar finding may carry exactly ONE
  // honest dollar - a charge already printed on the bill (the F2 demand-charge gap, whose dollar
  // rides in impactNote, never impactUsd). It is NOT a net-metering credit, which stays honest-blank
  // until a statement settles it. So when this billing dollar renders beside the solar tab's
  // honest-blank credit cells, label it explicitly "On your bill" so the layout can never be read as
  // a composite "solar saved you X". The discriminator is the pure, tested predicate gating on the
  // F2 action kind (review_solar_demand) - NOT severity:info, which the legacy track_trueup NEM2
  // true-up note (still live on the demo farm and the public Tour) also carries and would invert the
  // honesty contract. The energy card path is untouched (energy findings carry a different tool). The
  // chip never colors the card (NFR6: red is reserved for money at stake; this is money owed).
  const showBillingChip = isSolarBillingFinding(finding);

  return (
    <article
      aria-busy={isPending}
      className={cardClass({
        className: cn(
          "p-4 transition-opacity",
          finding.severity === "act" && "border-l-2 border-l-alert",
          // While the response is in flight the card recedes; the revalidated shell then
          // re-renders without it. A visible "saving" beat, not a silent disappear.
          isPending && "opacity-70",
        ),
      })}
    >
      <div className="flex items-center justify-between gap-3">
        <SeverityBadge severity={finding.severity} />
        {impact !== null && (
          <p className="type-num tnum font-medium text-on-surface">{impact}</p>
        )}
      </div>

      <p className="type-body-md mt-3 text-on-surface">{finding.situation}</p>
      {finding.impactNote !== null &&
        (showBillingChip ? (
          // The honest billing dollar (the F2 demand-charge gap) lives in impactNote. Front it with
          // the "On your bill" chip and set it off in its own bordered block so the charge is read as
          // a billing charge, never netted with the net-metering credit (which is honest-blank).
          <div className="mt-2 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low px-3 py-2">
            <span className="type-label-caps inline-flex items-center rounded-[var(--radius-control)] bg-surface-container-high px-2 py-0.5 text-on-surface-variant">
              <span className="sr-only">{en.solar.findingLabel.billingAria}</span>
              {en.solar.findingLabel.billing}
            </span>
            <p className="type-caption mt-1.5 text-on-surface-variant">{finding.impactNote}</p>
          </div>
        ) : (
          <p className="type-caption mt-1 text-on-surface-variant">{finding.impactNote}</p>
        ))}

      {/* The one concrete action (displayed today, executable later). */}
      <p className="type-body-md mt-2 font-medium text-on-surface">
        {finding.actionLabel ?? t.actionFallback}
      </p>

      {/* The closed-loop result, once Epic 4 fills it in. */}
      {finding.resultNote !== null && (
        <p className="type-caption mt-2 text-on-surface-variant">
          <span className="type-label-caps mr-1.5">{t.resultLabel}</span>
          {finding.resultNote}
        </p>
      )}

      {showTrace && finding.meterId !== null && finding.meterName !== null && (
        <button
          type="button"
          onClick={() => void setMeter(finding.meterId)}
          aria-label={t.traceAria(finding.meterName)}
          className="mt-2 min-h-[44px] type-body-md text-primary transition-colors hover:text-on-surface"
        >
          {t.trace(finding.meterName)}
        </button>
      )}

      {!readOnly &&
        (() => {
          // The primary action differs by surface: on the rail it PARKS the finding ("todo"); on the
          // To-do page it RESOLVES it ("done"). The secondary is always "dismissed" (Dismiss / Remove).
          const primaryResponse: FindingResponse = mode === "todo" ? "done" : "todo";
          const primaryLabel = mode === "todo" ? en.todos.markDone : t.respondDone;
          const secondaryLabel = mode === "todo" ? en.todos.remove : t.respondDismiss;
          return (
            <div className="mt-3 flex items-center gap-2 border-t border-outline-variant pt-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => respond(primaryResponse)}
                className="press min-h-[44px] flex-1 whitespace-nowrap rounded-[var(--radius-control)] bg-primary px-2.5 type-body-md font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isPending && pendingResponse === primaryResponse ? t.saving : primaryLabel}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => respond("dismissed")}
                className="press min-h-[44px] flex-1 whitespace-nowrap rounded-[var(--radius-control)] px-2.5 type-body-md text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-60"
              >
                {isPending && pendingResponse === "dismissed" ? t.saving : secondaryLabel}
              </button>
            </div>
          );
        })()}
      {!readOnly && failed && (
        <p role="alert" className="type-caption mt-2 text-alert">
          {t.respondError}
        </p>
      )}
    </article>
  );
}
