"use client";

// The "Connect your Almond Logic login" box (Phase 2 credential capture). A grower enters their Almond
// Logic username + password ONCE; the Server Action encrypts them (AES-256-GCM) before they touch the
// DB and Terra uses them only inside the Sandbox to read yield data. This component NEVER logs, echoes,
// or persists the plaintext beyond the input field, and clears the password on success. The action is
// the real security gate (session + manager role + own-farm); this form is just the input surface.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { en } from "@/copy/en";
import { saveAlmondLogicCredentialAction } from "../crop-actions";

const copy = en.crops.credential;

export function AlmondCredentialForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || username.trim() === "" || password === "") return;
    startTransition(async () => {
      const res = await saveAlmondLogicCredentialAction(username.trim(), password);
      if (res.ok) {
        setPassword(""); // never keep the plaintext around after a successful save
        setResult({ ok: true, message: copy.saved });
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <section
      aria-label={copy.title}
      className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-6 shadow-e1"
    >
      <p className="type-label-caps text-primary">{copy.eyebrow}</p>
      <h2 className="type-title mt-1 text-on-surface">{copy.title}</h2>
      <p className="type-body-sm mt-2 max-w-prose text-on-surface-variant">{copy.subtitle}</p>

      <form onSubmit={onSubmit} className="mt-4 flex max-w-sm flex-col gap-3">
        <Input
          label={copy.username}
          type="text"
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={pending}
          required
        />
        <Input
          label={copy.password}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          required
        />
        <div className="mt-1 flex items-center gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={pending || username.trim() === "" || password === ""}
            aria-busy={pending}
          >
            {pending ? copy.saving : copy.save}
          </Button>
          {result ? (
            <p
              className={
                result.ok ? "type-caption text-primary" : "type-caption text-destructive"
              }
              role="status"
              aria-live="polite"
            >
              {result.message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
