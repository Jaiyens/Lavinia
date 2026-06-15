import { en } from "@/copy/en";
import type { FindingView } from "@/lib/dashboard/findings";
import { FindingCard } from "../finding-card";

// Persistent right rail (320px), present on every (app) screen. Renders the farm's
// pending findings as cards (Story 3.1) - secondary to the data hero, calm by default,
// never a to-do list. No findings -> the calm empty state, never an apology and never
// a fabricated count. Mobile uses FindingsSheet instead.
export function FindingsRail({ findings }: { findings: FindingView[] }) {
  return (
    <aside
      aria-label={en.shell.findingsLabel}
      className="sticky top-0 hidden h-dvh w-findings-rail shrink-0 flex-col overflow-y-auto border-l border-outline-variant bg-paper px-6 py-6 lg:flex"
    >
      <h2 className="type-label-caps text-on-surface-variant">{en.shell.findingsLabel}</h2>
      {findings.length === 0 ? (
        <p className="type-body-md mt-6 text-on-surface-variant">{en.shell.findingsEmpty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {findings.map((finding) => (
            <li key={finding.id}>
              <FindingCard finding={finding} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
