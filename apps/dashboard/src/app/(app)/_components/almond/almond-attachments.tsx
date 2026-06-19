"use client";

import { FileText, X } from "lucide-react";
import { en } from "@/copy/en";

const t = en.shell.almond;

/**
 * The chips for files a grower has attached to the next turn (PDF / Excel / CSV), each removable
 * before sending. Read-only context: these go to the model as content, never as a data write. The
 * actual file reading happens server-side (spreadsheets parsed to text; PDFs/images read natively).
 */
export function AlmondAttachments({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={t.attachmentsLabel}>
      {files.map((file, i) => (
        <span
          key={`${file.name}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-1 type-label-caps text-on-surface-variant"
        >
          <FileText size={13} aria-hidden className="text-primary" />
          <span className="max-w-[12rem] truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={t.removeAttachment(file.name)}
            className="grid h-4 w-4 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-tint hover:text-on-surface"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
