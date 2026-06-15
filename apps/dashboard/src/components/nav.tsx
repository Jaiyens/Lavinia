import { cn } from "@/lib/cn";
import { Wordmark } from "./logo";

/**
 * Shared top bar for the tool. The Wordmark links home (/, which opens the
 * tool). "solid" gives a real app-shell bar; "over" floats transparently.
 */
export function Nav({ variant = "over" }: { variant?: "over" | "solid" }) {
  const solid = variant === "solid";
  return (
    <header
      className={cn(
        "z-30 w-full",
        solid
          ? "bg-surface/85 border-line sticky top-0 border-b backdrop-blur-md"
          : "absolute inset-x-0 top-0",
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1200px] items-center px-6 lg:px-10">
        <Wordmark className="text-ink" />
      </div>
    </header>
  );
}
