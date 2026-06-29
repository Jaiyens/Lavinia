"use client";

// The "Sync from Almond Logic" button in the portal header (DEV path for now). Click it and it POSTs
// the dev route to kick off the detached headed crawler, then polls the status file (fast at first,
// then backing off) and shows live progress (apiCallsDone / apiCallsTotal) with a PulseRing, mirroring
// the onboarding PG&E connecting screen. On "done" it revalidates the portal (so the freshly-loaded
// snapshots/deliveries appear) and refreshes the router. The login_required error renders a calm "log
// in again" prompt with a Try again, because the crawler reuses the developer's own browser window.
//
// The status SHAPE is the shared contract (sync-status.ts, type-only import - no Node code here). The
// message field is curated operator copy only; this component never renders a secret.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  isRunning,
  isTerminal,
  type AlmondSyncStatus,
} from "@/lib/almond/sync-status";
import { revalidateAlmondPortalAction } from "../actions";

const DEV_SYNC_URL = "/api/almond/sync/dev";
// Poll fast for the first ~30s (the crawler boots tsx + Playwright, then paces ~40 calls), then back
// off so a long run is not polled to death. Mirrors pge-connecting's fast-window-then-slow cadence.
const POLL_MS = 2500;
const SLOW_POLL_MS = 8000;
const FAST_WINDOW_MS = 30_000;

// Local copy, kept here (not the shared copy file) to stay in scope. Plain operator English, no em
// dashes, no exclamation marks.
const copy = {
  idle: "Sync from Almond Logic",
  starting: "Starting",
  scraping: "Reading Almond Logic",
  loading: "Saving to Terra",
  done: "Synced",
  retry: "Try again",
  loginTitle: "Log in to Almond Logic",
  loginBody:
    "A browser window opened. Sign in to Almond Logic there, then sync again to pull your latest production data.",
  genericTitle: "The sync did not finish",
  genericBody: "Something went wrong while syncing. Your existing data is safe. You can try again.",
};

type DevPostResponse = { status?: AlmondSyncStatus; error?: string };
type DevGetResponse = { status?: AlmondSyncStatus };

export function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<AlmondSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const finishing = useRef(false);

  const running = status !== null && isRunning(status.phase);
  const error = status?.phase === "error";
  const done = status?.phase === "done";

  // Poll loop: only active while a sync is in flight (running). Fast then slow. On a terminal status
  // it stops; "done" triggers a one-time revalidate + router refresh.
  useEffect(() => {
    if (!running) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const start = Date.now();

    async function tick() {
      try {
        const res = await fetch(DEV_SYNC_URL, { method: "GET", cache: "no-store" });
        if (!alive) return;
        const body = (await res.json()) as DevGetResponse;
        if (body.status) setStatus(body.status);
        if (body.status && isTerminal(body.status.phase)) {
          if (body.status.phase === "done" && !finishing.current) {
            finishing.current = true;
            try {
              await revalidateAlmondPortalAction();
              router.refresh();
            } catch {
              // Revalidate failed (network); the sync still landed in the DB. A manual reload shows
              // it. We do not surface this as a sync error because the data IS saved.
            }
          }
          return; // terminal: stop polling
        }
      } catch {
        if (!alive) return;
        // A poll fetch failed (dev server blip). Surface a generic error and stop, with a retry.
        setStatus((s) =>
          s
            ? { ...s, phase: "error", errorKind: "network", message: null }
            : s,
        );
        return;
      }
      const elapsed = Date.now() - start;
      timer = setTimeout(tick, elapsed < FAST_WINDOW_MS ? POLL_MS : SLOW_POLL_MS);
    }

    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [running, pollKey, router]);

  const startSync = useCallback(async () => {
    if (busy || running) return;
    setBusy(true);
    finishing.current = false;
    try {
      const res = await fetch(DEV_SYNC_URL, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as DevPostResponse;
      if (res.status === 409 && body.status) {
        // A sync is already running (e.g. another tab started it): adopt its status and poll.
        setStatus(body.status);
      } else if (res.ok && body.status) {
        setStatus(body.status);
      } else {
        setStatus((s) => ({
          phase: "error",
          startedAt: s?.startedAt ?? Date.now(),
          updatedAt: Date.now(),
          apiCallsDone: 0,
          apiCallsTotal: null,
          snapshots: 0,
          deliveries: 0,
          errorKind: "unknown",
          message: null,
          source: "dev_local",
        }));
      }
      // Nudge the poll effect to (re)start for the new in-flight status.
      setPollKey((k) => k + 1);
    } catch {
      setStatus({
        phase: "error",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        apiCallsDone: 0,
        apiCallsTotal: null,
        snapshots: 0,
        deliveries: 0,
        errorKind: "network",
        message: null,
        source: "dev_local",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, running]);

  // The error panel: a calm prompt below the button. login_required gets the sign-in copy.
  if (error) {
    const isLogin = status?.errorKind === "login_required";
    const title = isLogin ? copy.loginTitle : copy.genericTitle;
    // Prefer the curated server message when present; otherwise the local fallback body.
    const body = status?.message ?? (isLogin ? copy.loginBody : copy.genericBody);
    return (
      <div className="flex flex-col items-end gap-2" role="alert">
        <div className="max-w-xs text-right">
          <p className="type-label-caps text-primary">{title}</p>
          <p className="type-caption mt-0.5 text-on-surface-variant">{body}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void startSync()} disabled={busy}>
          {copy.retry}
        </Button>
      </div>
    );
  }

  const label = running
    ? status?.phase === "loading"
      ? copy.loading
      : status?.phase === "scraping"
        ? copy.scraping
        : copy.starting
    : done
      ? copy.done
      : copy.idle;

  const progress =
    running && status && status.apiCallsTotal
      ? `${status.apiCallsDone}/${status.apiCallsTotal}`
      : null;

  return (
    <div className="flex items-center gap-2">
      {running ? <PulseRing /> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void startSync()}
        disabled={busy || running}
        aria-busy={running}
        aria-live="polite"
      >
        {label}
        {progress ? <span className="ml-1.5 text-on-surface-variant tabular-nums">{progress}</span> : null}
      </Button>
    </div>
  );
}

/** The pulsing spinner ring, the same motion language as the onboarding connecting screen. */
function PulseRing() {
  return (
    <span className="relative flex size-5 items-center justify-center" aria-hidden>
      <span className="absolute inset-0 rounded-full bg-primary/20 [animation:terra-pulse_1.8s_var(--ease-standard)_infinite]" />
      <span className={cn("relative flex size-5 items-center justify-center rounded-full bg-primary/90 text-on-primary")}>
        <svg viewBox="0 0 24 24" className="size-3 [animation:terra-spin_0.8s_linear_infinite]" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <circle cx="12" cy="12" r="9" className="opacity-30" />
          <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
        </svg>
      </span>
    </span>
  );
}
