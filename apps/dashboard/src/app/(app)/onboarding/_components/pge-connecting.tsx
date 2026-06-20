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
import { finishPgeConnectAction, pgeRevealAction } from "../actions";
import type { RevealCounts } from "@/lib/onboarding/farm";

const t = en.connect.connecting;
const POLL_MS = 2500;
// Cap the poll so a hung or never-finished PG&E connect cannot strand the grower forever.
// ~3.5 minutes at the poll interval; after this we show a calm, recoverable error state.
const MAX_POLL_MS = 210_000;
const MAX_ATTEMPTS = Math.ceil(MAX_POLL_MS / POLL_MS);

// Local copy for the timeout / network error state. Kept here (not in the shared copy file)
// to stay within this file's scope; plain operator English, no em dashes, no exclamation
// marks, matching the connecting block.
const errorCopy = {
  timeoutTitle: "This is taking longer than expected",
  timeoutBody:
    "We have not heard back from PG&E yet. Make sure you finished signing in and chose the accounts to share, then try again.",
  networkTitle: "We hit a snag",
  networkBody:
    "Something went wrong while pulling your data. Your progress is safe. You can try again.",
  retry: "Try again",
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

  const finish = useCallback(
    async (force: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setFinishing(true);
      try {
        const ok = await finishPgeConnectAction(farmId, force ? { force: true } : undefined);
        if (ok) {
          router.push(`/onboarding/confirm?farm=${farmId}`);
          router.refresh();
        } else {
          // Not ready after all: resume polling.
          finished.current = false;
          setFinishing(false);
        }
      } catch {
        // The import call failed (network or server error). Surface the calm error state
        // instead of crashing or hanging; the grower can retry.
        finished.current = false;
        setFinishing(false);
        setErrorKind("network");
      }
    },
    [farmId, router],
  );

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
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
          void finish(false);
          return;
        }
      } catch {
        // A poll fetch failed (network blip or server error). Stop polling and show the
        // calm error state with a retry instead of crashing or spinning forever.
        if (!alive) return;
        setErrorKind("network");
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        // The connect never reported ready within the cap. Stop and let the grower retry
        // or go back, rather than spinning indefinitely.
        if (!alive) return;
        setErrorKind("timeout");
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    }
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [farmId, finish, retryKey]);

  const retry = useCallback(() => {
    // Clear the error and restart the poll loop from scratch via the retryKey dependency.
    finished.current = false;
    setErrorKind(null);
    setFinishing(false);
    setRetryKey((k) => k + 1);
  }, []);

  if (errorKind) {
    return <ConnectError kind={errorKind} farmId={farmId} reopenUrl={reopenUrl} onRetry={retry} />;
  }

  const accounts = counts?.accounts ?? 0;
  const meters = counts?.electricMeters ?? 0;
  const landed = accounts > 0 || meters > 0;
  const phase = finishing ? "finishing" : landed ? "working" : "waiting";

  return (
    <div className="flex flex-col items-center gap-7 text-center">
      <PulseRing active={phase !== "finishing"} done={finishing} />

      <div className="flex flex-col gap-2">
        <h1 className="type-display-lg">{t.title}</h1>
        <p className="type-body-md mx-auto max-w-sm text-on-surface-variant">
          {phase === "finishing" ? t.finishing : landed ? t.working : t.waiting}
        </p>
      </div>

      {landed ? (
        <div className="flex items-stretch gap-3">
          <Stat value={accounts} label={accounts === 1 ? "account" : "accounts"} />
          <Stat value={meters} label={meters === 1 ? "meter" : "meters"} />
        </div>
      ) : null}

      <div className="flex w-full flex-col items-center gap-3">
        {landed && !finishing ? (
          <button
            type="button"
            onClick={() => void finish(true)}
            className="press inline-flex h-11 w-full max-w-xs items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary/90"
          >
            {t.continueReady}
          </button>
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
  onRetry,
}: {
  kind: "timeout" | "network";
  farmId: string;
  reopenUrl: string | null;
  onRetry: () => void;
}) {
  const title = kind === "timeout" ? errorCopy.timeoutTitle : errorCopy.networkTitle;
  const body = kind === "timeout" ? errorCopy.timeoutBody : errorCopy.networkBody;
  return (
    <div className="flex flex-col items-center gap-7 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <AlertIcon />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="type-display-lg">{title}</h1>
        <p className="type-body-md mx-auto max-w-sm text-on-surface-variant">{body}</p>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="press inline-flex h-11 w-full max-w-xs items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary/90"
        >
          {errorCopy.retry}
        </button>

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
