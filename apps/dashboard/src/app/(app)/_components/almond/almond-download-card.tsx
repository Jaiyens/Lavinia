"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";

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

// A clean PDF red for the PDF card's icon + button; the spreadsheet card stays Terra green. Literal
// so the document type reads at a glance (red PDF, green sheet) without a new palette token.
const PDF_RED = "#D33A2C";

/** Decode the base64 payload into a fresh ArrayBuffer (the server encoded it with Buffer). Returns the
 *  backing ArrayBuffer so it slots into a Blob with no SharedArrayBuffer ambiguity. */
function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/** Whether this card carries a PDF (vs a spreadsheet), by its content type or file extension. */
function isPdf(card: AlmondReportCard): boolean {
  return card.contentType === "application/pdf" || card.fileName.toLowerCase().endsWith(".pdf");
}

/**
 * The download card the panel renders for a file Almond made. The bytes arrive base64 in the transient
 * stream part; the download is built AT CLICK TIME — decode to a Blob, create an object URL, click a
 * temporary anchor, then revoke the URL on a timer. The previous version created the URL on mount and
 * revoked it on unmount, so a re-render (the chat re-renders constantly while streaming) could revoke
 * the URL out from under the link and Chrome failed the download with a "check internet connection"
 * network error. Creating-and-revoking around the click removes that whole class of timing bug.
 *
 * The card labels and icons itself by the file it carries: a green spreadsheet icon + "Download
 * spreadsheet" for an xlsx, a red document icon + "Download PDF" for a PDF report.
 */
export function AlmondDownloadCard({ card }: { card: AlmondReportCard }) {
  const pdf = isPdf(card);
  const Icon = pdf ? FileText : FileSpreadsheet;
  const label = pdf ? t.downloadPdf : t.download;

  function download() {
    let url: string | null = null;
    try {
      const blob = new Blob([decodeBase64(card.base64)], { type: card.contentType });
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = card.fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // A malformed payload (should not happen — the server encodes it) simply does nothing on click,
      // so the conversation never breaks on a bad frame.
    } finally {
      // Revoke only AFTER the browser has started reading the blob; revoking synchronously is exactly
      // what made the download fail. A few seconds is ample for the download to kick off.
      if (url !== null) {
        const toRevoke = url;
        window.setTimeout(() => URL.revokeObjectURL(toRevoke), 4000);
      }
    }
  }

  return (
    <div className="mt-2 flex items-center gap-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low px-3 py-2">
      <Icon
        size={22}
        className={cn("shrink-0", !pdf && "text-primary")}
        style={pdf ? { color: PDF_RED } : undefined}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="type-body-md truncate font-medium text-on-surface">{card.fileName}</p>
        {card.saved ? (
          <p className="type-body-sm truncate text-on-surface-variant">{t.savedToReports}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={download}
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
        <span>{label}</span>
      </button>
    </div>
  );
}
