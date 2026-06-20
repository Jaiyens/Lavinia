"use client";

import { cn } from "@/lib/cn";

// The allocation share bar (A-5, UX-DR4). A thin {primary}-tinted bar whose WIDTH encodes a meter's
// usage-proportional share of its array. It is a STRUCTURAL primitive: it renders a width from a
// share in [0,1] and NEVER multiplies a percentage by a dollar to imply a credit (FR10). The real
// share value arrives in Epic C; at A-5 the share is null (not computed yet), so the bar renders its
// honest-blank track - an empty rail with no fill and no number - rather than a fabricated zero that
// would read as "dropped". When the real share lands (C-2), the same component fills the rail to the
// share width and the caller renders the percentage beside it (tnum); the credit DOLLAR is a separate
// honest-blank cell, never derived from this bar.

export function AllocationBar({
  share,
  label,
}: {
  /** Usage-weighted share in [0,1]; null = not computed yet (honest-blank, renders an empty rail). */
  share: number | null;
  /** Accessible label naming what the bar measures (the array share for this meter). */
  label: string;
}) {
  const hasShare = share !== null && share >= 0;
  // Clamp to [0,1] defensively; a pure share is already in range, but the bar must never overflow.
  const pct = hasShare ? Math.min(100, Math.max(0, share * 100)) : 0;

  return (
    <div
      role="img"
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
    >
      <div
        aria-hidden
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-[var(--dur-base)] motion-reduce:transition-none",
          !hasShare && "opacity-0",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
