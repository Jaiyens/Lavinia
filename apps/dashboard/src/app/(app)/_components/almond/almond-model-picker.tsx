"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { ALMOND_MODELS, type AlmondModelId } from "@/lib/almond/models";
import { useAlmondChat } from "./almond-launcher-provider";

const t = en.shell.almond;

/**
 * The model picker: a grower can switch which model answers (a farmer specifically loved this).
 *
 * A CUSTOM popover (not a native `<select>`, which renders the OS's own dropdown box) so it matches
 * the rest of the chat's look — a rounded card with the model list, the provider on the right, and a
 * check on the current one. It opens UPWARD because the composer sits at the bottom of the panel/page.
 * The choice is held in the shared chat context (persisted to localStorage there); the chat route
 * re-validates the id, so only an allowlisted model can ever be picked.
 */
export function AlmondModelPicker({ className }: { className?: string }) {
  const { model, setModel } = useAlmondChat();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = ALMOND_MODELS.find((m) => m.id === model) ?? ALMOND_MODELS[0];

  // Close on outside click or Escape (only while open).
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: AlmondModelId) {
    setModel(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.modelPickerAria}
        className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest py-1 pl-3 pr-2 type-label-caps text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface"
      >
        <span>{current.label}</span>
        <ChevronDown
          size={13}
          aria-hidden
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.modelPickerAria}
          className="absolute bottom-full left-0 z-50 mb-1.5 max-h-72 w-56 overflow-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-1 shadow-[var(--shadow-elevated)]"
        >
          <p className="px-2.5 py-1.5 type-label-caps text-on-surface-variant/70">{t.modelLabel}</p>
          {ALMOND_MODELS.map((m) => {
            const selected = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(m.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-left type-body-md transition-colors",
                  selected
                    ? "bg-primary/10 text-on-surface"
                    : "text-on-surface hover:bg-surface-container-high",
                )}
              >
                <span className="flex-1 truncate">{m.label}</span>
                <span className="shrink-0 type-label-caps text-on-surface-variant/70">{m.provider}</span>
                {selected ? (
                  <Check size={14} aria-hidden className="shrink-0 text-primary" />
                ) : (
                  <span aria-hidden className="w-3.5 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
