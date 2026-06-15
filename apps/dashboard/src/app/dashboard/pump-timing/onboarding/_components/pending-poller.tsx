"use client";

// The waiting screen's engine. After the grower signs in to PG&E, the provider pulls
// their bills and usage in the background (seconds to a long while on a big first pull).
// This polls the connection state every few seconds, shows honest live progress (how many
// bills have been read of the total), and once everything is ready imports it and moves
// on to the results screen. If the pull stalls on the provider's side, the grower can
// "Continue with what's ready" to import what has landed so far instead of waiting.
// Leaving the page is safe: the pull continues, and returning resumes the poll (or use
// the Resume banner on Connect). This legacy step-list is superseded by the reveal flow.

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import type { Readiness } from "@/lib/onboarding/farm";
import {
  connectionStatusAction,
  continueWithReadyAction,
  finishConnectionAction,
} from "../actions";

const POLL_MS = 5000;
const SLOW_AFTER_MS = 90000;

type Step = {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
  detail?: ReactNode;
};

export function PendingPoller({ farmId }: { farmId: string }) {
  const c = en.onboarding.pending;
  const [status, setStatus] = useState<Readiness | null>(null);
  const [importing, setImporting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the effect first runs (calling Date.now() during render is impure).
  const startedAt = useRef<number>(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    startedAt.current = Date.now();

    async function tick() {
      if (!active) return;
      try {
        const s = await connectionStatusAction(farmId);
        if (!active) return;
        setStatus(s);
        setSlow(Date.now() - startedAt.current > SLOW_AFTER_MS);
        if (s.ready) {
          setImporting(true);
          // Redirects to the results screen on success; false means a transient
          // not-ready, so keep polling.
          const ok = await finishConnectionAction(farmId);
          if (!active) return;
          if (!ok) {
            setImporting(false);
            timer = setTimeout(tick, POLL_MS);
          }
          return;
        }
      } catch {
        if (!active) return;
        setError(c.error);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [farmId, c.error]);

  async function onContinue() {
    setContinuing(true);
    try {
      await continueWithReadyAction(farmId); // redirects on success
    } catch {
      setContinuing(false);
      setError(c.error);
    }
  }

  const bills = status?.bills ?? null;
  const billsDetail: ReactNode =
    bills && bills.total > 0 ? (
      <div className="mt-2 space-y-1.5">
        <p className="text-muted font-mono text-xs tabular-nums">
          {c.billsProgress(bills.usable, bills.total)}
        </p>
        <div className="bg-tint h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-accent h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${Math.round((bills.usable / bills.total) * 100)}%` }}
          />
        </div>
        {bills.unparsed > 0 ? (
          <p className="text-faint text-xs leading-snug text-pretty">{c.billsUnparsed(bills.unparsed)}</p>
        ) : null}
      </div>
    ) : null;

  const steps: Step[] = [
    {
      key: "credentials",
      label: c.stepSignIn,
      done: Boolean(status?.hasCredentials),
      active: !status?.hasCredentials,
    },
    {
      key: "bills",
      label: c.stepBills,
      done: Boolean(status?.billsReady),
      active: Boolean(status?.hasCredentials) && !status?.billsReady,
      detail: billsDetail,
    },
    {
      key: "intervals",
      label: c.stepUsage,
      done: Boolean(status?.intervalsReady),
      active: Boolean(status?.billsReady) && !status?.intervalsReady,
    },
  ];

  // Once any usable bills have landed, let the grower proceed instead of waiting for
  // the full pull (covers a stalled interval pull or a Bayou-side bill parse issue).
  const canContinue = Boolean(
    status?.billsReady && bills && bills.usable > 0 && !importing && !continuing,
  );

  if (error) {
    return (
      <div className="border-border bg-card rounded-2xl border p-6">
        <p className="text-ink-soft text-sm leading-relaxed text-pretty">{error}</p>
        <Link
          href="/dashboard/pump-timing/onboarding"
          className="label-caps text-muted hover:text-foreground mt-4 inline-block transition-colors"
        >
          {c.retry}
        </Link>
      </div>
    );
  }

  return (
    <div className="border-border bg-card rounded-2xl border p-6">
      <ul className="space-y-4">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                step.done
                  ? "bg-accent text-accent-ink"
                  : step.active
                    ? "border-accent animate-pulse border-2"
                    : "border-border border",
              )}
            >
              {step.done ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <span className={cn(step.done || step.active ? "text-foreground" : "text-faint")}>
                {step.label}
              </span>
              {step.detail}
            </div>
          </li>
        ))}
      </ul>

      <p className="text-muted mt-6 text-sm leading-relaxed text-pretty">
        {continuing ? c.continuing : importing ? c.importing : slow ? c.slow : c.waiting}
      </p>

      {canContinue ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={onContinue}
            className="bg-accent text-accent-ink label-caps inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition-opacity hover:opacity-90"
          >
            {c.continueReady} <span aria-hidden>→</span>
          </button>
          <p className="text-faint mt-2 text-xs leading-relaxed text-pretty">{c.continueNote}</p>
        </div>
      ) : null}
    </div>
  );
}
