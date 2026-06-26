import type { Severity } from "@/lib/recommendations/types";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

export type SeverityBadgeProps = {
  severity: Severity;
  className?: string;
};

// DESIGN.md severity-badge. act = clay alert; watch = charcoal weight + label only
// (NO color, the third hue is banned); info = muted. Color is always paired with the
// text label so a grower who cannot tell green from clay still reads the severity
// (the accessibility floor). Three colors max on any screen.
const STYLES: Record<Severity, string> = {
  act: "bg-alert-container text-on-alert-container",
  watch: "bg-transparent text-on-surface font-semibold",
  info: "bg-transparent text-on-surface-variant",
};

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "type-label-caps h-auto rounded-[var(--radius-control)] px-2 py-0.5",
        STYLES[severity],
        className,
      )}
    >
      {en.ui.severity[severity]}
    </Badge>
  );
}
