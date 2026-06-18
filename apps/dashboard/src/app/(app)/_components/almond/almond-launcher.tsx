"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { en } from "@/copy/en";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import type { NavigateAction } from "@/lib/almond/skills/navigate";
import type { AlmondNavChip } from "./almond-result";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondPanel } from "./almond-panel";
import { useAlmondNavigation } from "./use-almond-navigation";

/**
 * Almond's chat carries one custom stream part: the transient `data-navigate` action. As of Story
 * 7.5 it carries BOTH the `action` (applied through the bridge) and a server-composed plain-English
 * `label` for the action chip the conversation shows.
 */
type AlmondUIMessage = UIMessage<unknown, { navigate: { action: NavigateAction; label: string } }>;

const t = en.shell.almond;

/** Appended to the live-region text on alternating announcements so an identical label still changes
 *  the DOM text and is re-announced. Zero-width (U+200B): invisible and not spoken by screen readers. */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/** The id of the most recent assistant message, or undefined if none exists yet. Never falls back to
 *  a user message — a chip keyed to a user turn would never render (it only renders in the assistant
 *  bubble), so an unattributable chip stays buffered until its assistant message appears. */
function lastAssistantId(messages: AlmondUIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i]?.id;
  }
  return undefined;
}

/**
 * Almond's persistent launcher: a corner button on every (app) screen that opens the chat
 * panel (the Notion-agent feel). Owns the `useChat` conversation so it survives open/close, and
 * streams against the farm-scoped `/api/almond/chat` endpoint (Story 6.1). Open/close is
 * ephemeral local UI state — no nuqs key (canonical keys are lens|entity|ranch|rate|meter only).
 *
 * It also owns the navigation bridge AND the action-chip record (Story 7.5): because the
 * `data-navigate` part is transient (never in `message.parts`), chips are captured here as the part
 * arrives and kept in launcher state, so they survive closing and reopening the panel. The chips are
 * threaded down to the message list; tapping one re-applies the same action (a link back).
 */
export function AlmondLauncher({
  farmName,
  starters,
}: {
  farmName: string;
  starters: string[];
}) {
  const [open, setOpen] = useState(false);
  // One transport instance for the component's life (not a new one per render).
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/almond/chat" }));
  // The navigation bridge: when the server streams a `data-navigate` part, apply it through the
  // canonical nuqs setters so the dashboard moves exactly as a manual click would (Story 7.4).
  // `apply` is a stable callback, so closing over it (in `onData` / `onReplay`) is safe.
  const { apply: applyNavigation } = useAlmondNavigation();
  // Action chips, keyed by the assistant message that drove each navigation (Story 7.5).
  const [navByMessage, setNavByMessage] = useState<Map<string, AlmondNavChip[]>>(new Map());
  // The latest navigation label, announced to screen readers via a polite live region (UX-DR7). The
  // `seq` forces the live region's text to differ even when the same label repeats, so a repeat
  // navigation (or a chip re-tap) is re-announced rather than silently swallowed.
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number }>({ text: "", seq: 0 });
  // Chips received from `onData` but not yet attributed to their assistant message; flushed by the
  // effect below. A ref (not state) because it is a hand-off buffer, not rendered directly.
  const pendingChips = useRef<AlmondNavChip[]>([]);
  // Bumped on each navigation to trigger the flush effect (the transient part does not change
  // `messages`, so the effect needs an explicit nudge).
  const [flushTick, setFlushTick] = useState(0);

  const announce = useCallback((label: string) => {
    setAnnouncement((a) => ({ text: label, seq: a.seq + 1 }));
  }, []);

  const { messages, sendMessage, status, regenerate } = useChat<AlmondUIMessage>({
    transport,
    // `onData` fires once per received data part and is never replayed on a re-render or a reload
    // (transient parts are not persisted to history), so each navigation is applied exactly once
    // without any manual dedupe — the 7.4 "applied exactly once" guarantee is structural here.
    onData: (part) => {
      if (part.type !== "data-navigate") return;
      const { action, label } = part.data;
      applyNavigation(action); // one-shot apply (Story 7.4)
      // Buffer the chip and nudge the flush effect, which attributes it to the assistant turn using
      // the freshly-rendered `messages` (not a laggy ref), so attribution is never stale or misfiled.
      pendingChips.current.push({ action, label });
      setFlushTick((n) => n + 1);
      announce(label);
    },
  });

  // Attribute buffered chips to the assistant message that drove them, and prune any whose message no
  // longer exists (e.g. after `regenerate()` replaces a turn with a new id). Runs against the current
  // `messages`, so the assistant id is correct; if it is not present yet, chips stay buffered for the
  // next pass. The updater is pure (the buffer is drained in the effect body, not inside setState).
  useEffect(() => {
    const liveIds = new Set(messages.map((m) => m.id));
    const assistantId = lastAssistantId(messages);
    const toFlush = assistantId ? pendingChips.current : [];
    if (toFlush.length > 0) pendingChips.current = [];
    setNavByMessage((prev) => {
      let changed = false;
      const next = new Map<string, AlmondNavChip[]>();
      for (const [id, chips] of prev) {
        if (liveIds.has(id)) next.set(id, chips);
        else changed = true; // drop chips whose message is gone
      }
      if (toFlush.length > 0 && assistantId) {
        next.set(assistantId, [...(next.get(assistantId) ?? []), ...toFlush]);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [messages, flushTick]);

  // Re-apply a chip's navigation (the chip is a link back to that view).
  const onReplay = useCallback(
    (chip: AlmondNavChip) => {
      applyNavigation(chip.action);
      announce(chip.label);
    },
    [applyNavigation, announce],
  );

  return (
    <>
      {/* Polite, visually hidden announcer for navigations Almond drives (UX-DR7). Mounted with the
          launcher (not the panel) so it announces whether or not the panel is open. The trailing
          zero-width space (toggled by `seq`) forces a text change so repeats are re-announced. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement.text}
        {announcement.seq % 2 === 1 ? ZERO_WIDTH_SPACE : ""}
      </span>

      {!open && (
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

      <AnimatePresence>
        {open && (
          <AlmondPanel
            farmName={farmName}
            messages={messages}
            status={status}
            starters={starters}
            navByMessage={navByMessage}
            onReplay={onReplay}
            onSend={(text) => sendMessage({ text })}
            onRetry={() => regenerate()}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
