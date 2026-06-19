"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { en } from "@/copy/en";
import { ShimmerButton } from "@/components/ui/shimmer-button";
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
        <ShimmerButton
          onClick={() => setOpen(true)}
          aria-label={t.openLabel}
          aria-expanded={false}
          background="#2fa84f"
          shimmerColor="#f2c14e"
          borderRadius="999px"
          className="fixed bottom-20 right-4 z-40 shadow-[var(--shadow-elevated)] lg:bottom-6 lg:right-6"
        >
          <span className="relative flex items-center gap-2 px-1 py-0.5">
            <AlmondAvatar size={24} />
            <span className="type-body-md font-medium text-white">{t.launcherLabel}</span>
          </span>
          <BorderBeam size={48} duration={6} colorFrom="#f2c14e" colorTo="#ffffff" />
        </ShimmerButton>
      )}

      <AnimatePresence>{open && <AlmondPanel />}</AnimatePresence>
    </>
  );
}
