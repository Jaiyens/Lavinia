"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondMarkdown } from "./almond-markdown";
import { AlmondMessageActions } from "./almond-message-actions";
import {
  AlmondActionChips,
  AlmondThought,
  AlmondToolChips,
  type AlmondNavChip,
} from "./almond-result";
import { AlmondDownloadCard, type AlmondReportCard } from "./almond-download-card";

const t = en.shell.almond;

// Inline message avatar (left of an answer) and the larger one for the live thinking line — big
// enough that the grower actually sees Almond blink and its thought bubbles drift.
const MSG_AVATAR = 30;
const THINKING_AVATAR = 40;

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

/** Whether a tool on this message is still running (called, no result yet). Stays true through the
 *  SLOW work — building a spreadsheet or PDF — so we can keep an animated "still working" line on
 *  screen instead of a frozen answer with no sign of life. */
function toolRunning(m: UIMessage): boolean {
  return partsOf(m).some((p) => {
    if (!(p.type.startsWith("tool-") || p.type === "dynamic-tool")) return false;
    if (!("state" in p) || typeof p.state !== "string") return false;
    return p.state !== "output-available" && p.state !== "output-error";
  });
}

type Props = {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  farmName: string;
  starters: string[];
  /** Action chips per assistant message id (Story 7.5). */
  navByMessage: Map<string, AlmondNavChip[]>;
  /** Download cards per assistant message id (Story 8.5). */
  reportsByMessage: Map<string, AlmondReportCard[]>;
  /** Re-apply a chip's navigation (the chip is a link back to that view). */
  onReplay: (chip: AlmondNavChip) => void;
  onStarter: (question: string) => void;
  onRetry: () => void;
  /** Edit a user turn and re-ask (drops that turn and everything after it, then resends). */
  onEdit: (messageId: string, newText: string) => void;
};

export function AlmondMessages({
  messages,
  status,
  farmName,
  starters,
  navByMessage,
  reportsByMessage,
  onReplay,
  onStarter,
  onRetry,
  onEdit,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  // Autoscroll to the newest content as it streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const waiting = status === "submitted";
  // After the answer text has streamed, the model may still be BUILDING something slow (a spreadsheet
  // or PDF). Keep an animated "still working" line under that turn so Almond never just vanishes mid
  // task — the gap a grower hit when an export took a few seconds.
  const last = messages[messages.length - 1];
  const generating =
    status === "streaming" &&
    last !== undefined &&
    last.role === "assistant" &&
    toolRunning(last) &&
    messageText(last).length > 0;

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
            <AlmondAvatar size={MSG_AVATAR} className="mt-0.5" />
            <p className="type-body-md text-on-surface-variant">{t.greeting(farmName)}</p>
          </div>
          {starters.length > 0 && (
            <div className="flex flex-col gap-1.5 pl-9">
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
        const text = messageText(m);
        if (m.role === "user") {
          // Skip an empty user bubble (e.g. an attachment-only or malformed message).
          if (!text) return null;
          return <UserMessage key={m.id} id={m.id} text={text} onEdit={onEdit} />;
        }
        const chips = navByMessage.get(m.id) ?? [];
        const reports = reportsByMessage.get(m.id) ?? [];
        const looking = isLookingUp(m);
        // Skip an assistant message with nothing to show (no text, not looking up, no tool chips,
        // no action chip, no download card).
        if (!text && !looking && !hasToolPart(m) && chips.length === 0 && reports.length === 0)
          return null;
        return (
          <AssistantMessage
            key={m.id}
            message={m}
            text={text}
            looking={looking}
            chips={chips}
            reports={reports}
            onReplay={onReplay}
            onRegenerate={onRetry}
          />
        );
      })}

      {waiting && <ThinkingLine />}
      {generating && <WorkingLine />}

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

/** A user turn: the green bubble plus hover actions to copy or edit-and-re-ask. */
function UserMessage({
  id,
  text,
  onEdit,
}: {
  id: string;
  text: string;
  onEdit: (id: string, newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[85%]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            aria-label={t.editAria}
            className="w-full resize-none rounded-[var(--radius-lg)] border border-primary bg-surface-container-low px-3 py-2 type-body-md leading-6 text-on-surface outline-none"
          />
          <div className="mt-1 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(text);
              }}
              className="rounded-[var(--radius-control)] px-2.5 py-1 type-label-caps text-on-surface-variant hover:bg-tint hover:text-on-surface"
            >
              {t.editCancel}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onEdit(id, draft);
              }}
              className="rounded-[var(--radius-control)] bg-primary px-2.5 py-1 type-label-caps text-on-primary transition-opacity hover:opacity-90"
            >
              {t.editSave}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-lg)] rounded-br-sm bg-primary px-3 py-2 type-body-md text-on-primary">
        {text}
      </div>
      <AlmondMessageActions
        text={text}
        align="end"
        onEdit={() => {
          setDraft(text);
          setEditing(true);
        }}
      />
    </div>
  );
}

