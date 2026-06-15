"use client";

// The before/after bill-shrink: a single column that collapses from the full demand
// charge (the penalty height, red) down to what the bill would have been without the one
// mistimed peak (the green floor). This transition is the pitch. The dollar figure counts
// down in step. Honors prefers-reduced-motion by rendering the final, collapsed state.

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { usd } from "@/copy/en";

const TRACK = 240;
const EASE = [0.16, 1, 0.3, 1] as const;

export function BeforeAfterBar({
  beforeUsd,
  afterUsd,
  beforeLabel,
  afterLabel,
}: {
  beforeUsd: number;
  afterUsd: number;
  beforeLabel: string;
  afterLabel: string;
}) {
  const reduce = useReducedMotion();
  // Safe denominator so the hooks below run unconditionally (the component early-returns
  // after they are declared, never before, to keep hook order stable).
  const safeBefore = beforeUsd > 0 ? beforeUsd : 1;
  const floorH = Math.max((Math.max(afterUsd, 0) / safeBefore) * TRACK, 18);
  const penaltyFull = TRACK - floorH;

  const penaltyH = useMotionValue(reduce ? 0 : penaltyFull);
  const figure = useMotionValue(reduce ? afterUsd : beforeUsd);
  const figureText = useTransform(figure, (v) => usd(v));

  useEffect(() => {
    if (reduce) return;
    const a1 = animate(penaltyH, 0, { duration: 1.1, ease: EASE, delay: 0.3 });
    const a2 = animate(figure, afterUsd, { duration: 1.1, ease: EASE, delay: 0.3 });
    return () => {
      a1.stop();
      a2.stop();
    };
    // beforeUsd/afterUsd are stable per finding; reduce gates the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterUsd, reduce]);

  if (beforeUsd <= 0) return null;

  return (
    <div className="flex items-end gap-6 sm:gap-8">
      <div className="relative w-24 shrink-0 sm:w-28" style={{ height: TRACK }} aria-hidden>
        {/* The floor: what the cycle would have cost anyway. Stays. */}
        <div
          className="bg-green-deep absolute inset-x-0 bottom-0 rounded-b-md"
          style={{ height: floorH }}
        />
        {/* The avoidable penalty: collapses to nothing. */}
        <motion.div
          className="bg-risk absolute inset-x-0 rounded-t-md"
          style={{ height: penaltyH, bottom: floorH }}
        />
      </div>

      <div className="pb-1">
        <motion.span className="figure text-ink text-5xl sm:text-6xl">{figureText}</motion.span>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2.5">
            <span className="bg-risk size-2.5 rounded-sm" />
            <dt className="text-muted">{beforeLabel}</dt>
            <dd className="tnum text-ink ml-auto font-mono">{usd(beforeUsd)}</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="bg-green-deep size-2.5 rounded-sm" />
            <dt className="text-muted">{afterLabel}</dt>
            <dd className="tnum text-ink ml-auto font-mono">{usd(afterUsd)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
