"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { en } from "@/copy/en";

const t = en.shell.almond;

type Props = {
  onSend: (text: string) => void;
  disabled: boolean;
};

export function AlmondComposer({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
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

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 border-t border-outline-variant bg-paper p-3"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={t.placeholder}
        aria-label={t.placeholder}
        className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low px-3 py-2 type-body-md text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        aria-label={t.send}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-primary text-on-primary transition-opacity disabled:opacity-40"
      >
        <ArrowUp size={18} aria-hidden />
      </button>
    </form>
  );
}
