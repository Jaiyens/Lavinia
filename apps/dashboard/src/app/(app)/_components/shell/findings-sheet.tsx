"use client";

import { ChevronUp } from "lucide-react";
import { en } from "@/copy/en";
import { centsFromDollars, formatUsdCompact } from "@/lib/format/money";
import { findingsAtRiskUsd, type FindingView } from "@/lib/dashboard/findings";
import { FindingCard } from "../finding-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Mobile findings collapse to a peeking bottom sheet: the count + rough dollars at
// stake ("3 findings · ~$34k up"), tapping open to the rail's cards (Story 3.1).
// Sits above the agent tab bar (h-16). The summary is honest: a zero count reads the
// calm empty line, and the dollar segment only appears when a finding carries a number.
export function FindingsSheet({
  findings,
  readOnly = false,
}: {
  findings: FindingView[];
  // The public Tour is read-only (no session): hide the one-tap responses on each card.
  readOnly?: boolean;
}) {
  // Gate the segment on rounded CENTS so a sub-cent positive sum cannot render "~$0 up".
  const atRiskCents = centsFromDollars(findingsAtRiskUsd(findings));
  const summary = en.shell.findingsSummary(
    findings.length,
    atRiskCents > 0 ? formatUsdCompact(atRiskCents) : undefined,
  );
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 lg:hidden">
      <Collapsible className="mx-3 rounded-t-[var(--radius-lg)] border border-outline-variant bg-paper shadow-[var(--shadow-elevated)]">
        <CollapsibleTrigger
          aria-label={en.shell.findingsLabel}
          className="group flex h-12 w-full items-center gap-2 px-4"
        >
          <span className="type-label-caps text-on-surface-variant">
            {en.shell.findingsLabel}
          </span>
          <span className="type-body-md tnum ml-auto text-on-surface-variant">{summary}</span>
          <ChevronUp
            size={18}
            aria-hidden
            className="transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="max-h-[50dvh] overflow-y-auto px-4 pb-4">
          {findings.length === 0 ? (
            <p className="type-body-md text-on-surface-variant">{en.shell.findingsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {findings.map((finding) => (
                <li key={finding.id}>
                  <FindingCard finding={finding} readOnly={readOnly} />
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
