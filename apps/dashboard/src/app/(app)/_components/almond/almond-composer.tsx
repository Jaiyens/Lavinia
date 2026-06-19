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
  const { send, status, canAttach } = useAlmondChat();
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const canSend = !busy && (value.trim().length > 0 || files.length > 0);

  function submit() {
    if (!canSend) return;
    send(value, files);
    setValue("");
    setFiles([]);
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          autoFocus={autoFocus}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          className={cn(
            "w-full resize-none bg-transparent px-3.5 text-on-surface outline-none placeholder:text-on-surface-variant",
            isPage ? "max-h-48 min-h-[3.5rem] pt-3.5 type-title" : "max-h-28 min-h-[2.5rem] pt-2.5 type-body-md",
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
