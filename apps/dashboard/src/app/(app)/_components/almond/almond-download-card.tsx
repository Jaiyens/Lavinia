"use client";

import { useEffect, useMemo } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { en } from "@/copy/en";

/**
 * One spreadsheet Almond made this turn, captured client-side as its transient `data-report` part
 * arrived (Story 8.5). Holds the server-authored file name / content type, the base64 bytes, and the
 * meter count for the card label. Transient parts are not in `message.parts`, so the launcher
 * captures these and threads them down (like the navigation chips).
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

/** Decode the base64 payload into a fresh ArrayBuffer once, client-side (the server encoded with
 *  Buffer). Returns the backing ArrayBuffer so it slots into a Blob with no SharedArrayBuffer ambiguity. */
function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/**
 * The download card the panel renders for a file Almond made (Story 8.5). The bytes arrive base64 in
 * the transient stream part; we rebuild a Blob and offer it as a real object-URL download, revoked on
 * unmount so nothing leaks. A real `<a download>` gives native keyboard/right-click behavior; the
 * >= 44px target meets the touch-size law. The card states the file name so it is self-explaining.
 *
 * Defensive: a malformed base64 payload (should not happen - the server encodes it) yields no card
 * rather than a crash, so the conversation never breaks on a bad frame.
 */
export function AlmondDownloadCard({ card }: { card: AlmondReportCard }) {
  // Build the object URL once per distinct payload; revoke the previous one when it changes/unmounts.
  const url = useMemo(() => {
    try {
      const blob = new Blob([decodeBase64(card.base64)], { type: card.contentType });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [card.base64, card.contentType]);

  // Revoke the object URL when it changes (a new payload) or the card unmounts, so a Blob URL never
  // leaks. Keyed on `url`, so the cleanup closes over the exact URL it created (no ref read during
  // render). A null url (decode failed) has nothing to revoke.
  useEffect(() => {
    if (url === null) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (url === null) return null;

  return (
    <div className="mt-2 flex items-center gap-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low px-3 py-2">
      <FileSpreadsheet size={22} className="shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="type-body-md truncate font-medium text-on-surface">{card.fileName}</p>
        {card.saved ? (
          <p className="type-body-sm truncate text-on-surface-variant">{t.savedToReports}</p>
        ) : null}
      </div>
      <a
        href={url}
        download={card.fileName}
        aria-label={t.downloadAria(card.fileName)}
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 type-label-caps text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Download size={14} aria-hidden />
        <span>{t.download}</span>
      </a>
    </div>
  );
}
