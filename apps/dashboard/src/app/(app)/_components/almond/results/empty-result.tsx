import { Sprout } from "lucide-react";

// The explicit empty state for any crop tool result that found nothing. The gate this track enforces
// requires an empty tool result to render an HONEST empty state — never a blank, never a fabricated
// zero. This is the single component every result switch falls back to (and what EmptyResult /
// unavailable variants render). It only displays the reason the tool returned; it computes nothing.

export function EmptyResult({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-4">
      <Sprout size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
      <p className="type-body-md text-on-surface-variant">{reason}</p>
    </div>
  );
}
