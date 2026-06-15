"use client";

// Screen 1, the hook. One serif headline, one button, one quiet line. The button IS
// the PG&E connect trigger (the headless useBayouConnect hook), so connecting is the
// farmer's only required action. A resume link appears only when there is a connection
// in progress to pick back up.

import Link from "next/link";
import { en } from "@/copy/en";
import { useBayouConnect } from "./bayou-connect";

export function Hook({ resumeFarmId }: { resumeFarmId: string | null }) {
  const r = en.onboarding.reveal;
  const { phase, error, start, modal } = useBayouConnect();
  const busy = phase === "starting" || phase === "form" || phase === "hosted";

  return (
    <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-[clamp(2.4rem,7vw,4rem)] leading-[1.05] text-balance">
        {r.hookHeadline}
      </h1>

      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="bg-green-deep hover:bg-green-hover label-caps mt-10 inline-flex items-center gap-2 rounded-full px-8 py-4 text-white transition-colors disabled:opacity-60"
      >
        {phase === "starting" ? r.hookStarting : r.hookCta}
        {phase !== "starting" ? <span aria-hidden>→</span> : null}
      </button>

      <p className="text-muted mt-6 max-w-sm text-sm leading-relaxed text-pretty">{r.hookQuiet}</p>

      {error ? (
        <p className="bg-tint text-ink-soft mt-5 rounded-lg px-3 py-2 text-sm leading-relaxed text-pretty">
          {error}
        </p>
      ) : null}

      {resumeFarmId ? (
        <Link
          href={`/dashboard/pump-timing/onboarding/reveal?farm=${resumeFarmId}`}
          className="label-caps text-muted hover:text-foreground mt-7 transition-colors"
        >
          {r.resume} <span aria-hidden>→</span>
        </Link>
      ) : null}

      {modal}
    </div>
  );
}
