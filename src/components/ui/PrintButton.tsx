"use client";

import { Printer } from "lucide-react";

/** Opens the browser print dialog so the white paper can be saved as a PDF. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="press inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-accent-300 print:hidden"
    >
      <Printer size={15} />
      Print or save as PDF
    </button>
  );
}
