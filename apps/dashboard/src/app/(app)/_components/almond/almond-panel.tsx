"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import type { UIMessage } from "ai";
import { en } from "@/copy/en";
import { ShineBorder } from "@/components/ui/shine-border";
import { DotPattern } from "@/components/ui/dot-pattern";
import type { AlmondNavChip } from "./almond-result";
import type { AlmondReportCard } from "./almond-download-card";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondMessages } from "./almond-messages";
import { AlmondComposer } from "./almond-composer";

const t = en.shell.almond;

type Props = {
  farmName: string;
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  starters: string[];
  /** Action chips per assistant message id (Story 7.5), captured in the launcher. */
  navByMessage: Map<string, AlmondNavChip[]>;
  /** Download cards per assistant message id (Story 8.5), captured in the launcher. */
  reportsByMessage: Map<string, AlmondReportCard[]>;
  /** Re-apply a chip's navigation (the chip is a link back to that view). */
  onReplay: (chip: AlmondNavChip) => void;
  onSend: (text: string) => void;
  onRetry: () => void;
  onClose: () => void;
};

export function AlmondPanel({
  farmName,
  messages,
  status,
  starters,
  navByMessage,
  reportsByMessage,
  onReplay,
  onSend,
  onRetry,
  onClose,
}: Props) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes; move focus into the panel on open.
  useEffect(() => {
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const busy = status === "submitted" || status === "streaming";

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
        // Desktop: anchored bottom-right, fixed width.
        "lg:inset-x-auto lg:right-6 lg:bottom-24 lg:w-[26rem]",
      ].join(" ")}
    >
      <div className="relative flex h-[min(70dvh,560px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant bg-paper shadow-[var(--shadow-elevated)]">
        <ShineBorder shineColor={["#2fa84f", "#f2c14e"]} borderWidth={1} duration={16} />

        <header className="relative flex items-center gap-3 overflow-hidden border-b border-outline-variant px-4 py-3">
          <DotPattern
            width={16}
            height={16}
            className="pointer-events-none absolute inset-0 text-primary/15 [mask-image:linear-gradient(to_right,white,transparent)]"
          />
          <AlmondAvatar size={32} className="relative" />
          <div className="relative min-w-0">
            <p className="type-body-md font-semibold text-on-surface">{t.name}</p>
            <p className="type-label-caps text-on-surface-variant">{t.tagline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeLabel}
            className="relative ml-auto grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-on-surface-variant hover:bg-tint"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <AlmondMessages
          messages={messages}
          status={status}
          farmName={farmName}
          starters={starters}
          navByMessage={navByMessage}
          reportsByMessage={reportsByMessage}
          onReplay={onReplay}
          onStarter={onSend}
          onRetry={onRetry}
        />
        <AlmondComposer onSend={onSend} disabled={busy} />
      </div>
    </motion.div>
  );
}
