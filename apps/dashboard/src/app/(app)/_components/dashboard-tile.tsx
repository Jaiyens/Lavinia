"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Card } from "@/components/ui";

// A bento dashboard tile: a compact square showing a summary at a glance. Click (or Enter) to
// ENLARGE it into a modal with the full detail. The home is a grid of these so the farmer sees
// everything without scrolling, and taps any square for more. `detail` is the enlarged content
// (a fuller card), passed in from the server component so each tile owns its own deep view.

export function DashboardTile({
  label,
  children,
  detail,
  className,
}: {
  label: string;
  children: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Card
        asChild
        className={cn(
          "group relative min-h-0 justify-start gap-0 p-4 transition-shadow hover:shadow-[var(--shadow-e3,0_16px_40px_rgba(20,24,40,0.10))]",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${label}. Tap to enlarge`}
          className="text-left"
        >
          <span className="type-label-caps text-on-surface-variant">{label}</span>
          <div className="mt-1 flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
            {children}
          </div>
          <Maximize2
            aria-hidden
            className="absolute right-3 top-3 h-3.5 w-3.5 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={en.shell.drawer.close}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-inverse-surface/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="relative z-10 max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-5 shadow-[var(--shadow-e4,0_24px_56px_rgba(20,25,15,0.16))] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="type-title text-on-surface">{label}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={en.shell.drawer.close}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-control)] text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {detail}
          </div>
        </div>
      )}
    </>
  );
}
