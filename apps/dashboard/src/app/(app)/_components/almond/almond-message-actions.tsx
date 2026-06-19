"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { mdToHtml, mdToPlain } from "./markdown-clipboard";

const t = en.shell.almond;

/**
 * The small action row under a chat message, the way Claude / ChatGPT / Notion do it: copy the text,
 * edit and re-ask a user question, or ask Almond to answer again. Hidden until the message is hovered
 * (a calm bubble by default), and always visible on touch devices where there is no hover. The icons
 * are secondary affordances; the primary controls (send, starters, action chips) carry the 44px touch
 * target.
 */
export function AlmondMessageActions({
  text,
  onEdit,
  onRegenerate,
  align = "start",
  className,
}: {
  /** The plain text to put on the clipboard (the message body). */
  text: string;
  /** Show the Edit control (user messages only). */
  onEdit?: () => void;
  /** Show the Regenerate control (assistant messages only). */
  onRegenerate?: () => void;
  /** Which side to align to: user bubbles sit right (end), Almond left (start). */
  align?: "start" | "end";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // The message body is markdown. Put BOTH a rich HTML flavor (real <strong>/<em>/<del>/<a>/lists,
    // no `**`/`~~` markers) and a clean plain-text flavor on the clipboard, so a rich target (Mail,
    // Notes, Docs) pastes bold as bold while a plain target pastes clean prose. This fixes the
    // grower's #1 complaint: copied answers leaked literal asterisks and tildes.
    const plain = mdToPlain(text);
    try {
      if (
        typeof ClipboardItem !== "undefined" &&
        typeof navigator.clipboard?.write === "function"
      ) {
        const html = mdToHtml(text);
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        // Older browsers / no ClipboardItem: write the markers-stripped plain text.
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context / denied permission); fail quietly, and try the
      // simplest path once more so a partial failure still copies clean text where possible.
      try {
        await navigator.clipboard.writeText(plain);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        // Give up quietly.
      }
    }
  }

  return (
    <div
      className={cn(
        "mt-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
        "[@media(hover:none)]:opacity-100",
        align === "end" && "justify-end",
        className,
      )}
    >
      <ActionButton onClick={copy} label={copied ? t.copied : t.copy} aria={t.copyAria}>
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </ActionButton>
      {onEdit && (
        <ActionButton onClick={onEdit} label={t.editAction} aria={t.editAria}>
          <Pencil size={14} aria-hidden />
        </ActionButton>
      )}
      {onRegenerate && (
        <ActionButton onClick={onRegenerate} label={t.regenerate} aria={t.regenerateAria}>
          <RotateCcw size={14} aria-hidden />
        </ActionButton>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  aria,
  children,
}: {
  onClick: () => void;
  label: string;
  aria: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] text-on-surface-variant transition-colors hover:bg-tint hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      {children}
    </button>
  );
}
