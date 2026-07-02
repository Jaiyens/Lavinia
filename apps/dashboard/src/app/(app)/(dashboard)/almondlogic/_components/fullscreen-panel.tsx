"use client";

// A reusable wrapper that adds a "Full screen" toggle above wide tables. Collapsed, it renders its
// children in place with a small toggle in the top-right. Expanded, it renders them in an overlay that
// fills the viewport (the whole point: these worksheet tables are wider than the content column).
//
// The overlay is rendered through a PORTAL to document.body. `position: fixed` is contained by any
// ancestor with a `transform` (the Reveal animation wrapper has one), which would otherwise trap the
// overlay inside the content column instead of covering the screen. Portaling to body escapes that.
// Esc exits; body scroll is locked while open.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";

export function FullscreenPanel({
  label,
  children,
  className,
}: {
  /** short name of what is being shown, e.g. "Crop position" (used in the button aria + the header). */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Esc to exit + lock the page scroll while the overlay is open.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  const toggle = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-label={expanded ? en.crops.worksheet.fullscreenExitAria : en.crops.worksheet.fullscreenAria(label)}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-outline-variant bg-surface px-2.5 py-1.5 type-label-caps text-on-surface-variant transition-colors hover:text-on-surface"
    >
      {expanded ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
      {expanded ? en.crops.worksheet.fullscreenExit : en.crops.worksheet.fullscreen}
    </button>
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex justify-end">{toggle}</div>
      {/* Children live here when collapsed; when expanded they move into the portal overlay. The
          portal only renders after a client click (expanded starts false), so document.body is always
          available and there is no SSR/hydration mismatch. */}
      {!expanded && children}
      {expanded && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex flex-col bg-surface p-4 lg:p-6">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="type-headline text-on-surface">{label}</h2>
                {toggle}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
