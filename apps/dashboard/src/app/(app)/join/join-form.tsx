"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { en } from "@/copy/en";
import { Button, Input } from "@/components/ui";
import { createJoinRequestAction } from "./actions";

// The code-entry form on /join. Submits a join code (+ optional note) to createJoinRequestAction.
// On success the request is in, so we route to /start, whose resolveLanding now returns "waiting"
// and renders the waiting-for-approval screen. On a calm short-circuit (already a member, bad code,
// cooldown) the op returns ok:false with a plain message shown inline.
export function JoinForm() {
  const router = useRouter();
  const t = en.join;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData): void {
    setError(null);
    const code = String(formData.get("code") ?? "");
    const message = String(formData.get("message") ?? "");
    start(async () => {
      const res = await createJoinRequestAction(code, message);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/start");
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <Input name="code" label={t.codeLabel} placeholder={t.codePlaceholder} required autoComplete="off" />
      <Input name="message" label={t.messageLabel} placeholder={t.messagePlaceholder} autoComplete="off" />
      {error ? <p className="type-body-sm text-alert">{error}</p> : null}
      <Button type="submit" variant="primary" className="mt-2 w-full" disabled={pending}>
        {t.submit}
      </Button>
    </form>
  );
}
