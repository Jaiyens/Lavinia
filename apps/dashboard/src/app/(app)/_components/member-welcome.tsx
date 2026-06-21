"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { en } from "@/copy/en";
import { dismissMemberWelcomeAction } from "../actions";

// The one-time welcome banner an INVITED member sees on Home (someone added them to a farm another
// operator set up). The server decides `show` from the membership (invited) and the dismissal
// cookie, so there is no flash of an already-dismissed banner; this client wrapper adds the
// optimistic self-hide so dismissal feels instant without waiting on the server round-trip.
export function MemberWelcome({ show, farmName }: { show: boolean; farmName: string }) {
  const [hidden, setHidden] = useState(false);
  if (!show || hidden) return null;

  function dismiss(): void {
    setHidden(true);
    void dismissMemberWelcomeAction();
  }

  const t = en.shell.memberWelcome;
  return (
    <div
      role="status"
      className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-4 shadow-[var(--shadow-soft)]"
    >
      <div className="min-w-0">
        <p className="type-body-md font-semibold text-on-surface">{t.title(farmName)}</p>
        <p className="mt-1 type-body-sm text-on-surface-variant">{t.body}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.dismiss}
        className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
