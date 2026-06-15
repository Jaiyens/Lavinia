// The ranked recommendation feed: the primary object of the home screen. The single
// biggest finding (already sorted to findings[0] by the page) is lifted into a full-width
// featured card and given the one quiet new-finding pulse; the rest fall into a one/two
// column grid. Server component. Sorting and mapping happen on the page.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { en } from "@/copy/en";
import { RecCard } from "./rec-card";
import type { FindingView } from "./finding-view";

export function RecFeed({ findings }: { findings: FindingView[] }) {
  const h = en.dashboard.home;
  const [hero, ...rest] = findings;

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl text-balance">{h.feedTitle}</h2>
        {findings.length > 0 ? <span className="text-faint font-mono text-xs">{h.feedNote}</span> : null}
      </div>

      {findings.length === 0 ? (
        <div className="border-line mt-5 flex flex-col items-center gap-4 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-muted text-pretty">{h.noFindings}</p>
          <Link
            href="/dashboard/pump-timing/farm"
            className="text-accent inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {h.browseFarm} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {hero ? <RecCard finding={hero} featured pulse index={0} /> : null}
          {rest.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {rest.map((finding, i) => (
                <RecCard key={finding.id} finding={finding} index={i + 1} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
