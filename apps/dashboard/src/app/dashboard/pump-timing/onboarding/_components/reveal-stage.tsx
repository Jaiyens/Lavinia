"use client";

// Screen 3, the reveal. As the connection lands, lines fade and slide in one by one:
// "Connected to PG&E", the account count, the meter count (a ticking number), then the
// bills filling a determinate bar. On the Speculoos sandbox the whole thing settles in
// a couple of seconds; on a slow real first pull the settled account/meter numbers show
// at once and only the bills line trails, with a "continue with what's ready" affordance.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { en } from "@/copy/en";
import type { RevealCounts } from "@/lib/onboarding/farm";
import { CountUp } from "./count-up";
import { DataBadge } from "./data-badge";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function RevealStage({
  counts,
  slow,
  continuing,
  error,
  onContinue,
}: {
  counts: RevealCounts | null;
  slow: boolean;
  continuing: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  const r = en.onboarding.reveal;
  const reduce = useReducedMotion();

  // One reusable enter transition, collapsed to instant under reduced motion. `index`
  // staggers lines that arrive in the same render (the fast sandbox case).
  const enter = (index: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.5, ease: EASE, delay: reduce ? 0 : index * 0.08 },
  });

  if (error) {
    return (
      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-ink-soft leading-relaxed text-pretty">{error}</p>
        <Link
          href="/dashboard/pump-timing/onboarding"
          className="label-caps text-muted hover:text-foreground mt-6 transition-colors"
        >
          {r.retry}
        </Link>
      </div>
    );
  }

  const badge =
    counts?.dataKind === "sandbox"
      ? r.badgeSandbox
      : counts?.dataKind === "sample"
        ? r.badgeSample
        : null;

  const bills = counts?.bills ?? null;
  const hasBillBar = Boolean(bills && bills.total > 0);

  return (
    <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-6">
      {badge ? (
        <div className="mb-8">
          <DataBadge label={badge} />
        </div>
      ) : null}

      <div className="space-y-6">
        {/* 1. Connected */}
        {counts?.hasCredentials ? (
          <motion.p {...enter(0)} className="font-display text-2xl leading-tight text-balance">
            {r.connected}
          </motion.p>
        ) : (
          <p className="text-muted text-lg text-pretty">{r.signingIn}</p>
        )}

        {/* 2. Accounts */}
        {counts && counts.accounts > 0 ? (
          <motion.p {...enter(1)} className="text-ink-soft text-xl tabular-nums text-pretty">
            {r.accountsFound(counts.accounts)}
          </motion.p>
        ) : null}

        {/* 3. Meters: a real ticking count */}
        {counts && counts.electricMeters > 0 ? (
          <motion.div {...enter(2)} className="flex items-baseline gap-3">
            <CountUp
              value={counts.electricMeters}
              className="font-display text-green-deep text-6xl leading-none tabular-nums"
            />
            <span className="text-muted text-lg">{r.metersWord(counts.electricMeters)}</span>
          </motion.div>
        ) : null}

        {/* 4. Bills, with a determinate bar (never a spinner) */}
        {counts?.billsReady ? (
          <motion.div {...enter(3)}>
            <p className="text-ink-soft text-xl text-pretty">{r.billsPulled}</p>
            {hasBillBar && bills ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-muted font-mono text-xs tabular-nums">
                  {r.billsProgress(bills.usable, bills.total)}
                </p>
                <div className="bg-tint h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-green h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.round((bills.usable / bills.total) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        {counts && counts.gasMeters > 0 ? (
          <p className="text-faint text-sm tabular-nums text-pretty">{r.gasNote(counts.gasMeters)}</p>
        ) : null}
      </div>

      {/* Slow real pull: let the farmer proceed with what has landed. */}
      {slow && !counts?.ready ? (
        <div className="mt-12">
          <p className="text-muted text-sm leading-relaxed text-pretty">{r.slow}</p>
          <button
            type="button"
            onClick={onContinue}
            disabled={continuing}
            className="bg-green-deep hover:bg-green-hover label-caps mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 text-white transition-colors disabled:opacity-60"
          >
            {r.continueReady} <span aria-hidden>→</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
