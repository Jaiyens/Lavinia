import { cn } from "@/lib/cn";

// The shared card surface (DESIGN.md `card` primitive, 2026-06-15). Every card in the
// app rests on the lowest warm-paper container at elevation e1 with a hairline. This is
// the soft depth the old flat 1px boxes were missing.
//
// `interactive` adds the feedback layer for clickable cards and rows: the `.lift` hover
// raise to e2, a tactile press, a one-shade-darker hover fill, and the green focus ring.
//
// Returned as a className (not a component) so it composes onto a <div>, <button>, <Link>,
// or <li> without element-type gymnastics, matching the repo's inline-class convention.
export function cardClass({
  interactive = false,
  radius = "lg",
  className,
}: {
  interactive?: boolean;
  radius?: "control" | "lg" | "2xl";
  className?: string;
} = {}): string {
  const radiusClass =
    radius === "control"
      ? "rounded-[var(--radius-control)]"
      : radius === "2xl"
        ? "rounded-[1.25rem]"
        : "rounded-[var(--radius-lg)]";

  return cn(
    "bg-surface-container-lowest shadow-e2",
    radiusClass,
    interactive &&
      "lift cursor-pointer hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    className,
  );
}
