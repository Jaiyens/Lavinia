"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft } from "lucide-react";
import { en } from "@/copy/en";
import { requestRateSwitchAction } from "./actions";

// Owner-only "Request this rate switch" control on a proposed rate-switch action. A client
// component so the owner taps without a full reload; it posts the action ID (a serializable
// string token, NOT a function) to the server action, which re-checks ownership server-side.
// While the transition is pending the button disables so a double-tap cannot double-fire (the
// server's atomic status guard is the real backstop). On success it shows the calm "Requested"
// confirmation in place of the button. Mobile-first: >= 44px tap target.
export function RequestRateSwitchButton({
  agentActionId,
  summary,
}: {
  agentActionId: string;
  summary: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await requestRateSwitchAction(agentActionId);
      if (res.ok) {
        setDone(true);
      } else {
        setError(res.error ?? en.agents.rateAgent.requestError);
      }
    });
  }

  if (done) {
    return (
      <p role="status" className="type-body-sm mt-3 text-on-surface-variant">
        {en.agents.rateAgent.requested}
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        aria-label={en.agents.rateAgent.requestAria(summary)}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 type-body-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ArrowRightLeft size={16} aria-hidden />
        {en.agents.rateAgent.request}
      </button>
      {error !== null && (
        <p role="alert" className="type-body-sm text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
