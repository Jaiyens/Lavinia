"use client";

// The two hero figures: money you can save (green, recurring) and money at risk right now
// (red, this bill). Both count up from zero on load. The largest thing on the screen. The
// count-up honors prefers-reduced-motion (it snaps to the final value). Figures are the
// display serif at tabular figures so the digits do not jitter while counting.

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function MoneyCountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => usdFmt.format(Math.round(v)));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: EASE, delay: 0.15 });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span className={cn(className)}>{text}</motion.span>;
}

function HeroFigure({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number;
  tone: "save" | "risk";
  sub: string;
}) {
  const has = value > 0;
  const color = tone === "save" ? "text-green-deep" : "text-risk";
  return (
    <div>
      <p className="eyebrow eyebrow-muted">{label}</p>
      {has ? (
        <p className="mt-2">
          <MoneyCountUp value={value} className={cn("figure tnum text-6xl sm:text-7xl", color)} />
          {tone === "save" ? (
            <span className="text-muted ml-2 text-base">{en.dashboard.home.perYear}</span>
          ) : null}
        </p>
      ) : (
        <p className="figure text-ink/30 mt-2 text-5xl sm:text-6xl">$0</p>
      )}
      <p className="text-muted mt-2 text-sm leading-relaxed text-pretty">{sub}</p>
    </div>
  );
}

export function HeroFigures({
  saveUsd,
  riskUsd,
  saveSub,
  riskSub,
}: {
  saveUsd: number;
  riskUsd: number;
  saveSub: string;
  riskSub: string;
}) {
  return (
    <div className="grid gap-8 sm:grid-cols-2 sm:gap-6">
      <HeroFigure label={en.dashboard.home.saveLabel} value={saveUsd} tone="save" sub={saveSub} />
      <HeroFigure label={en.dashboard.home.riskLabel} value={riskUsd} tone="risk" sub={riskSub} />
    </div>
  );
}
