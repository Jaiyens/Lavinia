import type { FarmRole } from "@prisma/client";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

// The role badge shown next to a person or a farm name (Owner / Manager / View only). Owner gets
// the brand-container tone; manager and viewer stay quiet. The text label (not color alone) is the
// signal, so it reads for a screen reader and meets the a11y floor. Shared by the Team list, the
// rail switcher region, and the Account page so the label and tone never drift. No hooks, so it
// renders inside server or client components alike.
export function RolePill({ role, className = "" }: { role: FarmRole; className?: string }) {
  const label = en.team.roles[role].label;
  const tone =
    role === "owner"
      ? "bg-primary-container text-on-primary-container"
      : "bg-surface-container text-on-surface-variant";
  return (
    <Badge variant="secondary" className={cn("h-auto rounded-full px-2.5 py-0.5 type-label-caps", tone, className)}>
      {label}
    </Badge>
  );
}
