import type { UIMessage } from "ai";
import { en } from "@/copy/en";

const labels = en.shell.almond.lookedAt;
type ToolName = keyof typeof labels;

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
