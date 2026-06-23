"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { en } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondMessages } from "./almond-messages";
import { AlmondComposer } from "./almond-composer";
import { AlmondHistoryButton, AlmondHistorySidebar, AlmondNewChatButton } from "./almond-history";
import { useAlmondChat } from "./almond-launcher-provider";

const t = en.shell.almond;

/**
 * The time-aware greeting part ("Good morning/afternoon/evening"), picked by the CURRENT hour in
 * America/Los_Angeles (Pacific) — the farm's timezone, so a California evening reads "Good evening"
 * regardless of the viewer's device clock.
 */
function pacificGreetingPart(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  // 0-11 morning, 12-16 afternoon, 17-23 evening. (Intl can return "24" for midnight; treat it as 0.)
  const h = hour === 24 ? 0 : hour;
  if (h < 12) return t.greetMorning;
  if (h < 17) return t.greetAfternoon;
  return t.greetEvening;
}

/**
 * The dedicated /almond full-page tab: a minimalist, centered chat landing. The empty state is just a
 * time-aware greeting over a centered composer and a few starter chips, on a clean white surface with
 * a subtle dot-pattern background. Saved chats live behind a "Saved chats" button that opens an
 * overlay (no always-on rail), so the composer sits dead center. It reads the SAME shared conversation
 * as the floating panel, so a thread started in the panel continues here and vice versa.
 */
export function AlmondPage() {
  const {
    farmName,
    starters,
    messages,
    status,
    navByMessage,
    reportsByMessage,
    metersByMessage,
    generationsByMessage,
    generations,
    decidedByMessage,
    onReplay,
    send,
    retry,
    editMessage,
    usageLimit,
    historyEnabled,
    markGenerationsSeen,
  } = useAlmondChat();
  const empty = messages.length === 0;
  const [showHistory, setShowHistory] = useState(false);
  const greeting = t.greetWithFarm(pacificGreetingPart(new Date()), farmName);

  // The dedicated Almond page is its own surface (the panel-open signal stays false here), so it clears
  // the unread badge on mount: a grower who opens /almond IS looking at Almond, so any finished build is
  // now seen. The launcher FAB is hidden on this route, so there is no stray red dot left behind.
  useEffect(() => {
    markGenerationsSeen();
  }, [markGenerationsSeen]);

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)]">
      {/* Full-bleed white + dot-pattern backdrop filling the whole content area (right of the rail on
          desktop, above the tab bar on mobile), so the surface never cuts off short at the bottom. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 bottom-16 z-0 bg-white lg:bottom-0 lg:left-48"
      >
        {/* Wider spacing keeps the SVG light (fewer nodes); the radial mask fades it toward the edges. */}
        <DotPattern
          width={26}
          height={26}
          cr={1}
          className="text-on-surface-variant/25 [mask-image:radial-gradient(75%_70%_at_50%_35%,white,transparent)]"
        />
      </div>

      {/* Saved-chats side panel, opened on demand by the "Saved chats" button (toggled, not always on). */}
      {historyEnabled && showHistory && (
        <AlmondHistorySidebar onClose={() => setShowHistory(false)} />
      )}

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Saved chats (toggles the side panel) + new chat. */}
        {historyEnabled && (
          <div className="flex items-center gap-2 px-4 py-3">
            <AlmondHistoryButton onClick={() => setShowHistory((v) => !v)} label={t.savedChats} />
            <AlmondNewChatButton />
          </div>
        )}

        {empty ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-16 text-center">
            {/* Centered greeting over a full-width composer. */}
            <div className="mb-6 flex flex-col items-center gap-3">
              <AlmondAvatar size={56} animated trackCursor />
              <h1 className="type-display-lg text-on-surface">{greeting}</h1>
            </div>

            <AlmondComposer variant="page" autoFocus />

            {starters.length > 0 && (
              <div className="mt-7 w-full text-left">
                <p className="eyebrow mb-2 text-on-surface-variant">{t.suggestedLabel}</p>
                <div className="flex flex-col gap-1.5">
                  {starters.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-outline-variant bg-white/80 px-3.5 py-2.5 text-left type-body-md text-on-surface transition-colors hover:border-primary hover:text-primary"
                    >
                      <Sparkles size={15} aria-hidden className="shrink-0 text-primary" />
                      <span>{q}</span>
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
              metersByMessage={metersByMessage}
              generationsByMessage={generationsByMessage}
              generations={generations}
              decidedByMessage={decidedByMessage}
              onReplay={onReplay}
              onStarter={(q) => send(q)}
              onRetry={retry}
              usageLimit={usageLimit}
              onEdit={editMessage}
              windowScroll
            />
            <div className="sticky bottom-0 bg-white pb-4 pt-2">
              <AlmondComposer variant="page" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
