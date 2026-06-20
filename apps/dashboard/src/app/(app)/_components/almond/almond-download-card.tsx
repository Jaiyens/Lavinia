"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Download, Eye, FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { downloadReportFile, isPdfFile } from "./report-file";
import { AlmondFilePreview } from "./almond-file-preview";

/**
 * One file Almond made this turn (a spreadsheet export, Story 8.5, or a PDF report, Story 9.3),
 * captured client-side as its transient `data-report` part arrived. Holds the server-authored file
 * name / content type, the base64 bytes, and the meter count for the card label. Transient parts are
 * not in `message.parts`, so the launcher captures these and threads them down (like the nav chips).
 */
export type AlmondReportCard = {
  fileName: string;
  contentType: string;
  base64: string;
  meterCount: number;
  /** True when the file was kept in the grower's Reports (owner-only persistence, Story 8.6). */
  saved?: boolean;
};

const t = en.shell.almond.export.skill.card;

// A clean PDF red for the PDF card's icon; the spreadsheet card stays Terra green. Literal so the
// document type reads at a glance (red PDF, green sheet) without a new palette token.
const PDF_RED = "#D33A2C";

/**
 * The card the panel renders for a file Almond made — now PREVIEW-FIRST. Clicking the file opens a
 * scrollable overlay of it (a PDF in the native viewer, an .xlsx as a table) with the download on
 * top, so a grower sees the file before saving it. The download button stays on the card as a quick
 * action; both paths share the decode/download logic in `report-file.ts`. The bytes arrive base64 in
 * the transient stream part and are decoded to a Blob at click time (creating-and-revoking around the
 * click avoids the re-render race that previously failed the download).
 *
 * The card labels and icons itself by the file it carries: a green spreadsheet icon for an xlsx, a
 * red document icon for a PDF report.
 */
export function AlmondDownloadCard({ card }: { card: AlmondReportCard }) {
  const pdf = isPdfFile(card);
  const Icon = pdf ? FileText : FileSpreadsheet;
  const downloadLabel = pdf ? t.downloadPdf : t.download;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low px-3 py-2">
        {/* The file area opens the preview (preview-first). A button, not a wrapping div, so the
            download button beside it is never a nested interactive. */}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          aria-label={t.previewAria(card.fileName)}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] py-1 text-left transition-colors"
        >
          <Icon
            size={22}
            className={cn("shrink-0", !pdf && "text-primary")}
            style={pdf ? { color: PDF_RED } : undefined}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="type-body-md truncate font-medium text-on-surface group-hover:text-primary">
              {card.fileName}
            </p>
            <p className="flex items-center gap-1 type-body-sm truncate text-on-surface-variant">
              <Eye size={12} aria-hidden className="shrink-0" />
              <span>{card.saved ? `${t.preview} · ${t.savedToReports}` : t.preview}</span>
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => downloadReportFile(card)}
          aria-label={t.downloadAria(card.fileName)}
          className={cn(
            "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 type-label-caps transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
            !pdf &&
              "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 focus-visible:outline-primary",
          )}
          style={
            pdf
              ? {
                  color: PDF_RED,
                  borderColor: `${PDF_RED}66`,
                  backgroundColor: `${PDF_RED}0d`,
                  outlineColor: PDF_RED,
                }
              : undefined
          }
        >
          <Download size={14} aria-hidden />
          <span>{downloadLabel}</span>
        </button>
      </div>

      <AnimatePresence>
        {previewOpen && <AlmondFilePreview file={card} onClose={() => setPreviewOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
