"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondToolChips } from "./almond-result";

const t = en.shell.almond;

/** A message's parts, defensively (a malformed frame without `parts` must never crash render). */
function partsOf(m: UIMessage): UIMessage["parts"] {
  return m.parts ?? [];
}

/** Flatten a UI message's text parts into a single string (tool parts render separately). */
function messageText(m: UIMessage): string {
  return partsOf(m)
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

function hasToolPart(m: UIMessage): boolean {
  return partsOf(m).some((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool");
}

/** Whether the message is mid-tool-call with no text yet (Almond is looking something up). */
function isLookingUp(m: UIMessage): boolean {
  const hasText = partsOf(m).some((p) => p.type === "text" && p.text.trim().length > 0);
  return hasToolPart(m) && !hasText;
}

type Props = {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  farmName: string;
  starters: string[];
  onStarter: (question: string) => void;
  onRetry: () => void;
};

export function AlmondMessages({ messages, status, farmName, starters, onStarter, onRetry }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  // Autoscroll to the newest content as it streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const waiting = status === "submitted";

  return (
    <div
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
      role="log"
      aria-live="polite"
      aria-label={t.conversationLabel}
    >
      {messages.length === 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <AlmondAvatar size={26} className="mt-0.5" />
            <p className="type-body-md text-on-surface-variant">{t.greeting(farmName)}</p>
          </div>
          {starters.length > 0 && (
            <div className="flex flex-col gap-1.5 pl-8">
              <span className="type-label-caps text-on-surface-variant">{t.startersLabel}</span>
              <div className="flex flex-wrap gap-2">
                {starters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onStarter(q)}
                    className="rounded-full border border-outline-variant bg-paper px-3 py-1.5 type-body-md text-on-surface transition-colors hover:border-primary hover:text-primary"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {messages.map((m) => {
        const isUser = m.role === "user";
        const text = messageText(m);
        if (isUser) {
          // Skip an empty user bubble (e.g. an attachment-only or malformed message).
          if (!text) return null;
          return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-[var(--radius-lg)] rounded-br-sm bg-primary px-3 py-2 type-body-md text-on-primary">
                {text}
              </div>
            </div>
          );
        }
        // Skip an assistant message with nothing to show (no text, not looking up, no tool chips).
        if (!text && !isLookingUp(m) && !hasToolPart(m)) return null;
        return (
          <div key={m.id} className="flex items-start gap-2">
            <AlmondAvatar size={26} className="mt-0.5" />
            <div
              className={cn(
                "max-w-[85%] rounded-[var(--radius-lg)] rounded-bl-sm border border-outline-variant bg-paper px-3 py-2",
                "type-body-md text-on-surface",
              )}
            >
              <AlmondToolChips message={m} />
              {isLookingUp(m) ? (
                <AnimatedShinyText className="text-on-surface-variant">
                  {t.streaming}
                </AnimatedShinyText>
              ) : (
                <span className="whitespace-pre-wrap">{text}</span>
              )}
            </div>
          </div>
        );
      })}

      {waiting && (
        <div className="flex items-start gap-2">
          <AlmondAvatar size={26} className="mt-0.5" />
          <AnimatedShinyText className="px-1 py-2 text-on-surface-variant">
            {t.thinking}
          </AnimatedShinyText>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2" role="alert">
          <p className="type-body-md text-risk">{t.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-[var(--radius-control)] border border-outline-variant px-2 py-1 type-body-md text-on-surface hover:border-primary hover:text-primary"
          >
            {t.retry}
          </button>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
