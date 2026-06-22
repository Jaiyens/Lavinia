"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { useAlmondChat } from "./almond-launcher-provider";
import { AlmondModelPicker } from "./almond-model-picker";
import { AlmondAttachments } from "./almond-attachments";

const t = en.shell.almond;

// Read-only context attachments: a grower's bills/exports. Generous caps so a real export fits while
// bounding cost/abuse (the per-IP rate limit is the other guard).
const ACCEPT = ".pdf,.xlsx,.xls,.csv,image/png,image/jpeg,image/webp";
const MAX_FILES = 4;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file

type Props = {
  /** "panel" (compact, in the floating drawer) or "page" (roomier, on the /almond tab). */
  variant?: "panel" | "page";
  /** Autofocus the textarea on mount (the empty full page does this). */
  autoFocus?: boolean;
};

/**
 * The shared composer for both Almond surfaces. Reads the chat from context (`send`, `status`,
 * `canAttach`), so the panel and the full page submit into the SAME conversation. Carries the model
 * picker and, for an authed owner, a file attach control (PDF / Excel / CSV).
 */
export function AlmondComposer({ variant = "panel", autoFocus = false }: Props) {
  const { send, status, canAttach, usageLimit } = useAlmondChat();
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const busy = status === "submitted" || status === "streaming";
  // The durable per-user token budget is spent: lock the composer so no new turn can be sent (the
  // server would 429 it anyway — this is just the honest, immediate UI of the hard server gate).
  const limited = usageLimit !== null;
  const canSend = !busy && !limited && (value.trim().length > 0 || files.length > 0);
  const placeholder = limited ? t.usage.composerDisabled : t.placeholder;

  // Grow the box with its content line by line (capped by max-h), so a single line sits centered with
  // no stray scrollbar and a long question expands instead of cramming text against the edges. The
  // scrollbar only appears once the content passes the cap.
  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function resetSize() {
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
  }

  function submit() {
    if (!canSend) return;
    send(value, files);
    setValue("");
    setFiles([]);
    resetSize();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.size <= MAX_BYTES);
    if (picked.length > 0) {
      setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
    }
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
  }

  const isPage = variant === "page";

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex flex-col gap-2",
        variant === "panel" && "border-t border-outline-variant bg-paper p-3",
      )}
    >
      <AlmondAttachments files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))} />

      <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low transition-colors focus-within:border-primary">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn(
            "w-full resize-none bg-transparent px-3.5 text-on-surface outline-none placeholder:text-on-surface-variant",
            isPage
              ? "max-h-56 min-h-[3.25rem] py-3.5 leading-7 type-title"
              : "max-h-40 min-h-[2.75rem] py-3 leading-6 type-body-md",
          )}
        />
        <div className="flex items-center gap-1.5 px-2 pb-2">
          {canAttach && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                onChange={onPickFiles}
                className="sr-only"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t.attachAria}
                title={t.attach}
                className="grid h-8 w-8 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-tint hover:text-on-surface"
              >
                <Paperclip size={17} aria-hidden />
              </button>
            </>
          )}
          <AlmondModelPicker />
          <button
            type="submit"
            disabled={!canSend}
            aria-label={t.send}
            className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition-opacity disabled:opacity-40"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
      </div>
    </form>
  );
}
