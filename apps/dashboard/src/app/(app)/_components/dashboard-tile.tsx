"use client";

import { type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  return (
    <Dialog>
      <Card
        asChild
        className={cn(
          "group relative min-h-0 justify-start gap-0 p-4 transition-shadow hover:shadow-[var(--shadow-e3,0_16px_40px_rgba(20,24,40,0.10))]",
          className,
        )}
      >
        <DialogTrigger aria-label={`${label}. Tap to enlarge`} className="text-left">
          <span className="type-label-caps text-on-surface-variant">{label}</span>
          <div className="mt-1 flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
            {children}
          </div>
          <Maximize2
            aria-hidden
            className="absolute right-3 top-3 h-3.5 w-3.5 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100"
          />
        </DialogTrigger>
      </Card>

      <DialogContent
        aria-label={label}
        className="max-w-2xl gap-0 border-outline-variant bg-surface-container-lowest p-5"
      >
        <DialogTitle className="type-title mb-4 text-on-surface">{label}</DialogTitle>
        {detail}
      </DialogContent>
    </Dialog>
  );
}
