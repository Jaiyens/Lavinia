"use client";

// The connecting screen. The grower is signing in to PG&E in the other tab; here we poll
// the live pull every few seconds and show what has landed (accounts, then meters). The
// moment the data is ready we import it into the farm and move on to review. A grower whose
// account is slow can "continue with what is ready" so they are never stranded.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { finishPgeConnectAction, pgeRevealAction } from "../actions";
import type { RevealCounts } from "@/lib/onboarding/farm";

const t = en.connect.connecting;
// Poll fast for the first minute (most connects land quickly), then back off so a large
// first pull (Batth runs ~183 meters, which PG&E can take a long time to assemble) does not
// hammer the server with hundreds of rapid polls while it works.
const POLL_MS = 2500;
const SLOW_POLL_MS = 15_000;
const FAST_WINDOW_MS = 60_000;
// Only after ~30 minutes of no "ready" do we show the calm, recoverable state. A big first
// pull can legitimately take much longer, so that screen lets the grower keep waiting,
// continue with what has landed, or leave and come back (the pull resumes server-side).
const MAX_POLL_MS = 1_800_000;

// Local copy for the timeout / network error state. Kept here (not in the shared copy file)
// to stay within this file's scope; plain operator English, no em dashes, no exclamation
// marks, matching the connecting block.
const errorCopy = {
  timeoutTitle: "This is taking a while",
  timeoutBody:
    "A large account with many meters can take PG&E a long time to assemble, sometimes much longer. Your progress is saved. You can keep waiting, continue with what has landed so far, or leave and come back later to pick up where this left off. If you have not finished signing in to PG&E, do that and try again.",
  networkTitle: "We hit a snag",
  networkBody:
    "Something went wrong while pulling your data. Your progress is safe. You can try again.",
  retry: "Try again",
  keepWaiting: "Keep waiting",
};

