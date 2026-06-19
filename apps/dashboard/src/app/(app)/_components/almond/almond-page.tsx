"use client";

import { Sparkles } from "lucide-react";
import { en } from "@/copy/en";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondMessages } from "./almond-messages";
import { AlmondComposer } from "./almond-composer";
import { useAlmondChat } from "./almond-launcher-provider";

const t = en.shell.almond;

/**
 * The dedicated /almond full-page tab (Notion-style, in Terra's cool-grey palette). It reads the
 * SAME shared conversation as the floating panel, so a thread started in the panel continues here and
 * vice versa. Empty state: a calm greeting hero over a roomy composer with suggestions. Active state:
 * the conversation with a sticky composer at the bottom.
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
  } = useAlmondChat();
  const empty = messages.length === 0;

  if (empty) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col items-center justify-center px-5 py-10 text-center lg:px-8">
        <AlmondAvatar size={104} animated className="mb-6" />
        <p className="eyebrow mb-2 text-primary">{t.pageEyebrow}</p>
        <h1 className="type-display-lg text-on-surface">{t.pageGreeting}</h1>
        <p className="mt-3 max-w-md type-body-md text-on-surface-variant">{t.greeting(farmName)}</p>

        <div className="mt-8 w-full max-w-2xl">
          <AlmondComposer variant="page" autoFocus />
        </div>

        {starters.length > 0 && (
          <div className="mt-8 w-full max-w-2xl text-left">
            <p className="eyebrow mb-2 text-on-surface-variant">{t.suggestedLabel}</p>
            <div className="flex flex-col gap-1.5">
              {starters.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-3.5 py-2.5 text-left type-body-md text-on-surface transition-colors hover:border-primary hover:text-primary"
                >
                  <Sparkles size={15} aria-hidden className="shrink-0 text-primary" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col px-5 lg:px-8">
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
  );
}
