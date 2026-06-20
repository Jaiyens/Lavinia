"use client";

// Route error boundary for the whole authed (app) group: the onboarding flow and the
// dashboard shell. An uncaught render error anywhere below here shows this calm, recoverable
// screen instead of a white page. reset() re-renders the segment so the farmer can try again
// without losing their place. Plain operator English, no em dashes, no exclamation marks.

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log for server-side observability without showing the details to the farmer.
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[100svh] place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <AlertIcon />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="type-display-lg">Something went wrong</h1>
          <p className="type-body-md text-on-surface-variant">
            We ran into a problem loading this page. Your data is safe. You can try again.
          </p>
        </div>

        <button
          type="button"
          onClick={reset}
          className="press inline-flex h-11 w-full max-w-xs items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </main>
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
