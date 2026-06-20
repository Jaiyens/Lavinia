import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/logo";
import { AuthBackdrop } from "@/components/auth-backdrop";

// Shared onboarding chrome (identify -> connect -> review). The same premium "front door"
// vibe as the sign-in screen: the shared AuthBackdrop (soft green glows on a calm cool-grey
// canvas), a logo-chip wordmark, and a three-segment progress bar so the grower always
// knows how far they are. Content is centered in a single column; `wide` widens it for the
// source picker's stacked cards. Mobile-first: the bar wraps under the wordmark on the
// narrowest screens via the flex header.
export function OnboardingShell({
  step,
  children,
  wide = false,
}: {
  step: 1 | 2 | 3;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="relative flex min-h-dvh w-full flex-col text-on-surface">
      <AuthBackdrop />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5"
          aria-label="Terra home"
        >
          <span className="flex size-9 items-center justify-center rounded-[0.7rem] border border-outline-variant bg-surface-bright shadow-e1">
            <LogoMark className="size-5 text-primary transition-transform duration-200 ease-out group-hover:rotate-6" />
          </span>
          <span className="font-display text-lg leading-none">Terra</span>
        </Link>
        <Stepper step={step} />
      </header>
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col justify-center px-5 pb-20 pt-2",
          wide ? "max-w-xl" : "max-w-md",
        )}
      >
        <div className="reveal">{children}</div>
      </div>
    </main>
  );
}

const LABELS = ["Identify", "Connect", "Review"];

function Stepper({ step }: { step: number }) {
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={`Step ${step} of 3: ${LABELS[step - 1]}`}
    >
      <span className="type-caption hidden text-on-surface-variant sm:inline">
        {LABELS[step - 1]}
      </span>
      <span className="flex items-center gap-1.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-[--dur-base] ease-[--ease-standard]",
              n === step
                ? "w-7 bg-primary"
                : n < step
                  ? "w-4 bg-primary/40"
                  : "w-4 bg-outline-variant",
            )}
          />
        ))}
      </span>
    </div>
  );
}
