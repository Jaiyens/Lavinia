"use client";

// Add-people form: paste one or more emails, pick a role, then a CONFIRM step shows the parsed
// addresses as chips before sending (the typo guard - a wrong address grants a real stranger
// access). Submits to inviteMembersAction; the server re-validates the role cap and dedupes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { FarmRole } from "@prisma/client";
import { Button } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { en } from "@/copy/en";
import { parseEmailList } from "@/lib/auth/team";
import { inviteMembersAction } from "../actions";

export function AddPeople({ farmId, canGrantOwner }: { farmId: string; canGrantOwner: boolean }) {
  const router = useRouter();
  const t = en.team;
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<FarmRole>("manager");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [chips, setChips] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const roleOptions: FarmRole[] = canGrantOwner ? ["owner", "manager", "viewer"] : ["manager", "viewer"];

  function review() {
    setError(null);
    setMessage(null);
    const { valid, invalid } = parseEmailList(raw);
    const firstBad = invalid[0];
    if (firstBad !== undefined) {
      setError(t.invalidEmail(firstBad));
      return;
    }
    if (valid.length === 0) {
      setError("Add at least one email.");
      return;
    }
    setChips(valid);
    setStep("confirm");
  }

  function send() {
    startTransition(async () => {
      const res = await inviteMembersAction(farmId, raw, role);
      if (res.ok) {
        setMessage(res.message ?? null);
        setRaw("");
        setChips([]);
        setStep("edit");
        router.refresh();
      } else {
        setError(res.error);
        setStep("edit");
      }
    });
  }

  return (
    <section className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
      <h2 className="type-label-caps mb-1 text-on-surface-variant">{t.addHeading}</h2>

      {step === "edit" ? (
        <>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={t.addPlaceholder}
            rows={3}
            className="mt-3 w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 type-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline focus:outline-2 focus:outline-primary"
          />
          <p className="mt-1.5 type-caption text-on-surface-variant">{t.addHelper}</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="type-label-caps text-on-surface-variant">{t.roleLabel}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" aria-label={t.roleLabel}>
                    {t.roles[role].label}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={role} onValueChange={(value) => setRole(value as FarmRole)}>
                    {roleOptions.map((r) => (
                      <DropdownMenuRadioItem key={r} value={r}>
                        {t.roles[r].label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button type="button" variant="primary" onClick={review} disabled={pending}>
              {t.reviewCta}
            </Button>
          </div>
          <p className="mt-3 type-caption text-on-surface-variant">{t.roles[role].desc}</p>
        </>
      ) : (
        <>
          <p className="mt-3 type-body-sm font-semibold text-on-surface">{t.confirmTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((email) => (
              <span
                key={email}
                className="rounded-full bg-surface-container px-3 py-1 type-body-sm text-on-surface"
              >
                {email}
              </span>
            ))}
          </div>
          <p className="mt-3 type-caption text-on-surface-variant">
            {t.roles[role].label}. {t.confirmBody}
          </p>
          <div className="mt-4 flex gap-3">
            <Button type="button" variant="primary" onClick={send} disabled={pending}>
              {t.sendCta}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep("edit")} disabled={pending}>
              {t.back}
            </Button>
          </div>
        </>
      )}

      {error ? <p className="mt-3 type-body-sm text-alert">{error}</p> : null}
      {message ? <p className="mt-3 type-body-sm text-primary">{message}</p> : null}
    </section>
  );
}
