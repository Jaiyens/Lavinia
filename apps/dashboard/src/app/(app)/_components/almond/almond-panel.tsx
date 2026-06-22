"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { en } from "@/copy/en";
import { ShineBorder } from "@/components/ui/shine-border";
import { DotPattern } from "@/components/ui/dot-pattern";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondMessages } from "./almond-messages";
import { AlmondComposer } from "./almond-composer";
import { AlmondHistoryButton, AlmondHistorySheet, AlmondNewChatButton } from "./almond-history";
import { useAlmondChat } from "./almond-launcher-provider";

const t = en.shell.almond;

/**
 * The floating chat panel (quick-ask from any screen). Reads the shared conversation from context,
 * so it shows the SAME thread as the /almond full-page tab — ask in the panel, open the page, the
 * conversation continues. The composer self-serves from context (model picker + attach live there).
 */
export function AlmondPanel() {
  const {
    farmName,
    starters,
    messages,
    status,
    navByMessage,
    reportsByMessage,
    onReplay,
    send,
    retry,
    editMessage,
    usageLimit,
    closeAlmond,
  } = useAlmondChat();
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Escape closes the history overlay first, then the whole panel; focus into the panel on open.
  useEffect(() => {
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setShowHistory((open) => {
        if (open) return false; // first Escape just closes the overlay
        closeAlmond();
        return false;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAlmond]);

  return (
    <motion.div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={t.conversationLabel}
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "fixed z-40 outline-none",
        // Mobile: a sheet above the tab bar, clear of the findings sheet.
        "inset-x-3 bottom-20",
        // Desktop: anchored bottom-right, a roomier fixed width than before.
        "lg:inset-x-auto lg:right-6 lg:bottom-24 lg:w-[30rem]",
      ].join(" ")}
    >
      <div className="relative flex h-[min(78dvh,680px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-[0_18px_50px_rgba(20,24,40,0.18)]">
        <ShineBorder shineColor={["#2fa84f", "#f2c14e"]} borderWidth={1} duration={16} />

        <header className="relative flex items-center gap-3 overflow-hidden border-b border-outline-variant bg-primary/[0.04] px-4 py-3.5">
          <DotPattern
            width={16}
            height={16}
            className="pointer-events-none absolute inset-0 text-primary/15 [mask-image:linear-gradient(to_right,white,transparent)]"
          />
          <AlmondAvatar size={52} animated trackCursor className="relative" />
          <div className="relative min-w-0">
            <p className="type-body-md font-semibold text-on-surface">{t.name}</p>
            <p className="type-label-caps text-on-surface-variant">{t.tagline}</p>
          </div>
          {/* New chat + saved history (per-user). Render nothing on the Tour (history disabled). */}
          <div className="relative ml-auto flex items-center gap-0.5">
            <AlmondNewChatButton />
            <AlmondHistoryButton onClick={() => setShowHistory(true)} />
            <button
              type="button"
              onClick={closeAlmond}
              aria-label={t.closeLabel}
              className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-on-surface-variant hover:bg-tint"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>

        {/* Saved-chats overlay, covering the panel body until a thread is picked or it is closed. */}
        <AlmondHistorySheet open={showHistory} onClose={() => setShowHistory(false)} />

        <AlmondMessages
          messages={messages}
          status={status}
          farmName={farmName}
          starters={starters}
          navByMessage={navByMessage}
          reportsByMessage={reportsByMessage}
          onReplay={onReplay}
          onStarter={(q) => send(q)}
          onRetry={retry}
          usageLimit={usageLimit}
          onEdit={editMessage}
        />
        <AlmondComposer variant="panel" />
      </div>
    </motion.div>
  );
}
