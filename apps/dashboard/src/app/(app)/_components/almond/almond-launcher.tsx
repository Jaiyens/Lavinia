"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { en } from "@/copy/en";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import type { NavigateAction } from "@/lib/almond/skills/navigate";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondPanel } from "./almond-panel";
import { useAlmondNavigation } from "./use-almond-navigation";

/** Almond's chat carries one custom stream part: the transient `data-navigate` action (Story 7.4). */
type AlmondUIMessage = UIMessage<unknown, { navigate: NavigateAction }>;

const t = en.shell.almond;

/**
 * Almond's persistent launcher: a corner button on every (app) screen that opens the chat
 * panel (the Notion-agent feel). Owns the `useChat` conversation so it survives open/close, and
 * streams against the farm-scoped `/api/almond/chat` endpoint (Story 6.1). Open/close is
 * ephemeral local UI state — no nuqs key (canonical keys are lens|entity|ranch|rate|meter only).
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
  const nav = useAlmondNavigation();
  const { messages, sendMessage, status, regenerate } = useChat<AlmondUIMessage>({
    transport,
    // `onData` fires once per received data part and is never replayed on a re-render or a reload
    // (transient parts are not persisted to history), so each navigation is applied exactly once
    // without any manual dedupe — the AC3 "applied exactly once" guarantee is structural here.
    onData: (part) => {
      if (part.type === "data-navigate") nav.apply(part.data);
    },
  });

  return (
    <>
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
            onSend={(text) => sendMessage({ text })}
            onRetry={() => regenerate()}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