/** An Almond turn: avatar + a clean, borderless answer block (Claude/Notion style) with rendered
 *  markdown, the quiet "looked at" line, optional Thought disclosure, action chips, download cards,
 *  and hover actions to copy or regenerate. */
function AssistantMessage({
  message,
  text,
  looking,
  chips,
  reports,
  onReplay,
  onRegenerate,
}: {
  message: UIMessage;
  text: string;
  looking: boolean;
  chips: AlmondNavChip[];
  reports: AlmondReportCard[];
  onReplay: (chip: AlmondNavChip) => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="group flex items-start gap-2">
      <AlmondAvatar size={MSG_AVATAR} state={looking ? "thinking" : "idle"} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className={cn("max-w-[92%] type-body-md text-on-surface")}>
          <AlmondThought message={message} />
          <AlmondToolChips message={message} />
          {looking ? (
            <AnimatedShinyText className="text-on-surface-variant">{t.streaming}</AnimatedShinyText>
          ) : (
            <AlmondMarkdown>{text}</AlmondMarkdown>
          )}
          {/* What Almond just did on the screen, and a tap back to it (Story 7.5). */}
          <AlmondActionChips chips={chips} onReplay={onReplay} />
          {/* Spreadsheets / PDFs Almond made this turn, as download cards (Story 8.5 / 9.3). */}
          {reports.map((card, i) => (
            <AlmondDownloadCard key={`${card.fileName}-${i}`} card={card} />
          ))}
        </div>
        {!looking && text && (
          <AlmondMessageActions text={text} align="start" onRegenerate={onRegenerate} />
        )}
      </div>
    </div>
  );
}

/** Rotate through the farm-flavored thinking phrases ("Walking the rows"…) on a gentle interval;
 *  under reduced motion it holds the first phrase. Shared by the thinking and working lines. */
function useRotatingPhrase(): string {
  const reduce = useReducedMotion();
  const phrases = t.thinkingPhrases;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || phrases.length <= 1) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % phrases.length), 1800);
    return () => window.clearInterval(id);
  }, [reduce, phrases.length]);
  return (reduce ? phrases[0] : phrases[i]) ?? t.thinking;
}

/** The live "thinking" line shown BEFORE any answer arrives: a prominent, animated Almond beside a
 *  rotating farm-flavored phrase, so the wait reads as Almond out checking the farm, not a dead box. */
function ThinkingLine() {
  const phrase = useRotatingPhrase();
  return (
    <div className="flex items-center gap-2">
      <AlmondAvatar size={THINKING_AVATAR} state="thinking" />
      <AnimatedShinyText className="px-1 py-2 text-on-surface-variant">{phrase}</AnimatedShinyText>
    </div>
  );
}

/** The "still working" line shown UNDER a streamed answer while Almond keeps building something slow
 *  (a spreadsheet or PDF), so the file-generation wait always shows a live, animated Almond instead of
 *  a frozen message. Aligned under the answer text, a touch smaller than the pre-answer thinking line. */
function WorkingLine() {
  const phrase = useRotatingPhrase();
  return (
    <div className="-mt-1 flex items-center gap-2 pl-9">
      <AlmondAvatar size={24} state="thinking" />
      <AnimatedShinyText className="type-body-sm text-on-surface-variant">{phrase}</AnimatedShinyText>
    </div>
  );
}
