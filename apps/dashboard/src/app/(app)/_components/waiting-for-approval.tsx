"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { en } from "@/copy/en";
import { cancelJoinRequestAction } from "../join/actions";
import { signOutAction } from "../actions";

// The waiting-for-approval screen, rendered by /start when resolveLanding returns "waiting". No
// polling needed: every navigation re-resolves, so on approval the next visit lands on the
// dashboard. "Cancel request" withdraws the request and returns to the fork; "Use a different
// account" signs out (for someone who used the wrong email).
export function WaitingForApproval({
  requestId,
  farmName,
}: {
  requestId: string;
  farmName: string;
}) {
  const router = useRouter();
  const t = en.join.waiting;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel(): void {
    setError(null);
    start(async () => {
      const res = await cancelJoinRequestAction(requestId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/start");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="type-label-caps text-on-surface-variant">{en.start.eyebrow}</span>
        <h1 className="type-display-lg">{t.title}</h1>
        <p className="type-body-md text-on-surface-variant">{t.body(farmName)}</p>
        <p className="type-body-sm text-on-surface-variant/80">{t.hint}</p>
      </div>
      {error ? <p className="type-body-sm text-alert">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-5">
        <Button
          type="button"
          variant="link"
          onClick={cancel}
          disabled={pending}
          className="h-auto p-0 type-body-sm font-normal text-on-surface-variant underline-offset-4 transition-colors hover:text-alert hover:underline disabled:opacity-50"
        >
          {t.cancel}
        </Button>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="link"
            className="h-auto p-0 type-body-sm font-normal text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline"
          >
            {t.signOut}
          </Button>
        </form>
      </div>
    </div>
  );
}
