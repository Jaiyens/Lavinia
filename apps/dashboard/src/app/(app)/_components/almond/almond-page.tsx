"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { en } from "@/copy/en";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondMessages } from "./almond-messages";
import { AlmondComposer } from "./almond-composer";
import {
  AlmondHistoryButton,
  AlmondHistoryReopen,
  AlmondHistorySheet,
  AlmondHistorySidebar,
  AlmondNewChatButton,
} from "./almond-history";
import { useAlmondChat } from "./almond-launcher-provider";

const t = en.shell.almond;

/**
 * The dedicated /almond full-page tab (Notion-style, in Terra's cool-grey palette). It reads the
 * SAME shared conversation as the floating panel, so a thread started in the panel continues here and
 * vice versa. A persistent saved-history rail sits on the left (desktop); on mobile it is a top bar
 * that opens an overlay. Empty state: a calm greeting hero over a roomy composer with suggestions.
 * Active state: the conversation with a sticky composer at the bottom.
 */
export function AlmondPage() {
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
    historyEnabled,
  } = useAlmondChat();
  const empty = messages.length === 0;
  const [showHistory, setShowHistory] = useState(false);
  const [railOpen, setRailOpen] = useState(true);

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)]">
      {/* Saved-chats rail (desktop), collapsible. Self-hides when history is disabled (the Tour). */}
      {railOpen && <AlmondHistorySidebar onClose={() => setRailOpen(false)} />}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Mobile history controls: New chat + open the saved-chats overlay. Desktop uses the rail. */}
        {historyEnabled && (
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-4 py-2 lg:hidden">
            <AlmondHistoryButton onClick={() => setShowHistory(true)} />
            <AlmondNewChatButton />
          </div>
        )}
        {/* Desktop: when the rail is collapsed, a labeled "Chats" pill brings it back. */}
        {historyEnabled && !railOpen && (
          <div className="hidden items-center px-4 py-3 lg:flex">
            <AlmondHistoryReopen onClick={() => setRailOpen(true)} />
          </div>
        )}

        {empty ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-10 text-center lg:px-8">
            <AlmondAvatar size={104} animated trackCursor className="mb-6" />
            <p className="eyebrow mb-2 text-primary">{t.pageEyebrow}</p>
            <h1 className="type-display-lg text-on-surface">{t.pageGreeting}</h1>
            <p className="mt-3 max-w-md type-body-md text-on-surface-variant">{t.greeting(farmName)}</p>

            <div className="mt-8 w-full max-w-2xl">
              <AlmondComposer variant="page" autoFocus />
            </div>

            {starters.length > 0 && (
              <div className="mt-9 w-full max-w-2xl text-left">
                <p className="eyebrow mb-3 text-on-surface-variant">{t.suggestedLabel}</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {starters.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="lift group flex items-center gap-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest px-4 py-3.5 text-left shadow-e1 transition-colors hover:border-primary/40"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                        <Sparkles size={15} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 type-body-md font-medium leading-snug text-on-surface">
                        {q}
                      </span>
                      <ArrowRight
                        size={16}
                        aria-hidden
                        className="shrink-0 -translate-x-1 text-on-surface-variant opacity-0 transition-all group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 lg:px-8">
            <header className="flex items-center gap-2.5 py-4">
              <AlmondAvatar size={30} />
              <div>
                <p className="type-body-md font-semibold text-on-surface">{t.name}</p>
                <p className="type-label-caps text-on-surface-variant">{t.tagline}</p>
              </div>
            </header>
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
              onEdit={editMessage}
              windowScroll
            />
            <div className="sticky bottom-0 bg-paper pb-4 pt-2">
              <AlmondComposer variant="page" />
            </div>
          </div>
        )}

        {/* Mobile saved-chats overlay (fixed full-screen). Desktop uses the persistent rail instead. */}
        <AlmondHistorySheet
          open={showHistory}
          onClose={() => setShowHistory(false)}
          className="fixed inset-0 z-50 lg:hidden"
        />
      </div>
    </div>
  );
}
