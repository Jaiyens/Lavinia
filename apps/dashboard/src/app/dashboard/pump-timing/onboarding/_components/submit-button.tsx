"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * A submit button that shows a pending label while its enclosing server-action
 * form is in flight. Must live inside the <form> (useFormStatus reads its context).
 */
export function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const base =
    "label-caps inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 transition-colors disabled:opacity-60";
  const look =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:bg-accent/90"
      : "border-border-strong text-foreground hover:bg-foreground hover:text-background border";
  return (
    <button type="submit" disabled={pending} className={cn(base, look, className)}>
      {pending ? pendingLabel : label}
      {!pending && variant === "primary" ? <span aria-hidden>→</span> : null}
    </button>
  );
}
