// One recommendation in the ranked feed. The whole card is a tap target into the detail
// view (the evidence and charts live there). It shows one plain situation sentence, the
// dollar in mono colored by polarity (green to save, red at risk), a severity tag, the
// plain move, and an honest affordance to open the proof. Server component: no client
// state, just a Link. A featured card is the single biggest finding, set larger.

import Link from "next/link";
import { en, usd } from "@/copy/en";
import { cn } from "@/lib/cn";
import type { FindingView, Polarity } from "./finding-view";

type Tag = { label: string; className: string };

function tagFor(f: FindingView): Tag {
  if (f.polarity === "save" && f.severity === "act") {
    return { label: en.dashboard.feed.tagSave, className: "bg-green-deep text-white" };
  }
  if (f.polarity === "risk") {
    return { label: en.dashboard.feed.tagRisk, className: "bg-risk text-white" };
  }
  if (f.severity === "watch") {
    return { label: en.dashboard.feed.tagWatch, className: "border-line-strong text-muted border" };
  }
  return { label: en.dashboard.feed.tagInfo, className: "border-line-strong text-muted border" };
}

const MONEY_COLOR: Record<Polarity, string> = {
  save: "text-green-deep",
  risk: "text-risk",
  neutral: "text-ink",
};

export function RecCard({
  finding,
  featured = false,
  pulse = false,
  index = 0,
}: {
  finding: FindingView;
  featured?: boolean;
  pulse?: boolean;
  index?: number;
}) {
  const tag = tagFor(finding);
  const showMoney = finding.impactUsd != null && finding.polarity !== "neutral";
  const suffix = finding.oneTime ? en.dashboard.feed.onceLabel : en.dashboard.feed.perYear;

  return (
    <Link
      href={`/dashboard/pump-timing/rec/${finding.id}`}
      className={cn(
        "reveal group border-line bg-surface hover:border-line-strong focus-visible:border-line-strong block rounded-2xl border transition-colors",
        featured ? "shadow-card p-7 sm:p-9" : "shadow-soft p-6",
        pulse && "pulse-once",
      )}
      style={{ ["--i" as string]: index }}
    >
      {featured ? <p className="eyebrow mb-3">{en.pumpTiming.home.heroKicker}</p> : null}

      <span className={cn("label-caps inline-flex w-fit items-center rounded-full px-3 py-1", tag.className)}>
        {tag.label}
      </span>

      <p className={cn("text-foreground mt-4 leading-relaxed text-pretty", featured && "text-lg sm:text-xl")}>
        {finding.situation}
      </p>

      {showMoney ? (
        <p className="mt-5">
          <span className={cn("figure tnum", MONEY_COLOR[finding.polarity], featured ? "text-5xl sm:text-6xl" : "text-4xl")}>
            {usd(finding.impactUsd as number)}
          </span>
          <span className="text-muted ml-2 text-sm">{suffix}</span>
        </p>
      ) : null}

      {finding.impactNote ? (
        <p className={cn("text-muted mt-3 leading-relaxed text-pretty", !featured && "text-sm")}>{finding.impactNote}</p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-4">
        <span className="text-foreground/80 text-sm font-medium">{finding.actionLabel}</span>
        <span className="label-caps text-green-deep inline-flex shrink-0 items-center gap-1 transition-transform group-hover:translate-x-0.5">
          {en.dashboard.feed.open} <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
