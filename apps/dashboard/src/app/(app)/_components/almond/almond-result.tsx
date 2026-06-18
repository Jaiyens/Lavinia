import type { UIMessage } from "ai";
import { CornerUpLeft } from "lucide-react";
import { en } from "@/copy/en";
import type { NavigateAction } from "@/lib/almond/skills/navigate";

const labels = en.shell.almond.lookedAt;
type ToolName = keyof typeof labels;

/**
 * One navigation Almond drove, captured client-side as its transient `data-navigate` part arrived
 * (Story 7.5). Holds the `action` to re-apply on tap and the server-composed plain-English `label`.
 * Transient parts are not in `message.parts`, so the launcher captures these and threads them down.
 */
export type AlmondNavChip = { action: NavigateAction; label: string };

/** Extract the distinct Almond tools an assistant message consulted, in first-seen order. */
function toolNamesFrom(message: UIMessage): ToolName[] {
  const seen = new Set<ToolName>();
  const ordered: ToolName[] = [];
  for (const part of message.parts ?? []) {
    let name: string | null = null;
    if (part.type.startsWith("tool-")) {
      name = part.type.slice("tool-".length);
    } else if (part.type === "dynamic-tool" && "toolName" in part && typeof part.toolName === "string") {
      name = part.toolName;
    }
    if (name && name in labels && !seen.has(name as ToolName)) {
      seen.add(name as ToolName);
      ordered.push(name as ToolName);
    }
  }
  return ordered;
}

/**
 * Compact chips that show which farm data Almond looked at to answer, tying the reply back to
 * the dashboard. Renders nothing when no tool was consulted (e.g. the offline stub answer).
 */
export function AlmondToolChips({ message }: { message: UIMessage }) {
  const names = toolNamesFrom(message);
  if (names.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {names.map((n) => (
        <span
          key={n}
          className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5 type-label-caps text-on-surface-variant"
        >
          {labels[n]}
        </span>
      ))}
    </div>
  );
}

/**
 * Action chips (Story 7.5, FR2/FR4): a plain-English record of each navigation Almond drove this
 * turn, and a link back to that view. Unlike the read-only tool chips above, these are interactive
 * controls — tapping one re-applies the same `NavigateAction` through the 7.4 bridge. Because
 * navigation only sets URL state and changes no data, "undo" is just navigating back, so the chip is
 * safely re-tappable (FR6). Real `<button>`s give keyboard operation (Enter/Space) and focus for
 * free; a >= 44px target meets the touch-size law (NFR7, UX-DR1). Intentionally static (no entrance
 * or loop animation), so there is nothing to degrade under `prefers-reduced-motion` (NFR7, AC5).
 */
export function AlmondActionChips({
  chips,
  onReplay,
}: {
  chips: AlmondNavChip[];
  onReplay: (chip: AlmondNavChip) => void;
}) {
  if (chips.length === 0) return null;
  const t = en.shell.almond;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip, i) => (
        <button
          // Keyed within one message's list; the parent separates lists by message id, so the index
          // is stable here (no collision with the shared transient part id "almond-nav").
          key={i}
          type="button"
          onClick={() => onReplay(chip)}
          aria-label={t.navigatedAria(chip.label)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 type-label-caps text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <CornerUpLeft size={14} aria-hidden />
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
