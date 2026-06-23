"use client";

import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { AlmondAvatar } from "./almond-avatar";
import { AlmondMarkdown } from "./almond-markdown";
import { AlmondMessageActions } from "./almond-message-actions";
import {
  AlmondActionChips,
  AlmondDecidedLine,
  AlmondThought,
  AlmondToolChips,
  type AlmondNavChip,
} from "./almond-result";
import { AlmondDownloadCard, type AlmondReportCard } from "./almond-download-card";
import { AlmondMeterCard } from "./almond-meter-card";
import type { AlmondMeterCard as AlmondMeterCardData } from "./almond-meter-card";
import type { AlmondUsageLimit } from "./almond-launcher-provider";
import type { AutoHeadlineKey } from "@/lib/almond/auto/types";

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
  /** Light inline meter cards per assistant message id (B2). */
  metersByMessage: Map<string, AlmondMeterCardData[]>;
  /** The "what Auto decided" headline key per assistant message id (Auto mode only). */
  decidedByMessage: Map<string, AutoHeadlineKey>;
  /** Re-apply a chip's navigation (the chip is a link back to that view). */
  onReplay: (chip: AlmondNavChip) => void;
  onStarter: (question: string) => void;
  onRetry: () => void;
  /** Set when the grower has hit their durable per-user token budget; shows a calm limit banner
   *  (no retry, since retrying is futile until the window resets) instead of the generic error. */
  usageLimit: AlmondUsageLimit | null;
  /** Edit a user turn and re-ask (drops that turn and everything after it, then resends). */
  onEdit: (messageId: string, newText: string) => void;
  /** On the full /almond page the WINDOW is the scroll container, so autoscroll pins the window to
   *  its bottom. In the floating panel the message list is its own scroll container (the default), so
   *  we pin that instead. Pinning the right target is what stops the page jumping on each message. */
  windowScroll?: boolean;
};