export function PgeConnecting({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [counts, setCounts] = useState<RevealCounts | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [reopenUrl, setReopenUrl] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"timeout" | "network" | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const finished = useRef(false);
  const reopenLoaded = useRef(false);

  // Returns true when the connection finalized and we navigated away; false when the pull is
  // not actually ready yet (so the caller resumes polling) or the import failed.
  const finish = useCallback(
    async (force: boolean): Promise<boolean> => {
      if (finished.current) return false;
      finished.current = true;
      setFinishing(true);
      try {
        const res = await finishPgeConnectAction(farmId, force ? { force: true } : undefined);
        if (res.ok) {
          // Stash any partial-connect note (an account not shared, a meter without history) so
          // the confirm step can be honest about it rather than presenting the subset as whole.
          if (res.note) {
            try {
              sessionStorage.setItem(`pge-note-${farmId}`, res.note);
            } catch {
              // sessionStorage unavailable (private mode); the note just won't show.
            }
          }
          router.push(`/onboarding/confirm?farm=${farmId}`);
          router.refresh();
          return true;
        }
        // Readiness reported ready but no usable history landed yet (e.g. the per-meter Green
        // Button exports have not arrived): release the latch so the poll loop keeps waiting.
        finished.current = false;
        setFinishing(false);
        return false;
      } catch {
        // The import call failed (network or server error). Surface the calm error state
        // instead of crashing or hanging; the grower can retry.
        finished.current = false;
        setFinishing(false);
        setErrorKind("network");
        return false;
      }
    },
    [farmId, router],
  );

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const start = Date.now();
    async function tick() {
      // Read the stashed form url for the "reopen sign-in" link on the first pass. Done
      // here (client only) so server and first client render agree, with no sessionStorage
      // on the server.
      if (!reopenLoaded.current) {
        reopenLoaded.current = true;
        try {
          const url = sessionStorage.getItem(`pge-form-${farmId}`);
          if (url) setReopenUrl(url);
        } catch {
          // sessionStorage unavailable (private mode); the reopen link stays hidden.
        }
      }
      try {
        const c = await pgeRevealAction(farmId);
        if (!alive) return;
        if (c) setCounts(c);
        if (c?.ready && !finished.current) {
          // Try to finalize. If it navigates away we are done; if it comes back false the pull
          // is not truly ready yet, so fall through and schedule the next poll (the retry is
          // throttled to the poll cadence, and `start` is preserved so the cap still fires).
          // This is the fix for the dead-stop where a not-ready finish skipped the setTimeout
          // and polling never resumed.
          const done = await finish(false);
          if (!alive || done) return;
        }
      } catch {
        // A poll fetch failed (network blip or server error). Stop polling and show the
        // calm error state with a retry instead of crashing or spinning forever.
        if (!alive) return;
        setErrorKind("network");
        return;
      }
      const elapsed = Date.now() - start;
      if (elapsed >= MAX_POLL_MS) {
        // No "ready" within the cap. Show the calm, recoverable state where the grower can
        // keep waiting, continue with what landed, or leave and resume later.
        if (!alive) return;
        setErrorKind("timeout");
        return;
      }
      // Fast for the first minute, then back off so a long pull is not polled to death.
      timer = setTimeout(tick, elapsed < FAST_WINDOW_MS ? POLL_MS : SLOW_POLL_MS);
    }
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [farmId, finish, retryKey]);

  const retry = useCallback(() => {
    // Clear the error and restart the poll loop from scratch via the retryKey dependency.
    // For the timeout state this is "keep waiting": the poll resumes from the top.
    finished.current = false;
    setErrorKind(null);
    setFinishing(false);
    setRetryKey((k) => k + 1);
  }, []);

  const continueReady = useCallback(() => {
    // From the timeout state: import whatever has landed so far rather than wait longer.
    setErrorKind(null);
    void finish(true);
  }, [finish]);

  if (errorKind) {
    return (
      <ConnectError
        kind={errorKind}
        farmId={farmId}
        reopenUrl={reopenUrl}
        counts={counts}
        onRetry={retry}
        onContinue={continueReady}
      />
    );
  }

  const accounts = counts?.accounts ?? 0;
  const meters = counts?.electricMeters ?? 0;
  const landed = accounts > 0 || meters > 0;
  const phase = finishing ? "finishing" : landed ? "working" : "waiting";

  return (
    <div className="flex flex-col items-center gap-7 text-center" aria-busy={phase === "finishing"}>
      <PulseRing active={phase !== "finishing"} done={finishing} />

      <div className="flex flex-col gap-2">
        <h1 className="type-display-lg">{t.title}</h1>
        {/* Live region: a screen reader hears the status change (waiting -> working ->
            finishing) and the running account/meter counts as the pull lands, instead of a
            silent spinner. */}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="type-body-md mx-auto max-w-sm text-on-surface-variant"
        >
          {phase === "finishing" ? t.finishing : landed ? t.working : t.waiting}
        </p>
      </div>

      {landed ? (
        <div className="flex items-stretch gap-3" aria-live="polite" aria-atomic="true">
          <Stat value={accounts} label={accounts === 1 ? "account" : "accounts"} />
          <Stat value={meters} label={meters === 1 ? "meter" : "meters"} />
        </div>
      ) : null}

      <div className="flex w-full flex-col items-center gap-3">
        {landed && !finishing ? (
          <Button
            type="button"
            onClick={() => void finish(true)}
            className="press h-11 w-full max-w-xs rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary/90"
          >
            {t.continueReady}
          </Button>
        ) : null}

        {reopenUrl && !finishing ? (
          <a
            href={reopenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="type-caption font-semibold text-primary hover:underline"
          >
            {t.reopen}
          </a>
        ) : null}

        {!finishing ? (
          <Link
            href={`/onboarding/connect?farm=${farmId}`}
            className="type-caption text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
          >
            {t.trouble}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ConnectError({
  kind,
  farmId,
  reopenUrl,
  counts,
  onRetry,
  onContinue,
}: {
  kind: "timeout" | "network";
  farmId: string;
  reopenUrl: string | null;
  counts: RevealCounts | null;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const title = kind === "timeout" ? errorCopy.timeoutTitle : errorCopy.networkTitle;
  const body = kind === "timeout" ? errorCopy.timeoutBody : errorCopy.networkBody;
  // On a timeout where something already landed, let the grower import what is ready rather
  // than discard a near-complete pull (a large Batth connect may cross the cap with most
  // meters in hand).
  const landed = (counts?.accounts ?? 0) > 0 || (counts?.electricMeters ?? 0) > 0;
  const showContinue = kind === "timeout" && landed;
  return (
    <div className="flex flex-col items-center gap-7 text-center" role="alert">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <AlertIcon />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="type-display-lg">{title}</h1>
        <p className="type-body-md mx-auto max-w-sm text-on-surface-variant">{body}</p>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        {showContinue ? (
          <Button
            type="button"
            onClick={onContinue}
            className="press h-11 w-full max-w-xs rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary/90"
          >
            {t.continueReady}
          </Button>
        ) : null}

        <Button
          type="button"
          onClick={onRetry}
          className={cn(
            "press h-11 w-full max-w-xs rounded-[var(--radius-control)] px-6 font-semibold transition-colors",
            showContinue
              ? "border border-outline-variant text-on-surface hover:bg-surface-container"
              : "bg-primary text-on-primary hover:bg-primary/90",
          )}
        >
          {kind === "timeout" ? errorCopy.keepWaiting : errorCopy.retry}
        </Button>

        {reopenUrl ? (
          <a
            href={reopenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="type-caption font-semibold text-primary hover:underline"
          >
            {t.reopen}
          </a>
        ) : null}

        <Link
          href={`/onboarding/connect?farm=${farmId}`}
          className="type-caption text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
        >
          {t.trouble}
        </Link>
      </div>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-24 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest px-5 py-4 shadow-e1">
      <div className="type-money-hero text-[2rem] leading-none text-on-surface">{value}</div>
      <div className="type-caption mt-1 text-on-surface-variant">{label}</div>
    </div>
  );
}

function PulseRing({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span className="relative flex size-16 items-center justify-center">
      {active ? (
        <span className="absolute inset-0 rounded-full bg-primary/20 [animation:terra-pulse_1.8s_var(--ease-standard)_infinite]" />
      ) : null}
      <span
        className={cn(
          "relative flex size-16 items-center justify-center rounded-full text-on-primary",
          done ? "bg-primary" : "bg-primary/90",
        )}
      >
        {done ? <CheckIcon /> : <Spinner />}
      </span>
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 [animation:terra-spin_0.8s_linear_infinite]" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <circle cx="12" cy="12" r="9" className="opacity-30" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
