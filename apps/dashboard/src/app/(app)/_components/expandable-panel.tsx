"use client";

import { type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  return (
    <Dialog>
      <div className={cn("group relative min-h-0", className)}>
        {children}

        {/* Click anywhere on the box to open it full-screen. */}
        <DialogTrigger
          aria-label={`${label}. Open full screen`}
          className="absolute inset-0 z-20 cursor-default rounded-[var(--radius-lg)]"
        />
        {/* A faint expand hint, shown on hover. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface-variant opacity-0 shadow-e2 transition-opacity group-hover:opacity-100"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </div>

      <DialogContent
        aria-label={label}
        className="max-h-[92dvh] max-w-4xl gap-0 border-transparent bg-surface-container-lowest p-5"
      >
        <DialogTitle className="type-title mb-4 text-on-surface">{label}</DialogTitle>
        {modal}
      </DialogContent>
    </Dialog>
  );
}
