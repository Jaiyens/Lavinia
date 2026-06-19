"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { ALMOND_MODELS, type AlmondModelId } from "@/lib/almond/models";
import { useAlmondChat } from "./almond-launcher-provider";

const t = en.shell.almond;

/**
 * The model picker: a grower can switch which model answers (a farmer specifically loved this). A
 * native `<select>` keeps it fully accessible and good on a phone; the options are the curated
 * allowlist (`ALMOND_MODELS`), and the choice is held in the shared chat context (persisted to
 * localStorage there). The chat route re-validates the id, so the picker can only ever pick an
 * allowlisted model.
 */
export function AlmondModelPicker({ className }: { className?: string }) {
  const { model, setModel } = useAlmondChat();
  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value as AlmondModelId)}
        aria-label={t.modelPickerAria}
        className="appearance-none rounded-full border border-outline-variant bg-surface-container-lowest py-1 pl-3 pr-7 type-label-caps text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface focus:outline-none focus-visible:border-primary"
      >
        {ALMOND_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        aria-hidden
        className="pointer-events-none absolute right-2 text-on-surface-variant"
      />
    </div>
  );
}
