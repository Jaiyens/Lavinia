// Client-side helpers for a file Almond made (a PDF report or an .xlsx export). The bytes arrive
// base64 in the transient `data-report` stream part; both the download card and the preview overlay
// decode and act on them here, so the decode/download/type logic lives in exactly one place.

/** The minimum a file needs to be decoded, typed, and downloaded. */
export type ReportFileLike = {
  fileName: string;
  contentType: string;
  /** Base64-encoded file bytes (the server encoded them with Buffer for JSON transport). */
  base64: string;
};

/** Decode a base64 payload into a fresh ArrayBuffer (backs a Blob with no SharedArrayBuffer ambiguity). */
export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/** Whether this file is a PDF, by its content type or extension. */
export function isPdfFile(file: { contentType: string; fileName: string }): boolean {
  return file.contentType === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf");
}

/** Whether this file is a spreadsheet we can render as a table (.xlsx / .xls), by type or extension. */
export function isSpreadsheetFile(file: { contentType: string; fileName: string }): boolean {
  const name = file.fileName.toLowerCase();
  return (
    file.contentType.includes("spreadsheetml") ||
    file.contentType === "application/vnd.ms-excel" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  );
}

/**
 * Trigger a download of the file. The Blob URL is built AT CALL TIME and revoked on a timer after the
 * browser has started reading it: creating-and-revoking around the click avoids the re-render race
 * that made an on-mount URL get revoked out from under the link (the "check internet connection" bug).
 */
export function downloadReportFile(file: ReportFileLike): void {
  let url: string | null = null;
  try {
    const blob = new Blob([decodeBase64ToArrayBuffer(file.base64)], { type: file.contentType });
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // A malformed payload (should not happen — the server encodes it) simply does nothing.
  } finally {
    if (url !== null) {
      const toRevoke = url;
      window.setTimeout(() => URL.revokeObjectURL(toRevoke), 4000);
    }
  }
}
