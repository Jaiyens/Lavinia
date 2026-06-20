"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { en } from "@/copy/en";
import { BorderBeam } from "@/components/ui/border-beam";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondPanel } from "./almond-panel";
import { useAlmondChat, ZERO_WIDTH_SPACE } from "./almond-launcher-provider";

const t = en.shell.almond;

/**
 * Almond's floating quick-ask launcher: a corner FAB on every (app) screen that opens the chat
 * PANEL. The conversation itself now lives in `AlmondChatProvider` (so the panel and the dedicated
 * /almond page share one thread); this component is just the FAB + the panel mount + the polite
 * navigation announcer. On the dedicated Almond page the FAB is hidden — the page is the surface
 * there, so a floating duplicate would be redundant.
 */
export function AlmondLauncher() {
  const { open, setOpen, announcement } = useAlmondChat();
  const pathname = usePathname();
  const onAlmondPage = pathname === "/almond" || pathname === "/tour/almond";

  return (
    <>
      {/* Polite, visually hidden announcer for navigations Almond drives (UX-DR7). Mounted here (not
          the panel) so it announces whether or not the panel is open. The trailing zero-width space
          (toggled by `seq`) forces a text change so repeats are re-announced. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement.text}
        {announcement.seq % 2 === 1 ? ZERO_WIDTH_SPACE : ""}
      </span>

      {!open && !onAlmondPage && (
        <div className="fixed bottom-20 right-4 z-40 flex flex-col items-center gap-1.5 lg:bottom-6 lg:right-6">
          {/* Compact circular mascot FAB (not a big pill): the almond on a white disc inside the brand
              green, so it reads as "the assistant" without taking over the corner. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t.openLabel}
            aria-expanded={false}
            className="press relative grid size-16 place-items-center rounded-full bg-primary shadow-[var(--shadow-elevated)] ring-1 ring-black/5 transition-transform hover:scale-105"
          >
            <span className="grid size-12 place-items-center rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.06)]">
              {/* The resting mascot watches the cursor wherever it goes on the screen. */}
              <AlmondAvatar size={44} animated trackCursor />
            </span>
            <BorderBeam size={64} duration={6} colorFrom="#f2c14e" colorTo="#ffffff" />
          </button>
          {/* A small, always-visible caption so a grower new to AI still knows what it is. */}
          <span className="pointer-events-none select-none rounded-full bg-surface-container-lowest px-2.5 py-0.5 type-label-caps text-on-surface-variant shadow-[var(--shadow-soft)]">
            {t.launcherLabel}
          </span>
        </div>
      )}

      <AnimatePresence>{open && <AlmondPanel />}</AnimatePresence>
    </>
  );
}
