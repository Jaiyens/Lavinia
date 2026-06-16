import { cn } from "@/lib/cn";

// Loading placeholder (DESIGN.md `skeleton`). A tonal block that matches the final
// element's shape and rhythm, with a slow warm shimmer (see `.skeleton` in globals.css).
// Replaces every spinner so the layout never jumps when data lands. Decorative-only, so
// it is hidden from assistive tech; pair it with an aria-busy region on the live element.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("skeleton rounded-[var(--radius-control)]", className)}
    />
  );
}
