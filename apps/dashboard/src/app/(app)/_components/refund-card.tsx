import Link from "next/link";
import { ArrowRight, HandCoins, ShieldAlert } from "lucide-react";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import type { RefundScan } from "@/lib/dashboard/refunds";

// The retroactive-refund hook (PG&E Rule 17.1), near the top of Home: commercial-rate meters that
// may be owed money back. This is a CLAIM against PG&E, so the number is conservative, hard-rounded,
// prefixed "up to ~", and the verify label is an unmissable banner - never fine print, never a promise.

const t = en.home.refund;

export function RefundCard({ scan, energyHref }: { scan: RefundScan; energyHref: string }) {
  // The lib already rounded DOWN to a clean $1k/$5k/$10k step, so this reads as "~$5k", never precise.
  const upTo = `~$${Math.round(scan.estimatedUpToCents / 100 / 1000)}k`;

  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/20 text-on-surface">
          <HandCoins size={16} aria-hidden />
        </span>
        <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
      </div>

      <p className="type-body-md mt-3 text-on-surface">{t.upTo(upTo)}</p>
      <p className="type-money-hero tnum text-money-positive">{upTo}</p>
      <p className="type-body-md mt-1 text-on-surface-variant">{t.meters(scan.meterCount)}</p>

      {/* The unmissable verify flag (not fine print): this is an estimate to check, not a number we
          stand behind yet. Gold border + icon so it reads as a flag worth opening. */}
      <div className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-gold bg-gold/10 px-3 py-2.5">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-on-surface" aria-hidden />
        <p className="type-body-sm font-medium text-on-surface">{t.estimateLabel}</p>
      </div>

      <p className="type-caption mt-2 text-on-surface-variant">{t.rule}</p>

      <Link
        href={`${energyHref}?rate=B-1`}
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 type-body-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t.cta}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </section>
  );
}
