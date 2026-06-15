"use client";

// Recovery boundary for the onboarding routes. A server action that throws (a bad
// payload, a missing field, a transient db error) lands here instead of a dead 500,
// so the farmer can retry the step rather than getting stranded mid-onboarding.

import Link from "next/link";
import { en } from "@/copy/en";

export default function OnboardingError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const e = en.onboarding.error;
  return (
    <main className="flex min-h-[100svh] items-center justify-center px-6">
      <div className="border-border bg-card max-w-md rounded-2xl border p-8 text-center">
        <h1 className="font-display text-2xl text-balance">{e.title}</h1>
        <p className="text-muted mt-3 text-[0.95rem] leading-relaxed text-pretty">{e.body}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="label-caps bg-accent text-accent-ink hover:bg-accent/90 rounded-full px-6 py-3 transition-colors"
          >
            {e.retry}
          </button>
          <Link
            href="/dashboard/pump-timing/onboarding"
            className="label-caps text-muted hover:text-foreground transition-colors"
          >
            {e.startOver}
          </Link>
        </div>
      </div>
    </main>
  );
}