export function AlmondMessages({
  messages,
  status,
  farmName,
  starters,
  navByMessage,
  reportsByMessage,
  metersByMessage,
  decidedByMessage,
  onReplay,
  onStarter,
  onRetry,
  usageLimit,
  onEdit,
  windowScroll = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Pin to the newest content as it streams in. On the full page the WINDOW scrolls, so we send it to
  // its bottom; in the panel the list is its own scroll container, so we pin that. Scrolling the exact
  // target (instead of scrollIntoView, which mis-aligns against the sticky composer) is what keeps the
  // view from jumping up on every message and token.
  useEffect(() => {
    if (windowScroll) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
      return;
    }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, windowScroll]);

  // ONE thinking indicator per turn. It appears the instant Enter is pressed (`useChat` flips status
  // to "submitted" and appends the optimistic user message synchronously) and retires the instant the
  // first answer content streams. Two render windows make it feel gapless:
  //   - "submitted": the request is sent, no assistant message exists yet.
  //   - "streaming" but the assistant turn is still an EMPTY SHELL (no text, no tool part yet) — the
  //     brief moment after the stream opens but before the first token/tool delta arrives. Without
  //     this, the indicator would blink out for a frame (the gap a grower notices as a dead box).
  // The instant the assistant turn shows ANY content, the per-message UI takes over: the inline
  // "Almond is answering" shimmer while a tool runs with no text (`looking`), then the streamed
  // markdown. So we never spawn a second thinking node below already-streamed text.
  const last = messages[messages.length - 1];
  const lastIsEmptyAssistant =
    last !== undefined &&
    last.role === "assistant" &&
    messageText(last).length === 0 &&
    !hasToolPart(last);
  const waiting =
    status === "submitted" || (status === "streaming" && lastIsEmptyAssistant);

  return (
    <div
      ref={scrollRef}
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
        const meterCards = metersByMessage.get(m.id) ?? [];
        const decided = decidedByMessage.get(m.id);
        const looking = isLookingUp(m);
        // After the answer text has streamed, the model may still be BUILDING something slow (a
        // spreadsheet or PDF). Show ONE quiet "still working" line AT that turn (inline, under its
        // text) so Almond never just freezes mid task — the gap a grower hit when an export took a
        // few seconds. Only the live last assistant turn while streaming can be working, and only
        // once it already has text (before text, the inline `looking` shimmer covers it), so the
        // working line and the pre-answer thinking line can never show at the same time.
        const working =
          status === "streaming" &&
          m.id === last?.id &&
          m.role === "assistant" &&
          toolRunning(m) &&
          text.length > 0;
        // Skip an assistant message with nothing to show (no text, not looking up, no tool chips,
        // no action chip, no download card, no meter card).
        if (
          !text &&
          !looking &&
          !hasToolPart(m) &&
          chips.length === 0 &&
          reports.length === 0 &&
          meterCards.length === 0
        )
          return null;
        return (
          <AssistantMessage
            key={m.id}
            message={m}
            text={text}
            looking={looking}
            working={working}
            chips={chips}
            reports={reports}
            meterCards={meterCards}
            decided={decided}
            onReplay={onReplay}
            onRegenerate={onRetry}
          />
        );
      })}

      {waiting && <ThinkingLine />}

      {usageLimit ? (
        // The durable per-user budget is spent: a calm, honest banner with NO retry (retrying just
        // earns another 429 until the window resets). Takes precedence over the generic error, which
        // the same 429 also raised in useChat.
        <div className="flex items-center gap-2" role="alert">
          <p className="type-body-md text-risk">{t.usage.limitReached(usageLimit.window)}</p>
        </div>
      ) : status === "error" ? (
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
      ) : null}
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
  working,
  chips,
  reports,
  meterCards,
  decided,
  onReplay,
  onRegenerate,
}: {
  message: UIMessage;
  text: string;
  looking: boolean;
  /** This turn streamed its text but is still building something slow (a spreadsheet / PDF). */
  working: boolean;
  chips: AlmondNavChip[];
  reports: AlmondReportCard[];
  meterCards: AlmondMeterCardData[];
  decided?: AutoHeadlineKey;
  onReplay: (chip: AlmondNavChip) => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="group flex items-start gap-2">
      <AlmondAvatar
        size={MSG_AVATAR}
        state={looking || working ? "thinking" : "idle"}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className={cn("max-w-[92%] type-body-md text-on-surface")}>
          <AlmondThought message={message} />
          {decided ? <AlmondDecidedLine headline={decided} /> : null}
          <AlmondToolChips message={message} />
          {looking ? (
            <AnimatedShinyText className="text-on-surface-variant">{t.streaming}</AnimatedShinyText>
          ) : (
            <AlmondMarkdown>{text}</AlmondMarkdown>
          )}
          {/* The slow "still working" status sits AT the answer (inline under its text), never as a
              floating second thinking node below the turn. Only one indicator shows at a time. */}
          {working && <WorkingLine />}
          {/* Single meters Almond pulled into the chat this turn, as light inline cards (B2). Above
              the action chips so the meter is read first, then the tap-to-open chip beside it. */}
          {meterCards.map((card, i) => (
            <AlmondMeterCard key={`${card.meter.id}-${i}`} card={card} />
          ))}
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

/** The mascot wrapped in a thin, spinning conic ring (green -> gold) — the "thinking" loader. The
 *  ring sits just outside the avatar and is left static under reduced motion (globals.css). One
 *  component serves both the pre-answer thinking line and the slow file "working" line. */
function ThinkingMascot({ size }: { size: number }) {
  const ring = size + 10;
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: ring, height: ring }}
    >
      <span aria-hidden className="almond-thinking-ring absolute inset-0 rounded-full" />
      <AlmondAvatar size={size} state="thinking" />
    </span>
  );
}

/** The live "thinking" line shown BEFORE any answer arrives: the mascot inside a spinning ring beside
 *  a calm shimmering "Thinking", so the wait reads as a polished loader, not a dead box. */
function ThinkingLine() {
  return (
    <div className="flex items-center gap-2.5">
      <ThinkingMascot size={THINKING_AVATAR} />
      <AnimatedShinyText className="px-1 py-2 text-on-surface-variant">{t.thinking}</AnimatedShinyText>
    </div>
  );
}

/** The "still working" line shown AT a streamed answer while Almond keeps building something slow
 *  (a spreadsheet or PDF), so the file-generation wait always shows a live loader instead of a frozen
 *  message. Rendered inline inside the assistant turn (under its text), a touch smaller than the
 *  pre-answer thinking line, so it never floats as a second thinking node below the turn. */
function WorkingLine() {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <ThinkingMascot size={20} />
      <AnimatedShinyText className="type-body-sm text-on-surface-variant">{t.working}</AnimatedShinyText>
    </div>
  );
}
