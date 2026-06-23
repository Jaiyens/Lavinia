"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { en } from "@/copy/en";
import { approveAgentActionAction, rejectAgentActionAction } from "./actions";

// Owner-only Approve / Skip controls on a proposed agent action. A client component so the
// owner taps without a full reload; it posts the action ID (a serializable string token, NOT
// a function) to the server actions, which re-check ownership server-side — the client is
// never trusted. While a transition is pending both buttons disable so a double-tap cannot
// double-fire (the server's atomic status guard is the real backstop). Mobile-first: >= 44px
// tap targets.
export function AgentActionButtons({
  agentActionId,
  summary,
}: {
  agentActionId: string;
  summary: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn(agentActionId);
      if (!res.ok) setError(res.error ?? en.agents.actionError);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(approveAgentActionAction)}
          aria-label={en.agents.approveAria(summary)}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 type-body-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Check size={16} aria-hidden />
          {en.agents.approve}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(rejectAgentActionAction)}
          aria-label={en.agents.rejectAria(summary)}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X size={16} aria-hidden />
          {en.agents.reject}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="type-body-sm text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
