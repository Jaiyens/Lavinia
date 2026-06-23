"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import {
  decodeBase64ToArrayBuffer,
  downloadReportFile,
  isPdfFile,
  isSpreadsheetFile,
  type ReportFileLike,
} from "./report-file";

const t = en.shell.almond.export.skill.card;

// Bound the rendered grid so a huge sheet can never lock the tab building DOM. The real exports are
// ~180 meters, well under this.
const MAX_PREVIEW_ROWS = 1000;
const MAX_PREVIEW_COLS = 60;

/**
 * A scrollable, rectangular preview overlay for a file Almond made: a PDF (shown in the browser's
 * native viewer) or an .xlsx (parsed to a table). The download lives at the TOP so a grower can grab
 * the file straight from the preview. Rendered through a portal to <body> so it is never clipped or
 * mis-positioned by the chat panel's transformed (animated) container.
 */
export function AlmondFilePreview({ file, onClose }: { file: ReportFileLike; onClose: () => void }) {
  const reduce = useReducedMotion();
  const pdf = isPdfFile(file);
  const sheet = !pdf && isSpreadsheetFile(file);

  // Close on Escape. Capture-phase + stopPropagation so the chat panel's own Escape handler (also a
  // window listener) does not fire underneath and close the panel out from under the preview.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t.previewTitle(file.fileName)}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 sm:p-6"
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(88dvh,820px)] w-[min(94vw,920px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-[0_24px_70px_rgba(20,24,40,0.4)]"
      >
        <header className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
          <p className="min-w-0 flex-1 truncate type-body-md font-semibold text-on-surface">
            {file.fileName}
          </p>
          <button
            type="button"
            onClick={() => downloadReportFile(file)}
            aria-label={t.downloadAria(file.fileName)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 type-label-caps text-on-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Download size={14} aria-hidden />
            <span>{t.downloadShort}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closePreview}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] text-on-surface-variant hover:bg-tint"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-surface-container-low">
          {pdf ? (
            <PdfPreview file={file} />
          ) : sheet ? (
            <SpreadsheetPreview file={file} />
          ) : (
            <Unavailable />
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** A PDF in the browser's native, scrollable viewer (a Blob URL in an iframe). The URL is built once
 *  in a lazy initializer (the bytes never change while open) and revoked on unmount. */
function PdfPreview({ file }: { file: ReportFileLike }) {
  const [url] = useState<string | null>(() => {
    try {
      const blob = new Blob([decodeBase64ToArrayBuffer(file.base64)], { type: "application/pdf" });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (!url) return <Unavailable />;
  return <iframe src={url} title={file.fileName} className="h-full w-full border-0 bg-white" />;
}

/** An .xlsx rendered as a scrollable table. ExcelJS is loaded on demand so it never bloats the main
 *  bundle — only a grower who actually previews a spreadsheet pays for it. */
function SpreadsheetPreview({ file }: { file: ReportFileLike }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [failed, setFailed] = useState(false);
  const buffer = useMemo(() => decodeBase64ToArrayBuffer(file.base64), [file.base64]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) {
          if (!cancelled) setFailed(true);
          return;
        }
        const rowCount = Math.min(ws.rowCount, MAX_PREVIEW_ROWS);
        const colCount = Math.min(ws.columnCount, MAX_PREVIEW_COLS);
        const grid: string[][] = [];
        for (let r = 1; r <= rowCount; r++) {
          const row = ws.getRow(r);
          const cells: string[] = [];
          for (let c = 1; c <= colCount; c++) cells.push(row.getCell(c).text);
          grid.push(cells);
        }
        if (!cancelled) setRows(grid);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buffer]);

  if (failed) return <Unavailable />;
  if (rows === null) {
    return (
      <div className="grid h-full place-items-center px-6 text-center type-body-md text-on-surface-variant">
        {t.previewLoading}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left">
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className={cn(r === 0 && "sticky top-0")}>
              {cells.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    "whitespace-nowrap border border-outline-variant/60 px-3 py-1.5 align-top type-body-sm tabular-nums",
                    r === 0
                      ? "bg-surface-container font-semibold text-on-surface"
                      : "bg-surface-container-lowest text-on-surface-variant",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shown for a file type we cannot render inline (or a decode failure): the download still works. */
function Unavailable() {
  return (
    <div className="grid h-full place-items-center px-6 text-center type-body-md text-on-surface-variant">
      {t.previewUnavailable}
    </div>
  );
}
