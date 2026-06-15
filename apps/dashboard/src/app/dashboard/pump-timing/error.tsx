"use client";

// Error boundary for the dashboard views. The onboarding subtree has its own error.tsx,
// which is more specific and takes precedence there, so this covers the home, drill, and
// detail pages. Plain, calm, reassuring: the data is safe, try again.

import { useEffect } from "react";
import { en } from "@/copy/en";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for server logs / observability without leaking details to the farmer.
    console.error(error);
  }, [error]);

  const s = en.dashboard.state;
  return (
    <main className="grid min-h-[100svh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-balance">{s.errorTitle}</h1>
        <p className="text-muted mt-3 leading-relaxed text-pretty">{s.errorBody}</p>
        <button
          type="button"
          onClick={reset}
          className="label-caps bg-green-deep hover:bg-green-hover mt-6 inline-flex rounded-full px-6 py-3 text-white transition-colors"
        >
          {s.retry}
        </button>
      </div>
    </main>
  );
}
