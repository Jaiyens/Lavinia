"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { en } from "@/copy/en";
import { AlmondAvatar } from "./almond-avatar";
import { useAlmondLauncher } from "./almond-launcher-provider";
import { dismissAlmondNudgeAction } from "../../actions";

// The calm, dismissible first-run nudge (Story 10.2, FR21 / FR22 / UX-DR5). It points the grower at
// Almond once — on their first dashboard view — and never nags: a small, out-of-the-way callout (not a
// modal, no focus trap, does not cover the data), shown only on Home and only when the server says so
// (`show` = a real owner who has not dismissed it). "Show me" opens Almond AND counts as dismissal
// (engaging acknowledges); the X dismisses. Both persist via the server action so it does not reappear.
// It is a polite live region, not a dialog, so it does not steal focus on mount; static by design, so
// it is reduced-motion-safe (NFR7, UX-DR8).
export function AlmondNudge({ show }: { show: boolean }) {
  const pathname = usePathname();
  const { open, openAlmond } = useAlmondLauncher();
  const [hidden, setHidden] = useState(false);

  // Server gate (owner + not dismissed) AND the landing-only placement (Home), plus the optimistic
  // self-hide so dismissal feels instant without waiting on the round-trip. Also hidden whenever the
  // panel is already open (via the FAB or the rail entry): the grower is already in Almond, so the
  // hint would be redundant, and both sit at the same bottom-right anchor — hiding it avoids the overlap.
  if (!show || hidden || open || pathname !== "/") return null;

  function dismiss(): void {
    setHidden(true);
    void dismissAlmondNudgeAction();
  }

  function engage(): void {
    openAlmond();
    dismiss();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-36 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low p-4 shadow-[var(--shadow-elevated)] lg:bottom-24 lg:right-6"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex shrink-0 items-center">
          <AlmondAvatar size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-body-md font-semibold text-on-surface">{en.shell.almond.nudge.title}</p>
          <p className="mt-1 type-caption text-on-surface-variant">{en.shell.almond.nudge.body}</p>
          <button
            type="button"
            onClick={engage}
            className="mt-3 inline-flex h-11 items-center rounded-[var(--radius-control)] bg-primary-container px-4 type-body-md font-medium text-on-primary-container transition-colors hover:opacity-90"
          >
            {en.shell.almond.nudge.cta}
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={en.shell.almond.nudge.dismiss}
          className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
