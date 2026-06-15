// Shared building blocks for the drill-down levels (farm, entity, account, ranch, meter).
// Server components, all presentation. The rate schedule is promoted to a first-class fact
// at every level since rate optimization is the wedge: the code shows with a plain-English
// gloss beside it, never bare.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { en, rateGloss, usd } from "@/copy/en";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/cn";

/** The rate code with its plain-English gloss. The wedge fact, shown at every level. */
export function RateFact({ code, size = "sm" }: { code: string | null; size?: "sm" | "lg" }) {
  if (!code) return null;
  const gloss = rateGloss(code);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span
        className={cn(
          "bg-green-tint/60 text-green-deep tnum inline-flex items-center rounded-md px-2 py-0.5 font-mono font-medium",
          size === "lg" ? "text-base" : "text-xs",
        )}
      >
        {code}
      </span>
      {gloss ? <span className={cn("text-muted", size === "lg" ? "text-sm" : "text-xs")}>{gloss}</span> : null}
    </span>
  );
}

/** A tappable summary row in a drill list: title + sub on the left, spend + trend on the right. */
export function DrillRow({
  href,
  title,
  sub,
  rateCode,
  spend,
  series,
}: {
  href: string;
  title: string;
  sub?: string;
  rateCode?: string | null;
  spend?: number;
  series?: number[];
}) {
  return (
    <Link
      href={href}
      className="group border-line bg-surface hover:border-line-strong shadow-soft flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate font-medium">{title}</p>
        {sub ? <p className="text-muted mt-0.5 truncate text-sm">{sub}</p> : null}
        {rateCode ? <div className="mt-1.5">{<RateFact code={rateCode} />}</div> : null}
      </div>
      {series && series.length > 1 ? (
        <Sparkline points={series} className="hidden shrink-0 sm:block" ariaLabel="Spend trend" />
      ) : null}
      {spend != null ? (
        <div className="shrink-0 text-right">
          <p className="tnum text-ink font-mono">{usd(spend)}</p>
          <p className="text-faint text-[0.65rem]">{en.dashboard.drill.cycleSpendLabel}</p>
        </div>
      ) : null}
      <ChevronRight className="text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** A pair of headline stats (spend, usage) for a drill level header. */
export function StatTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="border-line mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label}>
          <p className="eyebrow eyebrow-muted">{t.label}</p>
          <p className="tnum text-ink mt-1 font-mono text-xl">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Server-side pagination control for long meter lists (Batth has ~183). */
export function Pagination({
  page,
  totalPages,
  baseHref,
}: {
  page: number;
  totalPages: number;
  baseHref: string;
}) {
  if (totalPages <= 1) return null;
  const sep = baseHref.includes("?") ? "&" : "?";
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
      {page > 1 ? (
        <Link href={`${baseHref}${sep}page=${page - 1}`} className="label-caps text-muted hover:text-foreground transition-colors">
          <span aria-hidden>←</span> {en.dashboard.drill.prev}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-faint font-mono text-xs">{en.dashboard.drill.pageOf(page, totalPages)}</span>
      {page < totalPages ? (
        <Link href={`${baseHref}${sep}page=${page + 1}`} className="label-caps text-muted hover:text-foreground transition-colors">
          {en.dashboard.drill.next} <span aria-hidden>→</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** A plain empty state for a level with nothing to show. */
export function DrillEmpty({ message }: { message: string }) {
  return (
    <p className="text-muted border-line mt-6 rounded-2xl border border-dashed p-8 text-center">{message}</p>
  );
}
