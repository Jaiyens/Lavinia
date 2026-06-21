import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Shared calm chrome for the post-login fork surfaces (/start, /join, the waiting screen): the same
// grain canvas + slim Terra wordmark as onboarding, without the three-step stepper (these are not
// onboarding steps). Centered single column, mobile-first.
export function ForkShell({
  children,
  maxWidth = "max-w-2xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="grain relative flex min-h-dvh w-full flex-col bg-surface text-on-surface">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-5">
        <span className="font-display text-lg font-semibold tracking-tight">Terra</span>
      </header>
      <div
        className={cn("mx-auto flex w-full flex-1 flex-col justify-center px-5 pb-20 pt-2", maxWidth)}
      >
        {children}
      </div>
    </main>
  );
}
