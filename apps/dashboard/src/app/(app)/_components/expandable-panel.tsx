"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";

// Wraps a dashboard widget so it shows inline as a preview AND pops up full-size when clicked
// ANYWHERE on the box. A transparent full-cover button captures the click (so the grower can tap
// anywhere), and the full, interactive widget lives in the modal. The drag handle (rendered by the
// bento cell at a higher z-index) still sits above this overlay, so rearranging keeps working.
export function ExpandablePanel({
  label,
  className,
  children,
  modal,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  modal: ReactNode;
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
    <div className={cn("group relative min-h-0", className)}>
      {children}

      {/* Click anywhere on the box to open it full-screen. */}
      <button
        type="button"
        aria-label={`${label}. Open full screen`}
        onClick={() => setOpen(true)}
        className="absolute inset-0 z-20 cursor-default rounded-[var(--radius-lg)]"
      />
      {/* A faint expand hint, shown on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface-variant opacity-0 shadow-e2 transition-opacity group-hover:opacity-100"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </span>

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
            className="relative z-10 max-h-[92dvh] w-full max-w-4xl overflow-auto rounded-[var(--radius-lg)] bg-surface-container-lowest p-5 shadow-[var(--shadow-e4,0_24px_56px_rgba(20,24,40,0.16))] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
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
            {modal}
          </div>
        </div>
      )}
    </div>
  );
}
