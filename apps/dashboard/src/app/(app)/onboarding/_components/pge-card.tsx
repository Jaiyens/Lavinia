"use client";

// The primary source: a live PG&E connection. Clicking it asks the server to create a
// UtilityAPI hosted authorization form, opens that page in a new tab (the grower signs in
// to PG&E and picks accounts THERE, their password never touches Terra), and moves this tab
// to the connecting screen, which polls until the meters and bills land.
//
// The new tab is opened SYNCHRONOUSLY in the click handler (as about:blank) so the popup
// blocker allows it; once the server returns the form url we point the tab at it. If the
// browser still blocked the tab, we fall back to a plain window.open after the await.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { en } from "@/copy/en";
import { startPgeConnectAction } from "../actions";

const t = en.connect.picker;

export function PgeCard({ farmId }: { farmId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function connect() {
    setError(null);
    // Open the tab inside the user gesture so it is not blocked; we set its url once the
    // form exists. Not noopener: we need the handle to navigate it.
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const res = await startPgeConnectAction(farmId);
      if (!res.ok) {
        tab?.close();
        setError(res.error);
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = res.formUrl;
      } else {
        window.open(res.formUrl, "_blank", "noopener,noreferrer");
      }
      // Stash the form url so the connecting screen can reopen the sign-in if the grower
      // lost the tab, without minting a fresh form (which would orphan a started auth).
      try {
        sessionStorage.setItem(`pge-form-${farmId}`, res.formUrl);
      } catch {
        // sessionStorage can throw in private mode; the reopen link just won't show.
      }
      router.push(`/onboarding/connecting?farm=${farmId}`);
    });
  }

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-primary/30 bg-primary-container/40 p-5 shadow-e1">
      <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-on-primary">
        {t.pgeRecommended}
      </span>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
          <BoltIcon />
        </span>
        <div className="flex flex-col gap-1 pr-16">
          <h2 className="type-title">{t.pgeTitle}</h2>
          <p className="type-body-md text-on-surface-variant">{t.pgeBody}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={connect}
        disabled={pending}
        className="press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? (
          <>
            <Spinner /> {t.pgeStarting}
          </>
        ) : (
          <>
            {t.pgeCta} <ArrowIcon />
          </>
        )}
      </button>

      <p className="type-caption mt-3 flex items-start gap-1.5 text-on-surface-variant">
        <LockIcon /> <span>{t.pgeSecure}</span>
      </p>

      {error ? (
        <p className="type-caption mt-3 rounded-[var(--radius-control)] bg-alert-container px-3 py-2 font-medium text-on-alert-container">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-px size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 [animation:terra-spin_0.7s_linear_infinite]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
