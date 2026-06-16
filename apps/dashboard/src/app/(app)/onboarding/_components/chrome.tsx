import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Shared onboarding chrome (identify -> connect -> review). A calm warm-paper canvas with a
// faint grain wash, a slim Terra wordmark, and a three-segment progress bar so the grower
// always knows how far they are. Content is centered in a single column; `wide` widens it
// for the source picker's stacked cards. Mobile-first: the bar wraps under the wordmark on
// the narrowest screens via the flex header.
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
    <main className="grain relative flex min-h-dvh w-full flex-col bg-surface text-on-surface">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <span className="font-display text-lg font-semibold tracking-tight">Terra</span>
        <Stepper step={step} />
      </header>
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col justify-center px-5 pb-20 pt-2",
          wide ? "max-w-xl" : "max-w-md",
        )}
      >
        {children}
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
