import type { CoverageState } from "@/lib/recommendations/types";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";

// The one render treatment for the coverage union (AR-15), reused by the table cell (2.4), the
// meter drawer (2.5), and - as the label only - the CSV (2.7) and map pin (2.9). needs_review
// earns the clay alert-container tint (the single concern signal per row); no_bill is muted;
// reconciled reads calm. Color is ALWAYS paired with the text label so a grower who cannot tell
// green from clay still reads the state (the accessibility floor). One treatment everywhere so a
// coverage state never looks like two different things on two surfaces.
const COVERAGE_STYLES: Record<CoverageState, string> = {
  reconciled: "bg-transparent text-on-surface-variant",
  needs_review: "bg-alert-container text-on-alert-container",
  no_bill: "bg-transparent text-on-surface-variant/70",
};

/** The grower-facing label for a coverage state (also the CSV cell text in 2.7). */
export function coverageLabel(state: CoverageState): string {
  return en.shell.table.coverage[state];
}

export function CoveragePill({ state, className }: { state: CoverageState; className?: string }) {
  return (
    <span
      className={cn(
        "type-label-caps inline-flex items-center rounded-[var(--radius-control)] px-2 py-0.5",
        COVERAGE_STYLES[state],
        className,
      )}
    >
      {coverageLabel(state)}
    </span>
  );
}
