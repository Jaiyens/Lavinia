"use client";

// Screen 4, the finding. One number is the hero: the dollar this connection just found,
// set in the display serif. One situation line, one action line, a single CTA to save.
// A real PG&E ag finding shows unbadged; the Speculoos sandbox (residential, no ag rate
// finding) falls back to the demo farm's finding, badged so it reads as an example.

import { en, usd } from "@/copy/en";
import type { RevealFinish } from "../actions";
import { DataBadge } from "./data-badge";

export function FindingStage({
  finish,
  onNext,
}: {
  finish: RevealFinish;
  onNext: () => void;
}) {
  const r = en.onboarding.reveal;
  const f = finish.finding;

  return (
    <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-lg flex-col justify-center px-6">
      {finish.sample && f ? (
        <div className="mb-6">
          <DataBadge label={r.badgeSampleFinding} />
        </div>
      ) : null}

      {f ? (
        <>
          <span className="label-caps text-green mb-4">{r.findingKicker}</span>

          {f.impactUsd != null ? (
            <p className="leading-none text-balance">
              <span className="font-display text-green-deep text-7xl tabular-nums sm:text-8xl">
                {usd(f.impactUsd)}
              </span>
              <span className="text-muted ml-3 text-lg">{r.perYear}</span>
            </p>
          ) : null}

          <p className="text-foreground mt-7 text-lg leading-relaxed text-pretty">{f.situation}</p>

          {f.actionLabel ? (
            <p className="text-foreground/80 mt-4 font-medium text-pretty">{f.actionLabel}</p>
          ) : null}
        </>
      ) : (
        <p className="text-foreground text-xl leading-relaxed text-pretty">{r.noFinding}</p>
      )}

      <div className="mt-12">
        <button
          type="button"
          onClick={onNext}
          className="bg-green-deep hover:bg-green-hover label-caps inline-flex items-center gap-2 rounded-full px-8 py-4 text-white transition-colors"
        >
          {r.findingCta} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
